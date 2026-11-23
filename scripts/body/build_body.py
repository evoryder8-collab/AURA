"""Build the AURA anatomical body (web GLB, print renders, view frames, surface anchors).

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python scripts/body/build_body.py -- --mpfb-data <MPFB 2.0.18>/data --work <scratch dir> [--stage preview|all]

See scripts/body/README.md for sources, licence and what each stage writes.
"""

import argparse
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np

sys.dont_write_bytecode = True  # no __pycache__ left in the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import body_lib as L  # noqa: E402
import relief  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

# ------------------------------------------------------------------ figure parameters
MACRO = dict(gender=0.5, age=0.5, muscle=1.0, weight=0.38, proportions=1.0, height=0.5,
             cupsize=0.15, firmness=0.5, race=dict(african=1 / 3, asian=1 / 3, caucasian=1 / 3))
DETAIL = [  # (target, weight): extra definition where a therapist needs to point
    ("arms/l-upperarm-shoulder-muscle-incr", 0.6), ("arms/r-upperarm-shoulder-muscle-incr", 0.6),
    ("arms/l-upperarm-muscle-incr", 0.35), ("arms/r-upperarm-muscle-incr", 0.35),
    ("arms/l-lowerarm-muscle-incr", 0.35), ("arms/r-lowerarm-muscle-incr", 0.35),
    ("legs/l-lowerleg-muscle-incr", 0.6), ("legs/r-lowerleg-muscle-incr", 0.6),
    ("legs/l-upperleg-muscle-incr", 0.35), ("legs/r-upperleg-muscle-incr", 0.35),
    ("torso/torso-muscle-dorsi-incr", 0.45),
    ("pelvis/bulge-decr", 1.0),
]
HEIGHT_M = 1.72
ARM_DEG, FOREARM_DEG, ELBOW_FLEX_DEG = 17.0, 21.0, 6.0   # abduction from vertical; slight natural elbow bend
THIGH_DEG, SHIN_DEG = 3.0, 1.0
FINGER_GATHER, THUMB_GATHER = 0.75, 0.3   # 0 = MakeHuman splay, 1 = parallel to the middle finger / index
JAW_CLOSE_DEG = 1.5       # MakeHuman's lips rest slightly parted
RELIEF_GAIN = 1.7         # scales every form in relief.py
WEB_TRIANGLES = 84000     # GLB budget: ~2.4 MB with the texture (16-bit indices need < 65536 vertices)
TEX_SIZE, JPEG_QUALITY = 2048, 88
FORM_NEAR, FORM_FAR, FORM_FLOOR = 0.9, 0.3, 0.4   # how much each AO bake (8 cm, 20 cm) darkens the base colour
PRINT_W, PRINT_H, PRINT_SAMPLES, PRINT_MARGIN = 1400, 3000, 384, 0.04
NIPPLE_RADII = 0.02, 0.038   # flatten inside, blend back to the pectoral by the outer radius
LID_CLOSE_AT = 0.3        # closed-lid line, as a fraction from the lower lid up to the upper lid


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--mpfb-data", required=True)
    ap.add_argument("--work", required=True)
    ap.add_argument("--stage", default="all", choices=["preview", "all"])
    return ap.parse_args(argv)


# ------------------------------------------------------------------ shape + pose


def shaped_vertices(data_dir):
    V, UV, F, G = L.load_basemesh(data_dir)
    stack = L.macro_target_stack(data_dir, MACRO) + DETAIL
    B = L.mh_to_blender(L.apply_targets(V, data_dir, stack))
    return B, UV, F, G


def pose_vertices(data_dir, B, G):
    bones, order = L.load_rig(data_dir, B, G)
    weights = L.load_weights(data_dir, len(B))
    twist = {}

    def frontal(side, deg, fwd_deg=0.0):
        a, f = math.radians(deg), math.radians(fwd_deg)
        d = np.array([side * math.sin(a), -math.sin(f), -math.cos(a)])
        return d / np.linalg.norm(d)

    def hook(P, n, parent):
        if n == "jaw":
            return L.rot_axis(np.array([1.0, 0, 0]), -JAW_CLOSE_DEG)
        if not (n.endswith(".L") or n.endswith(".R")):
            return None
        side = 1.0 if n.endswith(".L") else -1.0
        s = n[-2:]
        head = P.xf(n, bones[n]["head"])
        if n.startswith("upperarm01"):
            return L.rot_between(P.xf(n, bones["lowerarm01" + s]["head"]) - head, frontal(side, ARM_DEG))
        if n.startswith("lowerarm01"):
            target = frontal(side, FOREARM_DEG, ELBOW_FLEX_DEG)
            R = L.rot_between(P.xf(n, bones["wrist" + s]["head"]) - head, target)
            # supinate so the palm faces forward (-Y): dorsal normal of the hand -> +Y
            w, i, p = (R @ (P.xf(n, bones[b + s]["head"]) - head) for b in ("wrist", "finger2-1", "finger5-1"))
            dorsal = side * np.cross(i - w, p - w)
            proj = lambda v: v - np.dot(v, target) * target  # noqa: E731
            a, b = proj(dorsal), proj(np.array([0.0, 1.0, 0.0]))
            ang = math.degrees(math.atan2(np.dot(np.cross(a, b), target), np.dot(a, b)))
            twist[s] = (target, ang)
            return L.rot_axis(target, ang * 0.5) @ R
        if n.startswith("lowerarm02"):
            target, ang = twist[s]
            return L.rot_axis(target, ang * 0.5)
        if n.startswith("wrist"):  # straight wrist: hand continues the forearm
            return L.rot_between(P.xf(n, bones["finger3-1" + s]["head"]) - head, twist[s][0])
        if n[:7] in ("finger1", "finger2", "finger4", "finger5") and n[8] == "1":  # gather the splayed fingers
            tip = lambda f: P.xf(n, bones[f + "-3" + s]["tail"]) - P.xf(n, bones[f + "-1" + s]["head"])  # noqa: E731
            cur, ref = tip(n[:7]), tip("finger2" if n[:7] == "finger1" else "finger3")
            ref = ref / np.linalg.norm(ref) * np.linalg.norm(cur)
            k = THUMB_GATHER if n[:7] == "finger1" else FINGER_GATHER
            return L.rot_between(cur, cur + k * (ref - cur))
        if n.startswith("orbicularis0"):  # serene closed eyes: lids rotate about the eye centre to meet
            ang = lambda b: math.degrees(math.atan2(*(bones[b + s]["tail"] - bones[b + s]["head"])[[2, 1]] * [1, -1]))  # noqa: E731
            up, lo = ang("orbicularis03"), ang("orbicularis04")
            meet = lo + LID_CLOSE_AT * (up - lo)
            return L.rot_axis(np.array([1.0, 0, 0]), (up - meet) if n.startswith("orbicularis03") else (lo - meet))
        if n.startswith("upperleg01"):
            cur = P.xf(n, bones["lowerleg01" + s]["head"]) - head
            return L.rot_between(cur * [1, 0, 1], frontal(side, THIGH_DEG) * np.linalg.norm(cur[[0, 2]]))
        if n.startswith("lowerleg01"):
            cur = P.xf(n, bones["foot" + s]["head"]) - head
            return L.rot_between(cur * [1, 0, 1], frontal(side, SHIN_DEG) * np.linalg.norm(cur[[0, 2]]))
        if n.startswith("foot"):
            return P.G[n][0].T  # undo the leg rotation: sole stays flat, toes keep pointing forward
        return None

    P = L.Pose(bones, order)
    P.solve(hook)
    return P.skin(B, weights), P, bones


# ------------------------------------------------------------------ look: porcelain, studio light, ortho camera


def porcelain_material(name="Porcelain", ao_distance=0.08):
    """Light porcelain/alabaster with a touch of subsurface; Cycles AO deepens the muscle separations."""
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.46
    bsdf.inputs["Specular IOR Level"].default_value = 0.32
    bsdf.inputs["Subsurface Weight"].default_value = 0.18
    bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.8, 0.65)
    bsdf.inputs["Subsurface Scale"].default_value = 0.006
    bsdf.inputs["Coat Weight"].default_value = 0.06
    bsdf.inputs["Coat Roughness"].default_value = 0.25
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = ao_distance
    ao.samples = 16
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.0, (0.26, 0.255, 0.25, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 1.0, (0.80, 0.79, 0.77, 1)
    nt.links.new(ao.outputs["AO"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def light_rig(behind):
    """Soft studio rig. `behind` turns it 180 deg so the back view gets the same modelling light."""
    target = np.array([0.0, 0.0, HEIGHT_M * 0.58])
    rigs = [  # (position for the front view, size, watts)
        ((-2.8, -2.4, 3.0), 2.4, 380),   # key: high, camera-left, raking across the forms
        ((2.9, -2.3, 1.3), 3.2, 55),     # broad fill keeps the shadow side readable in grayscale
        ((-2.1, 2.6, 2.5), 1.6, 200),    # rims keep the silhouette off the paper
        ((2.3, 2.5, 2.1), 1.6, 160),
        ((0.0, -0.4, 4.2), 2.0, 50),     # soft top
    ]
    from mathutils import Vector
    for i, (pos, size, watts) in enumerate(rigs):
        p = np.array(pos) * ([-1, -1, 1] if behind else 1)
        light = bpy.data.lights.new(f"rig{i}", "AREA")
        light.shape, light.size, light.energy = "DISK", size, watts
        ob = bpy.data.objects.new(f"rig{i}", light)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = p
        ob.rotation_euler = Vector(target - p).to_track_quat("-Z", "Y").to_euler()


def setup_cycles(samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    sc.cycles.device = "GPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "AgX"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    world = bpy.data.worlds.new("studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.05
    sc.world = world
    return sc


def ortho_camera(sc, behind, cx, cz, scale, rx, ry):
    cam = sc.camera
    if cam is None:
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        sc.collection.objects.link(cam)
        sc.camera = cam
    cam.data.type, cam.data.ortho_scale = "ORTHO", scale
    cam.data.clip_start, cam.data.clip_end = 0.1, 50
    cam.location = (cx, 10.0 if behind else -10.0, cz)
    cam.rotation_euler = (math.radians(90), 0, math.radians(180 if behind else 0))
    sc.render.resolution_x, sc.render.resolution_y = rx, ry


def clear_lights():
    for o in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(o)


def lookdev(ob, work, tag):
    sc = setup_cycles(48)
    ob.data.materials.append(porcelain_material())
    H = HEIGHT_M
    shots = [("front", False, 0, H / 2, 1.9, 640, 1400), ("back", True, 0, H / 2, 1.9, 640, 1400),
             ("upperback", True, 0, H * 0.72, 0.62, 800, 800), ("legsback", True, 0, H * 0.26, 0.62, 800, 800),
             ("torso", False, 0, H * 0.7, 0.62, 800, 800), ("legsfront", False, 0, H * 0.3, 0.62, 800, 800)]
    for name, behind, cx, cz, scale, rx, ry in shots:
        clear_lights()
        light_rig(behind)
        ortho_camera(sc, behind, cx if not behind else -cx, cz, scale, rx, ry)
        sc.render.filepath = os.path.join(work, f"{tag}_{name}.png")
        bpy.ops.render.render(write_still=True)


def soften_nipples(B, F, nipples):
    """Replace the chest points (at the MakeHuman breast-bone tips) by the surrounding pectoral surface."""
    adj = L.Adjacency(F["body"])
    for p in nipples:
        B = L.flatten_bump(B, F["body"], adj, p, *NIPPLE_RADII)
    return B


def landmarks(P, bones, to_final):
    j = lambda b, end="head": to_final(P.xf(b, bones[b][end]))  # noqa: E731
    return dict(c7=j("neck01"), gh=j("upperarm01.L"), elbow=j("lowerarm01.L"), wrist=j("wrist.L"),
                hip=j("upperleg01.L"), knee=j("lowerleg01.L"), ankle=j("foot.L"), nipple=j("breast.L", "tail"), nipple_r=j("breast.R", "tail"),
                mcp=j("finger3-1.L"), head=j("head"), head_top=j("head", "tail"), eye=j("eye.L"), toe=j("toe3-1.L"))


def build_figure(data_dir):
    """Shaped, posed, 1.72 m base mesh (MakeHuman topology) + landmarks."""
    B, UV, F, G = shaped_vertices(data_dir)
    B, P, bones = pose_vertices(data_dir, B, G)
    body = np.array(G["body"])
    zmin, zmax = B[body, 2].min(), B[body, 2].max()
    scale = HEIGHT_M / (zmax - zmin)
    to_final = lambda p: (np.asarray(p) - [0.0, 0.0, zmin]) * scale  # noqa: E731
    B = to_final(B)
    lm = landmarks(P, bones, to_final)
    B = soften_nipples(B, F, [lm["nipple"], lm["nipple_r"]])
    ob, _ = L.make_object(bpy, "AuraBase", B, F["body"], UV, body)
    ob.data.shade_smooth()
    return ob, lm


def sculpted(base, lm, levels, name):
    """Catmull-Clark `levels`, then the anatomical relief along the smooth normals."""
    mod = base.modifiers.new("sub", "SUBSURF")
    mod.levels = mod.render_levels = levels
    mod.uv_smooth = "PRESERVE_CORNERS"
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(base.evaluated_get(dg))
    base.modifiers.remove(mod)
    me.name = name
    n = len(me.vertices)
    P, N = np.zeros(n * 3), np.zeros(n * 3)
    me.vertices.foreach_get("co", P)
    me.vertex_normals.foreach_get("vector", N)
    P, N = P.reshape(-1, 3), N.reshape(-1, 3)
    d = relief.displacement(P, N, relief.forms_for(lm)) * RELIEF_GAIN
    me.vertices.foreach_set("co", (P + N * d[:, None]).ravel())
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.shade_smooth()
    return ob


# ------------------------------------------------------------------ web model: decimate, bake, export


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def web_mesh(high):
    """Collapse-decimate the sculpted mesh to the web budget, triangulated as exported."""
    ob = bpy.data.objects.new("AuraBody", high.data.copy())
    bpy.context.scene.collection.objects.link(ob)
    ob.data.name = "AuraBody"
    dec = ob.modifiers.new("dec", "DECIMATE")
    dec.decimate_type, dec.use_collapse_triangulate = "COLLAPSE", True
    dec.ratio = WEB_TRIANGLES / tri_count(high)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.remove(dec)
    old, ob.data = ob.data, me
    bpy.data.meshes.remove(old)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.to_mesh(me)
    bm.free()
    me.name = "AuraBody"
    me.shade_smooth()
    return ob


def bake_ao(source, target, distance, samples):
    """Cycles AO of `source` baked onto `target`'s UVs (selected to active) through an emission shader."""
    sc = bpy.context.scene
    sc.cycles.samples = samples
    img = bpy.data.images.new(f"bake_ao_{distance}", TEX_SIZE, TEX_SIZE, float_buffer=True, alpha=False)
    m = bpy.data.materials.new(f"bake_ao_{distance}")
    nt = m.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    em = nt.nodes.new("ShaderNodeEmission")
    node = nt.nodes.new("ShaderNodeAmbientOcclusion")
    node.inputs["Distance"].default_value = distance
    node.only_local, node.samples = True, 32
    nt.links.new(node.outputs["AO"], em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
    source.data.materials.clear()
    source.data.materials.append(m)
    t = bpy.data.materials.new("bake_target")
    tex = t.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    t.node_tree.nodes.active = tex
    target.data.materials.clear()
    target.data.materials.append(t)
    for o in sc.objects:
        o.select_set(o in (source, target))
    bpy.context.view_layer.objects.active = target
    b = sc.render.bake
    b.use_selected_to_active, b.cage_extrusion, b.max_ray_distance = True, 0.008, 0.02
    b.margin, b.margin_type = 0, "EXTEND"  # our own margin below: Cycles' edge texels can sample off the surface
    bpy.ops.object.bake(type="EMIT")
    px = np.array(img.pixels[:], dtype=np.float32).reshape(TEX_SIZE, TEX_SIZE, 4)[..., 0]
    bpy.data.images.remove(img)
    return px


def uv_coverage(ob, size):
    """True for texels whose centre lies inside a UV triangle of `ob` (all faces are triangles)."""
    me = ob.data
    uv = np.zeros(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get("uv", uv)
    tri = uv.reshape(-1, 3, 2) * size - 0.5          # texel centres at integer coordinates
    cover = np.zeros((size, size), bool)
    for (ax, ay), (bx, by), (cx, cy) in tri:
        x0, x1 = max(int(np.ceil(min(ax, bx, cx))), 0), min(int(np.floor(max(ax, bx, cx))), size - 1)
        y0, y1 = max(int(np.ceil(min(ay, by, cy))), 0), min(int(np.floor(max(ay, by, cy))), size - 1)
        if x1 < x0 or y1 < y0:
            continue
        X, Y = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-12:
            continue
        l1 = ((by - cy) * (X - cx) + (cx - bx) * (Y - cy)) / d
        l2 = ((cy - ay) * (X - cx) + (ax - cx) * (Y - cy)) / d
        cover[y0:y1 + 1, x0:x1 + 1] |= (l1 >= -1e-4) & (l2 >= -1e-4) & (l1 + l2 <= 1 + 1e-4)
    return cover


def dilate(values, valid, steps):
    """Grow valid texels outwards (mean of valid 8-neighbours) so filtering never reads unbaked texels."""
    v, ok = np.where(valid, values, 0.0), valid.astype(float)
    for _ in range(steps):
        pv, pk = np.pad(v, 1), np.pad(ok, 1)
        s = sum(pv[1 + dy:1 + dy + v.shape[0], 1 + dx:1 + dx + v.shape[1]] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        k = sum(pk[1 + dy:1 + dy + v.shape[0], 1 + dx:1 + dx + v.shape[1]] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        grow = (ok == 0) & (k > 0)
        v[grow], ok[grow] = s[grow] / k[grow], 1.0
    return np.where(ok > 0, v, 1.0)


def form_map(high, web, path):
    """Base colour = baked form shading (near-white open surfaces, soft shade between muscle masses), as JPEG."""
    setup_cycles(64)
    near = bake_ao(high, web, 0.08, 256)     # between muscle masses, spine groove, eyelid line, finger gaps
    far = bake_ao(high, web, 0.2, 256)       # armpits, between the legs, under the glutes
    lin = 1.0 - FORM_NEAR * (1.0 - near) - FORM_FAR * (1.0 - far)
    lin = np.clip(dilate(lin, uv_coverage(web, TEX_SIZE), 24), FORM_FLOOR, 1.0)
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)
    img = bpy.data.images.new("aura-body-form", TEX_SIZE, TEX_SIZE, alpha=False)
    img.pixels.foreach_set(np.dstack([srgb, srgb, srgb, np.ones_like(srgb)]).astype(np.float32).ravel())
    sc = bpy.context.scene
    sc.render.image_settings.file_format, sc.render.image_settings.quality = "JPEG", JPEG_QUALITY
    sc.render.image_settings.color_mode = "BW"
    sc.view_settings.view_transform, sc.view_settings.look = "Standard", "None"  # store the values as computed
    img.save_render(path, scene=sc)
    bpy.data.images.remove(img)
    for o in sc.objects:
        o.select_set(False)
    return bpy.data.images.load(path)


def export_glb(ob, tex_img, path):
    m = bpy.data.materials.new("AuraBody")
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.55
    m.use_backface_culling = True  # closed mesh: exported single-sided
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = tex_img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    ob.data.materials.clear()
    ob.data.materials.append(m)
    for o in bpy.context.scene.objects:
        o.select_set(o is ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials="EXPORT",
        export_image_format="AUTO", export_draco_mesh_compression_enable=False, export_animations=False,
        export_skins=False, export_morph=False, export_cameras=False, export_lights=False, export_extras=False)


# ------------------------------------------------------------------ surface anchors (ray-cast on the exported mesh)


def anchor_rays(lm):
    """(region, side, surface, origin, direction) in Blender axes, left side; right is mirrored.

    front/back anchors are what the camera sees first along -Y/+Y; edge anchors are cast from a point
    inside the body outwards, so they land on the outer surface whatever hangs beside it (the hands).
    """
    c7, gh, el, wr, hip, kn, an = (lm[k] for k in ("c7", "gh", "elbow", "wrist", "hip", "knee", "ankle"))
    nip, mcp, eye, top, skull = lm["nipple"], lm["mcp"], lm["eye"], lm["head_top"], lm["head"]
    back = c7[2] - hip[2]
    lvl = lambda f: c7[2] - f * back  # noqa: E731
    lerp = lambda a, b, t: a + t * (b - a)  # noqa: E731
    FRONT, BACK = np.array([0.0, 1.0, 0.0]), np.array([0.0, -1.0, 0.0])
    fr = lambda x, z: (np.array([x, -2.0, z]), FRONT)  # noqa: E731
    bk = lambda x, z: (np.array([x, 2.0, z]), BACK)  # noqa: E731
    arm_axis = (el - gh) / np.linalg.norm(el - gh)
    arm_out = np.array([1.0, 0, 0]) - arm_axis[0] * arm_axis
    up = math.radians(40)
    neck = lerp(c7, skull, 0.5)
    foot = lerp(an, lm["toe"], 0.45)
    rays = [
        ("head", "centre", "front", *fr(0.0, lerp(eye, top, 0.42)[2])),
        ("neck", "centre", "back", *bk(0.0, neck[2])),
        ("neck", "left", "edge", neck, np.array([1.0, 0, 0])),
        ("shoulder", "left", "edge", gh, np.array([math.cos(up), 0, math.sin(up)])),
        ("shoulder_blade", "left", "back", *bk(0.116, lvl(0.2))),
        ("upper_back", "centre", "back", *bk(0.0, lvl(0.17))),
        ("mid_back", "centre", "back", *bk(0.0, lvl(0.38))),
        ("lower_back", "left", "back", *bk(0.04, lvl(0.77))),
        ("lower_back", "centre", "back", *bk(0.0, lvl(0.77))),
        ("chest", "left", "front", *fr(nip[0] * 0.85, nip[2] + 0.03)),
        ("chest", "centre", "front", *fr(0.0, nip[2] + 0.03)),
        ("abdomen", "centre", "front", *fr(0.0, lerp(hip, nip, 0.48)[2])),
        ("upper_arm", "left", "edge", lerp(gh, el, 0.45), arm_out / np.linalg.norm(arm_out)),
        ("elbow", "left", "back", *bk(el[0], el[2])),
        ("forearm", "left", "front", *fr(*lerp(el, wr, 0.33)[[0, 2]])),
        ("hand", "left", "front", *fr(*lerp(wr, mcp, 0.55)[[0, 2]])),
        ("hip", "left", "edge", hip - [0, 0, 0.04], np.array([1.0, 0, 0])),
        ("glute", "left", "back", *bk(0.075, hip[2] - 0.06)),
        ("thigh_front", "left", "front", *fr(*lerp(hip, kn, 0.45)[[0, 2]])),
        ("thigh_back", "left", "back", *bk(*lerp(hip, kn, 0.5)[[0, 2]])),
        ("knee", "left", "front", *fr(kn[0], kn[2] + 0.026)),
        ("shin", "left", "front", *fr(*lerp(kn, an, 0.4)[[0, 2]])),
        ("calf", "left", "back", *bk(lerp(kn, an, 0.27)[0] - 0.006, lerp(kn, an, 0.27)[2])),
        ("foot", "left", "front", foot + [0, -0.25, 0.25], np.array([0.0, 0.7071, -0.7071])),
    ]
    out = []
    for region, side, surface, o, d in rays:
        out.append((region, side, surface, o, d))
        if side == "left":
            out.append((region, "right", surface, o * [-1, 1, 1], d * [-1, 1, 1]))
    return out


def write_anchors(ob, lm, path):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from mathutils.interpolate import poly_3d_calc
    me = ob.data
    verts = [v.co.copy() for v in me.vertices]
    bvh = BVHTree.FromPolygons(verts, [p.vertices[:] for p in me.polygons])
    to_gltf = lambda v: [round(v[0], 5), round(v[2], 5), round(-v[1], 5)]  # noqa: E731
    anchors = []
    for region, side, surface, o, d in anchor_rays(lm):
        d = Vector(d).normalized()
        if surface == "edge":  # outermost exit among parallel rays through the body: the silhouette point
            hits = [bvh.ray_cast(Vector(o) + Vector((0, dy, 0)), d) for dy in np.linspace(-0.03, 0.03, 25)]
            loc, _, idx, _ = max((h for h in hits if h[0] is not None), key=lambda h: h[0].dot(d))
        else:
            loc, _, idx, _ = bvh.ray_cast(Vector(o), d)
        if loc is None:
            raise RuntimeError(f"anchor ray missed: {region}/{side}")
        poly = me.polygons[idx]
        w = poly_3d_calc([verts[i] for i in poly.vertices], loc)
        n = sum((me.vertices[i].normal * wi for i, wi in zip(poly.vertices, w)), Vector()).normalized()
        anchors.append({"region": region, "side": side, "position": to_gltf(loc), "normal": to_gltf(n), "surface": surface})
    with open(path, "w") as fh:
        json.dump(anchors, fh, indent=2)
        fh.write("\n")


# ------------------------------------------------------------------ print renders + view frames


def print_frame(high):
    co = np.zeros(len(high.data.vertices) * 3)
    high.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    half_w = np.abs(co[:, 0]).max() + PRINT_MARGIN
    frame_h = max(co[:, 2].max() + 2 * PRINT_MARGIN, 2 * half_w * PRINT_H / PRINT_W)
    return frame_h, frame_h * PRINT_W / PRINT_H, co[:, 2].max() / 2


def print_renders(high, out_dir):
    sc = setup_cycles(PRINT_SAMPLES)
    high.data.materials.clear()
    high.data.materials.append(porcelain_material())
    for o in sc.objects:
        o.hide_render = o is not high and o.type == "MESH"
    fh, fw, cz = print_frame(high)
    views = {"width": PRINT_W, "height": PRINT_H, "units": "metres, glTF axes of aura-body.glb (+Y up, figure faces +Z, anatomical left +X)",
             "mapping": "imageX = (x - left) / (right - left) * width; imageY = (top - y) / (top - bottom) * height; pixel (0,0) is the top-left corner"}
    for name, behind in (("front", False), ("back", True)):
        clear_lights()
        light_rig(behind)
        ortho_camera(sc, behind, 0.0, cz, fh, PRINT_W, PRINT_H)
        sc.camera.data.sensor_fit = "VERTICAL"
        sc.render.filepath = os.path.join(out_dir, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        edge = fw / 2 * (-1 if behind else 1)
        views[name] = {"left": round(-edge, 6), "right": round(edge, 6), "bottom": round(cz - fh / 2, 6),
                       "top": round(cz + fh / 2, 6), "lookFrom": "-Z" if behind else "+Z",
                       "imageXIncreasesWith": "-X (model +X, the anatomical left, is on the image's left)" if behind
                       else "+X (model +X, the anatomical left, is on the image's right)"}
    with open(os.path.join(out_dir, "views.json"), "w") as fh_:
        json.dump(views, fh_, indent=2)
        fh_.write("\n")


def main():
    args = parse_args()
    os.makedirs(args.work, exist_ok=True)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    base, lm = build_figure(args.mpfb_data)
    base.hide_render = True
    if args.stage == "preview":
        lookdev(sculpted(base, lm, 2, "AuraHigh"), args.work, "pv")
        return
    models, prints = os.path.join(REPO, "public", "models"), os.path.join(REPO, "public", "body")
    os.makedirs(models, exist_ok=True)
    os.makedirs(prints, exist_ok=True)
    web = web_mesh(sculpted(base, lm, 1, "AuraLevel1"))   # mild decimation of level 1: no slivers
    level2 = sculpted(base, lm, 2, "AuraLevel2")            # bake source
    tex = form_map(level2, web, os.path.join(args.work, "aura-body-form.jpg"))
    level2.hide_render = True
    export_glb(web, tex, os.path.join(models, "aura-body.glb"))
    write_anchors(web, lm, os.path.join(REPO, "src", "features", "body", "anchors.json"))
    print_renders(sculpted(base, lm, 3, "AuraPrint"), prints)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.work, "aura-body.blend"))


if __name__ == "__main__":
    main()
