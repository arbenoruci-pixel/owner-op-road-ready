# Scanner video follow-up — 110.3.30

The supplied 19.3-second Road Ready recording shows the outline wandering outside
paper on carpet, then several seconds in Capture/Preparing. The 5.9-second TurboScan
recording reaches its corrected preview at about 2 seconds. Road Ready's recording
never opens the saved page, so it does not support a final-image quality comparison.

Our own detector now searches for a paper/background transition around each proposed
side and robustly fits four lines before intersecting the corners. The safety margin
is a half analysis pixel instead of a percentage of the paper size. On the supplied
recording, the stable frames at 6.3–6.5 seconds have no colored detection overlay and
provide a useful independent visual check. Earlier/later frames contain overlays and
are treated only as supplementary diagnostics. Private recordings are not fixtures
in the repository.

A local module worker now owns photo preparation and exports. The same engine falls
back to the main thread if worker canvas/decode support fails. Automatic intake
reuses one full-detail source decode, skips the unused review JPEG, and reuses the
same normalized pixels for display and OCR. It preserves perspective interpolation,
output limits, manual crop/rotation, original source bytes and capture assets.
Workers terminate after success/failure; a bounded timeout allows fallback.

Verification covers five synthetic textured/creased-paper boundaries, the existing
six background cases, real browser worker completion on Chromium and WebKit, camera
continuity, crop/reset, reader recovery and durable original/PDF storage. Desktop
and headless-browser timing cannot certify physical iPhone latency or autofocus.
No third-party scanner SDK or learned content generation is introduced.
