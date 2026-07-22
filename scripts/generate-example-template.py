from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


WIDTH = 600
HEIGHT = 1800
SLOTS = [
    (30, 45, 570, 450),
    (30, 480, 570, 885),
    (30, 915, 570, 1320),
]

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "templates" / "tobfest-half-4r-strip-example.png"
FONT_PATH = "/System/Library/Fonts/HelveticaNeue.ttc"


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size=size, index=1)


def main() -> None:
    image = Image.new("RGBA", (WIDTH, HEIGHT), (255, 248, 235, 255))
    draw = ImageDraw.Draw(image, "RGBA")

    # Full-canvas festival artwork. The transparent windows are cut afterwards.
    draw.rectangle((0, 0, 18, HEIGHT), fill=(255, 90, 54, 255))
    draw.rectangle((582, 0, WIDTH, HEIGHT), fill=(23, 23, 17, 255))
    draw.polygon([(0, 0), (210, 0), (0, 160)], fill=(184, 244, 61, 255))
    draw.polygon([(600, 1800), (390, 1800), (600, 1640)], fill=(57, 116, 255, 255))

    for y in range(80, HEIGHT, 180):
        draw.ellipse((4, y, 14, y + 10), fill=(255, 210, 63, 255))

    for y in range(35, HEIGHT, 150):
        draw.line((586, y, 596, y + 10), fill=(255, 248, 235, 210), width=3)

    # Cut three true transparent 4:3 photo windows and add print-safe outlines.
    for index, slot in enumerate(SLOTS, start=1):
        draw.rounded_rectangle(slot, radius=20, fill=(0, 0, 0, 0))
        draw.rounded_rectangle(slot, radius=20, outline=(23, 23, 17, 255), width=12)
        draw.text((300, slot[3] + 14), f"0{index}", font=font(22), fill=(23, 23, 17, 255), anchor="ma")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
