# Phone reading feedback: v110.3.41

The latest phone review used core 0.3.2. Receipt OCR contained usable text, but a PO field and load description were flattened into one row, preventing receipt classification. A thank-you message beside the net total also prevented amount extraction. Shipping output proposed a BOL number label as a company and missed an explicit Customer P.O. Number label.

Core 0.3.3 accepts these bounded field contexts, preserves exact source offsets, and filters identity labels from party candidates. Previous/estimated totals and instructional prefixes do not become current values. OCR disagreements, low confidence and ambiguous dates remain unresolved. No image capture changes are included.

The private export replay now identifies one unloading receipt and two BOLs. The receipt's observed amount, fee and total pass arithmetic validation. A customer PO is offered with its original weak-recognition warning; unreadable BOL text is not reconstructed. The private export and its document text are not committed.

Verification covers synthetic single-pass receipt data, exact evidence, negative label contexts, conflicting retries, arithmetic mismatch, shipping party guards, materialized app routing, and the browser review/correction/export flow. CI also covers existing scanner and module isolation workflows. This verifies parsing of observations; a fresh installed-phone run with source PDF/images is still needed to measure recognition accuracy.
