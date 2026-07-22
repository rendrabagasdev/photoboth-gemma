from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


WIDTH = 1200
HEIGHT = 1800
SLOTS = [
    (220, 15, 980, 585),
    (220, 615, 980, 1185),
    (220, 1215, 980, 1785),
]

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "templates" / "tobfest-4r-portrait-example.png"
FONT_PATH = "/System/Library/Fonts/HelveticaNeue.ttc"


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size=size, index=1)


def main() -> None:
    image = Image.new("RGBA", (WIDTH, HEIGHT), (255, 248, 235, 255))
    draw = ImageDraw.Draw(image, "RGBA")

    # Full-canvas festival artwork. The transparent windows are cut afterwards.
    draw.rectangle((0, 0, 174, HEIGHT), fill=(255, 90, 54, 255))
    draw.rectangle((1026, 0, WIDTH, HEIGHT), fill=(23, 23, 17, 255))
    draw.polygon([(0, 0), (430, 0), (0, 330)], fill=(184, 244, 61, 255))
    draw.polygon([(1200, 1800), (770, 1800), (1200, 1470)], fill=(57, 116, 255, 255))

    for y in range(80, HEIGHT, 180):
        draw.ellipse((52, y, 122, y + 70), fill=(255, 210, 63, 255))

    for y in range(35, HEIGHT, 150):
        draw.line((1070, y, 1156, y + 86), fill=(255, 248, 235, 210), width=10)

    # Cut three true transparent 4:3 photo windows and add print-safe outlines.
    for index, slot in enumerate(SLOTS, start=1):
        draw.rounded_rectangle(slot, radius=20, fill=(0, 0, 0, 0))
        draw.rounded_rectangle(slot, radius=20, outline=(23, 23, 17, 255), width=12)
        draw.text((72, slot[1] + 250), f"0{index}", font=font(42), fill=(23, 23, 17, 255), anchor="mm")

    title_layer = Image.new("RGBA", (580, 110), (0, 0, 0, 0))
    title_draw = ImageDraw.Draw(title_layer)
    title_draw.text((290, 55), "TOBFEST", font=font(66), fill=(255, 248, 235, 255), anchor="mm")
    rotated_title = title_layer.rotate(90, expand=True, resample=Image.Resampling.BICUBIC)
    image.alpha_composite(rotated_title, (1038, 610))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
