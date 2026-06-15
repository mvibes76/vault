# Video Vault v16

Supabase is the real vault. Google Sheets is now both a one-page mirror and an optional collection/import inbox.

## v16 changes

- Removed the in-app browser.
- Fixed desktop/mobile menu clipping with portal-based card menus.
- Added Google Sheets import from `Vault Import`, `Vault Library`, or custom tabs.
- Added batch webhook support for the Google Sheet mirror.
- Added per-item comments in the player.
- Kept playback relay/proxy invisible.

## Required setup

1. Run `sql/schema.sql` in Supabase. If you already ran v12, run this again to add `vault_comments`.
2. Replace your Apps Script with `scripts/vault-automation.gs` and deploy it as a Web App.
3. Confirm Vercel env vars:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SHEETS_WEBHOOK_URL=...
MEDIA_RELAY_MAX_BYTES=536870912
```

## Google Sheet import format

Create a tab named `Vault Import` or use `Vault Library`. The importer supports these headers:

```txt
Title | URL | Folder | Tags | Notes | Type | Source | Thumbnail
```

Only `URL` is required.

## Google Sheet mirror

The webhook writes to one sheet tab named `Vault Library`. Supabase remains the source of truth.

## Local test

```bash
npm install
npm run dev
```

## Build verified

`npm run build` passed in the package workspace.


## v17

Adds folder deletion, better scrollable menus, exact-case Sheet folder import, restored player controls, timestamp mark confirmation, and less aggressive relay fallback.


## v18 folder behavior

Folder identity is case-insensitive. Existing folder casing wins. If `Main` exists, imported `main` goes into `Main` instead of creating a second folder.


## v19

- Dashboard home screen.
- Full-screen image viewer fix.
- View tracking stats.
- Portrait-first cards.
- Sheet Thumbnail column support.
- Drag cards to folders on desktop.

Run `sql/schema.sql` again after deploying v19.


## v21

Adds pop-out playback fallback, PDF page viewer with last-page memory, Google Drive direct-play progress when available, edit item, rename folder, keyword folder auto-assignment, cover rules, and a cleaner dashboard. Run `sql/schema.sql` again for the `cover_rules` settings column.


## v22 Cover Library

Settings now includes a **Covers** tab. Use it as a running library of subject covers.

Example covers:

```txt
Label: Darth Maul
Image URL: https://.../darth-maul.jpg
Match against: Tag
Keywords: Darth Maul, Maul, Sith
```

The app can match covers against title, tags, folder, source, URL, or any field. Google Drive image file links are supported through the media proxy.

Run `sql/schema.sql` after updating to v22 so Supabase creates `vault_covers` and adds `vault_items.thumbnail_source`.


## v23 Cover Controls

Run `sql/schema.sql` after deploying. v23 adds per-item cover behavior, crop/sizing controls, Sheet cover import fields, and Cover Library crop controls.

## v24 Gallery Experience

Folders can now act as galleries. A gallery can have its own cover, note, display mode, and recently viewed state. The Everything view can show organized gallery cards or a flat wall of all media. Folder views include media filters and a slideshow mode.

Run `sql/schema.sql` after deploying v24.


## v25

Adds nested gallery buckets inside folders, folder expand-all mode, bulk selection actions, and the lightweight Vault Oil interaction in the media player. Run `sql/schema.sql` again to add `vault_folders.parent_folder`.

## v28

Gallery and slideshow image rendering now uses a safer fallback chain so image URLs without generated thumbnails still display instead of showing a broken image icon.

## v30
- Fixed folder slideshow/gallery display toggle so it works in all folders, not only one gallery-type folder.


## v31 — WebXR Lite Mode

- Adds optional VR Library mode for WebXR-capable devices.
- The VR button only appears when `immersive-vr` is supported.
- Normal desktop and mobile behavior stays unchanged.
- No Supabase schema update is required for v31.

## v32 Hardening

- Added app-level crash recovery.
- Added Settings → Diagnostics.
- Added Settings → Backup with JSON and CSV export.
- Added `/api/health` for Vercel/Supabase/webhook health checks.
- Hardened folder/gallery routing and search.
- No Supabase schema update required for v32.

## v33 polish notes

v33 tightens the app without changing the data model:

- refined dashboard hero and rows
- stronger empty states
- modal overflow cleanup
- global focus/scroll/tap styling
- clearer player fallback messages
- slightly stronger Crisp enhance mode

No Supabase migration is required for v33.

### v34 VR Upgrade

WebXR Lite now opens an Ambient Vault mode with shelf navigation, a media wall, a selected-item screen, wall/cinema mode, controller-friendly controls, and desktop keyboard fallback for testing. Opening a selected item exits VR and uses the normal Vault player. No Supabase schema change is required.

## v35 Sheet Sources

- The provided Google Sheet is built in as the first/default import source.
- Settings → Google Sheet now manages saved Sheet Sources.
- Import from Sheet now includes a source dropdown and supports tab names or `gid:...` values.
- No OAuth or Google console setup is required. The Sheet must be shared as "Anyone with the link can view".
- Run `sql/schema.sql` once to add `sheet_sources` and `default_sheet_source_id` to `user_settings`.

## v36 VR Preview

Desktop now includes a **VR Preview** button for testing the Ambient Vault interface without a headset. WebXR-capable devices still get the real **VR** entry. Press `Esc` twice to exit the VR preview.
