# Video Vault

Personal video library. Paste any video URL, it plays inside the app. No external tabs.

## What plays inside the app

- **YouTube** (regular, Shorts, live, embeds) — IFrame API, watch progress saved
- **Vimeo**
- **Google Drive** (any video file)
- **Dropbox** (auto-converted to direct stream)
- **TikTok**
- **X / Twitter** (posts with video)
- **Facebook** (videos, Reels, Watch)
- **Instagram** (posts, Reels, IGTV)
- **Reddit** (video posts)
- **Twitch** (channels, VODs, clips)
- **Dailymotion**
- **Streamable**
- **Wistia**
- **HLS streams** (`.m3u8`) via hls.js
- **Direct video files** (`.mp4`, `.webm`, `.mov`, `.m4v`, `.ogg`, `.mkv`, etc.) — full `<video>` controls, watch progress saved, Picture-in-Picture
- **Images** (`.jpg`, `.png`, `.gif`, `.webp`, etc.) — full-screen view

If a URL isn't one of these, the player tells you it can't be embedded. Nothing silently fails.

## Adding a new source

All source logic lives in one file: `lib/sources.js`. Each source is an entry with `match`, `id_of`, `thumb`, and `embed`. The Player picks up new sources automatically. No other file needs to change.

## Stack

- Next.js 16 (App Router)
- Supabase (auth, progress, favorites, folders, quick adds)
- Google Sheets as the primary data source (one tab per category)
- hls.js (lazy-loaded, only when an HLS URL is opened)
- PWA-installable

## Setup

1. `npm install`
2. `cp .env.local.example .env.local` and fill in Supabase keys
3. In Supabase SQL Editor, run `sql/schema.sql`
4. `npm run dev`
5. First load: paste your Google Sheet URL in the Connect modal, or use Quick Add to paste any video URL

### Google Sheet format

Each tab is a category. Required column: `url`. Optional columns: `title`, `note`, `tags`. Rows with non-playable URLs are skipped silently.

### Quick Add webhook (optional)

Want Quick Adds to also land in your sheet? Deploy `scripts/vault-automation.gs` as a Web App in Apps Script, paste the URL in `SHEETS_WEBHOOK_URL`. Without it, Quick Adds still sync to Supabase across devices.

## Watch progress

YouTube and direct video files save progress to Supabase. The "Continue" tab surfaces items between 5 seconds and 95% watched. Other embed types (Vimeo, TikTok, etc.) don't expose progress events to the iframe, so they're not tracked.

## Twitch embeds

Twitch requires a `parent` URL param matching the embed host. The Player reads `window.location.hostname` at runtime, so it works on localhost, your Vercel preview URLs, and your prod domain without config.

## What's NOT here

- No PDF/EPUB reader. That was removed.
- No audio/music player. Audio files won't load.
- No image gallery scraping. Just direct image URLs.
- No Google Drive folder browser. Open the folder externally if you need to.
