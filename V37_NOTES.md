# Video Vault v37 — VR Media Wall

## Changes

- VR Preview now shows actual media thumbnails/cards instead of a mostly empty preview room.
- Added a more media-library style wall view with clickable cards.
- Added Cinema mode with a larger selected-item preview.
- Added controller calibration controls in the VR panel.
- Updated real VR select behavior so trigger opens the selected item instead of only cycling media.
- Kept keyboard fallback controls for desktop preview.
- No Supabase schema changes.

## Controls

Desktop preview:
- Left / Right: previous / next shelf
- Up / Down: previous / next media
- Enter: open selected item
- M: toggle Wall / Cinema
- Esc twice: exit

Quest/WebXR:
- Trigger/select: open selected item
- Squeeze: next shelf
- DOM overlay cards/buttons can be pointed at when supported
