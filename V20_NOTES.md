# Video Vault v20 Notes

## Thumbnail fill patch

- Card thumbnails now always render as cover-filled 4:5 previews.
- YouTube thumbnails now prefer `maxresdefault.jpg` first to avoid the black letterbox bars common in `hqdefault.jpg`.
- Added thumbnail fallback candidates for YouTube: maxres → sd → hq → mq.
- Player image/video view remains contain/fullscreen so the opened media is not cropped.

No Supabase schema update is needed for v20.
