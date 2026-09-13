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

    def forward(self, images):
        features = self.features(images)
        sequence = features.permute(0, 3, 1, 2).flatten(2)
        sequence, _ = self.sequence(sequence)
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
