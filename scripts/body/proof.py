"""Draw every anchor onto the print renders through views.json, to check alignment by eye.

  python3 scripts/body/proof.py <output dir>      (needs Pillow; writes front.png and back.png there)
"""

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


def project(view, x, y, width, height):
    """Model (glTF) x/y -> image pixels. left/right are the model x at the image's left/right edge."""
    px = (x - view["left"]) / (view["right"] - view["left"]) * width
    py = (view["top"] - y) / (view["top"] - view["bottom"]) * height
    return px, py


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(ROOT, "public", "body", "views.json")) as fh:
        views = json.load(fh)
    with open(os.path.join(ROOT, "src", "features", "body", "anchors.json")) as fh:
        anchors = json.load(fh)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 26)
    except OSError:
        font = ImageFont.load_default()
    colours = {"front": (214, 40, 57), "back": (36, 99, 235), "edge": (16, 150, 72)}
    for name in ("front", "back"):
        img = Image.open(os.path.join(ROOT, "public", "body", f"{name}.png")).convert("RGBA")
        bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
        bg.alpha_composite(img)
        draw = ImageDraw.Draw(bg)
        for a in anchors:
            if a["surface"] not in (name, "edge"):
                continue
            x, y = project(views[name], a["position"][0], a["position"][1], views["width"], views["height"])
            c = colours[a["surface"]]
            draw.ellipse([x - 11, y - 11, x + 11, y + 11], fill=c, outline=(255, 255, 255), width=3)
            label = f'{a["region"]} {a["side"][0].upper()}'
            width = draw.textlength(label, font=font)
            if a["side"] == "centre":  # centred under the dot, clear of the left/right labels beside it
                tx, ty = x - width / 2, y + 14
            else:
                tx, ty = (x + 16 if x > views["width"] / 2 else x - 16 - width), y - 15
            draw.text((tx, ty), label, fill=(20, 20, 20), font=font, stroke_width=3, stroke_fill=(255, 255, 255))
        draw.text((20, 20), f"{name.upper()}  (L = anatomical left, +X)", fill=(20, 20, 20), font=font)
        bg.convert("RGB").save(os.path.join(out_dir, f"{name}.png"))
        print(os.path.join(out_dir, f"{name}.png"))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
