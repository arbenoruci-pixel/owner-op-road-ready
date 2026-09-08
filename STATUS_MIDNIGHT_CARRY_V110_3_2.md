# Status-change midnight continuity

The 110.2.12 read-only graph rejected every first event starting after 00:00,
including a first live ON event following an unchanged OFF day. The display
timeline already contained the correct OFF prefix, but the graph discarded it.
Coverage checks separately required the previous stored end to reach midnight,
even though live status rows commonly hold an earlier snapshot end.

The additive read-only contract is a known prior OFF/SB/ON prefix, ending at the
first recorded change. Logbook passes day context to `dutyViewEvents`; the graph,
list, current archive and coverage checks share `knownMidnightCarry`. The prefix
stays a separate, non-editable derived row. Internal gaps and overlaps stay exact,
and Driving is never synthesized or extended. Missing prior evidence stays a gap.

No stored event schema or migration changes. No event, history, signature, route,
document or database writes are introduced. Reviewed runtime locks cover the
Logbook view and coverage consumer changes. Release identity is 110.3.2 and the
service-worker update remains non-forced.

Regression evidence includes the Sep 8 14:10 ON/14:25 Now case, OFF/SB/ON prior
statuses, short prior live snapshots, multiple empty days, real internal gaps,
prior Driving/unknown status, reload persistence and phone-size browser tests.
