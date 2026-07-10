# PATCH V95.95 — DOT HTML primary professional officer package

## What changed
- Replaced the visible PDF-first officer sharing flow with a self-contained HTML-first flow.
- The main action is now **Share DOT HTML Package**.
- Added direct HTML download and preview actions.
- Removed PDF share/download buttons from the DOT Mode screens.
- Rebuilt the exported HTML package with:
  - a professional summary cover;
  - navigation for Summary, Documents, and Logs;
  - today plus the previous 7 log days;
  - mobile-friendly professional daily RODS layouts;
  - document cards with **Open document** actions;
  - full-screen document viewing when JavaScript is available;
  - inline embedded document fallback inside the same HTML file.
- Preserved all existing log events, HOS logic, signing, inspections, miles, loads, and wallet data.

## Release
- Version: `95.95.0`
- ZIP packaging: NO ROOT
