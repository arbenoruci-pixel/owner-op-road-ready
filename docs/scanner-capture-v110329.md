# Scanner capture v110.3.29

The previous detector fitted one exterior line in each direction. Strong furniture
and suitcase edges could therefore become a page. Its full-frame fallback was then
misreported as a document extending past the camera. Camera selection also discarded
the detected crop before Read document.

The replacement compares multiple luminance/neutral-color components and Hough-line
quadrilaterals, verifies all four edges, rejects implausible geometry, and checks for
interior strokes. Supporting line pixels refine the coarse Hough orientation. A
bounded preview supplies live guidance; the actual still image is independently
detected and processed so differing video/still dimensions cannot misplace a crop.
Uncertain images retain the full source and remain manually editable. Explicit
Full page choices survive reader navigation. Originals remain immutable.

Capture keeps the camera open, shows the page count and last page, and suppresses
repeated automatic shots until the previous sheet leaves view. Manual capture remains
available. No OCR or network request runs in the live camera loop.

Research consulted September 13, 2026:

- [OpenCV connected components, convex hulls and polygon approximation](https://docs.opencv.org/4.13.0/d3/dc0/group__imgproc__shape.html).
- [OpenCV Hough line transform](https://docs.opencv.org/4.13.0/d9/db0/tutorial_hough_lines.html).
- [Apple document segmentation request](https://developer.apple.com/documentation/vision/vndetectdocumentsegmentationrequest): a native alternative for a future native iOS scanner.
- [Scanbot Web SDK](https://docs.scanbot.io/web/document-scanner-sdk/introduction/): commercial on-device browser detection, capture, crop and quality analysis.
- [Scanbot license requirements](https://docs.scanbot.io/web/document-scanner-sdk/detailed-setup-guide/initializing-the-sdk/): production requires a license; its timed trial was not added to this app.
- [ImageCapture.takePhoto](https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture/takePhoto): retain still capture when supported, with native-photo and video-frame fallbacks.

The OpenCV concepts are implemented in bounded JavaScript without an additional
runtime library. This is not a learned segmentation model or a claim to match
commercial scanners on arbitrary scenes. Synthetic backgrounds, supplied screenshot
camera regions, and browser regression flows assess this change. Screenshots include
UI overlays and cannot certify physical-camera autofocus, capture timing or exported
scan quality on an iPhone. Final on-device acceptance still needs those checks.

The clean production build also exposed an older editor materializer accepting only
one preview expression. It now recognizes either exact known expression, retains the
existing expression, and rejects missing or ambiguous matches.
