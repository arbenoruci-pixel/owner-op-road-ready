"""Owned page segmentation: pixel runs, connected components and line geometry.

No OCR dependency, learned detector, external model, or customer-specific layout.
Boxes always address the EXIF-oriented input pixels. Perspective correction and
handwriting are outside this first detector's validated scope.
"""
import numpy as np
from PIL import Image, ImageOps


def runs(values):
    edges = np.diff(np.pad(np.asarray(values, dtype=np.int8), (1, 1)))
    return list(zip(np.flatnonzero(edges == 1).tolist(), np.flatnonzero(edges == -1).tolist()))


def remove_rules(mask):
    """Remove only long, uninterrupted horizontal/vertical ink runs."""
    cleaned = mask.copy()
    horizontal = max(45, round(mask.shape[1] * .09))
    vertical = max(60, round(mask.shape[0] * .08))
    for y, row in enumerate(mask):
        for left, right in runs(row):
            if right-left >= horizontal:
                cleaned[y, left:right] = False
    for x, column in enumerate(mask.T):
        for top, bottom in runs(column):
            if bottom-top >= vertical:
                cleaned[top:bottom, x] = False
    return cleaned


def components(mask, max_components=40000):
    """Eight-connected ink components using row runs and union/find."""
    parents, boxes, counts = [], [], []

    def root(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i

    previous = []
    for y, row in enumerate(mask):
        current, cursor = [], 0
        for left, right in runs(row):
            while cursor < len(previous) and previous[cursor][1] < left:
                cursor += 1
            joined = []
            for a, b, label in previous[cursor:]:
                if a > right:
                    break
                joined.append(root(label))
            if not joined:
                label = len(parents)
                if label >= max_components:
                    raise ValueError('Page is too noisy; crop or recapture it before recognition')
                parents.append(label)
                boxes.append([left, y, right, y+1])
                counts.append(right-left)
            else:
                label = min(joined)
                for other in set(joined):
                    if other != label:
                        parents[other] = label
                        boxes[label] = union_box(boxes[label], boxes[other])
                        counts[label] += counts[other]
                boxes[label] = union_box(boxes[label], [left, y, right, y+1])
                counts[label] += right-left
            current.append((left, right, label))
        previous = current
    return [box for i, box in enumerate(boxes) if root(i) == i and counts[i] >= 2]


def union_box(a, b):
    return [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]


def group_components(boxes):
    if not boxes:
        return []
    typical = float(np.median([b[3]-b[1] for b in boxes]))
    main, small = [], []
    for box in boxes:
        (main if box[3]-box[1] >= max(3, typical*.45) else small).append(box)
    groups = []
    for box in sorted(main, key=lambda b: (b[0], b[1])):
        height = box[3]-box[1]
        choices = []
        for index, group in enumerate(groups):
            target = group['box']
            reference = group['height']
            baseline = group['baseline']
            overlap = min(box[3], target[3])-max(box[1], target[1])
            gap = max(0, box[0]-target[2], target[0]-box[2])
            if (overlap >= .4*min(height, reference) and
                    abs(box[3]-baseline) <= .5*max(height, reference) and
                    gap <= 1.9*max(height, reference) and
                    max(height, reference) <= 2.6*min(height, reference)):
                choices.append((gap + 2*abs(box[3]-baseline), index))
        if choices:
            group = groups[min(choices)[1]]
            group['box'] = union_box(group['box'], box)
            group['heights'].append(height)
            group['bottoms'].append(box[3])
            group['height'] = float(np.median(group['heights']))
            group['baseline'] = float(np.median(group['bottoms']))
        else:
            groups.append({'box': box[:], 'heights': [height], 'bottoms': [box[3]], 'height':height, 'baseline':box[3]})
    # Attach dots, commas and apostrophes only to a nearby established text line.
    for box in small:
        choices = []
        for index, group in enumerate(groups):
            target = group['box']
            height = group['height']
            dx = max(0, box[0]-target[2], target[0]-box[2])
            dy = max(0, box[1]-target[3], target[1]-box[3])
            if dx <= height*.65 and dy <= height*.45:
                choices.append((dx+dy*2, index))
        if choices:
            group = groups[min(choices)[1]]
            group['box'] = union_box(group['box'], box)
    return [g['box'] for g in groups if g['box'][2]-g['box'][0] >= 4]


def reverse_print_components(gray, boxes):
    """Recover bright glyphs enclosed in compact dark label cells."""
    output, cells = [], 0
    for box in boxes:
        left,top,right,bottom=box
        width,height=right-left,bottom-top
        if 8<=height<=150 and width>=height*1.4 and width<gray.shape[1]*.65:
            region=gray[top:bottom,left:right]
            if np.mean(region<100)>.6:
                bright=components(region>180)
                # White outside the cell touches its boundary; only enclosed
                # components are candidate letters/punctuation.
                letters=[b for b in bright if b[0]>0 and b[1]>0 and b[2]<width and b[3]<height and b[3]-b[1]>=3]
                if len(letters)>=2:
                    output.extend([[a+left,b+top,c+left,d+top] for a,b,c,d in letters])
                    cells+=1
                    continue
        output.append(box)
    return output,cells


def detect_lines(original, max_dimension=3000):
    image = ImageOps.exif_transpose(original).convert('L')
    if image.width*image.height > 40000000:
        raise ValueError('Source image is too large')
    scale = min(1., max_dimension/max(image.size))
    working = image.resize((round(image.width*scale), round(image.height*scale)), Image.Resampling.BILINEAR)
    gray = np.asarray(working)
    # A local background estimate tolerates gradual page shading. This is not a
    # perspective correction or a guarantee for dark/creased phone photographs.
    from PIL import ImageFilter
    background = np.asarray(working.filter(ImageFilter.BoxBlur(max(5, round(working.width/70)))), dtype=np.int16)
    ink = (gray.astype(np.int16) < background-30) & (gray < 185)
    ink = remove_rules(ink)
    try:
        boxes = components(ink)
    except ValueError:
        return {'regions':[], 'warnings':['page_too_noisy_recapture_required'], 'sourceSize':list(image.size),
                'detector':'owned-pixel-components-v1', 'rejectedComponents':None}
    if len(boxes) > 15000:
        return {'regions':[], 'warnings':['page_too_noisy_recapture_required'], 'sourceSize':list(image.size),
                'detector':'owned-pixel-components-v1', 'rejectedComponents':len(boxes)}
    boxes, reversed_cells = reverse_print_components(gray,boxes)
    typical = float(np.median([b[3]-b[1] for b in boxes])) if boxes else 0
    rejected = [b for b in boxes if b[3]-b[1] > max(40, typical*5) or b[2]-b[0] > working.width*.75]
    boxes = [b for b in boxes if b not in rejected]
    lines = group_components(boxes)
    regions, warnings = [], []
    for left, top, right, bottom in sorted(lines, key=lambda b: (b[1], b[0])):
        padding = max(2, round((bottom-top)*.22))
        x = max(0, int((left-padding)/scale))
        y = max(0, int((top-padding)/scale))
        x2 = min(image.width, int(np.ceil((right+padding)/scale)))
        y2 = min(image.height, int(np.ceil((bottom+padding)/scale)))
        if (x2-x)/(y2-y) > 63:
            warnings.append('line_too_wide_requires_review')
            # Do not silently truncate a long line or stretch it to fit a model.
            continue
        regions.append({'x':x, 'y':y, 'width':x2-x, 'height':y2-y})
    if rejected:
        warnings.append('large_ink_components_not_read')
    if not regions:
        warnings.append('no_printed_text_regions_found')
    if len(regions) > 1000:
        raise ValueError('More than 1000 regions; inspect the page before reading')
    return {'regions':regions, 'warnings':sorted(set(warnings)), 'sourceSize':list(image.size),
            'detector':'owned-pixel-components-v1', 'rejectedComponents':len(rejected),'reversePrintCells':reversed_cells}


def draw_regions(image, regions):
    from PIL import ImageDraw
    preview = ImageOps.exif_transpose(image).convert('RGB')
    draw = ImageDraw.Draw(preview)
    for index, region in enumerate(regions, 1):
        x,y,w,h = [region[k] for k in ('x','y','width','height')]
        draw.rectangle((x,y,x+w,y+h), outline='#cf2544', width=2)
        draw.text((x,y), str(index), fill='#0b32c4')
    return preview
