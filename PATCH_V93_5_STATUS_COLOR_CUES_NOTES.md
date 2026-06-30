# PATCH V93.5 — Status Color Cues

Base: v93.4 driver action picker

Changes:
- Added duty-status color cues to the Change Status screen.
- OFF uses slate tint, SB uses sleeper tint, D uses green tint, ON uses blue tint.
- Selected duty button now fills with the active status color.
- Selected reason button now follows the active status color.
- Save button now follows the active status color.
- Active status label and action links now follow the active status color.
- Preserved prior v93.4 layout and quick-action flow.

Validation:
- `npm run build` passed successfully.
