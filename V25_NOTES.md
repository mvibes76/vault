# Video Vault v25 Notes

## What changed

- Reframed galleries as nested buckets inside normal folders instead of making the main folder itself become the gallery.
- Added `parent_folder` to `vault_folders` so a gallery can live inside a topic folder like `General → Garden Session`.
- Removed the confusing `Open first` action from folder headers.
- Simplified the folder header so it is lighter and faster.
- Added `New gallery inside` from inside a folder.
- Added `Expand all / Organized` toggle inside folders:
  - Organized: shows child galleries plus the media directly in the current folder.
  - Expand all: flattens media from the current folder and nested galleries into one gallery wall.
- Added selection mode and bulk actions:
  - Select items
  - Move selected to folder
  - Delete selected
  - Clear selection
- Kept consistent card/grid behavior across folder views.
- Added a low-hassle interactive `Oil the vault` splash button inside the media player.

## Supabase

Run `sql/schema.sql` again. v25 adds:

```sql
alter table vault_folders add column if not exists parent_folder text;
```

Safe to rerun.
