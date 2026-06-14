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
