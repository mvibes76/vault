# Video Vault v34 — VR Upgrade

## Changes

- Upgraded WebXR Lite into Ambient Vault mode.
- Added a richer VR launch surface with shelves, media wall, selected media preview, and controls.
- Added shelf navigation and media navigation before entering VR.
- Added desktop keyboard fallback for testing:
  - Left / Right: previous / next shelf
  - Up / Down: previous / next media
  - Enter: open selected item in the normal vault player
  - M: switch wall / cinema mode
  - Esc: close VR overlay
- Added controller behavior for VR:
  - Select: next media
  - Squeeze: next shelf, when supported
- Added Open Selected, Next Shelf, Next Media, and Wall/Cinema controls in DOM overlay.
- Opening a selected item exits VR and opens the normal Vault player.
- No Supabase schema change.

## Philosophy

This remains WebXR Lite. It is an ambient browser-based media room, not a full standalone VR app.
