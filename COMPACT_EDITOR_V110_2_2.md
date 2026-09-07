# Compact editor 110.2.2 — synchronous resize bounds

Preserve released main `8e4ab4eb36cf3b7b7fb8c62ee82fd07dd14f66cc` and all 110.2.1 editor work. The 110.2.1 PR passed all tests, but the post-merge repeat caught a genuine WebKit resize timing case: the SVG resized immediately while an old ResizeObserver measurement briefly placed END outside the 320px viewport. The screenshot and failing assertion were retained; the assertion was not relaxed.

The grabber's inline left position now uses a CSS `clamp()` evaluated against the current rail width, reserving 100px for each button and an 8px gap. The old JavaScript measurement can no longer place either control outside the rail or overlap the other. Window and visualViewport resize listeners also update the ideal positions; exact stored minutes and drag math are unchanged.

Ten additional pure checks and 54 browser CSS cases deliberately combine stale and current widths (312, 382, 836) to reproduce observer lag deterministically. The complete existing Chromium/WebKit graph tap, drag, Save, Cancel, live ON/Driving, GPS, 320px/390px, midnight, signature isolation and worker tests remain required. Production verification waits for the exact main sourceCommit and then exercises the hosted editor with synthetic storage and intercepted account APIs.

Release metadata: 110.2.2 / v110202-compact-handles, force:false. Worker behavior is unchanged; explicit activation handshakes are tested from 110.1.0, 110.2.0 and 110.2.1. Same PWA origin, same offline stores, no data restore/deletion or forced Driving refresh. No Tepiha changes. Physical installed-iPhone confirmation remains separate.
