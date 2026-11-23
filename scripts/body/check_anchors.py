"""Self-check for src/features/body/anchors.json against public/models/aura-body.glb.

  python3 scripts/body/check_anchors.py        (needs numpy; exits 1 on any failure)

Asserts: every required region/side exists once; anatomical left is +X and right is -X;
each anchor lies on the GLB surface; its normal agrees with the surface; and nothing hides it
from the view(s) its "surface" field promises (front = seen from +Z, back = from -Z,
edge = from both; glTF coordinates).
"""

import json
import os
import struct
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
GLB = os.path.join(ROOT, "public", "models", "aura-body.glb")
ANCHORS = os.path.join(ROOT, "src", "features", "body", "anchors.json")

REQUIRED = {
    ("head", "centre", "front"), ("neck", "centre", "back"), ("neck", "left", "edge"), ("neck", "right", "edge"),
    ("shoulder", "left", "edge"), ("shoulder", "right", "edge"),
    ("shoulder_blade", "left", "back"), ("shoulder_blade", "right", "back"),
    ("upper_back", "centre", "back"), ("mid_back", "centre", "back"),
    ("lower_back", "left", "back"), ("lower_back", "right", "back"), ("lower_back", "centre", "back"),
    ("chest", "left", "front"), ("chest", "right", "front"), ("chest", "centre", "front"),
    ("abdomen", "centre", "front"),
    ("upper_arm", "left", "edge"), ("upper_arm", "right", "edge"),
    ("elbow", "left", "back"), ("elbow", "right", "back"),
    ("forearm", "left", "front"), ("forearm", "right", "front"),
    ("hand", "left", "front"), ("hand", "right", "front"),
    ("hip", "left", "edge"), ("hip", "right", "edge"),
    ("glute", "left", "back"), ("glute", "right", "back"),
    ("thigh_front", "left", "front"), ("thigh_front", "right", "front"),
    ("thigh_back", "left", "back"), ("thigh_back", "right", "back"),
    ("knee", "left", "front"), ("knee", "right", "front"),
    ("shin", "left", "front"), ("shin", "right", "front"),
    ("calf", "left", "back"), ("calf", "right", "back"),
    ("foot", "left", "front"), ("foot", "right", "front"),
}
ON_SURFACE_M = 0.001      # anchor to nearest triangle


def read_glb(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, _, _ = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67, "not a GLB"
    jlen, _ = struct.unpack_from("<II", data, 12)
    gltf = json.loads(data[20:20 + jlen])
    blen, _ = struct.unpack_from("<II", data, 20 + jlen)
    binary = data[28 + jlen:28 + jlen + blen]

    def accessor(i):
        a = gltf["accessors"][i]
        bv = gltf["bufferViews"][a["bufferView"]]
        dtype = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a["componentType"]]
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        assert bv.get("byteStride", np.dtype(dtype).itemsize * width) == np.dtype(dtype).itemsize * width
        arr = np.frombuffer(binary, dtype=dtype, count=a["count"] * width, offset=start)
        return arr.reshape(-1, width) if width > 1 else arr

    for node in gltf["nodes"]:
        assert not any(k in node for k in ("matrix", "rotation", "scale", "translation")), "node transforms not expected"
    tris = []
    for mesh in gltf["meshes"]:
        for prim in mesh["primitives"]:
            pos = accessor(prim["attributes"]["POSITION"]).astype(np.float64)
            tris.append(pos[accessor(prim["indices"]).astype(np.int64).reshape(-1, 3)])
    return np.concatenate(tris)


def closest_on_triangles(p, T):
    """Distance from p to every triangle (Ericson's region test, vectorised); returns (dist, index)."""
    a, b, c = T[:, 0], T[:, 1], T[:, 2]
    ab, ac, ap = b - a, c - a, p - a
    d1, d2 = (ab * ap).sum(1), (ac * ap).sum(1)
    bp = p - b
    d3, d4 = (ab * bp).sum(1), (ac * bp).sum(1)
    cp = p - c
    d5, d6 = (ab * cp).sum(1), (ac * cp).sum(1)
    va, vb, vc = d3 * d6 - d5 * d4, d5 * d2 - d1 * d6, d1 * d4 - d3 * d2
    denom = np.where(np.abs(va + vb + vc) < 1e-20, 1e-20, va + vb + vc)
    q = a + ab * (vb / denom)[:, None] + ac * (vc / denom)[:, None]
    with np.errstate(divide="ignore", invalid="ignore"):
        cases = [
            ((d1 <= 0) & (d2 <= 0), a),
            ((d3 >= 0) & (d4 <= d3), b),
            ((d6 >= 0) & (d5 <= d6), c),
            ((vc <= 0) & (d1 >= 0) & (d3 <= 0), a + ab * np.nan_to_num(d1 / (d1 - d3))[:, None]),
            ((vb <= 0) & (d2 >= 0) & (d6 <= 0), a + ac * np.nan_to_num(d2 / (d2 - d6))[:, None]),
            ((va <= 0) & (d4 - d3 >= 0) & (d5 - d6 >= 0),
             b + (c - b) * np.nan_to_num((d4 - d3) / ((d4 - d3) + (d5 - d6)))[:, None]),
        ]
    for cond, val in reversed(cases):
        q = np.where(cond[:, None], val, q)
    d = np.linalg.norm(q - p, axis=1)
    i = int(np.argmin(d))
    return d[i], i


def first_hit(origin, direction, T):
    """Möller–Trumbore against all triangles; distance along the ray to the nearest hit (inf if none)."""
    e1, e2 = T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]
    h = np.cross(direction, e2)
    a = (e1 * h).sum(1)
    ok = np.abs(a) > 1e-12
    f = np.where(ok, 1.0 / np.where(ok, a, 1), 0)
    s = origin - T[:, 0]
    u = f * (s * h).sum(1)
    q = np.cross(s, e1)
    v = f * (q @ direction)
    t = f * (e2 * q).sum(1)
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0)
    return t[hit].min() if hit.any() else np.inf


def main():
    T = read_glb(GLB)
    with open(ANCHORS) as fh:
        anchors = json.load(fh)
    errors = []
    keys = [(a["region"], a["side"], a["surface"]) for a in anchors]
    if sorted(keys) != sorted(REQUIRED):
        errors.append(f"region set mismatch: missing {sorted(REQUIRED - set(keys))}, extra {sorted(set(keys) - REQUIRED)}")
    e1, e2 = T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]
    fn = np.cross(e1, e2)
    fn /= np.maximum(np.linalg.norm(fn, axis=1), 1e-20)[:, None]
    for a in anchors:
        name = f'{a["region"]}/{a["side"]}'
        p, n = np.array(a["position"], float), np.array(a["normal"], float)
        if a["side"] == "left" and not p[0] > 0:
            errors.append(f"{name}: left anchor must have x > 0 (anatomical left is +X)")
        if a["side"] == "right" and not p[0] < 0:
            errors.append(f"{name}: right anchor must have x < 0")
        if a["side"] == "centre" and abs(p[0]) > 0.01:
            errors.append(f"{name}: centre anchor must sit on the midline (|x| <= 1 cm)")
        d, i = closest_on_triangles(p, T)
        if d > ON_SURFACE_M:
            errors.append(f"{name}: {d * 1000:.2f} mm off the surface")
        if abs(np.linalg.norm(n) - 1) > 1e-3 or np.dot(n, fn[i]) < 0.7:
            errors.append(f"{name}: normal does not match the surface")
        for view, z in (("front", 1.0), ("back", -1.0)):
            if a["surface"] not in (view, "edge"):
                continue
            t = first_hit(p + n * 0.002, np.array([0.0, 0.0, z]), T)  # look from the anchor towards that camera
            if np.isfinite(t):
                errors.append(f"{name}: covered in the {view} view (surface {t * 1000:.0f} mm in front of it)")
        if a["surface"] == "front" and n[2] < 0.2 or a["surface"] == "back" and n[2] > -0.2:
            errors.append(f"{name}: normal does not face its {a['surface']} view")
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    print(f"ok: {len(anchors)} anchors on {len(T)} triangles")


if __name__ == "__main__":
    main()
