#!/usr/bin/env bash
set -euo pipefail
python "$(dirname "$0")/train.py" --output "${1:?Supply a private output directory}" \
  --steps 6000 --batch-size 20 --threads 2 --evaluate-every 500 --seed 334 \
  --train-font /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf \
  --train-font /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf \
  --train-font /usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf \
  --train-font /usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf \
  --train-font /usr/share/fonts/opentype/urw-base35/NimbusMonoPS-Regular.otf \
  --train-font /usr/share/fonts/opentype/urw-base35/NimbusMonoPS-Bold.otf \
  --train-font /usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf \
  --train-font /usr/share/fonts/opentype/urw-base35/NimbusRoman-Regular.otf \
  --validation-font /usr/share/fonts/opentype/urw-base35/URWGothic-Book.otf \
  --validation-font /usr/share/fonts/opentype/urw-base35/P052-Roman.otf
