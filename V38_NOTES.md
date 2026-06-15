# Video Vault v38 — VR Stabilization

## Focus
v38 stabilizes the WebXR experience after Quest testing showed the VR room was still behaving too much like a head-locked web overlay.

## Changes
- Reworked the immersive renderer so the media wall is positioned in room space instead of screen/clip space.
- Added a wall distance control for moving the media wall farther away.
- Reduced reliance on DOM overlay while a real VR session is running.
- Added Quest-style point/select behavior through controller target rays.
- Added ray hit testing for shelves, media cards, and the selected screen.
- Added thumbnail-backed WebGL textures for media cards and selected screen.
- Added proxied thumbnail loading so Google Drive and external images have a better chance of appearing in Quest Browser.
- Updated VR control copy around Quest controller behavior.
- Kept desktop VR Preview and keyboard controls.

## Known limits
- Google Drive playback in Quest Browser may still fail when Google blocks iframe/preview behavior. v38 improves previews through proxied thumbnails, but actual playback may need the normal Vault fallback/open-original path.
- This is still WebXR Lite, not a full 3D app/game engine.

## Supabase
No schema changes.
