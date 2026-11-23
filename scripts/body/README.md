# AURA body: source, licence and rebuild

These scripts build the anatomical figure used by Session Mode, the client check-in and the PDF report:

| Output | What it is |
| --- | --- |
| `public/models/aura-body.glb` | Web model: one mesh, smooth normals, UVs, one plain PBR material whose base-colour texture is the baked form shading (JPEG, 2048 px, embedded). No Draco or meshopt: three.js `GLTFLoader` loads it with no decoder. |
| `public/body/front.png`, `public/body/back.png` | Print renders, 1400 × 3000 px, transparent background, orthographic. |
| `public/body/views.json` | The exact orthographic frame of each render in model coordinates, for projecting anchors onto the images. |
| `src/features/body/anchors.json` | 41 pain-marker anchors ray-cast onto the exported mesh. |

Current build: GLB 2,295,712 bytes (84,000 triangles, 52,229 vertices, 16-bit indices, 2048 px JPEG of 119 KB embedded); renders about 2.3 MB each. `check_anchors.py` passes on all 41 anchors.

## Source and licence

Everything geometric comes from the **MakeHuman assets bundled with MPFB 2.0.18** (MakeHuman Plugin For Blender), downloaded from the official Blender extensions platform:

- Listing: <https://extensions.blender.org/add-ons/mpfb/>
- Archive: <https://extensions.blender.org/download/sha256:c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad/add-on-mpfb-v2.0.18.zip>
  (sha256 `c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad`)
- Licence statement: <https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md>, section C: the bundled assets (base mesh, targets, rigs, weights) are **CC0 1.0 Universal**. The `base.obj` header repeats this ("explicitly released as CC0 in september 2020"), and `weights.default.json` carries `"license": "CC0"`.

MPFB's Python code is GPLv3. These scripts do **not** import or run it: they read the CC0 data files (`data/3dobjs/base.obj`, `data/targets/**`, `data/rigs/standard/rig.default.json`, `data/rigs/standard/weights.default.json`) and do the rest themselves. Because the sources are CC0, the derived files carry no attribution or share-alike obligation; `public/models/CREDITS.md` credits the MakeHuman team anyway. Do not commit the downloaded archive.

## What the build does

1. **Shape** (`body_lib.py`): applies the MakeHuman macro targets with the same interpolation as MakeHuman/MPFB: gender 0.5 (androgynous), age 25, muscle at maximum, weight 0.38, ideal proportions, small cup size; plus detail targets for deltoids, arms, calves, thighs and latissimus, and `bulge-decr` for a smooth pelvis.
2. **Pose** (`build_body.py`, linear blend skinning with the CC0 default rig and weights): upper arms 17° and forearms 21° from vertical with a 6° elbow bend, forearms supinated so the palms face forward, fingers gathered, legs 3° apart with flat feet, eyelids closed, lips closed. Scaled to 1.72 m, feet on the ground.
3. **Clean-up**: nipples replaced by the surrounding pectoral surface (a local quadric fit); the base mesh has no genitals, hair or eyeballs (helper geometry is discarded).
4. **Sculpt pass** (`relief.py`): the MakeHuman surface is too soft to read from across a room, so muscle masses and a few bony landmarks are added along the normal, placed from the posed skeleton: shoulder blades, infraspinatus, teres major, latissimus, erector spinae either side of the spinal groove, the three deltoid heads, clavicles, pectoral border, gluteal fold, hamstrings, both gastrocnemius heads, soleus, Achilles tendon, vastus medialis, patella. `RELIEF_GAIN` in `build_body.py` scales all of it.
5. **Web model**: Catmull-Clark level 1 with the sculpt → mild collapse decimation to `WEB_TRIANGLES` (no slivers) → two Cycles AO bakes (8 cm and 20 cm) from the level-2 sculpt onto its UVs, combined into one grey form map (`FORM_NEAR`, `FORM_FAR`, `FORM_FLOOR`). Only texels whose centre lies inside a UV triangle are kept; the margin is grown from those, so no bake texel sampled off the surface can show as a speck at a seam → glTF export.
6. **Anchors**: each region is located from skeletal landmarks (e.g. the calf at 27 % of the knee–ankle length, the shoulder blade over the infraspinous fossa) and ray-cast onto the exported mesh. Front/back anchors are the first surface the camera sees along ∓Z; edge anchors are the outermost exit point of rays cast from inside the body, i.e. the silhouette, so they show in both views.
7. **Print renders**: Catmull-Clark level 3 with the same sculpt, porcelain material, soft studio rig turned 180° for the back view, Cycles, AgX.

## Rebuild

```sh
# 1. Fetch the CC0 data into a scratch directory (not the repo) and verify it
mkdir -p /tmp/aura-body-src && cd /tmp/aura-body-src
curl -LO "https://extensions.blender.org/download/sha256:c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad/add-on-mpfb-v2.0.18.zip"
shasum -a 256 add-on-mpfb-v2.0.18.zip   # must print c075b3e9...2dad
unzip -q add-on-mpfb-v2.0.18.zip 'data/*' -d mpfb

# 2. Build (from the repo root; ~7 minutes on an M2 Max GPU)
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python scripts/body/build_body.py -- --mpfb-data /tmp/aura-body-src/mpfb/data --work /tmp/aura-body-work

# 3. Verify the anchors against the GLB, then draw them on the renders
python3 scripts/body/check_anchors.py
python3 scripts/body/proof.py /tmp/aura-body-work/proof
```

`--stage preview` renders quick look-development crops into `--work` without touching the repo. Tested with Blender 5.3 (Cycles on Metal), Python 3 with numpy and Pillow for the check and proof scripts.

## Conventions the app relies on

- glTF axes: **+Y up, feet at y = 0, metres, figure faces +Z, anatomical left is +X**, centred on x = 0 (the hip joints sit at z ≈ 0; the toes reach z ≈ +0.2).
- `views.json`: `left`/`right` are the model x at the image's left/right edge and `bottom`/`top` the model y at its bottom/top edge, so for both views
  `imageX = (x - left) / (right - left) * width`, `imageY = (top - y) / (top - bottom) * height` (pixel (0, 0) = top-left corner).
  Front (seen from +Z): `left < right`, model +X (anatomical left) is on the image's right. Back (seen from -Z): `left > right`, model +X is on the image's left.
- `anchors.json`: `{region, side, position, normal, surface}` in the same glTF axes; `surface` is `front`, `back` or `edge` (edge = on the silhouette, visible in both views).
- The base-colour texture is near-white on open surfaces and darker in the separations between muscles, so tinting the material colour keeps the form shading. It is not repeated as an occlusion texture.
