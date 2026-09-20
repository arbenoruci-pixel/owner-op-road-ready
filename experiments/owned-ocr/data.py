"""Explicit, reproducible data provenance and group-separated evaluation."""
import hashlib
import json
import random
from pathlib import Path
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


def image_tensor(image):
    image = ImageOps.exif_transpose(image).convert('L')
    if image.height < 1 or image.width < 1:
        raise ValueError('Empty line image')
    pixels = np.asarray(image)
    border = np.concatenate((pixels[0],pixels[-1],pixels[:,0],pixels[:,-1]))
    if np.quantile(border,.8) < 100:
        # Reverse-print labels (white letters in a dark cell) use the same ink
        # convention as ordinary text. Never infer letters from the cell label.
        image = ImageOps.invert(image)
    width = max(8, round(image.width * 32 / image.height))
    width = (width + 3) // 4 * 4
    if width > 2048:
        raise ValueError('Line is too wide; split the region before reading')
    image = image.resize((width, 32), Image.Resampling.BILINEAR)
    return torch.from_numpy((1 - np.asarray(image, dtype=np.float32) / 255).copy())[None]


def collate(samples, alphabet):
    widths = [sample[0].shape[-1] for sample in samples]
    padded_width = (max(widths) + 3) // 4 * 4
    images = torch.zeros(len(samples), 1, 32, padded_width)
    labels, lengths = [], []
    for i, (image, text) in enumerate(samples):
        images[i, :, :, :image.shape[-1]] = image
        encoded = [alphabet.index(char) + 1 for char in text]
        # Adjacent repeated letters require a separating blank timestep.
        needed = len(encoded) + sum(a == b for a, b in zip(encoded, encoded[1:]))
        if widths[i] // 4 < needed:
            raise ValueError('Line is too compressed for its transcription')
        labels.extend(encoded)
        lengths.append(len(encoded))
    return images, torch.tensor(labels), torch.tensor([w // 4 for w in widths]), torch.tensor(lengths)


WORDS = ('INVOICE BOL TOTAL SHIPPER DATE WEIGHT CARRIER AMOUNT REFERENCE ORDER '
         'RATE CONFIRMATION DELIVERY PICKUP APPOINTMENT NUMBER ADDRESS CITY STATE ZIP '
         'PHONE CONTACT TRAILER EQUIPMENT MILES DESCRIPTION QUANTITY PALLETS CASES '
         'GROSS NET TARE FREIGHT LINEHAUL SURCHARGE PAYMENT RECEIVED SIGNATURE '
         'TRANSPORT LOGISTICS SYSTEMS EXPRESS SERVICES WAREHOUSE DISTRIBUTION '
         'ROAD STREET DRIVE AVENUE DOCK SUITE PARKWAY NORTH SOUTH EAST WEST '
         'PRINT COPY ORIGINAL NOTES REQUIRED ONLY LOAD SPECIAL INSTRUCTIONS '
         'ALPHA BRAVO CHARLIE DELTA ECHO FOXTROT').split()


def synthetic_text(rng, alphabet):
    """Generic generated content: never import a customer's document into training."""
    mode = rng.randrange(7)
    if mode == 0:
        text = ''.join(rng.choice('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-') for _ in range(rng.randint(4, 18)))
    elif mode == 1:
        text = f'{rng.randint(1,12):02}/{rng.randint(1,28):02}/{rng.randint(20,30):02} {rng.randint(1,12):02}:{rng.randint(0,59):02} ' + rng.choice(['AM', 'PM', 'EST', 'CST'])
    elif mode == 2:
        value = f'{rng.randint(1,99999):,}.{rng.randint(0,99):02}'
        text = rng.choice(['$', '', 'Weight: ', 'TOTAL: ', 'Rate: ']) + value + rng.choice(['', ' LB', ' KG', ' USD'])
    elif mode == 3:
        text = rng.choice(WORDS) + ': ' + ''.join(rng.choice('0123456789') for _ in range(rng.randint(3,12)))
    elif mode in (4, 5):
        text = ' '.join(rng.choices(WORDS, k=rng.randint(1,4)))
        if rng.random() < .45:
            text = text.title()
        if rng.random() < .2:
            text = str(rng.randint(1,9999)) + ' ' + text
    else:
        text = ''.join(rng.choice(alphabet) for _ in range(rng.randint(3,24))).strip() or '0'
    return text[:42].strip()


def synthetic_sample(rng, fonts, alphabet, digits_only=False):
    if digits_only:
        text = ''.join(rng.choice('0123456789') for _ in range(rng.randint(3, 9)))
    else:
        text = synthetic_text(rng, alphabet)
    if any(char not in alphabet for char in text):
        raise ValueError('Unsupported synthetic alphabet')
    font_path = rng.choice(fonts)
    font = ImageFont.truetype(str(font_path), rng.randint(18, 38))
    bounds = font.getbbox(text)
    ink_height = bounds[3] - bounds[1]
    padding = max(2, round(ink_height * rng.uniform(.14, .32)))
    image = Image.new('L', (bounds[2] - bounds[0] + padding*2, ink_height + padding*2), rng.randint(225, 255))
    ImageDraw.Draw(image).text((padding-bounds[0], padding-bounds[1]), text, font=font, fill=rng.randint(0, 65))
    image = image.rotate(rng.uniform(-.7, .7), expand=False, fillcolor=255)
    if rng.random() < .35:
        # Low-resolution print/scan simulation, with transcription unchanged.
        scale = rng.uniform(.55, .95)
        image = image.resize((max(8, round(image.width*scale)), max(8, round(image.height*scale))), Image.Resampling.BILINEAR)
    if rng.random() < .25:
        image = image.filter(ImageFilter.GaussianBlur(rng.uniform(.1, .5)))
    return image_tensor(image), text


def read_manifest(path, split):
    path = Path(path).resolve()
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    groups, images, ids = {}, {}, set()
    for row in rows:
        for key in ('id', 'image', 'text', 'group', 'split', 'provenance'):
            if key not in row:
                raise ValueError(f'Missing {key}')
        if row['id'] in ids:
            raise ValueError('Duplicate sample ID')
        ids.add(row['id'])
        if row['split'] not in ('train', 'validation', 'test'):
            raise ValueError('Unknown split')
        if not row['group'] or not row['provenance']:
            raise ValueError('Document group and data provenance are required')
        if row['group'] in groups and groups[row['group']] != row['split']:
            raise ValueError('Document group leaks across splits')
        groups[row['group']] = row['split']
        image_path = (path.parent / row['image']).resolve()
        if not image_path.is_relative_to(path.parent):
            raise ValueError('Image must be inside the dataset directory')
        # Hash decoded pixels: re-encoding the same image must not evade the split guard.
        with Image.open(image_path) as original:
            decoded = ImageOps.exif_transpose(original).convert('L')
            digest = hashlib.sha256(str(decoded.size).encode() + decoded.tobytes()).hexdigest()
        if digest in images and images[digest] != row['split']:
            raise ValueError('Image content leaks across splits')
        images[digest] = row['split']
        row['_path'] = image_path
    return [row for row in rows if row['split'] == split]


def load_samples(rows):
    samples = []
    for row in rows:
        with Image.open(row['_path']) as image:
            samples.append((image_tensor(image), row['text']))
    return samples
