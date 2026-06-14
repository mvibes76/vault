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
