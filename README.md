# Video Vault v39 — Browser Stability

v39 removes the VR/WebXR experiment and returns the app to one goal: work cleanly in normal browsers.

Supabase remains the source of truth. Google Sheets remains an import/mirror layer.

## What v39 changes

- Removed the VR button.
- Removed the VR Preview button.
- Removed WebXR detection.
- Removed the `VaultXR` component.
- Kept the normal Vault player, folders, nested galleries, covers, ratings, comments, PDF viewer, Sheet import, Sheet mirror, relay, diagnostics, and backup tools.
- Keeps playback fallbacks focused on browser-safe behavior.

## Current app shape

- **Supabase** stores saved media, folders, galleries, ratings, comments, covers, view stats, and settings.
- **Google Sheets** can collect/import links and mirror the Vault Library.
- **Folders** hold normal media.
- **Nested galleries** can live inside folders for photo sets or sessions.
- **Covers** can come from the item, Sheet import, Cover Library, or manual custom cover.
- **Playback** uses official embeds when possible, direct playback when possible, relay fallback when useful, and clear fallback messages when a site refuses to expose playable media.

## Required setup

Confirm Vercel env vars:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SHEETS_WEBHOOK_URL=...
MEDIA_RELAY_MAX_BYTES=536870912
```

Run the latest `sql/schema.sql` only if you have not already caught up through v35. v39 itself adds no schema changes.

## Google Sheet import format

Supported headers include:

```txt
Title | URL | Folder | Gallery | Tags | Notes | Type | Source | Thumbnail | Cover | Cover Mode | Cover Fit | Cover X | Cover Y
```

Only `URL` is required.

## Local test

```bash
npm install
npm run dev
```

## Build note

The v39 code compiled and TypeScript completed in the package workspace. The container timed out during Next.js page-data collection, but the change is isolated to removing the VR system from `components/Vault.jsx` and deleting `components/VaultXR.jsx`.

## Recommended browser test list

- Desktop Chrome
- Desktop Safari
- Desktop Firefox
- Desktop Edge
- iPhone Safari
- iPhone Chrome
- Android Chrome

Test these flows:

```txt
Add item → edit item → assign cover → move folder → open player → rate → mark → comment → import Sheet → export backup
```
