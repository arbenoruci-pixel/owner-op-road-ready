function text(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function lower(value = '') {
  return text(value).toLowerCase();
}

function unique(values = []) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

function excerpt(value = '', max = 220) {
  const clean = text(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function timeMinutes(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^\d{3,4}$/.test(digits)) return null;
  const padded = digits.padStart(4, '0');
  const hour = Number(padded.slice(0, 2));
  const minute = Number(padded.slice(2));
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function earlyMinutesFromReview(value = '') {
  const source = lower(value);
  const patterns = [
    /\b(\d{3,4})\s*(?:appointment|appt)\b[\s\S]{0,100}?\b(?:arrived|arrival|checked\s*in|check\s*in)\b[^0-9]{0,18}(\d{3,4})\b/i,
    /\b(?:arrived|arrival|checked\s*in|check\s*in)\b[^0-9]{0,18}(\d{3,4})\b[\s\S]{0,100}?\b(\d{3,4})\s*(?:appointment|appt)\b/i,
  ];
  for (let index = 0; index < patterns.length; index += 1) {
    const match = source.match(patterns[index]);
    if (!match) continue;
    const appointment = timeMinutes(index === 0 ? match[1] : match[2]);
    const arrival = timeMinutes(index === 0 ? match[2] : match[1]);
    if (appointment == null || arrival == null) continue;
    let difference = appointment - arrival;
    if (difference < -720) difference += 1440;
    if (difference >= 0 && difference <= 360) return difference;
  }
  const explicit = source.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\s+early\b/i);
  return explicit ? Number(explicit[1]) : null;
}

function durationMinutesFromReview(value = '') {
  const source = lower(value);
  const minutePatterns = [
    /\bin\s*(?:&|and)\s*out(?:\s+in)?\s*(\d{1,3})\s*(?:minutes?|mins?)\b/i,
    /\b(?:unload(?:ed|ing)?|loading|at\s+door|dock)\b[\s\S]{0,45}?\b(\d{1,3})\s*(?:minutes?|mins?)\b/i,
  ];
  for (const pattern of minutePatterns) {
    const match = source.match(pattern);
    if (match) return Number(match[1]);
  }
  const hours = source.match(/\b(?:unload(?:ed|ing)?|loading|in\s*(?:&|and)\s*out)\b[\s\S]{0,45}?\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  return hours ? Math.round(Number(hours[1]) * 60) : null;
}

export function normalizeGoogleReviewV1021(review = {}) {
  const reviewText = text(review?.text?.text || review?.originalText?.text || review?.text || review?.comment);
  return {
    id:text(review.name || review.id || `${review?.authorAttribution?.displayName || 'review'}_${review?.publishTime || review?.relativePublishTimeDescription || ''}`),
    authorName:text(review?.authorAttribution?.displayName || review?.authorName || 'Google user'),
    authorUri:text(review?.authorAttribution?.uri || review?.authorUri),
    authorPhotoUri:text(review?.authorAttribution?.photoUri || review?.authorPhotoUri),
    rating:Number(review.rating || 0),
    relativeTime:text(review.relativePublishTimeDescription || review.relativeTime),
    publishTime:text(review.publishTime),
    text:reviewText,
    googleMapsUri:text(review.googleMapsUri || review.uri),
    earlyMinutes:earlyMinutesFromReview(reviewText),
    durationMinutes:durationMinutesFromReview(reviewText),
  };
}

function matchingReviews(reviews = [], pattern) {
  return reviews.filter(review => pattern.test(lower(review.text)));
}

function evidenceFrom(reviews = [], pattern, max = 3) {
  return matchingReviews(reviews, pattern).slice(0, max).map(review => ({
    reviewId:review.id,
    authorName:review.authorName,
    rating:review.rating,
    relativeTime:review.relativeTime,
    text:excerpt(review.text),
  }));
}

export function receiverSearchQueryV1021(input = {}) {
  return unique([
    input.facility || input.name,
    input.address,
    [input.city, input.state].filter(Boolean).join(', '),
    input.postalCode,
  ]).join(', ');
}

export function analyzeReceiverReviewsV1021(inputReviews = []) {
  const reviews = (inputReviews || []).map(normalizeGoogleReviewV1021).filter(review => review.text);
  const dayEarlyPositive = /\b(?:one|1)\s+day\s+early\b|\bday\s+early\b|\b24\s*(?:hours?|hrs?)\s+early\b|\bnight\s+before\b|\bprevious\s+day\b/i;
  const earlyRefusal = /\b(?:appointment\s+only|strict\s+appointment|no\s+early|wouldn['’]?t\s+take|won['’]?t\s+take|will\s+not\s+take|refused|turned\s+(?:me|us)\s+away)\b/i;
  const earlyArrival = /\bearly\b|\bbefore\s+(?:my|the)?\s*appointment\b|\barrived\s+at\s+\d{3,4}\b|\bchecked\s+in\b/i;
  const unloading = /\bin\s*(?:&|and)\s*out\b|\bunload(?:ed|ing)?\b|\bdock\b|\bdoor\b/i;
  const parkingPositive = /\bovernight\s+parking\b|\btruck\s+parking\b|\bparking\s+(?:available|allowed|lot)\b|\bpark(?:ed|ing)?\s+overnight\b/i;
  const parkingNegative = /\bno\s+(?:overnight\s+)?parking\b|\bparking\s+not\s+allowed\b/i;
  const tandem = /\b(?:slide|slid|move)\s+(?:your\s+)?tandems?\b|\btandems?\s+(?:back|forward|all\s+the\s+way)\b/i;
  const lumper = /\blumper\b|\bcapstone\b|\bunloading\s+fee\b/i;
  const restroom = /\brestroom\b|\bbathroom\b|\bporta?\s*(?:potty|john)\b|\bport\s+a\s+potty\b/i;
  const guard = /\bguard\s+shack\b|\bsecurity\s+gate\b|\bcheck\s*in\s+at\s+(?:the\s+)?gate\b/i;
  const call = /\bwait\s+for\s+(?:their\s+)?call\b|\bcall\s+(?:to|for)\s+check\s*in\b|\bthey\s+call\b/i;

  const dayEarlyYes = matchingReviews(reviews, dayEarlyPositive);
  const dayEarlyNo = matchingReviews(reviews, earlyRefusal);
  const earlyReviews = matchingReviews(reviews, earlyArrival);
  const earlyMinuteValues = reviews.map(review => review.earlyMinutes).filter(value => Number.isFinite(value));
  const durationValues = reviews.map(review => review.durationMinutes).filter(value => Number.isFinite(value) && value > 0 && value <= 1440);
  const parkingYes = matchingReviews(reviews, parkingPositive);
  const parkingNo = matchingReviews(reviews, parkingNegative);

  const instructions = [];
  if (matchingReviews(reviews, tandem).length) instructions.push('Slide tandems before or after docking as instructed.');
  if (matchingReviews(reviews, call).length) instructions.push('Reviews mention waiting for a phone call for paperwork or next instructions.');
  if (matchingReviews(reviews, guard).length) instructions.push('Reviews mention checking in at a gate or guard shack.');
  if (matchingReviews(reviews, lumper).length) instructions.push('Lumper or unloading-fee references appear in reviews.');
  if (matchingReviews(reviews, restroom).length) instructions.push('Restroom or portable-toilet access is mentioned.');

  const earlyMax = earlyMinuteValues.length ? Math.max(...earlyMinuteValues) : 0;
  const earlyMin = earlyMinuteValues.length ? Math.min(...earlyMinuteValues) : 0;
  const durationMin = durationValues.length ? Math.min(...durationValues) : 0;
  const durationMax = durationValues.length ? Math.max(...durationValues) : 0;

  return {
    reviewCountUsed:reviews.length,
    earlyCheckIn:{
      status:earlyReviews.length || earlyMinuteValues.length ? 'reported' : 'unknown',
      label:earlyMinuteValues.length
        ? (earlyMin === earlyMax ? `Check-in reported ${earlyMax} min early` : `Check-in reported ${earlyMin}–${earlyMax} min early`)
        : earlyReviews.length ? 'Early arrival/check-in is mentioned' : 'No early check-in evidence in returned reviews',
      evidence:evidenceFrom(reviews, earlyArrival),
    },
    dayEarly:{
      status:dayEarlyYes.length && dayEarlyNo.length ? 'mixed' : dayEarlyYes.length ? 'reported' : dayEarlyNo.length ? 'not_reported' : 'unknown',
      label:dayEarlyYes.length && dayEarlyNo.length
        ? 'Mixed reports about arriving a day early'
        : dayEarlyYes.length ? 'A day-early arrival is mentioned'
          : dayEarlyNo.length ? 'Reviews mention strict/no-early appointments'
            : 'No evidence they accept a truck one day early',
      evidence:[...evidenceFrom(reviews, dayEarlyPositive), ...evidenceFrom(reviews, earlyRefusal)].slice(0, 3),
    },
    unloading:{
      status:matchingReviews(reviews, unloading).length ? 'reported' : 'unknown',
      label:durationValues.length
        ? (durationMin === durationMax ? `Reported turnaround about ${durationMin} min` : `Reported turnaround ${durationMin}–${durationMax} min`)
        : matchingReviews(reviews, unloading).length ? 'Dock/unloading experience is mentioned' : 'No unloading-time evidence in returned reviews',
      evidence:evidenceFrom(reviews, unloading),
    },
    parking:{
      status:parkingYes.length && parkingNo.length ? 'mixed' : parkingYes.length ? 'reported' : parkingNo.length ? 'not_available' : 'unknown',
      label:parkingYes.length && parkingNo.length
        ? 'Mixed parking reports'
        : parkingYes.length ? 'Truck/overnight parking is mentioned'
          : parkingNo.length ? 'Reviews say parking is not available'
            : 'Parking is not confirmed',
      evidence:[...evidenceFrom(reviews, parkingPositive), ...evidenceFrom(reviews, parkingNegative)].slice(0, 3),
    },
    tandems:{ status:matchingReviews(reviews, tandem).length ? 'reported' : 'unknown', evidence:evidenceFrom(reviews, tandem) },
    lumper:{ status:matchingReviews(reviews, lumper).length ? 'reported' : 'unknown', evidence:evidenceFrom(reviews, lumper) },
    restroom:{ status:matchingReviews(reviews, restroom).length ? 'reported' : 'unknown', evidence:evidenceFrom(reviews, restroom) },
    instructions:unique(instructions),
    reviews,
  };
}
