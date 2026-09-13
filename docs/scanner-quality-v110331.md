# Scanner capture and paper cleanup — 110.3.31

The latest device recording shows repeated waiting for steady corners and strong fold shadows in the saved document preview.

Capture now accepts three sharp observations whose corresponding corners agree within 1.8% of the normalized camera frame. The observations must span at least 420 ms and remain within a 900 ms window. An isolated corner outlier no longer restarts the entire wait. Blur, a missing page, weak detection, sustained motion or stale observations still prevent automatic capture. The photo burst takes its first sample immediately, keeps full-resolution pixels only for the best candidate, and stops after two similarly sharp samples; changing focus can still use three samples.

Paper cleanup estimates illumination on a bounded 1000-pixel analysis image using a separable morphological closing and smoothing. It fills thin ink strokes in the estimated background, corrects broad fold shadows, and balances paper color before applying a continuous tone curve. A background floor protects filled dark regions. There is no content generation, thresholding or change to the original file. The existing local worker and full-resolution perspective correction remain in use.

Validation includes deterministic jitter/motion/blur/loss cases, procedural folded paper with fine black print, faint pencil, red and blue strokes and a filled footer, and the existing browser camera, worker, fallback, crop and original-storage regressions. Recording-derived images are used locally for inspection only. Screen-recording resolution limits visual conclusions; processing timings from development and CI are not physical iPhone benchmarks.
