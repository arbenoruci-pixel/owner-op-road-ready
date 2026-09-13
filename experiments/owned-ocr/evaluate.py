"""Evaluate a frozen checkpoint against a separately labeled test split."""
import argparse
import hashlib
import json
from pathlib import Path
import torch
from data import load_samples, read_manifest
from model import LineReader
from train import evaluate

parser = argparse.ArgumentParser()
parser.add_argument('--checkpoint', type=Path, required=True)
parser.add_argument('--manifest', type=Path, required=True)
args = parser.parse_args()
torch.set_num_threads(2)
checkpoint = torch.load(args.checkpoint,map_location='cpu',weights_only=True)
model = LineReader(checkpoint['alphabet'])
model.load_state_dict(checkpoint['state_dict'])
rows = read_manifest(args.manifest,'test')
if not rows:
    raise ValueError('A held-out test split is required')
print(json.dumps({'checkpointSha256':hashlib.sha256(args.checkpoint.read_bytes()).hexdigest(),
    'manifestSha256':hashlib.sha256(args.manifest.read_bytes()).hexdigest(),
    'split':'test','productionReady':False,'metrics':evaluate(model,load_samples(rows))},indent=2))
