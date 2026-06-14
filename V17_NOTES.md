# Video Vault v17 Notes

## Changes

- Added safe folder deletion from the sidebar. Deleting a folder keeps the items and moves them to No folder.
- Folder deletion now clears the folder in Supabase `vault_items` and `user_data`, not just local state.
- Google Sheets imports keep folder names exactly as typed, including lowercase names like `videos`.
- Improved desktop three-dot menu placement. Menus flip upward near the bottom of the viewport and remain scrollable.
- Restored player controls visibility with a horizontally scrollable top control rail.
- Kept Enhance modes, HLS quality selector, item rating, and timestamp mark controls visible in the player.
- Timestamp marking now shows a short confirmation toast like `Marked 1:24 · ★ 5`.
- HLS playback now attempts one media recovery before falling back to the relay, which should reduce unnecessary slow relay usage.
- Increased stream relay timeout from 20s to 45s for slower sources.

## Setup

No new Supabase migration is required if v16 schema was already run.
