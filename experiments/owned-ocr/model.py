"""First owned line recognizer. Random initialization; no downloaded weights."""
import torch
from torch import nn

ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,:;#/$%&()+-'\"@!?=ëËçÇ"


class LineReader(nn.Module):
    def __init__(self, alphabet=ALPHABET):
        super().__init__()
        self.alphabet = alphabet
        self.features = nn.Sequential(
            nn.Conv2d(1, 24, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(24, 48, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(48, 64, 3, padding=1), nn.ReLU(),
        )
        self.sequence = nn.GRU(64 * 8, 64, batch_first=True, bidirectional=True)
        self.output = nn.Linear(128, len(alphabet) + 1)

    def forward(self, images, lengths=None):
        # V2 masks padding after every layer, then packs the recurrent sequence.
        # Otherwise the backward GRU reads another sample's padding as context.
        features = images
        widths = lengths.to(images.device) * 4 if lengths is not None else None
        for layer in self.features:
            features = layer(features)
            if widths is not None:
                if isinstance(layer, nn.MaxPool2d):
                    widths = widths // 2
                valid = torch.arange(features.shape[-1], device=images.device)[None, :] < widths[:, None]
                features = features * valid[:, None, None, :]
        sequence = features.permute(0, 3, 1, 2).flatten(2)
        if lengths is not None:
            sequence = nn.utils.rnn.pack_padded_sequence(sequence, lengths.cpu(), batch_first=True, enforce_sorted=False)
        sequence, _ = self.sequence(sequence)
        if lengths is not None:
            sequence, _ = nn.utils.rnn.pad_packed_sequence(sequence, batch_first=True)
        return self.output(sequence).log_softmax(-1).transpose(0, 1)


def decode(log_probs, alphabet=ALPHABET, lengths=None):
    """CTC greedy decoding: blank separates repeated characters."""
    output = []
    for index, path in enumerate(log_probs.argmax(-1).transpose(0, 1).tolist()):
        if lengths is not None:
            path = path[:int(lengths[index])]
        previous, chars = 0, []
        for token in path:
            if token and token != previous:
                chars.append(alphabet[token - 1])
            previous = token
        output.append(''.join(chars))
    return output


def edit_distance(left, right):
    row = list(range(len(right) + 1))
    for i, a in enumerate(left, 1):
        next_row = [i]
        for j, b in enumerate(right, 1):
            next_row.append(min(next_row[-1] + 1, row[j] + 1, row[j-1] + (a != b)))
        row = next_row
    return row[-1]
