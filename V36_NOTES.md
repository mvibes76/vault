# Video Vault v36 — VR Preview Exit Polish

## Added

- Desktop **VR Preview** button so the Ambient Vault room can be opened without a WebXR headset.
- Real WebXR **VR** button still only appears when `immersive-vr` is supported.
- Double-press `Esc` to exit the VR preview/overlay.
- First `Esc` shows a short “Press Esc again to exit” hint instead of instantly closing.
- Controls copy inside the VR panel now explains desktop preview controls.

## Controls

Desktop preview:

- Left / Right: previous / next shelf
- Up / Down: previous / next media
- Enter: open selected item
- M: toggle wall/cinema
- Esc twice: exit preview

## Supabase

No schema update needed.

## Build

`npm install` and `npm run build` passed.
