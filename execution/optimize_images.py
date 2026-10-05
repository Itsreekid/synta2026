"""
optimize_images.py — Generate lightweight WebP versions of the site's static images.

Why: the original assets are huge (algo2.gif = 22 MB, logos are 3500x3200 px for an
80 px display, hero1.png = 826 KB). This script writes a resized `.webp` next to each
original (originals are never modified or deleted, so it's safe to re-run).

Usage (from repo root):
    python execution/optimize_images.py            # optimize everything in IMAGES
    python execution/optimize_images.py --force    # regenerate even if .webp is newer

Each entry: relative path under backend/public/source -> (max_width, quality)
  - max_width is ~2x the largest on-screen display width (sharp on retina screens)
  - Animated GIFs become animated WebP + a static "-poster.webp" (first frame)
"""
import argparse
import os
import sys

from PIL import Image, ImageSequence

ROOT = os.path.join(os.path.dirname(__file__), "..", "backend", "public", "source")

# path -> (max_width_px, webp_quality)
IMAGES = {
    # Landing page
    "hero1.png":           (1000, 82),   # hero image, shown up to ~780px
    "soon1.jpg":           (720, 78),    # course card thumbnail (~350px)
    "graphique.jfif":      (680, 78),    # course card thumbnail
    "algo2.gif":           (560, 60),    # animated course card thumbnail (~350px)
    "whiteorangeweb.png":  (320, 85),    # footer logo (80px)
    "users/imen.jpg":      (200, 80),    # testimonial avatars
    "users/baraa.jpg":     (200, 80),
    # Logos (originals are 3500px wide!)
    "logo.png":            (320, 85),    # header logo 80px, auth bubble, 150px max
    "logosynta.png":       (160, 85),    # admin sidebar 55px
    # Offers
    "offres/slogan1.png":  (900, 80),
    "offres/slogan2.png":  (900, 80),
    # Auth pages background / misc
    "back4.png":           (1920, 75),
    "soon.jpg":            (1280, 75),
    "hero.png":            (1000, 82),
    # Payment page logos
    "portoflio/QR code.jpg": (500, 85),
    "portoflio/poste.jpg":   (240, 82),
    "portoflio/d17.png":     (240, 82),
    "portoflio/enligne.jpg": (240, 82),
    "portoflio/bank.jpg":    (240, 82),
}


def kb(path):
    return round(os.path.getsize(path) / 1024)


def resize(im, max_w):
    if im.width <= max_w:
        return im
    h = round(im.height * max_w / im.width)
    return im.resize((max_w, h), Image.LANCZOS)


def optimize_static(src, dst, max_w, quality):
    with Image.open(src) as im:
        im = im.convert("RGBA") if im.mode in ("P", "LA", "RGBA") else im.convert("RGB")
        im = resize(im, max_w)
        im.save(dst, "WEBP", quality=quality, method=6)


def optimize_animated(src, dst, max_w, quality):
    with Image.open(src) as im:
        frames, durations = [], []
        for frame in ImageSequence.Iterator(im):
            durations.append(frame.info.get("duration", 80))
            frames.append(resize(frame.convert("RGB"), max_w))
        frames[0].save(
            dst, "WEBP", save_all=True, append_images=frames[1:],
            duration=durations, loop=0, quality=quality, method=4,
        )
        # Static poster (first frame) for places that don't need animation
        poster = os.path.splitext(dst)[0] + "-poster.webp"
        frames[0].save(poster, "WEBP", quality=80, method=6)
        print(f"    + poster {os.path.basename(poster)}: {kb(poster)} KB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regenerate all outputs")
    args = ap.parse_args()

    total_before = total_after = 0
    for rel, (max_w, q) in IMAGES.items():
        src = os.path.join(ROOT, rel)
        if not os.path.exists(src):
            print(f"  ! missing {rel} (skipped)")
            continue
        dst = os.path.splitext(src)[0] + ".webp"
        if not args.force and os.path.exists(dst) and os.path.getmtime(dst) > os.path.getmtime(src):
            print(f"  = {rel} up to date")
        else:
            with Image.open(src) as probe:
                animated = getattr(probe, "n_frames", 1) > 1
            (optimize_animated if animated else optimize_static)(src, dst, max_w, q)
            print(f"  ✓ {rel}: {kb(src)} KB -> {kb(dst)} KB")
        total_before += kb(src)
        total_after += kb(dst)

    print(f"\nTotal: {total_before} KB -> {total_after} KB "
          f"({100 - round(100 * total_after / max(total_before, 1))}% smaller)")


if __name__ == "__main__":
    sys.exit(main())
