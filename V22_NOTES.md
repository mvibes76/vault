# Video Vault v22 Notes

## Cover Library

v22 replaces the old cover-rules textbox workflow with a real Cover Library in Settings.

### Added

- `Settings → Covers` tab.
- Add/edit/delete cover records.
- Store cover label, image URL, match type, keywords, notes, enabled state, and priority.
- Supports normal image URLs and Google Drive image file links.
- Cover preview uses the same thumbnail proxy as vault cards.
- Cover matching can target:
  - Any field
  - Tag
  - Title
  - Folder
  - Source
  - URL

### Matching priority

1. Manual per-item cover from Add/Edit Item.
2. Cover Library match.
3. Legacy cover rules.
4. Sheet Thumbnail column.
5. Provider thumbnail/fallback.

### Supabase

Run `sql/schema.sql` again. v22 adds:

- `vault_covers` table
- `vault_items.thumbnail_source`

The migration is safe to rerun and uses `if not exists`.

### Notes

- The old `user_settings.cover_rules` value still works under the Legacy Rules tab.
- Existing items that had thumbnails before v22 may be overridden by Cover Library matches unless edited with a manual cover.
