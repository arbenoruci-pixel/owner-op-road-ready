# DOT preparation contract

Keep the existing three steps and styling: Review → Inspection link → Officer email. Changes to packaging must not replace this workflow. Reviewing a real package is required before opening its email draft. The saved driver/equipment controls, local preview and alternative exports remain available.

The published package is an immutable capture from the active phone:

- Historical days retain their exact certified content, signature bytes/reference, signing time, equipment and miles. Draft edits and old account copies cannot replace that evidence.
- Midnight continuation may be displayed only from the immediately preceding signed day's recorded non-driving status ending at midnight. The preceding signature fingerprint must verify. The separate view carries provenance; the original signed events stay unchanged. Interior gaps, missing evidence, and Driving continuation are never filled.
- Today stops at the actual recorded On Duty / DOT Inspection entry, including that entry at its recorded start. If no such entry exists, capture stops at the current terminal minute.
- All saved Digital Wallet originals on the phone are included by default, including photoDataUrl legacy originals. Existing matching files are reused. Missing selected originals, upload failure, device/account changes, source edits and mismatched published files stop publication. The client verifies the immutable manifest's document hashes and metadata before exposing the link; failed verification revokes it.
- Log preparation does not merge account conflicts, overwrite log archives, change duty times, or generate signatures. Wallet copies use the existing version-checked document API. No database or edge-function changes are required.

The UI preview uses the same capture as the share. Email text states that Digital Wallet is included. The message opens in the driver's email application, which remains responsible for Send.

The package-review checkbox is available as soon as the verified link is ready. It does not depend on tracking an external-tab click. Equivalent background state refreshes preserve this acknowledgement; changed package contents, expiry or preparing a new link require review again.

After materialization:

```sh
node --test scripts/inspection-package/core.test.mjs scripts/inspection-package/client.test.mjs scripts/inspection-package/rendered.test.mjs
```

An additional interactive React test uses react-test-renderer 18.3.1, resolving the same React instance as the checkout (no new production dependency):

```sh
TEST_RENDERER=/path/to/react-test-renderer/index.js node --test scripts/inspection-package/flow.test.mjs
```

Regression fixtures reproduce the October 28–29 leading-continuity failure with synthetic facts. No user records, signatures or tokens are committed. Network mocks verify upload interruption, stale wallet content, revision races, inactive devices, exact originals and revocation before link display.
