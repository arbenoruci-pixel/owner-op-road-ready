"""Local document reader: native PDF first; owned pixels-to-text for scans.

Creates an auditable, offline review bundle. Does not contact an OCR service,
modify the Road Ready database, or accept/file any extracted value automatically.
"""
import argparse
import hashlib
import json
import re
import subprocess
import time
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageOps
from geometry import geometric_rows


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def native_observations(page, source_id):
    """Keep both row context and word-level geometry, without inventing boxes."""
    observations = []
    width, height = float(page.attrib['width']), float(page.attrib['height'])
    words = []
    for word in page.findall('.//{*}word'):
        words.append({'text':''.join(word.itertext()), **{k:float(word.attrib[k]) for k in ('xMin','yMin','xMax','yMax')}})
    # PDF object/flow order can visit an entire column before its neighbor.
    # Rebuild page rows from coordinates, retaining a wide row for label/value
    # context and separate cells for the existing evidence/stop-layout rules.
    for name, items in [('rows', geometric_rows(words, False)), ('cells', geometric_rows(words, True)), ('words', words)]:
        lines = []
        for item in items:
            text = item['text'].replace('\n', ' ').replace('\r', ' ').strip()
            x, y = max(0, item['xMin']), max(0, item['yMin'])
            right, bottom = min(width, item['xMax']), min(height, item['yMax'])
            if not text or right <= x or bottom <= y:
                continue
            # Match the existing native-PDF adapter's text-layer contract. This
            # denotes directly decoded PDF text, never neural OCR confidence.
            lines.append({'id':f'{name}-{len(lines)+1}', 'text':text, 'confidence':1,
                          'box':{'x':x/width, 'y':y/height, 'width':(right-x)/width,
                                 'height':(bottom-y)/height}})
        observations.append({'id':f'native-{name}', 'source':'pdf-text-layer', 'sourceImageId':source_id, 'lines':lines})
    return observations


def native_usable(observations):
    text = ' '.join(line['text'] for obs in observations[:1] for line in obs['lines'])
    return len(text) >= 15 and len(re.findall(r'\(cid:\d+\)|\ufffd', text)) == 0 and sum(c.isalnum() for c in text) >= 10


def prepare_image(path, destination):
    """Apply EXIF orientation once and preserve these exact pixels for evidence."""
    with Image.open(path) as original:
        if original.width*original.height > 40000000:
            raise ValueError('Source image is too large')
        image = ImageOps.exif_transpose(original).convert('RGB')
        image.save(destination)


def read_document(input_path, output, checkpoint=None, raster_pdf=False, format_memory=None):
    started = time.monotonic()
    input_path, output = Path(input_path).resolve(), Path(output).resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError('Choose a new or empty review directory to avoid mixing source pages and stale results')
    output.mkdir(parents=True, exist_ok=True)
    input_digest = sha256(input_path)
    pages, assets, notes, reference_words = [], [], [], []
    is_pdf = input_path.suffix.lower() == '.pdf'
    pdf_pages = None
    if is_pdf:
        extracted = subprocess.run(['pdftotext','-bbox-layout','-enc','UTF-8',str(input_path),'-'],
                                   capture_output=True, timeout=60)
        if extracted.returncode:
            raise RuntimeError('Native PDF extraction failed')
        # Some legacy Type 3 PDFs contain nonprinting glyphs illegal in XML 1.0.
        # Record removal; never substitute a guessed printable character.
        cleaned, removed = re.subn(rb'[\x00-\x08\x0b\x0c\x0e-\x1f]', b'', extracted.stdout)
        if removed:
            notes.append({'warning':'native_nonprinting_glyphs_removed','count':removed})
        pdf_pages = ET.fromstring(cleaned).findall('.//{*}page')
        count = len(pdf_pages)
    else:
        count = 1
    if not 1 <= count <= 12:
        raise ValueError('Supply 1 to 12 pages per experimental review')
    for index in range(count):
        number, page_id = index+1, f'page-{index+1}'
        image_path = output/f'{page_id}.png'
        if image_path.resolve() == input_path:
            raise ValueError('Choose an output directory that will not overwrite the original image')
        if pdf_pages is not None:
            # Rendering is not OCR. Poppler supplies the same source image for
            # both raster recognition and the evidence viewer.
            rendered = subprocess.run(['pdftoppm','-f',str(number),'-l',str(number),'-singlefile',
                '-scale-to','2200','-png',str(input_path),str(output/page_id)], capture_output=True, timeout=60)
            if rendered.returncode:
                raise RuntimeError('PDF page rendering failed')
        else:
            prepare_image(input_path, image_path)
        source_id = sha256(image_path)
        native = native_observations(pdf_pages[index], source_id) if pdf_pages is not None and not raster_pdf else []
        if native_usable(native):
            # Single-word reference boxes are for evaluation only. Feeding
            # each word as a text line can turn a word such as DELIVERY in
            # a terms paragraph into a false stop heading.
            observations, mode = native[:2], 'native-pdf'
            reference_words.append({'pageId':page_id,'lines':native[2]['lines']})
            # A text-bearing PDF can still contain untranscribed scanned regions.
            notes.append({'pageId':page_id, 'warning':'native_text_does_not_cover_handwriting_or_embedded_images'})
        else:
            if checkpoint is None:
                raise ValueError('An owned checkpoint is required for image/scanned pages')
            from recognize import recognize
            reading = recognize(checkpoint, image_path)
            observations, mode = reading['pages'][0]['observations'], 'owned-raster'
            notes.append({'pageId':page_id, 'recognition':reading['recognition']})
            from layout import draw_regions
            with Image.open(image_path) as image:
                draw_regions(image, reading['recognition']['detection']['regions']).save(output/f'{page_id}-regions.png')
        pages.append({'id':page_id, 'number':number, 'observations':observations})
        with Image.open(image_path) as image:
            assets.append({'pageId':page_id, 'sourceImageId':source_id, 'file':image_path.name,
                           'width':image.width, 'height':image.height, 'mode':mode})
    document = {'documentId':f'owned-{input_digest[:16]}', 'pages':pages}
    metadata = {'reader':'owned-document-reader-v2', 'originalSha256':input_digest,
                'checkpointSha256':sha256(checkpoint) if checkpoint else None,
                'assets':assets, 'notes':notes, 'productionReady':False, 'automaticAcceptance':False,
                'elapsedSeconds':round(time.monotonic()-started, 3)}
    (output/'input.json').write_text(json.dumps(document, ensure_ascii=False, indent=2)+'\n')
    (output/'reference-words.json').write_text(json.dumps(reference_words, ensure_ascii=False, indent=2)+'\n')
    (output/'metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+'\n')
    renderer = Path(__file__).with_name('review.mjs')
    subprocess.run(['node', str(renderer), str(output), *([str(Path(format_memory).resolve())] if format_memory else [])], check=True, timeout=60)
    return metadata


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--checkpoint', type=Path)
    parser.add_argument('--raster-pdf', action='store_true', help='Evaluate raster OCR even when native text exists')
    parser.add_argument('--format-memory', type=Path, help='Explicitly selected, previously confirmed layout memory')
    parser.add_argument('--threads', type=int, default=2)
    args = parser.parse_args()
    if args.checkpoint:
        import torch
        torch.set_num_threads(args.threads)
    print(json.dumps(read_document(args.input, args.output, args.checkpoint, args.raster_pdf, args.format_memory), ensure_ascii=False))


if __name__ == '__main__':
    main()
