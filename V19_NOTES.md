# Video Vault v19

## Added

- Dashboard home screen with Welcome, stats, Continue Watching, Last Watched, Top Rated, and Recently Added.
- Full-screen image viewer behavior. Images now use the full viewport and zoom/pan inside the screen instead of staying trapped in a small frame.
- View tracking on item open:
  - `view_count`
  - `first_viewed_at`
  - `last_viewed_at`
  - `completed_count`
  - `watch_seconds`
- Google Sheet thumbnail support remains active through the `Thumbnail` column. Manual thumbnails win over provider thumbnails.
- Portrait-first card previews using 4:5 cards for the library and dashboard.
- Drag-to-folder on desktop. Drag a card and drop it on a folder in the sidebar.

## Supabase

Run `sql/schema.sql` again. It is safe to rerun. v19 adds columns to `user_data` for dashboard/view stats.

## Notes

- The in-app browser remains removed.
- Supabase remains the source of truth.
- Google Sheets remains an import/mirror layer.
- Playback relay remains invisible and only helps when direct playback fails.
