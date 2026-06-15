# Video Vault v39 — Browser Stability

v39 removes the VR/WebXR layer completely.

## Removed

- `components/VaultXR.jsx`
- WebXR support detection
- VR button
- VR Preview button
- VR overlay state
- Quest/WebXR-specific interaction code

## Kept

- Supabase source of truth
- Sheet sources/import/mirror
- folders and nested galleries
- gallery/slideshow views
- cover library and cover controls
- ratings, marks, comments
- PDF viewer
- playback relay/fallbacks
- diagnostics and backup

## Supabase

No schema update required.
