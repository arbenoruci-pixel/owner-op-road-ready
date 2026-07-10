# v95.96 — Compact DOT HTML Package

- Keeps every roadside document payload only once in the self-contained HTML.
- Removes repeated base64 copies from PDF/image fallback and action links.
- Compresses large document photos at export time to a maximum 2000 px edge at high JPEG quality when this saves at least 8%.
- Leaves source wallet documents unchanged; compression applies only to the shared/downloaded HTML package.
- Shows the final package size after creation or sharing.
- Preserves DOT logs, HOS data, signing, event data, and the existing document viewer flow.
