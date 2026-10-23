# One BOL field in recorded duty details

The recorded duty editor displays one BOL number input. The duplicate shipping
reference, destination, load/order number, correction action and reference help
text are removed from this section. The existing sparse-save adapter retains
those stored fields when a driver edits the BOL. Current-status entry, freight
identity, original documents, duty times and DOT exports keep their contracts.

The input keeps the driver's complete text, including leading zeroes and an
explicit empty value. It never truncates identifiers or asserts that a two-digit
abbreviation satisfies DOT requirements.

The final installer accepts the exact reviewed 110.4.84 editor and registers its
deterministic output with the retained duty compatibility checks. Unknown source
changes remain rejected. The release is 110.4.85 and is non-forced.

No runtime requests, services, paid add-ons or dependencies are introduced.
Automatic Vercel deployment is disabled for this review branch. Publication is
pending full build verification and confirmation of the Vercel cost controls.
