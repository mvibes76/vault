# Video Vault v24

## Gallery / folder showcase system

v24 turns folders into first-class organizers and optional galleries.

### Added

- Folder/gallery distinction with `kind: folder | gallery`.
- Gallery display mode with `grid` and `slideshow`.
- Folder metadata: cover image, note, view count, last viewed time.
- Home now shows Recent Galleries instead of only individual media recency.
- Everything view can toggle between organized gallery cards and one flat media wall.
- Clicking a gallery/folder card opens the actual gallery contents.
- Folder view has media filters: all, video, photo, pdf, link.
- Folder view has an editable header for gallery/folder name, cover, note, kind, and display mode.
- Slideshow mode gives a large gallery hero with thumbnail strip while keeping the normal player, zoom, rating, and marking features.
- Sheet import can create galleries by using `Gallery` / `Gallery Name` as the folder column or `Folder Kind` / `Folder Type` / `Is Gallery` set to `gallery`, `yes`, `true`, or `1`.

### Supabase

Run `sql/schema.sql`. v24 adds safe columns to `vault_folders`:

- `kind`
- `display_mode`
- `cover`
- `note`
- `view_count`
- `last_viewed_at`
- `updated_at`

Uses `add column if not exists`, so it is safe to rerun.

### Build

`npm install` and `npm run build` passed.
