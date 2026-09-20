"""Evaluate frozen owned weights on a previously extracted native review bundle.

Native text is a reference only. Raster inference receives pixels, never text.
The development-document label is intentional: engineering inspected this form;
this is not an independent production benchmark or a phone-photo evaluation.
"""
import argparse
import hashlib
import json
import re
import time
from pathlib import Path
import torch
from PIL import Image
from data import image_tensor
from model import LineReader, decode, edit_distance
from recognize import recognize
from layout import draw_regions


def canonical(text):
    return re.sub(r'\s+', ' ', text).strip()


def pixel_box(box, width, height):
    import math
    return (max(0, math.floor(box['x']*width)-2), max(0, math.floor(box['y']*height)),
            min(width, math.ceil((box['x']+box['width'])*width)+2),
            min(height, math.ceil((box['y']+box['height'])*height)))


def intersection(a,b):
    return max(0,min(a['x']+a['width'],b['x']+b['width'])-max(a['x'],b['x']))*max(0,
        min(a['y']+a['height'],b['y']+b['height'])-max(a['y'],b['y']))


def compare(truth, predictions):
    """Assign each predicted line once by geometry; account for every deletion."""
    buckets = [[] for _ in truth]
    unmatched = []
    for prediction in predictions:
        box = prediction['box']
        area = box['width']*box['height']
        scored = [(intersection(box,line['box'])/(area+line['box']['width']*line['box']['height']-intersection(box,line['box'])),i)
                  for i,line in enumerate(truth) if intersection(box,line['box'])/area >= .45]
        if scored and max(scored)[0] >= .1:
            buckets[max(scored)[1]].append(prediction)
        else:
            unmatched.append(prediction)
    rows = []
    for line, fragments in zip(truth,buckets):
        prediction = canonical(' '.join(p['text'] for p in sorted(fragments,key=lambda p:p['box']['x'])))
        expected = canonical(line['text'])
        rows.append({'expected':expected,'predicted':prediction,'edits':edit_distance(expected,prediction),
                     'box':line['box'],'exact':expected==prediction})
    return rows,unmatched


def metrics(rows, extras=None):
    extras = extras or []
    chars = sum(len(r['expected']) for r in rows)
    insertions = sum(len(canonical(p['text'])) for p in extras)
    return {'referenceLines':len(rows),'referenceCharacters':chars,
            'characterErrorRate':(sum(r['edits'] for r in rows)+insertions)/max(chars,1),
            'lineExactMatch':sum(r['exact'] for r in rows)/max(len(rows),1),
            'unmatchedPredictedLines':len(extras),'unmatchedPredictedCharacters':insertions}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--checkpoint',type=Path,required=True)
    parser.add_argument('--reference-bundle',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    torch.set_num_threads(2)
    state=torch.load(args.checkpoint,map_location='cpu',weights_only=True)
    model=LineReader(state['alphabet']);model.load_state_dict(state['state_dict']);model.eval()
    reference=json.loads((args.reference_bundle/'input.json').read_text())
    metadata=json.loads((args.reference_bundle/'metadata.json').read_text())
    reference_words=json.loads((args.reference_bundle/'reference-words.json').read_text())
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError('Choose a new or empty evaluation output directory')
    if len(reference['pages'])!=len(metadata['assets']):
        raise ValueError('Reference pages and source assets must match')
    args.output.mkdir(parents=True,exist_ok=True)
    started=time.monotonic();pages=[];all_oracle=[];all_page=[];all_extras=[];page_reports=[];assets=[];notes=[]
    for page,asset in zip(reference['pages'],metadata['assets']):
        if page['id']!=asset['pageId']:
            raise ValueError('Reference pages and source assets are out of order')
        original=args.reference_bundle/asset['file']
        digest=hashlib.sha256(original.read_bytes()).hexdigest()
        if digest!=asset['sourceImageId']:
            raise ValueError('Reference source pixels changed')
        image=Image.open(original).convert('L')
        truth=[line for line in next(o for o in page['observations'] if o['id']=='native-cells')['lines']
               if len(canonical(line['text']))>=2 and any(c.isalnum() for c in line['text'])]
        oracle=[];excluded=[]
        with torch.inference_mode():
            for line in truth:
                crop=image.crop(pixel_box(line['box'],image.width,image.height))
                expected=canonical(line['text'])
                try:
                    tensor=image_tensor(crop)[None]
                except ValueError as error:
                    # Count unreadable/oversized crops as deletions, never drop them.
                    prediction='';excluded.append({'lineId':line['id'],'reason':str(error)})
                else:
                    lengths=torch.tensor([tensor.shape[-1]//4]) if state.get('version',1)>=2 else None
                    prediction=canonical(decode(model(tensor,lengths),model.alphabet,lengths)[0])
                oracle.append({'expected':expected,'predicted':prediction,'edits':edit_distance(expected,prediction),
                               'exact':expected==prediction,'box':line['box']})
        inferred=recognize(args.checkpoint,original)
        observed=inferred['pages'][0]['observations'][0]
        rows,extras=compare(truth,observed['lines'])
        words=[line for line in next(p for p in reference_words if p['pageId']==page['id'])['lines'] if any(c.isalnum() for c in line['text'])]
        covered=sum(any(intersection(word['box'],line['box'])/(word['box']['width']*word['box']['height'])>=.7 for line in observed['lines']) for word in words)
        page_report={'pageId':page['id'],'referenceWords':len(words),'wordsCoveredAt70Percent':covered,
                     'wordBoxCoverage':covered/max(len(words),1),'oracleCrops':metrics(oracle),
                     'fullPage':metrics(rows,extras),'unreadableReferenceCrops':excluded,
                     'oracleLines':oracle,'pageLines':rows,'unmatchedPredictions':extras}
        page_reports.append(page_report);all_oracle.extend(oracle);all_page.extend(rows);all_extras.extend(extras)
        pages.append({**page,'observations':inferred['pages'][0]['observations']})
        (args.output/asset['file']).write_bytes(original.read_bytes())
        draw_regions(image,inferred['recognition']['detection']['regions']).save(args.output/f"{page['id']}-regions.png")
        assets.append({**asset,'mode':'owned-raster'})
        notes.append({'pageId':page['id'],'recognition':inferred['recognition']})
    report={'evaluation':'development document, excluded from model training',
            'reference':'native PDF text and coordinates; not independently hand-transcribed',
            'phonePhotoEvaluation':False,'independentDocumentBenchmark':False,'productionReady':False,
            'checkpointSha256':hashlib.sha256(args.checkpoint.read_bytes()).hexdigest(),
            'sourceSha256':metadata['originalSha256'],'pages':len(pages),
            'oracleCrops':metrics(all_oracle),'fullPage':metrics(all_page,all_extras),
            'elapsedSeconds':round(time.monotonic()-started,2),'pageReports':page_reports}
    (args.output/'benchmark.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    (args.output/'input.json').write_text(json.dumps({'documentId':reference['documentId'],'pages':pages},ensure_ascii=False,indent=2)+'\n')
    (args.output/'metadata.json').write_text(json.dumps({**metadata,'assets':assets,'notes':notes,
        'checkpointSha256':report['checkpointSha256'],'elapsedSeconds':report['elapsedSeconds']},indent=2)+'\n')
    import subprocess
    subprocess.run(['node',str(Path(__file__).with_name('review.mjs')),str(args.output)],check=True,timeout=60)
    print(json.dumps({k:v for k,v in report.items() if k!='pageReports'}))


if __name__=='__main__':
    main()
