# Reliable synchronization — 110.4.81

This release applies the account scheduler and snapshot fixes without installing
PR #231's HOS engine, historical edit workflow, original-reference migration,
audit views or timezone proposal UI. Existing database tables and active-device
access checks remain the source of authorization.

Durable saves are compared using the account's semantic records. Navigation and
account-receive notifications cannot repeatedly schedule uploads. Working
records take priority over archives. Temporary failures use retry delays;
conflicting versions remain retained and require explicit selection.

The diagnostic record index now runs after durable saves. Idle polling reads
pending corrections rather than resending the entire inventory. Identical
inventory hashes skip server writes. A save inside the old minute throttle is
checked before acknowledgement. Hidden-app interruptions keep their generation
pending; failures exhaust a bounded indexing attempt budget. A manual retry or
reconnect can retry. PostgREST deadlines cancel the actual request with an
AbortSignal; uncertain writes are checked by existing reconciliation.

The installed-runtime tests execute capture, hashing, cache, batch, finish and
interruption boundaries. The browser receive suite uses real IndexedDB with
synthetic account transport and blocks external services. It covers device
handoff, original-file reuse, conflict journals, account/generation guards,
interrupted receives and export exclusion of staging.

No existing driving event, signature, financial transaction or original file is
migrated or deleted. A complete live-data restore remains a prerequisite for the
broader HOS/original-reference candidate in PR #231.

The signing and working screens have no floating account-sync badge or automatic
error panel. Settings → Synchronization status opens the retained diagnostics and
retry controls explicitly; close and Escape work even while errors repeat.
Account ownership, startup handoff and explicit conflict selection remain guarded.

The server migration caches the current and incoming records objects before
comparing their keys. This removes repeated extraction of the entire JSONB archive
for each key, retaining the same delta/history format, authorization, locks and
revision checks. Seven database reconstruction cases and a read-only large-account
benchmark verify the delta behavior without rewriting existing records.
