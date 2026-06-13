# v11 Notes

## What changed

- Added secured `/api/stream` media relay with Range passthrough.
- Added HLS playlist rewriting for child playlists, segments, keys, and maps.
- Added public URL validation shared by extract/media/stream routes.
- Blocked localhost, private IPs, link-local IPs, metadata IPs, and private DNS resolutions.
- Revalidated redirects before following them.
- Added direct playback first, relay fallback second in `Player.jsx`.
- Added manual **Relay** button for direct file/HLS sources.
- Added relay status badge in the player.
- Added browser service worker for app shell caching.
- Kept stream/extract/media endpoints out of the service worker cache.
- Fixed `localStorage` initialization for Quick Adds so it does not run during render.
- Removed `.avi`, `.mkv`, and `.mpd` from playable direct file detection.
- Removed SVG from proxied image support.
- Removed wildcard image host config.
- Added `MEDIA_RELAY_MAX_BYTES` env setting.

## Known limits

- The relay is still not meant to be a public, unlimited video CDN.
- Vercel functions may still hit timeout or bandwidth limits on heavy files.
- Some sites use IP-bound tokens, DRM, or anti-bot pages. Those still need the original platform embed or a dedicated long-running media worker.
- Browser service worker caching is for the app shell only, not the video streams.

## Recommended deploy path

1. Deploy v11 as-is for normal vault use.
2. Test with YouTube, Drive, Dropbox, direct MP4, direct M3U8, Reddit image thumbnails, and unknown webpage extraction.
3. If you start pushing lots of large files, move `/api/stream` into a dedicated Node worker on Railway/Fly/Render and keep the same safety rules.
