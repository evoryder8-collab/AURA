"""Geometry core for the AURA body: MakeHuman base mesh + CC0 targets + CC0 rig weights.

Pure numpy except `make_object`; imported by build_body.py inside Blender.
All coordinates returned are Blender world space in metres: +Z up, figure faces -Y,
anatomical left is +X (the glTF exporter turns this into +Y up, faces +Z, left +X).
"""

import collections
import gzip
import json
import math
import os

import numpy as np

# ---------------------------------------------------------------- loading


def load_basemesh(data_dir):
    """Parse data/3dobjs/base.obj. Returns verts (MakeHuman dm, Y up), uvs, body faces, groups."""
    verts, uvs = [], []
    faces = collections.defaultdict(list)  # group -> [[(v, vt), ...]]
    group = None
    with open(os.path.join(data_dir, "3dobjs", "base.obj")) as fh:
        for line in fh:
            if line.startswith("v "):
                verts.append([float(t) for t in line.split()[1:4]])
            elif line.startswith("vt "):
                uvs.append([float(t) for t in line.split()[1:3]])
            elif line.startswith("g "):
                group = line[2:].strip()
            elif line.startswith("f "):
                corners = []
                for tok in line.split()[1:]:
                    parts = tok.split("/")
                    corners.append((int(parts[0]) - 1, int(parts[1]) - 1))
                faces[group].append(corners)
    groups = {g: sorted({v for f in fl for v, _ in f}) for g, fl in faces.items()}
    return np.array(verts), np.array(uvs), faces, groups


def mh_to_blender(a):
    """MakeHuman (x, y-up, z-forward, decimetres) -> Blender (x, -z, y) metres."""
    a = np.asarray(a, dtype=np.float64)
    return np.stack([a[..., 0], -a[..., 2], a[..., 1]], axis=-1) * 0.1


def read_target(path):
    idx, off = [], []
    with gzip.open(path, "rt") as fh:
        for line in fh:
            line = line.strip()
            if not line or line[0] in "#\"":
                continue
            p = line.split()
            idx.append(int(p[0]))
            off.append([float(p[1]), float(p[2]), float(p[3])])
    return np.array(idx, dtype=np.int64), np.array(off)


# ---------------------------------------------------------------- macro targets
# Same interpolation as MakeHuman/MPFB (data/targets/macrodetails/macro.json).


def _components(macro_cfg, name, value):
    out = []
    for part in macro_cfg["macrotargets"][name]["parts"]:
        lo, hi = part["lowest"], part["highest"]
        if lo < value < hi:
            pct = (value - lo) / (hi - lo)
            if part["low"]:
                out.append((part["low"], round(1 - pct, 4)))
            if part["high"]:
                out.append((part["high"], round(pct, 4)))
    return out


def macro_target_stack(data_dir, macro, cutoff=0.01):
    """Return [(relative target path, weight)] for the macro sliders (gender, age, muscle...)."""
    with open(os.path.join(data_dir, "targets", "macrodetails", "macro.json")) as fh:
        cfg = json.load(fh)
    c = {k: _components(cfg, k, macro[k]) for k in
         ["gender", "age", "muscle", "weight", "proportions", "height", "cupsize", "firmness"]}
    stack = []
    for race, rw in macro["race"].items():
        for a, aw in c["age"]:
            for g, gw in c["gender"]:
                stack.append((f"macrodetails/{race}-{g}-{a}", rw * gw * aw))
    for g, gw in c["gender"]:
        for a, aw in c["age"]:
            for m, mw in c["muscle"]:
                for w, ww in c["weight"]:
                    base = gw * aw * mw * ww
                    stack.append((f"macrodetails/universal-{g}-{a}-{m}-{w}", base))
                    for h, hw in c["height"]:
                        stack.append((f"macrodetails/height/{g}-{a}-{m}-{w}-{h}", base * hw))
                    if a != "baby":
                        for p, pw in c["proportions"]:
                            stack.append((f"macrodetails/proportions/{g}-{a}-{m}-{w}-{p}", base * pw))
                    if g == "female" and a != "baby":  # breast targets ignore the gender weight (as MPFB)
                        for cu, cw in c["cupsize"]:
                            for fi, fw in c["firmness"]:
                                if cu == "averagecup" and fi == "averagefirmness":
                                    continue
                                stack.append((f"breast/female-{a}-{m}-{w}-{cu}-{fi}", aw * mw * ww * cw * fw))
    return [(n, w) for n, w in stack if w > cutoff]


def apply_targets(verts, data_dir, stack):
    v = verts.copy()
    for name, weight in stack:
        path = os.path.join(data_dir, "targets", name + ".target.gz")
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        idx, off = read_target(path)
        if len(idx):  # the neutral targets are empty files
            v[idx] += weight * off
    return v


# ---------------------------------------------------------------- rig + linear blend skinning


def load_rig(data_dir, verts_b, groups):
    """Bone heads/tails (Blender coords) from rig.default.json evaluated on the shaped mesh."""
    with open(os.path.join(data_dir, "rigs", "standard", "rig.default.json")) as fh:
        rig = json.load(fh)

    def point(spec):
        s = spec["strategy"]
        if s == "CUBE":
            return verts_b[groups[spec["cube_name"]]].mean(0)
        if s == "VERTEX":
            return verts_b[spec["vertex_index"]]
        if s == "MEAN":
            return verts_b[spec["vertex_indices"]].mean(0)
        raise ValueError(s)

    bones = {n: {"head": point(b["head"]), "tail": point(b["tail"]), "parent": b["parent"] or None}
             for n, b in rig.items()}
    order, seen = [], set()

    def visit(n):
        if n in seen:
            return
        p = bones[n]["parent"]
        if p:
            visit(p)
        seen.add(n)
        order.append(n)

    for n in bones:
        visit(n)
    return bones, order


def load_weights(data_dir, nverts):
    with open(os.path.join(data_dir, "rigs", "standard", "weights.default.json")) as fh:
        w = json.load(fh)["weights"]
    out = {}
    for bone, pairs in w.items():
        if not pairs:
            continue
        a = np.array(pairs)
        a = a[a[:, 0] < nverts]
        out[bone] = (a[:, 0].astype(np.int64), a[:, 1])
    return out


def rot_between(a, b):
    """3x3 rotation taking direction a onto direction b (shortest arc)."""
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-9:
        return np.eye(3)
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k * (1.0 / (1.0 + c))


def rot_axis(axis, deg):
    axis = axis / np.linalg.norm(axis)
    t = math.radians(deg)
    k = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return np.eye(3) + math.sin(t) * k + (1 - math.cos(t)) * k @ k


class Pose:
    """Forward kinematics with world-space deltas: G_bone = R_world(about posed head) * G_parent."""

    def __init__(self, bones, order):
        self.bones, self.order = bones, order
        self.G = {}

    def xf(self, name, p):
        M, t = self.G[name]
        return M @ p + t

    def solve(self, hook):
        """hook(pose, bone_name, parent_name) -> 3x3 world rotation (or None) applied at the posed head."""
        for n in self.order:
            p = self.bones[n]["parent"]
            M, t = self.G[p] if p else (np.eye(3), np.zeros(3))
            self.G[n] = (M, t)
            R = hook(self, n, p)
            if R is not None:
                h = M @ self.bones[n]["head"] + t
                self.G[n] = (R @ M, R @ (t - h) + h)

    def skin(self, verts, weights):
        acc = np.zeros_like(verts)
        tot = np.zeros(len(verts))
        for bone, (idx, w) in weights.items():
            M, t = self.G[bone]
            acc[idx] += w[:, None] * (verts[idx] @ M.T + t)
            tot[idx] += w
        out = verts.copy()
        m = tot > 1e-6
        out[m] = acc[m] / tot[m, None]
        return out


# ---------------------------------------------------------------- local smoothing


class Adjacency:
    """Padded one-ring neighbour table over global vertex ids (only vertices used by `faces`)."""

    def __init__(self, faces):
        nb = collections.defaultdict(set)
        for f in faces:
            vs = [v for v, _ in f]
            for a, b in zip(vs, vs[1:] + vs[:1]):
                nb[a].add(b)
                nb[b].add(a)
        self.idx = np.array(sorted(nb))
        width = max(len(v) for v in nb.values())
        self.table = np.zeros((len(self.idx), width), dtype=np.int64)
        self.valid = np.zeros((len(self.idx), width))
        for r, i in enumerate(self.idx):
            ns = sorted(nb[i])
            self.table[r, :len(ns)] = ns
            self.valid[r, :len(ns)] = 1
        self.deg = self.valid.sum(1)

    def mean(self, X):
        return (X[self.table] * self.valid[..., None]).sum(1) / self.deg[:, None]

    def relax(self, X, iters, lam=0.5):
        X = X.copy()
        for _ in range(iters):
            X[self.idx] += lam * (self.mean(X) - X[self.idx])
        return X


def flatten_bump(P, faces, adj, center, r_in, r_out):
    """Replace a small bump (a nipple) by the quadric that the surrounding ring of skin describes.

    Vertices inside r_in take the fitted height, fading back to their own between r_in and r_out.
    """
    n = vertex_normals(P, faces)
    idx = adj.idx
    d = np.linalg.norm(P[idx] - center, axis=1)
    near = idx[d < r_out]
    n0 = n[near].mean(0)
    n0 /= np.linalg.norm(n0)
    t1 = np.cross(n0, [0.0, 0.0, 1.0])
    t1 /= np.linalg.norm(t1)
    t2 = np.cross(n0, t1)
    rel = P[near] - center
    u, v, h = rel @ t1, rel @ t2, rel @ n0
    dn = d[d < r_out]
    ring = dn > r_in
    A = np.stack([np.ones_like(u), u, v, u * u, u * v, v * v], 1)
    coef = np.linalg.lstsq(A[ring], h[ring], rcond=None)[0]
    t = np.clip((r_out - dn) / (r_out - r_in), 0, 1)
    w = t * t * (3 - 2 * t)
    out = P.copy()
    out[near] += ((A @ coef - h) * w)[:, None] * n0
    return out


def vertex_normals(P, faces):
    n = np.zeros_like(P)
    for f in faces:
        vs = [v for v, _ in f]
        a, b, c, d = P[vs[0]], P[vs[1]], P[vs[2]], P[vs[-1]]
        n[vs] += np.cross(c - a, d - b) if len(vs) == 4 else np.cross(b - a, c - a)
    ln = np.linalg.norm(n, axis=1)
    ln[ln == 0] = 1
    return n / ln[:, None]


# ---------------------------------------------------------------- Blender object


def make_object(bpy, name, verts_b, faces, uvs, keep_vertex_ids):
    """Build a mesh object from `faces` [(v, vt)...] using only vertices in keep_vertex_ids."""
    remap = {v: i for i, v in enumerate(keep_vertex_ids)}
    me = bpy.data.meshes.new(name)
    polys = [[remap[v] for v, _ in f] for f in faces]
    me.from_pydata([tuple(p) for p in verts_b[keep_vertex_ids]], [], polys)
    uv = me.uv_layers.new(name="UVMap")
    flat = [uvs[vt] for f in faces for _, vt in f]
    uv.data.foreach_set("uv", np.array(flat, dtype=np.float32).ravel())
    me.validate()
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob, remap
