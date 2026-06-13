# Video Vault v12

v12 moves the vault to an app-first model.

## Data model

- Supabase is now the source of truth.
- `vault_items` stores every app-added link/file/reference.
- Native folders replace the old Google Sheet tab workflow.
- Google Sheets is now a one-page mirror named `Vault Library`, driven by the webhook.

## Added

- App-native item save flow with title, tags, notes, and folder selection.
- Save any `http/https` URL, even if it is only a reference and not playable.
- Native folder movement from the card menu.
- 1-5 rating on cards and inside the player.
- Rated view in the sidebar.
- Timestamp mark button in the player.
- HLS quality selector when HLS variant levels are available.
- Visual Enhance modes: Off, Soft, Crisp, Cinema.
- Fullscreen player shell fix for desktop.
- Stronger three-dot menu visibility.

## Google Sheet mirror

The app calls `/api/sheets-sync` after save/move/delete. That route forwards to `SHEETS_WEBHOOK_URL` if configured.

The Apps Script now writes to one tab:

```txt
Vault Library
```

The sheet is no longer loaded as the app source.

## Required Supabase step

Run `sql/schema.sql` in Supabase SQL Editor before deploying v12.

## Required Vercel env vars

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SHEETS_WEBHOOK_URL=... # optional, for Google Sheet mirror
MEDIA_RELAY_MAX_BYTES=536870912
```
