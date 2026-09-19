# Unified Duty Form and recorded-pickup protection — 110.3.78

User-approved correction of inconsistent new-status / Edit forms and contradictory pickup metadata. Baseline: production 110.3.77, e8080804afcddd0c2d1a8dafd18b3cdfa53c15c9.

The actual production materialization overwrites source files during build. The final stage therefore applies explicit line edits against complete verified SHA-256 baselines; validates all output hashes before writing; and uses inspectable new-file text packs. These are code-only build inputs, never user-data migrations.

## Functionality
- One shared DutyForm layout/component, shared status and activity vocabulary, common location input, equipment fields, Notes and sticky Save. Current mode keeps Now/relative start semantics. Recorded mode keeps graph/start/end, recorded equipment and location, existing stale-draft and temporal validation.
- Exact historical trailer Drop/Hook phrases are recognized even when reasons is empty. Unknown/legacy activities and equipment details remain visible.
- Current GPS on a past record asks before replacing location. Planned load destinations no longer supply physical-location suggestions.
- Existing source-description vs automatically repaired-field conflicts are visible. Use recorded pickup details is a driver-confirmed draft action followed by Save, with before/after event and route audit. No autonomous repair of the supplied day backup is performed.
- Destination edits do not rewrite a distinct BOL/order number. Explicit selected-event edits synchronize only that event's linked selected-day pickup route; unlinked plans, other days, current equipment and document guidance stay intact.
- Active guide normalization cannot rewrite the recorded pickup; linking a guide's origin requires exact consistent event/load/destination evidence. BOL/order namespaces stay distinct. An unlinked manual plan is labelled Plan — no pickup recorded rather than a performed trip.

## Boundaries
No signature deletion, duty-time reset, database migration, document deletion, automatic merge of conflicting references, outbound email or financial actions. Old contradictory values remain reviewable until the driver accepts a correction. Stored plans and document references are retained.

## Validation status
Thirty focused tests and repeat hash-checked installation passed locally on the materialized baseline. Full production build, existing regressions and new Chromium/WebKit tests must pass for the exact candidate before release. Physical-iPhone testing is separate. User JSON/signature data is excluded from this public repository; committed fixtures are synthetic.
