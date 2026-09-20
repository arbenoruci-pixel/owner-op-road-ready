"""Shared source-coordinate grouping for native PDF and owned OCR observations."""
import re


def geometric_rows(words, split_columns):
    rows = []
    for word in sorted(words, key=lambda w:(w['yMax'],w['xMin'])):
        height = word['yMax']-word['yMin']
        if height <= 0 or not word['text'].strip():
            continue
        center = (word['yMax']+word['yMin'])/2
        row = next((row for row in reversed(rows[-5:]) if
                    abs(row['center']-center) <= .4*min(row['height'],height) and
                    max(row['height'],height)/min(row['height'],height) <= 1.35), None)
        if row is None:
            rows.append({'center':center,'height':height,'words':[word]})
        else:
            row['words'].append(word)
    output = []
    for row in rows:
        groups = [[]]
        for word in sorted(row['words'], key=lambda w:w['xMin']):
            group = groups[-1]
            if group and split_columns:
                previous = group[-1]
                marker = re.fullmatch(r'(?:PICK(?:\s*UP)?|STOP|DELIVERY)', ' '.join(w['text'] for w in group), re.I) and word['text'].isdigit()
                threshold = max(4, min(word['yMax']-word['yMin'], previous['yMax']-previous['yMin'])*(3 if marker else .85))
                if word['xMin']-previous['xMax'] > threshold:
                    groups.append([])
            groups[-1].append(word)
        for group in groups:
            output.append({'text':' '.join(w['text'] for w in group),
                           'xMin':min(w['xMin'] for w in group),'yMin':min(w['yMin'] for w in group),
                           'xMax':max(w['xMax'] for w in group),'yMax':max(w['yMax'] for w in group)})
    return output


