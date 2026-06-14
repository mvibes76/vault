# Video Vault v21

Focus: player fallback polish, PDF/page memory, Drive playback memory, editing, cover control, cleaner dashboard.

## Added
- Pop-out player button for URLs/media that do not behave well inside the internal player.
- Reddit now attempts direct video extraction first instead of defaulting to the Reddit embed UI.
- PDF source support with page controls and last-page memory using `user_data.progress`.
- Google Drive video direct-play attempt before preview fallback, enabling progress memory and Enhance when Drive allows direct playback.
- Edit item flow from card menu: title, URL, tags, note, folder, and cover image.
- Rename folder action in sidebar.
- Keyword-to-folder assignment: if no folder is selected, existing folder names are matched against title/tags/notes/URL.
- Cover rules in Settings: `keyword=image URL` lines apply a consistent cover when an item has that tag/keyword.
- Manual cover image URL field when adding/editing items.
- Mobile player no longer closes from a single backdrop tap. Use X or double-tap the backdrop.
- Desktop Escape still closes the media viewer.

## Changed
- Mark button is now separate from rating. It no longer auto-rates the item as 5 stars.
- Crisp Enhance mode is stronger.
- Dashboard is less cluttered and focuses on continue/recent items.

## Supabase
Run `sql/schema.sql` again. It adds:

```sql
alter table user_settings add column if not exists cover_rules jsonb default '[]'::jsonb;
```

Safe to rerun. Existing data is preserved.
