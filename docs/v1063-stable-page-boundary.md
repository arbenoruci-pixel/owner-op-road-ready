# Road Ready v106.3 — Stable Page Boundary

Preview release for real-device validation of the Smart Capture live page outline.

The scanner now converts noisy segmentation meshes into one convex four-corner page boundary, smooths corner movement across frames, rejects center spikes, and waits for five stable detections before auto-capture.

Validation includes the real failure pattern where the former overlay formed a moving house-shaped polygon through the center of a flat BOL/POD page.
