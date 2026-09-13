"""Train the owned recognizer from random weights; never auto-promote a model."""
import argparse
import hashlib
import json
import random
import time
from pathlib import Path
import torch
from data import collate, load_samples, read_manifest, synthetic_sample
from model import ALPHABET, LineReader, decode, edit_distance


def evaluate(model, samples, batch_size=16):
    model.eval()
    edits = chars = exact = 0
    examples = []
    with torch.inference_mode():
        for start in range(0, len(samples), batch_size):
            batch = samples[start:start+batch_size]
            images, _, lengths, _ = collate(batch, model.alphabet)
            predictions = decode(model(images), model.alphabet, lengths)
            for (_, truth), prediction in zip(batch, predictions):
                edits += edit_distance(truth, prediction)
                chars += len(truth)
                exact += truth == prediction
                if len(examples) < 12:
                    examples.append({'expected': truth, 'predicted': prediction})
    return {'samples': len(samples), 'characterErrorRate': edits/max(1, chars),
            'lineExactMatch': exact/max(1, len(samples)), 'examples': examples}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--train-font', action='append', default=[])
    parser.add_argument('--validation-font', action='append', default=[])
    parser.add_argument('--steps', type=int, default=1000)
    parser.add_argument('--batch-size', type=int, default=24)
    parser.add_argument('--seed', type=int, default=334)
    parser.add_argument('--threads', type=int, default=2)
    parser.add_argument('--digits-only', action='store_true')
    args = parser.parse_args()
    if args.steps < 1 or args.batch_size < 1:
        parser.error('Positive steps and batch size required')
    torch.set_num_threads(args.threads)
    torch.manual_seed(args.seed)
    torch.use_deterministic_algorithms(True)
    rng = random.Random(args.seed)
    alphabet = '0123456789' if args.digits_only else ALPHABET
    manifest_hash = None
    if args.manifest:
        train = load_samples(read_manifest(args.manifest, 'train'))
        validation = load_samples(read_manifest(args.manifest, 'validation'))
        manifest_hash = hashlib.sha256(args.manifest.read_bytes()).hexdigest()
        if not train or not validation:
            parser.error('Train and validation splits must both contain samples')
    else:
        train_fonts = [Path(p).resolve() for p in args.train_font]
        validation_fonts = [Path(p).resolve() for p in args.validation_font]
        if not train_fonts or not validation_fonts:
            parser.error('Supply disjoint training/validation fonts or a labeled manifest')
        train_hashes = {hashlib.sha256(p.read_bytes()).hexdigest() for p in train_fonts}
        validation_hashes = {hashlib.sha256(p.read_bytes()).hexdigest() for p in validation_fonts}
        if train_hashes & validation_hashes:
            parser.error('Training and validation fonts must have different content')
        validation_rng = random.Random(args.seed + 100000)
        validation = [synthetic_sample(validation_rng, validation_fonts, alphabet, args.digits_only) for _ in range(160)]
        train = None
    model = LineReader(alphabet)
    optimizer = torch.optim.AdamW(model.parameters(), lr=.001)
    criterion = torch.nn.CTCLoss(blank=0, zero_infinity=False)
    started = time.monotonic()
    losses = []
    for step in range(args.steps):
        model.train()
        batch = [rng.choice(train) if train is not None else synthetic_sample(rng, train_fonts, alphabet, args.digits_only) for _ in range(args.batch_size)]
        images, labels, input_lengths, target_lengths = collate(batch, alphabet)
        optimizer.zero_grad(set_to_none=True)
        loss = criterion(model(images), labels, input_lengths, target_lengths)
        if not torch.isfinite(loss):
            raise RuntimeError('Non-finite CTC loss; check transcription/line dimensions')
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 5)
        optimizer.step()
        losses.append(float(loss.detach()))
        if (step+1) % 100 == 0 or step == 0:
            print(json.dumps({'step': step+1, 'loss': round(losses[-1], 4), 'seconds': round(time.monotonic()-started)}), flush=True)
    args.output.mkdir(parents=True, exist_ok=True)
    report = {'model': 'owned-line-reader-v1', 'initialization': 'random', 'pretrainedWeights': False,
              'alphabet': alphabet, 'seed': args.seed, 'steps': args.steps, 'batchSize': args.batch_size,
              'parameters': sum(p.numel() for p in model.parameters()), 'torchVersion': str(torch.__version__),
              'dataset': 'manifest' if args.manifest else 'synthetic', 'manifestSha256': manifest_hash,
              'evaluationSplit': 'validation', 'productionReady': False, 'realDocumentEvaluation': False,
              'trainingLossFirst': losses[0], 'trainingLossLast': losses[-1],
              'elapsedSeconds': round(time.monotonic()-started), 'metrics': evaluate(model, validation)}
    if not args.manifest:
        report['trainingFonts'] = [{'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in train_fonts]
        report['validationFonts'] = [{'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in validation_fonts]
    torch.save({'state_dict': model.state_dict(), 'alphabet': alphabet, 'report': report}, args.output/'model.pt')
    report['checkpointSha256'] = hashlib.sha256((args.output/'model.pt').read_bytes()).hexdigest()
    (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
