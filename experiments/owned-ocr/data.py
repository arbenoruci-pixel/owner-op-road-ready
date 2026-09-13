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
    width = max(8, round(image.width * 32 / image.height))
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


def synthetic_sample(rng, fonts, alphabet, digits_only=False):
    if digits_only:
        text = ''.join(rng.choice('0123456789') for _ in range(rng.randint(3, 9)))
    else:
        labels = ['INVOICE', 'BOL', 'TOTAL', 'SHIPPER', 'DATE', 'WEIGHT', 'Carrier', 'Amount', 'Fature', 'Narta', 'PO']
        text = (rng.choice(labels) + ': ' if rng.random() < .6 else '') + ''.join(
            rng.choice('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-') for _ in range(rng.randint(3, 10)))
        if rng.random() < .3:
            text = ''.join(rng.choice(alphabet) for _ in range(rng.randint(3, 18))).strip() or '0'
    if any(char not in alphabet for char in text):
        raise ValueError('Unsupported synthetic alphabet')
    font_path = rng.choice(fonts)
    font = ImageFont.truetype(str(font_path), rng.randint(20, 30))
    bounds = font.getbbox(text)
    image = Image.new('L', (bounds[2] - bounds[0] + 12, bounds[3] - bounds[1] + 10), rng.randint(235, 255))
    ImageDraw.Draw(image).text((6-bounds[0], 5-bounds[1]), text, font=font, fill=rng.randint(0, 45))
    image = image.rotate(rng.uniform(-1.5, 1.5), expand=True, fillcolor=255)
    if rng.random() < .3:
        image = image.filter(ImageFilter.GaussianBlur(rng.uniform(.1, .55)))
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
        digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
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
