# Video Vault v16 Notes

## Removed
- Removed the in-app browser/search experience. It was unreliable on mobile because Google and many sites block iframe browsing.
- Removed the unused `/api/browser-search` route from the package.

## Fixed
- Card action menus now render through a React portal attached to `document.body` with fixed positioning. This prevents menus from being clipped by card/grid/list containers on desktop and mobile.

## Added
- Google Sheets import modal.
  - Import from a public Google Sheet by URL or Sheet ID.
  - Scans configurable tabs, defaulting to `Vault Import, Vault Library`.
  - Supports columns: `Title`, `URL`, `Folder`, `Tags`, `Notes`, `Type`, `Source`, `Thumbnail`.
  - Creates missing native Vault folders during import.
  - Dedupes by stable URL key.
  - Saves imported rows into Supabase and mirrors them back to `Vault Library` through the webhook.
- `/api/sheet-import` route for optimized import parsing.
- Per-item comments.
  - New `vault_comments` table in `sql/schema.sql`.
  - Comment panel in the player.
  - Add/delete comments per vault item.
- Batch webhook support in `scripts/vault-automation.gs`.
  - Single item upsert/delete still works.
  - Batch imports now send one payload with `items`.

## Setup change
Run the updated `sql/schema.sql` again in Supabase to add `vault_comments`.
Replace the Apps Script with the updated `scripts/vault-automation.gs` so batch imports and deletes mirror correctly.
