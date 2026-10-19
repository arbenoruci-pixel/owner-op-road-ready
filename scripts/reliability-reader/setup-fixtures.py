#!/usr/bin/env python3
"""Recreate the wholly fictional, two-page Reader browser inputs locally.

    python3 -m pip install reportlab==4.4.9 Pillow==12.3.0
    python3 scripts/reliability-reader/setup-fixtures.py --output /tmp/road-ready-reader-fixtures

Also requires Poppler's pdftoppm, pdftotext and pdfinfo, plus DejaVuSans.ttf.
Use --font for a nonstandard font location. The recorded toolchain used
Poppler 26.05.0 and the DejaVu font SHA-256 below. No dependencies or fonts are
downloaded by this script; no private documents or app state are read.

This preserves the original fictional text and measured native PDF layout.
The old one-off photo generator was not retained, so the photo transformation
order/resampling/fill below is an explicit deterministic reconstruction of its
recorded settings, not a claim that the old JPEG/PDF bytes are reproduced.
The output manifest records actual bytes and tool versions. This setup check
validates text/pages, not OCR accuracy; run the browser suite for that result.

Output must be a new or empty directory, so earlier test evidence is preserved.
PDF dates/IDs and embedded-image names are independent of the output path.
"""

import argparse
import hashlib
from importlib.metadata import version
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess


SOURCE = """Rate Confirmation
Load Number: TEST-80173
Broker: EXAMPLE FREIGHT LLC
Carrier: EXAMPLE CARRIER LLC
Document Date: 2026-10-12
Equipment: Dry Van
Total Rate: $2,350.00
Pickup: SAMPLE PRESS
Pickup Address: 123 Example Rd Albany, NY 12207
Pickup Date: 2026-10-12
Pickup Appointment: 08:00 - 16:00
Delivery: SAMPLE TOYS
Delivery Address: 456 Sample St Madison, WI 53703
Delivery Date: 2026-10-14
Delivery Appointment: 09:00 - 17:00
PO Number: PO-64318
Document Ref: SYNTHETIC-TEST-80173
Page 1 of 2\fRate Confirmation
Load Number: TEST-80173
Carrier: EXAMPLE CARRIER LLC
TERMS AND CONDITIONS
Carrier payment requires complete billing documentation.
Driver must verify load information with dispatch.
POD is required after delivery.
Detention: $35 per hour after three free hours.
Document Ref: SYNTHETIC-TEST-80173
Page 2 of 2"""

REFERENCE_FONT_SHA256 = "ae7b7855e115a5966d8b1b3f80f254ccc117ec86f9965e202ee2940453837280"
REFERENCE_SCAN_SHA256 = {
    "scan-1.png": "fcf04a9572ab7a08eaacb074225afbad30b253af01c85eddf5c700fb1a1c9318",
    "scan-2.png": "9c568418a4fb1ffd67133f621734f9302f0701d2f590cd3c58979c4cb239557b",
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(*command):
    return subprocess.run(command, check=True, capture_output=True, text=True).stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", type=Path, default=Path(os.environ.get("READER_UI_FIXTURES", "/tmp/road-ready-reader-fixtures")))
    parser.add_argument("--font", type=Path, default=Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
    args = parser.parse_args()
    for tool in ("pdftoppm", "pdftotext", "pdfinfo"):
        if shutil.which(tool) is None:
            parser.error(f"Missing {tool}; install Poppler utilities before generating fixtures")
    if not args.font.is_file():
        parser.error("DejaVuSans.ttf is unavailable; install DejaVu Sans or pass --font /path/to/DejaVuSans.ttf")
    if args.output.exists() and (not args.output.is_dir() or any(args.output.iterdir())):
        parser.error("Output must be new or empty; choose another directory to preserve existing evidence")
    try:
        from PIL import Image, ImageEnhance, ImageFilter, features
        from reportlab.lib.pagesizes import A4, letter
        from reportlab.lib.utils import ImageReader
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.pdfgen.canvas import Canvas
    except ImportError as error:
        parser.error(f"{error}; install reportlab==4.4.9 and Pillow==12.3.0 in an isolated Python environment")

    args.output.mkdir(parents=True, exist_ok=True)
    # Fix ReportLab's timestamp even when the caller has SOURCE_DATE_EPOCH set.
    os.environ["SOURCE_DATE_EPOCH"] = "946684800"
    pdfmetrics.registerFont(TTFont("ReaderFixtureDejaVu", str(args.font)))
    (args.output / "fixture-source.txt").write_text(SOURCE, encoding="utf-8")
    native = args.output / "synthetic-rate-native.pdf"
    canvas = Canvas(str(native), pagesize=letter, invariant=1, pageCompression=1)
    for text in SOURCE.split("\f"):
        canvas.setFont("ReaderFixtureDejaVu", 11)
        for index, line in enumerate(text.splitlines()):
            canvas.drawString(42, 748 - index * 28, line)
        canvas.showPage()
    canvas.save()
    run("pdftoppm", "-r", "180", "-png", str(native), str(args.output / "scan"))

    for number in (1, 2):
        with Image.open(args.output / f"scan-{number}.png") as scan:
            image = scan.convert("RGB").rotate(
                3.5, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=(215, 210, 200)
            )
            image = ImageEnhance.Contrast(image).enhance(0.78)
            image = image.resize((int(image.width * 0.73), int(image.height * 0.73)), Image.Resampling.LANCZOS)
            image = image.filter(ImageFilter.GaussianBlur(0.25))
            image.save(args.output / f"photo-{number}.jpg", format="JPEG", quality=82)

    for kind, extension in (("scan", "png"), ("photo", "jpg")):
        canvas = Canvas(str(args.output / f"synthetic-rate-{kind}.pdf"), pagesize=A4, invariant=1, pageCompression=1)
        for number in (1, 2):
            # ImageReader hashes the image content rather than an absolute filename.
            image = ImageReader(io.BytesIO((args.output / f"{kind}-{number}.{extension}").read_bytes()))
            canvas.drawImage(image, 0, 0, width=A4[0], height=A4[1])
            canvas.showPage()
        canvas.save()

    native_pages = [page for page in run("pdftotext", str(native), "-").split("\f") if page.strip()]
    normalize = lambda text: " ".join(text.split())
    if [normalize(page) for page in native_pages] != [normalize(page) for page in SOURCE.split("\f")]:
        raise ValueError("Generated native PDF text differs from the fixed fictional source")
    for kind in ("native", "scan", "photo"):
        pdf = args.output / f"synthetic-rate-{kind}.pdf"
        if not re.search(r"^Pages:\s+2\s*$", run("pdfinfo", str(pdf)), re.MULTILINE):
            raise ValueError(f"{pdf.name}: expected exactly two pages")
        if kind != "native" and run("pdftotext", str(pdf), "-").strip():
            raise ValueError(f"{pdf.name}: raster packet unexpectedly has a native text layer")

    poppler = subprocess.run(["pdftoppm", "-v"], check=True, capture_output=True, text=True)
    manifest = {
        "schemaVersion": 1,
        "recipeVersion": "2026-10-19.1",
        "source": "Fixed fictional RateCon source embedded in setup-fixtures.py; no private input",
        "nativeTextAndTwoPageStructureVerified": True,
        "scanAndPhotoHaveNoNativeTextLayer": True,
        "ocrRerun": False,
        "photoProvenance": "Deterministic reconstruction of recorded degradation; original one-off operation order/fill/resampling was not retained",
        "photoRecipe": {
            "order": ["rotate", "contrast", "resize", "blur", "encode JPEG"],
            "rotationDegrees": 3.5,
            "rotationResampling": "BICUBIC",
            "expand": True,
            "fillRGB": [215, 210, 200],
            "contrast": 0.78,
            "resizeScale": 0.73,
            "resizeResampling": "LANCZOS",
            "gaussianBlurRadius": 0.25,
            "jpegQuality": 82,
        },
        "toolchain": {
            "reportlab": version("reportlab"),
            "Pillow": version("Pillow"),
            "libjpeg": features.version("jpg"),
            "poppler": (poppler.stdout + poppler.stderr).splitlines()[0],
            "fontSHA256": digest(args.font),
            "fontMatchesRecordedInput": digest(args.font) == REFERENCE_FONT_SHA256,
        },
        "recordedScanByteMatches": {name: digest(args.output / name) == expected for name, expected in REFERENCE_SCAN_SHA256.items()},
        "files": {path.name: {"bytes": path.stat().st_size, "sha256": digest(path)} for path in sorted(args.output.iterdir()) if path.is_file()},
    }
    (args.output / "fixture-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Generated and checked 3 two-page PDFs, 2 scans and 2 photos in {args.output}")
    print("Native source text matches; raster packets have no hidden text. See fixture-manifest.json for hashes and toolchain.")
    print("Photo reconstruction is a new input; this setup check is not an OCR/browser pass.")


if __name__ == "__main__":
    main()
