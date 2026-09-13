"""Read explicit line regions using our trained weights and emit core input JSON.

Regions are measured on the EXIF-oriented source image. No guessed word boxes,
external service, automatic filing or claim of production accuracy.
"""
import argparse
import hashlib
import json
from pathlib import Path
import torch
from PIL import Image, ImageOps
from data import image_tensor
from model import LineReader, decode


def recognize(checkpoint, image_path, regions):
    state = torch.load(checkpoint, map_location='cpu', weights_only=True)
    model = LineReader(state['alphabet'])
    model.load_state_dict(state['state_dict'])
    model.eval()
    with Image.open(image_path) as original:
        image = ImageOps.exif_transpose(original).convert('L')
    if image.width * image.height > 40000000:
        raise ValueError('Source image is too large')
    if not isinstance(regions, list) or not 1 <= len(regions) <= 1000:
        raise ValueError('Supply 1 to 1000 line regions')
    lines = []
    with torch.inference_mode():
        for i, region in enumerate(regions):
            x,y,w,h = [region[key] for key in ('x','y','width','height')]
            if not all(isinstance(v,int) for v in (x,y,w,h)) or min(x,y) < 0 or min(w,h) <= 0 or x+w > image.width or y+h > image.height:
                raise ValueError('Invalid source line region')
            crop = image.crop((x,y,x+w,y+h))
            tensor = image_tensor(crop)[None]
            text = decode(model(tensor), model.alphabet)[0]
            lines.append({'id':f'line-{i+1}','text':text,'confidence':None,
                          'box':{'x':x/image.width,'y':y/image.height,'width':w/image.width,'height':h/image.height}})
    source_id = hashlib.sha256(Path(image_path).read_bytes()).hexdigest()
    weights_id = hashlib.sha256(Path(checkpoint).read_bytes()).hexdigest()
    return {'documentId':f'scan-{source_id[:16]}','pages':[{'id':'page-1','number':1,'observations':[
        {'id':f'owned-{weights_id[:16]}','source':'owned-line-reader-v1','sourceImageId':source_id,'lines':lines}]}]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--checkpoint', type=Path, required=True)
    parser.add_argument('--image', type=Path, required=True)
    parser.add_argument('--regions', type=Path, required=True)
    parser.add_argument('--threads', type=int, default=2)
    args = parser.parse_args()
    torch.set_num_threads(args.threads)
    print(json.dumps(recognize(args.checkpoint,args.image,json.loads(args.regions.read_text())),ensure_ascii=False))


if __name__ == '__main__':
    main()
