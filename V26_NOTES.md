# Video Vault v26 Notes

## Purpose
v26 repairs the v25 folder/gallery regression and tightens the gallery UX.

## Fixes
- Fixed folder click crash caused by reading `renderedItems` before initialization.
- Main folders now stay visually treated as folders. Nested folders can act as galleries.
- Slideshow mode only appears for nested galleries, not legacy/root folders.
- Top folder/source filter rows are hidden by default behind a filter button.
- Bulk select now includes Select All.
- Card select mode shows a checkbox overlay.

## Vault Web / Oil Interaction
- Reworked the old gold oil button into a white web-fluid splash.
- Moved the splash action to the bottom-right of the player.
- Splash animation fills the screen and is isolated for easy removal.
- Added per-item count tracking for the splash interaction.
- Home can show a “Most Oiled” row when items have counts.

## Supabase
Run `sql/schema.sql` to add:
- `user_data.oil_count`
- `user_data.last_oiled_at`
- indexes for oil tracking
