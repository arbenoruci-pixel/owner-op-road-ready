# Continuous capture and page review — 110.3.33

The comparison recordings show the first photo being processed while the driver
moves to another sheet. The previous camera stopped analyzing during this job,
then unconditionally locked capture on completion. It missed the transition and
could display a ready outline on the next sheet indefinitely.

The camera now locks at capture time and observes page transitions throughout
processing. Two missing boundaries, sustained large movement, or three confident
observations of a different paper layout rearm capture. The existing sharpness,
boundary confidence and stability gate still decides when to take the next shot.
A small paper-relative luminance descriptor tolerates minor motion and exposure
changes; it is a heuristic, not document identity or OCR. Nearly identical sheets
held in exactly the same position may still need a manual shutter tap. Captured
photos remain local and originals remain immutable. No scanner SDK was added.

The camera uses a compact Done action, a tappable thumbnail with count, an Auto
toggle, and flash when supported. The native phone-camera fallback is available
under More and directly on camera-open failure. Stale outlines disappear during
capture and processing. The account shortcut yields to the scanner overlay.

Review gives the selected page more space, groups Adjust / Rotate / Order / Delete
beside it, and uses a compact thumbnail strip. Reordering exposes the existing
accessible arrow controls. The enlarged preview starts with the complete page
fitted, supports explicit zoom and scrolling, closes with Escape, contains keyboard
focus, and returns focus to the opener. Reader confirmation, multipage PDF output,
recovery and original-asset storage stay in the existing workflow.

Validation includes exposure/motion/duplicate transition fixtures, live synthetic
camera replacement during the first real worker job without an empty frame or
manual capture, subsequent duplicate prevention, delayed native-still fallback,
crop reset, quick rotation, reordering, fit/zoom, PDF reading and byte-for-byte
original storage. Browser fixtures use synthetic documents; user recordings and
document pixels are not committed. Browser results do not replace physical iPhone
camera validation.
