import math
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from PIL import Image, ImageDraw


STRIP_WIDTH = 600
STRIP_HEIGHT = 1800
PRINT_WIDTH = 1200
BACKGROUND = (255, 216, 226, 255)

# Geometry follows the six 600 x 1800 base layouts supplied by the designer.
LAYOUTS = {
    "full": {
        "name": "Frame 4",
        "slots": [(0, 27, 600, 450, 0), (0, 496, 600, 450, 0), (0, 965, 600, 450, 0)],
    },
    "lower": {
        "name": "Frame 5",
        "slots": [(0, 378, 600, 450, 0), (0, 849, 600, 450, 0), (0, 1320, 600, 450, 0)],
    },
    "editorial": {
        "name": "Frame 6",
        "slots": [(0, 27, 600, 450, 0), (0, 519, 516, 387, 0), (84, 948, 516, 387, 0)],
    },
    "inset": {
        "name": "Frame 7",
        "slots": [(48, 143, 504, 378, 0), (48, 612, 504, 378, 0), (48, 1081, 504, 378, 0)],
    },
    "staggered": {
        "name": "Frame 8",
        "slots": [(0, 90, 519, 389, 0), (81, 538, 519, 389, 0), (0, 986, 519, 389, 0)],
    },
    "tilted": {
        "name": "Frame 9",
        "slots": [(15, 119, 450, 338, -6.03), (100, 634, 450, 338, 9.37), (61, 1137, 450, 338, -3)],
    },
}

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = ROOT / "public" / "templates"
LEGACY_STRIP_OUTPUT = TEMPLATE_DIR / "tobfest-half-4r-strip-example.png"
PRINT_OUTPUT = TEMPLATE_DIR / "tobfest-4r-portrait-example.png"
ZIP_OUTPUT = TEMPLATE_DIR / "tobfest-template-layouts.zip"


def rotated_corners(slot: tuple[float, float, float, float, float]) -> list[tuple[float, float]]:
    x, y, width, height, rotation = slot
    center_x = x + width / 2
    center_y = y + height / 2
    radians = math.radians(rotation)
    cosine = math.cos(radians)
    sine = math.sin(radians)
    corners = []
    for local_x, local_y in [
        (-width / 2, -height / 2),
        (width / 2, -height / 2),
        (width / 2, height / 2),
        (-width / 2, height / 2),
    ]:
        corners.append((
            center_x + local_x * cosine - local_y * sine,
            center_y + local_x * sine + local_y * cosine,
        ))
    return corners


def create_strip(slots: list[tuple[float, float, float, float, float]]) -> Image.Image:
    scale = 4
    image = Image.new("RGBA", (STRIP_WIDTH * scale, STRIP_HEIGHT * scale), BACKGROUND)
    draw = ImageDraw.Draw(image)
    for slot in slots:
        corners = [(x * scale, y * scale) for x, y in rotated_corners(slot)]
        draw.polygon(corners, fill=(0, 0, 0, 0))
    return image.resize((STRIP_WIDTH, STRIP_HEIGHT), Image.Resampling.LANCZOS)


def main() -> None:
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    generated: list[tuple[str, str, Path]] = []

    for layout_id, layout in LAYOUTS.items():
        output = TEMPLATE_DIR / f"tobfest-layout-{layout_id}.png"
        strip = create_strip(layout["slots"])
        strip.save(output, format="PNG", optimize=True)
        generated.append((layout_id, layout["name"], output))

        if layout_id == "full":
            strip.save(LEGACY_STRIP_OUTPUT, format="PNG", optimize=True)
            print_sheet = Image.new("RGBA", (PRINT_WIDTH, STRIP_HEIGHT), (0, 0, 0, 0))
            print_sheet.alpha_composite(strip, (0, 0))
            print_sheet.alpha_composite(strip, (STRIP_WIDTH, 0))
            print_sheet.save(PRINT_OUTPUT, format="PNG", optimize=True)

    guide = """CONTOH TEMPLATE TOBFEST - FRAME 4 SAMPAI FRAME 9

Semua PNG berukuran 600 x 1800 px dan memakai tepat 3 area foto landscape 4:3.
Saat mengunggah PNG di dashboard operator, pilih Frame 4-9 yang namanya sama dengan file.
Area foto pada PNG benar-benar transparan. Beberapa aplikasi mungkin menampilkannya sebagai warna hitam.
Jangan mengubah ukuran kanvas, posisi, atau rotasi area transparan.

File:
"""
    guide += "\n".join(
        f"- tobfest-layout-{layout_id}.png = {name}"
        for layout_id, name, _ in generated
    )

    with ZipFile(ZIP_OUTPUT, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("PETUNJUK.txt", guide)
        for _, name, output in generated:
            archive.write(output, arcname=f"{name}.png")


if __name__ == "__main__":
    main()
