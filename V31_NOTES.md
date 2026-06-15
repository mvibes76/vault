# Video Vault v31 — WebXR Lite Mode

## Added

- WebXR support detection using `navigator.xr.isSessionSupported("immersive-vr")`.
- Optional **VR** entry button only appears on WebXR-capable browsers/devices.
- New isolated `components/VaultXR.jsx` component.
- Lightweight ambient VR library mode:
  - dark media-room style view
  - folder shelf cards
  - selected folder media wall
  - controller select cycles through folders
  - close/exit path without changing the normal vault UI

## Notes

- No Supabase schema update required.
- This is intentionally WebXR Lite, not a full VR rewrite.
- Normal desktop/mobile vault behavior is unchanged.
- On unsupported devices, the VR button stays hidden.
- On Quest Browser or similar WebXR browsers, the VR button appears and launches the immersive session.

## Test

1. Deploy to Vercel.
2. Open on Quest Browser.
3. Confirm the VR button appears.
4. Tap VR.
5. Tap **Enter VR Library**.
6. Confirm immersive mode opens and controller select cycles folders.
