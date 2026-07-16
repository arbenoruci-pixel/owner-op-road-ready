function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function scannerLockDecisionV1031({ quality = {}, cornerDelta = 1, flashAgeMs = Infinity } = {}) {
  const reasons = [];
  const confidence = number(quality.confidence);
  const coverage = number(quality.coverage);
  const sharpness = number(quality.sharpness);
  const score = number(quality.score);
  const brightness = number(quality.brightness);
  const glare = number(quality.glareRatio ?? quality.glare, 1);
  const angleScore = number(quality.angleScore, .75);

  if (!quality.paperDetected) reasons.push('paper');
  if (confidence < .68) reasons.push('edges');
  if (coverage < .32) reasons.push('closer');
  if (coverage > .93) reasons.push('farther');
  if (angleScore < .70) reasons.push('angle');
  if (sharpness < 14.5) reasons.push('focus');
  if (score < 82) reasons.push('quality');
  if (brightness < 62) reasons.push('dark');
  if (brightness > 226) reasons.push('bright');
  if (glare > .055) reasons.push('glare');
  if (number(cornerDelta, 1) > .009) reasons.push('motion');
  if (number(flashAgeMs, Infinity) < 1100) reasons.push('flash-settle');

  return {
    ready:reasons.length === 0,
    reasons,
    confidence,
    coverage,
    sharpness,
    score,
  };
}

export function nextFlashDecisionV1031({
  mode = 'auto',
  supported = false,
  torchOn = false,
  darkFrames = 0,
  brightFrames = 0,
  sinceChangeMs = Infinity,
} = {}) {
  if (!supported) return { desired:false, change:torchOn, reason:'unsupported' };
  if (mode === 'on') return { desired:true, change:!torchOn, reason:'manual-on' };
  if (mode === 'off') return { desired:false, change:torchOn, reason:'manual-off' };

  if (!torchOn && darkFrames >= 6 && sinceChangeMs >= 2500) {
    return { desired:true, change:true, reason:'stable-dark' };
  }
  if (torchOn && brightFrames >= 10 && sinceChangeMs >= 3500) {
    return { desired:false, change:true, reason:'stable-bright' };
  }
  return { desired:Boolean(torchOn), change:false, reason:'hold' };
}
