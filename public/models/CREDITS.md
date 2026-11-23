# Credits: aura-body.glb and the body print renders

Applies to `public/models/aura-body.glb`, `public/body/front.png`, `public/body/back.png` and `src/features/body/anchors.json`.

## Source

- **Asset:** MakeHuman base mesh "hm08", macro and detail targets, default skeleton and skin weights, as bundled with MPFB 2.0.18 (MakeHuman Plugin For Blender).
- **Authors:** the MakeHuman team. Copyright holders at the time of the CC0 release (September 2020): Data Collection AB, Joel Palmius, Jonas Hauquier.
- **Licence:** CC0 1.0 Universal (public domain dedication) for the assets — <https://creativecommons.org/publicdomain/zero/1.0/>.
  Statement: <https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md> (section C) and the header of `data/3dobjs/base.obj`.
- **Downloaded from:** <https://extensions.blender.org/add-ons/mpfb/> (archive `add-on-mpfb-v2.0.18.zip`, sha256 `c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad`).
- MPFB's program code (GPLv3) was not used or redistributed; only the CC0 data files were read.

CC0 requires no attribution and imposes no share-alike terms, so these derived files can be used, modified and redistributed in the public web app and the PDF report. The credit above is given as a courtesy.

## What was changed

Built by `scripts/body/build_body.py` (see `scripts/body/README.md`):

- Body shape: gender 0.5 (androgynous), age 25, maximum muscle, low body fat, ideal proportions, flat chest; extra deltoid, arm, latissimus, thigh and calf definition from the MakeHuman detail targets.
- Pose: neutral standing A-pose, arms about 17–21° from the torso, palms forward, fingers gathered, feet apart and flat; eyes and lips closed; height 1.72 m.
- Removed: eyeballs, teeth, tongue, eyelashes and all other helper geometry; nipples smoothed into the chest; no genitals (none in the base mesh).
- Added: a sculpt pass of muscle masses and bony landmarks (shoulder blades, trapezius/latissimus, erector spinae, deltoids, clavicles, glutes, hamstrings, gastrocnemius heads, Achilles tendon, knee) so the regions read from a distance.
- Web model: subdivided, decimated, ambient occlusion baked in Blender Cycles into the base-colour texture, exported as glTF binary.
- Print renders: orthographic front and back views rendered in Blender Cycles with a porcelain material and studio lighting.
