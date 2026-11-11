# Saved log coverage

A completed live-status Sleeper saved as 22:33–23:03 was painted through midnight.
Log Check used only HOS warnings; the immutable inspection snapshot and JSON
retained 23:03, so an apparently clean certified day still had a 57-minute gap.

The completed-day graph/list, editor, report, archive, coverage wizard and sign
validation now use saved interval boundaries. The existing verified adjacent
signed midnight prefix remains supported. Today's live projection continues to
Now in the home-terminal timezone. No runtime migration or record rewrite runs.
The certification constructor also rejects gaps, overlaps and invalid intervals
before creating an attestation, including when invoked by batch signing.

Older attestations retain their original content and fingerprints. A historical
inspection fixture deliberately creates old incomplete attestations outside the
new-signature constructor; all original export and tampering assertions remain.

Verification:

```
node --test scripts/recorded-coverage/core.test.mjs scripts/recorded-coverage/rendered.test.mjs
```

The synthetic reproduction retains only interval times. The user's uploaded
backup and signature are not part of this repository. Physical locations and
mileage disagreements require evidence and are never automatically corrected.
