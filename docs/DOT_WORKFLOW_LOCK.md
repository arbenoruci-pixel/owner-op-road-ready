# Approved DOT workflow

Owner: Arben Oruci. Approved working release: **110.4.100**.
Baseline source commit: `6f36b85d69e0f7d18fd25ab0eac1a2d63838ca48`.
Approval date: **2026-11-04, America/New_York**.

Arben confirmed "mir o tash funksionoj" and then requested "tash bone lock qe mos me ma ndryshu naj qka pa u marr vesh". This authorizes the development lock only. Ordinary use of the application continues normally.

## Protected behavior

1. Retain **Review → Inspection link → Officer email**, including its existing design, controls, local preview, and alternative exports.
2. Historical inspection days use the exact signed content and original signature evidence. Today's copy ends at the recorded On Duty / DOT Inspection boundary. Export remains read-only.
3. Include and verify the current phone's Digital Wallet originals in the same immutable officer package. No account/phone conflict chooser is introduced into preparation.
4. A verified ready package has an enabled review checkbox. Equivalent background refreshes preserve its acknowledgement. Actual package changes, expiry, or a new link require review again.
5. Keep the link and email handoff, exact-file verification, active-device checks, stale-package rejection, and existing recovery protections.

## Enforcement

`dot-workflow-lock.v1.json` contains SHA-256 hashes for the approved source inputs and the final materialized runtime. The build checks source inputs before running installers, then checks the final DOT runtime immediately before the production compiler. An installer or shared dependency cannot silently replace a protected runtime file.

The verifier is read-only and has no unlock, repair, accept-current, or automatic hash-update mode. A mismatch stops the build with the affected paths. The guard tests cover source edits, generated-output edits, missing files, and incomplete lock manifests.

This is a repository development policy and a build guard. It does not freeze driver controls or require a new in-app confirmation. Repository maintainers can deliberately revise code and locks; the instruction in `AGENTS.md` requires Arben's agreement before doing so.

## Future approved changes

Explain the exact proposed behavior or design change to Arben and obtain explicit approval. Record the approval's date, agreed scope, and user instruction below. Make only that change, run the relevant regressions, and update only its affected source/runtime hashes. Keep unrelated entries fixed. The approval does not permit removing the three-step workflow or changing records unless that exact action was separately agreed.

## Approval record

- **2026-11-04:** Arben approved release 110.4.100 as working and requested this lock. Scope: repository instructions, a fixed baseline manifest, verification tests, and build checks. No product behavior or user records changed.

- **2026-11-07:** Arben explicitly requested local device originals and uploads only when creating links, limited to selected documents: “dokumentet origjinale të ruhen lokalisht në pajisje dhe të ngarkohen në Supabase vetëm kur krijoj link për t’i shpërndarë” and “krijimi i linkut ngarkon vetëm dokumentet e zgjedhura.” Authorized scope: remove wallet originals from the older backup API, add explicit Wallet document selection inside the existing Review step, and wait for verified local document persistence. Preserve the three-step wizard, signed/current log contents, immutable share verification, all existing cloud files, and all historical originals. Corresponding hashes: backup client, wizard, updated selection regression, this approval record. No record restoration, cloud deletion, or logbook mutation is authorized.
