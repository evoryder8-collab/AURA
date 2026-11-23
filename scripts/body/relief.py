"""Sculpt pass: anatomical relief the MakeHuman surface is too soft to show.

Every form is placed from the posed skeleton (landmarks in metres, Blender axes: +X = anatomical
left, -Y = front, +Z = up) and pushed along the vertex normal with a smooth Gaussian profile, so a
therapist can read scapulae, trapezius, erectors, deltoids and calf heads from across the table.
Forms are written for the left side and mirrored. Amplitudes and widths are in millimetres; heights follow
the landmarks, lateral offsets are in metres for this 1.72 m figure.
"""

import numpy as np

FACING = {"back": np.array([0.0, 1.0, 0.0]), "front": np.array([0.0, -1.0, 0.0]),
          "lateral": np.array([1.0, 0.0, 0.0])}


def _plane(points, view):
    """2D coordinates in the view plane (x, z for back/front, y, z for lateral)."""
    return points[..., [1, 2]] if view == "lateral" else points[..., [0, 2]]


def _gate(normals, view, side):
    f = FACING[view] * ([side, 1, 1] if view == "lateral" else 1)
    t = np.clip(normals @ f / 0.5, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _polyline(q, pts):
    """Distance from 2D points q to a polyline, and the normalised arc position of the closest point."""
    best = np.full(len(q), np.inf)
    pos = np.zeros(len(q))
    lengths = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    start = np.concatenate([[0], np.cumsum(lengths)])
    for a, b, s0, ln in zip(pts[:-1], pts[1:], start, lengths):
        t = np.clip(((q - a) @ (b - a)) / (ln * ln), 0, 1)
        d = np.linalg.norm(q - (a + t[:, None] * (b - a)), axis=1)
        m = d < best
        best[m], pos[m] = d[m], (s0 + t[m] * ln) / start[-1]
    return best, pos


def _polygon(q, poly):
    """Signed distance from 2D points q to a closed polygon (negative inside)."""
    d = np.full(len(q), np.inf)
    inside = np.zeros(len(q), bool)
    for a, b in zip(poly, np.roll(poly, -1, axis=0)):
        t = np.clip(((q - a) @ (b - a)) / ((b - a) @ (b - a)), 0, 1)
        d = np.minimum(d, np.linalg.norm(q - (a + t[:, None] * (b - a)), axis=1))
        crosses = (a[1] > q[:, 1]) != (b[1] > q[:, 1])
        xcross = a[0] + (q[:, 1] - a[1]) * (b[0] - a[0]) / np.where(b[1] == a[1], 1e-12, b[1] - a[1])
        inside ^= crosses & (q[:, 0] < xcross)
    return np.where(inside, -d, d)


def displacement(P, N, forms):
    """Sum of all forms, as a distance along the vertex normal (metres)."""
    out = np.zeros(len(P))
    for f in forms:
        for side in (1, -1):
            pts = np.array(f["pts"], float) * ([side, 1] if f["view"] != "lateral" else [1, 1])
            q = _plane(P, f["view"])
            reach = 4 * (max(f["r"]) if f["kind"] == "blob" else f["w"]) / 1000
            lo, hi = pts.min(0) - reach, pts.max(0) + reach
            sel = np.all((q >= lo) & (q <= hi), axis=1)
            if f["view"] == "lateral":
                sel &= P[:, 0] * side > 0
            if "xmin" in f:
                sel &= P[:, 0] * side > f["xmin"]
            if "ymax" in f:
                sel &= P[:, 1] < f["ymax"]
            idx = np.nonzero(sel)[0]
            if not len(idx):
                continue
            qq = q[idx]
            if f["kind"] == "plate":  # raised area with a soft rim (e.g. the shoulder blade)
                t = np.clip(0.5 - _polygon(qq, pts) / (2 * f["w"] / 1000), 0, 1)
                prof = t * t * (3 - 2 * t)
            elif f["kind"] == "blob":
                c, r = pts[0], np.array(f["r"]) / 1000
                ang = np.radians(f.get("rot", 0.0)) * side
                rot = np.array([[np.cos(ang), np.sin(ang)], [-np.sin(ang), np.cos(ang)]])
                d2 = (((qq - c) @ rot.T) / r) ** 2
                prof = np.exp(-d2.sum(1))
            else:
                d, t = _polyline(qq, pts)
                taper = np.clip(np.minimum(t, 1 - t) / f.get("taper", 0.2), 0, 1)
                prof = np.exp(-(d / (f["w"] / 1000)) ** 2) * taper * taper * (3 - 2 * taper)
            out[idx] += f["amp"] / 1000 * prof * _gate(N[idx], f["view"], side)
    return out


def forms_for(lm):
    """Anatomical forms placed from landmarks (left side; the caller mirrors to the right)."""
    c7, gh, el, hip, kn, an, nip = (lm[k] for k in ("c7", "gh", "elbow", "hip", "knee", "ankle", "nipple"))
    back = c7[2] - hip[2]                      # C7 to hip-joint height
    lvl = lambda f: c7[2] - f * back           # noqa: E731  vertebral levels as a fraction of the back
    t7, t12, l4, psis = lvl(0.30), lvl(0.50), lvl(0.79), lvl(0.88)
    acro = np.array([gh[0] - 0.006, gh[2] + 0.046])
    arm = lambda t, dx=0.0: [gh[0] + t * (el[0] - gh[0]) + dx, gh[2] + t * (el[2] - gh[2])]  # noqa: E731
    leg = lambda t, dx=0.0: [kn[0] + t * (an[0] - kn[0]) + dx, kn[2] + t * (an[2] - kn[2])]  # noqa: E731
    thigh = lambda t, dx=0.0: [hip[0] + t * (kn[0] - hip[0]) + dx, hip[2] + t * (kn[2] - hip[2])]  # noqa: E731
    root, inf = [0.068, lvl(0.13)], [0.088, t7]   # scapular spine root, inferior angle
    F = []
    add = F.append
    # Masses first (muscle bellies as soft ellipsoids); valleys come from masses meeting.
    # The few lines are wide and shallow, or bony landmarks (clavicle, scapular spine).
    # ---------------- back: scapula plate, latissimus, erectors either side of the spinal groove
    add(dict(kind="blob", view="back", pts=[[0.118, lvl(0.19)]], r=(32, 38), amp=3.4))                          # infraspinatus
    add(dict(kind="blob", view="back", pts=[[0.138, t7 + 0.016]], r=(26, 16), amp=3.0, rot=-30))              # teres major
    add(dict(kind="blob", view="back", pts=[[0.135, lvl(0.46)]], r=(36, 80), amp=2.8, rot=18))                # latissimus
    add(dict(kind="plate", view="back", pts=[root, [0.135, lvl(0.08)], [0.15, lvl(0.15)], [0.14, lvl(0.24)], inf, [0.076, lvl(0.21)]],
             amp=3.0, w=18))                                                                                        # shoulder blade (infraspinous part)
    add(dict(kind="blob", view="back", pts=[[0.044, lvl(0.2)]], r=(16, 48), amp=-1.2))                       # rhomboid hollow
    add(dict(kind="line", view="back", pts=[root, [0.1, lvl(0.11)], [0.135, lvl(0.095)]], amp=1.0, w=13, taper=0.35))  # spine of scapula
    add(dict(kind="line", view="back", pts=[[0.0, lvl(0.05)], [0.0, lvl(0.45)]], amp=-1.2, w=12, taper=0.3))    # thoracic spinal groove
    add(dict(kind="line", view="back", pts=[[0.0, lvl(0.4)], [0.0, psis]], amp=-2.4, w=12, taper=0.3))          # lumbar spinal groove
    add(dict(kind="line", view="back", pts=[[0.036, lvl(0.42)], [0.038, t12], [0.04, l4], [0.036, psis]], amp=5.0, w=22, taper=0.3))  # erector spinae
    add(dict(kind="blob", view="back", pts=[[0.045, psis - 0.01]], r=(12, 12), amp=-1.8))                    # sacral dimple
    # ---------------- shoulder: three deltoid heads against trapezius, pectoral, triceps
    ins = arm(0.46)
    add(dict(kind="blob", view="lateral", pts=[[gh[1], gh[2] - 0.02]], r=(30, 48), amp=2.6, xmin=gh[0] - 0.01))  # lateral deltoid
    add(dict(kind="blob", view="front", pts=[[0.168, lvl(0.17)]], r=(20, 40), amp=2.6, rot=-10, ymax=0.0))   # anterior deltoid
    add(dict(kind="blob", view="back", pts=[[0.17, lvl(0.17)]], r=(22, 40), amp=2.8, rot=-15))               # posterior deltoid
    add(dict(kind="line", view="front", pts=[[0.118, acro[1] - 0.012], [0.135, lvl(0.2)], [0.15, lvl(0.27)]], amp=-1.1, w=14, ymax=0.0))  # deltopectoral groove
    add(dict(kind="line", view="lateral", pts=[[gh[1] - 0.03, ins[1] + 0.014], [gh[1], ins[1] - 0.008], [gh[1] + 0.03, ins[1] + 0.014]], amp=-0.7, w=14, xmin=gh[0]))  # deltoid insertion
    add(dict(kind="line", view="front", pts=[[0.022, lvl(0.1)], [0.07, lvl(0.085)], acro + [-0.01, -0.003]], amp=1.6, w=9, ymax=-0.02))  # clavicle
    add(dict(kind="blob", view="front", pts=[[0.07, lvl(0.03)]], r=(24, 12), amp=-2.0, ymax=0.0))            # supraclavicular hollow
    # ---------------- chest and abdomen (athletic, not a six-pack)
    add(dict(kind="blob", view="front", pts=[[0.082, nip[2] + 0.025]], r=(55, 42), amp=1.8, ymax=-0.03))     # pectoralis major
    add(dict(kind="line", view="front", pts=[[0.0, lvl(0.12)], [0.0, nip[2] - 0.04]], amp=-1.0, w=14, ymax=-0.05))  # sternal groove
    add(dict(kind="line", view="front", pts=[[0.035, nip[2] - 0.04], [0.08, nip[2] - 0.05], [0.125, nip[2] - 0.015], [0.15, lvl(0.24)]], amp=-1.3, w=15, ymax=-0.03))  # pectoral border
    add(dict(kind="line", view="front", pts=[[0.0, nip[2] - 0.07], [0.0, hip[2] + 0.1]], amp=-0.8, w=12, ymax=-0.04))  # linea alba
    add(dict(kind="line", view="front", pts=[[0.068, nip[2] - 0.08], [0.07, hip[2] + 0.08]], amp=-0.7, w=16, ymax=-0.03))  # linea semilunaris
    add(dict(kind="line", view="front", pts=[[0.1, hip[2] + 0.06], [0.045, hip[2] - 0.03]], amp=-1.0, w=14, ymax=-0.03))  # inguinal line
    # ---------------- glutes and posterior thigh
    add(dict(kind="line", view="back", pts=[[0.03, hip[2] - 0.115], [0.08, hip[2] - 0.12], [0.135, hip[2] - 0.09]], amp=-2.0, w=13))  # gluteal fold
    add(dict(kind="blob", view="back", pts=[[0.155, hip[2] - 0.01]], r=(16, 32), amp=-2.0))                 # lateral glute hollow
    add(dict(kind="line", view="back", pts=[thigh(0.45, 0.004), thigh(0.85, 0.0)], amp=-1.2, w=12))        # hamstring division
    add(dict(kind="blob", view="back", pts=[leg(-0.03)], r=(14, 20), amp=-2.6))                             # popliteal fossa
    add(dict(kind="line", view="back", pts=[thigh(0.75, -0.026), thigh(1.0, -0.022)], amp=1.2, w=9))        # medial hamstring tendon
    add(dict(kind="line", view="back", pts=[thigh(0.75, 0.026), thigh(1.0, 0.026)], amp=1.2, w=9))          # biceps femoris tendon
    # ---------------- calves: two broad gastrocnemius heads over the soleus, then the Achilles
    add(dict(kind="blob", view="back", pts=[leg(0.3, -0.017)], r=(21, 58), amp=6.0, rot=4))                 # medial head (larger, lower)
    add(dict(kind="blob", view="back", pts=[leg(0.24, 0.018)], r=(18, 46), amp=4.8, rot=-4))                # lateral head
    add(dict(kind="line", view="back", pts=[leg(0.48, -0.024), leg(0.52, -0.004), leg(0.42, 0.022)], amp=-1.2, w=22))  # lower gastrocnemius border
    add(dict(kind="blob", view="back", pts=[leg(0.57, -0.022)], r=(16, 42), amp=1.3))                       # soleus (medial)
    add(dict(kind="blob", view="back", pts=[leg(0.54, 0.024)], r=(16, 42), amp=1.3))                        # soleus (lateral)
    add(dict(kind="line", view="back", pts=[leg(0.62, 0.0), leg(0.88, 0.0)], amp=1.4, w=10))                # Achilles tendon
    # ---------------- front of the leg
    add(dict(kind="blob", view="front", pts=[thigh(0.86, -0.024)], r=(19, 32), amp=4.0, rot=-12))           # vastus medialis
    add(dict(kind="blob", view="front", pts=[thigh(0.55, 0.03)], r=(22, 80), amp=2.0, rot=-4))              # vastus lateralis
    add(dict(kind="line", view="front", pts=[thigh(0.0, 0.0), thigh(0.55, -0.02), thigh(0.95, -0.036)], amp=-0.9, w=14))  # sartorius line
    add(dict(kind="blob", view="front", pts=[leg(-0.06)], r=(19, 22), amp=2.6))                              # patella
    add(dict(kind="blob", view="front", pts=[leg(0.3, 0.016)], r=(16, 60), amp=2.2))                         # tibialis anterior
    return F
