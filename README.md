# Vault V40

Vault is a private media library for saving links, video, images, PDFs, Drive files, and references from across the web.

V40 is the product consolidation release. It keeps the playback and organization work from earlier versions, but changes the app around five daily actions: **resume, save, find, organize, play**.

## V40 product model

- **Home** is a media-first landing page with Continue, recent saves, collections, and a universal command bar.
- **Library** is always the flat media library.
- **Inbox** contains anything saved without a folder so capture never requires organization up front.
- **Collections** owns folders and nested galleries.
- **Add** is paste-first. URL, preview, destination, save. Notes, tags, crop, and cover controls live under Details.
- **Search** matches title, URL, notes, tags, folder, source, and site metadata.
- **Smart Relay** is the automatic server relay fallback for direct media that the browser cannot load normally.

## Playback model

Vault does not promise to bypass DRM, authentication, subscriptions, or licensing restrictions.

Playback order is intentionally boring:

1. Official/native player when available.
2. Direct browser playback.
3. Extraction for supported public pages.
4. Smart Relay when direct playback is blocked by browser/network rules.
5. Open the original source when the site does not expose usable media.

The relay validates public URLs to block private-network SSRF targets. V40 also gates relay requests to same-site browser traffic and applies a high per-client request ceiling so the deployment is less useful as a public proxy.

## Data model

Supabase is the source of truth.

Google Sheets remains an optional import/mirror layer.

V40 adds a safe stable-ID migration for folder relationships while preserving the legacy name fields used by older clients:

```txt
sql/v40-stable-folder-ids.sql
```

The migration backfills `folder_id` / `parent_id` UUID relationships and installs triggers that keep them synced when older code writes folder names.

## Required environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SHEETS_WEBHOOK_URL=...
MEDIA_RELAY_MAX_BYTES=536870912
MEDIA_RELAY_REQUESTS_PER_MINUTE=900
```

Optional escape hatch for trusted non-browser relay clients:

```env
MEDIA_RELAY_ALLOW_NON_BROWSER=1
```

Leave that unset for the normal Vault deployment.

## Database setup

For a new install, run:

```txt
sql/schema.sql
```

For an existing install already caught up through V35+, run:

```txt
sql/v40-stable-folder-ids.sql
```

## Local development

```bash
npm ci
npm run dev
```

Quality checks:

```bash
npm test
npm run lint
npm run build
```

## V40 regression flow

Test these in desktop and mobile browsers:

```txt
Sign in
→ Home loads
→ paste URL in command bar
→ Save to Inbox
→ open Inbox
→ move item to a collection
→ search by title/tag/folder/source
→ open media
→ direct playback
→ Smart Relay fallback when needed
→ rate
→ mark a moment
→ comment
→ close and resume
→ create nested gallery
→ import Sheet
→ export JSON backup
```

## Repository cleanup

V40 removes disconnected legacy components from the live source tree and moves V11–V39 release notes to `docs/history/`.

The live component set is intentionally smaller now. Old experiments are history, not runtime surface area.
