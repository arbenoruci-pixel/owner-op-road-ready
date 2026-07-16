import React, { useMemo, useState } from 'react';

const CACHE_PREFIX_V1021 = 'road-ready-receiver-intel-v1021:';
const CACHE_TTL_MS_V1021 = 6 * 60 * 60 * 1000;

function text(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function cacheKey(input = {}) {
  return `${CACHE_PREFIX_V1021}${[
    input.placeId,
    input.facility,
    input.address,
    input.city,
    input.state,
  ].map(text).join('|').toLowerCase()}`;
}

function readCache(input = {}) {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(input));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > CACHE_TTL_MS_V1021) return null;
    return parsed.payload || null;
  } catch {
    return null;
  }
}

function writeCache(input = {}, payload = null) {
  if (!payload || typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(cacheKey(input), JSON.stringify({ savedAt:Date.now(), payload }));
  } catch {}
}

function tone(status = '') {
  if (status === 'reported') return 'good';
  if (status === 'mixed') return 'warn';
  if (status === 'not_reported' || status === 'not_available') return 'bad';
  return 'unknown';
}

function Metric({ label, item }) {
  return (
    <div className={`receiver-intel-metric-v1021 ${tone(item?.status)}`}>
      <span>{label}</span>
      <b>{item?.label || 'Not confirmed'}</b>
    </div>
  );
}

function Stars({ rating = 0 }) {
  const rounded = Math.max(0, Math.min(5, Math.round(Number(rating || 0))));
  return <span className="receiver-stars-v1021" aria-label={`${rating} stars`}>{'★'.repeat(rounded)}{'☆'.repeat(5 - rounded)}</span>;
}

function ReviewCard({ review }) {
  return (
    <article className="receiver-review-v1021">
      <header>
        <div>
          <b>{review.authorName || 'Google user'}</b>
          <em>{review.relativeTime || review.publishTime || ''}</em>
        </div>
        <Stars rating={review.rating} />
      </header>
      <p>{review.text}</p>
    </article>
  );
}

export default function ReceiverIntelV1021({
  facility = '',
  address = '',
  city = '',
  state = '',
  placeId = '',
  mapsUrl = '',
}) {
  const input = useMemo(() => ({ facility, address, city, state, placeId, mapsUrl }), [facility, address, city, state, placeId, mapsUrl]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');

  async function load(force = false) {
    setOpen(true);
    setError('');
    if (!force) {
      const cached = readCache(input);
      if (cached) {
        setPayload(cached);
        return;
      }
    }
    setLoading(true);
    try {
      const response = await fetch('/api/places/receiver', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        cache:'no-store',
        body:JSON.stringify(input),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Google Maps request failed (${response.status})`);
      setPayload(body);
      writeCache(input, body);
    } catch (loadError) {
      setError(text(loadError?.message || loadError || 'Receiver intelligence failed.'));
    } finally {
      setLoading(false);
    }
  }

  const intel = payload?.intelligence || {};
  const place = payload?.place || {};
  const reviews = Array.isArray(payload?.reviews) ? payload.reviews : [];
  const hasQuery = Boolean(text(placeId || facility || address || city));

  return (
    <>
      <button
        type="button"
        className="receiver-intel-trigger-v1021"
        disabled={!hasQuery}
        onClick={() => load(false)}
      >
        Receiver Intel
      </button>

      {open && (
        <div className="receiver-intel-overlay-v1021" role="dialog" aria-modal="true" aria-label="Receiver intelligence">
          <section className="receiver-intel-sheet-v1021">
            <header className="receiver-intel-head-v1021">
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
              <div><span>Google Maps</span><b>Receiver Intel</b></div>
              <button type="button" onClick={() => load(true)} disabled={loading}>Refresh</button>
            </header>

            {loading && !payload ? (
              <main className="receiver-intel-loading-v1021"><span /><b>Checking Google Maps reviews…</b><p>Looking for early check-in, unloading, parking, tandems, lumper and restroom information.</p></main>
            ) : error ? (
              <main className="receiver-intel-error-v1021">
                <span>!</span><b>Google Maps connection unavailable</b><p>{error}</p>
                <button type="button" onClick={() => load(true)}>Try again</button>
              </main>
            ) : payload ? (
              <main className="receiver-intel-body-v1021">
                <section className="receiver-place-v1021">
                  <div>
                    <span>Matched receiver</span>
                    <h2>{place.name || facility || 'Receiver'}</h2>
                    <p>{place.formattedAddress || [address, city, state].filter(Boolean).join(', ')}</p>
                  </div>
                  <div className="receiver-rating-v1021"><b>{place.rating ? Number(place.rating).toFixed(1) : '—'}</b><Stars rating={place.rating} /><em>{Number(place.userRatingCount || 0).toLocaleString()} reviews</em></div>
                </section>

                {place.reviewSummary ? <section className="receiver-summary-v1021"><span>Google review summary</span><p>{place.reviewSummary}</p></section> : null}

                <section className="receiver-intel-grid-v1021">
                  <Metric label="Early check-in" item={intel.earlyCheckIn} />
                  <Metric label="One day early" item={intel.dayEarly} />
                  <Metric label="Unloading" item={intel.unloading} />
                  <Metric label="Parking" item={intel.parking} />
                </section>

                <section className="receiver-flags-v1021">
                  <span className={intel.tandems?.status === 'reported' ? 'yes' : ''}>Tandems {intel.tandems?.status === 'reported' ? 'mentioned' : 'not confirmed'}</span>
                  <span className={intel.lumper?.status === 'reported' ? 'yes' : ''}>Lumper {intel.lumper?.status === 'reported' ? 'mentioned' : 'not confirmed'}</span>
                  <span className={intel.restroom?.status === 'reported' || place.restroom ? 'yes' : ''}>Restroom {intel.restroom?.status === 'reported' || place.restroom ? 'mentioned' : 'not confirmed'}</span>
                </section>

                {Array.isArray(intel.instructions) && intel.instructions.length ? (
                  <section className="receiver-instructions-v1021"><span>Driver notes found</span>{intel.instructions.map((instruction, index) => <p key={`${instruction}_${index}`}>• {instruction}</p>)}</section>
                ) : null}

                <section className="receiver-reviews-head-v1021"><div><span>Returned Google reviews</span><b>{reviews.length} relevant review{reviews.length === 1 ? '' : 's'}</b></div>{place.googleMapsUri ? <button type="button" onClick={() => window.open(place.googleMapsUri, '_blank', 'noopener,noreferrer')}>Open Google Maps</button> : null}</section>
                {reviews.length ? <div className="receiver-review-list-v1021">{reviews.map(review => <ReviewCard key={review.id} review={review} />)}</div> : <div className="receiver-no-reviews-v1021">Google returned no review text for this receiver.</div>}

                <p className="receiver-limit-v1021">Google Places returns a limited relevant set, not every review visible in the Google Maps app. “One day early” stays unconfirmed unless a returned review says it directly.</p>
              </main>
            ) : null}
          </section>
        </div>
      )}
    </>
  );
}
