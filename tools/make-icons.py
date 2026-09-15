"""Render the extension icons from one vector-ish master.

    python tools/make-icons.py

Draws at 512px and downsamples, so the small sizes stay clean.
The mark is a form field with its left portion already filled in — the whole
product in one shape. No LinkedIn logo, deliberately: that is their trademark.
"""

from pathlib import Path

from PIL import Image, ImageDraw

MASTER = 512
SIZES = (16, 32, 48, 128)
OUT = Path(__file__).resolve().parent.parent / "icons"

BLUE = (10, 102, 194, 255)
WHITE = (255, 255, 255, 255)
FILLED = (255, 255, 255, 255)
EMPTY = (255, 255, 255, 96)


def master() -> Image.Image:
    img = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    d.rounded_rectangle((0, 0, MASTER - 1, MASTER - 1), radius=112, fill=BLUE)

    # The field: one solid bar. Solid survives the downsample to 16px, where an
    # outline collapses into a grey smudge.
    left, right, top, bottom = 84, 428, 202, 310
    d.rounded_rectangle((left, top, right, bottom), radius=30, fill=FILLED)

    # The part still to type, knocked out of the right end.
    d.rounded_rectangle((296, 232, 400, 280), radius=16, fill=BLUE)

    return img


def main() -> None:
    OUT.mkdir(exist_ok=True)
    img = master()
    img.save(OUT / "icon.png")
    for size in SIZES:
        img.resize((size, size), Image.LANCZOS).save(OUT / f"icon{size}.png")
        print(f"wrote icons/icon{size}.png")


if __name__ == "__main__":
    main()
