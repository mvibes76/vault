# Video Vault v12

Supabase is the live vault. Google Sheets is now a one-page mirror/reference named `Vault Library`.

## v12 setup

1. Run `sql/schema.sql` in Supabase.
2. Deploy the Apps Script in `scripts/vault-automation.gs` if you want the Sheet mirror.
3. Set `SHEETS_WEBHOOK_URL` in Vercel to the Apps Script Web App URL.
4. Run locally with `npm install && npm run dev`.

## v12 behavior

- Add links inside the app.
- Fill in title, tags, notes, and folder.
- Supabase stores the item instantly.
- The Google Sheet mirror updates in the background.
- Folders are native app tabs now.
- The player uses direct playback first, then secure relay fallback when needed.

---

# Video Vault v11

Personal media vault for videos and images, with safe embeds first, direct playback second, and a secured relay fallback for streams the browser blocks because of CORS.

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
- **Direct video files** (`.mp4`, `.webm`, `.mov`, `.m4v`, `.ogg`, `.ogv`) — full `<video>` controls, watch progress saved, Picture-in-Picture. If browser playback is blocked by CORS, the player can switch to the secured relay.
- **Images** (`.jpg`, `.png`, `.gif`, `.webp`, `.avif`, `.bmp`) — full-screen view. SVG is intentionally blocked from the proxy.
- **Any other webpage** — last-resort server-side extractor tries to find a video URL in `<video>` tags, `og:video`/`twitter:player:stream` meta, or JSON-LD `VideoObject` markup. Works on a real chunk of "won't play" sites. Fails quietly on sites with IP-bound tokens, expiring signatures that beat the round-trip, or anti-bot perimeters.

If a URL isn't one of these, the player tells you it can't be embedded. Nothing silently fails.


## v11 streaming layer

The app now uses three playback lanes:

1. **Official embeds** for known platforms like YouTube, Vimeo, Drive, TikTok, Instagram, Reddit, Twitch, Streamable, Wistia, and Facebook.
2. **Direct browser playback** for normal video files and HLS playlists.
3. **Secured relay fallback** through `/api/stream` when direct browser playback fails because of CORS.

The relay is not an open proxy. It validates URLs before fetching:

- only `http` and `https` are accepted
- localhost and private networks are blocked
- DNS-resolved private addresses are blocked
- redirects are revalidated
- HLS playlists are rewritten so child playlists, segments, keys, and maps stay on the same safe relay path
- direct-file relay size is capped by `MEDIA_RELAY_MAX_BYTES`

The player still tries direct playback first. If it fails, the player switches to relay mode. You can also hit the **Relay** button manually while watching a direct file or HLS stream.

## Browser service worker

`public/sw.js` caches the app shell for PWA-style resilience. It intentionally does **not** cache `/api/stream`, `/api/extract`, or `/api/media` because signed media URLs and stream responses must stay fresh.

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
4. Optional: set `MEDIA_RELAY_MAX_BYTES` if you want a smaller/larger direct-file relay cap
5. `npm run dev`
5. First load: paste your Google Sheet URL in the Connect modal, or use Quick Add to paste any video URL

### Google Sheet format

Each tab is a category. Required column: `url`. Optional columns: `title`, `note`, `tags`. Rows with non-playable URLs are skipped silently.

### Quick Add webhook (optional)

Want Quick Adds to also land in your sheet? Deploy `scripts/vault-automation.gs` as a Web App in Apps Script, paste the URL in `SHEETS_WEBHOOK_URL`. Without it, Quick Adds still sync to Supabase across devices.

### Pre-flight check

When you paste a URL into Quick Add that isn't a known source, the modal hits `/api/extract` in the background to verify a stream exists on the page. Known sources (YouTube, Vimeo, etc.) skip the check since they're guaranteed playable. The Add button stays disabled until extraction succeeds, so you don't load broken cards into your vault.

## Watch progress

YouTube and direct video files save progress to Supabase. The "Continue" tab surfaces items between 5 seconds and 95% watched. Other embed types (Vimeo, TikTok, etc.) don't expose progress events to the iframe, so they're not tracked.

## Twitch embeds

Twitch requires a `parent` URL param matching the embed host. The Player reads `window.location.hostname` at runtime, so it works on localhost, your Vercel preview URLs, and your prod domain without config.

## The player

The player overlay handles every source kind with consistent controls:

- **Fullscreen button** (top-right) — native `requestFullscreen()` on the stage. Works for video, images, and iframe embeds.
- **Picture-in-Picture** — for direct video files and HLS streams (browsers don't expose PiP through iframe embeds).
- **Mute** — for direct video, HLS, and YouTube.
- **Refresh stream** — for extracted webpage sources, manually re-extracts a fresh signed URL.
- **Open original** — escape hatch to the source page.

**Image viewer** has zoom and pan built in:
- Scroll wheel zooms in/out toward the cursor
- Pinch zoom on touch devices
- Click-drag (or one-finger pan) to move when zoomed
- Double-click/tap to toggle between 1× and 2.5×
- On-screen zoom controls at the bottom with percentage readout

**Stage sizing** adapts per source: 16:9 for wide video, portrait dimensions for TikTok/Instagram Reels, tall scrollable container for Reddit/Facebook post-style embeds where the platform's own UI sits around the video.

## The webpage extractor (`/api/extract`)

When you paste a URL that isn't a known source, the player calls `/api/extract`. The server validates the URL, fetches the page, parses the HTML, and looks for video URLs in:

- `<video src>` / `<video><source src></video>` (with resolution from `size`/`label`/`data-res` attrs)
- `<meta property="og:video">`, `og:video:url`, `og:video:secure_url`
- `<meta name="twitter:player:stream">`
- JSON-LD `VideoObject` (`contentUrl` / `embedUrl`)
- Inline `.mp4` / `.webm` / `.m3u8` URLs in `<script>` strings

Highest resolution wins. Result is never cached (tokens expire). On failure you get a clear error and an "Open original" link.

**Auto-refresh on expired tokens.** When a CDN-signed URL expires mid-playback, the `<video>` element fires an error. The player catches it, re-extracts a fresh URL from the page, swaps the source, and seeks back to where you left off. Up to 2 retries before giving up. HLS streams via hls.js fire the same path on fatal segment errors. There's also a manual refresh button (top-right circle-arrow) when watching an extracted stream.

**What it won't fix:**
- **IP-bound CDN tokens.** Server fetches from Vercel's IP, browser plays from yours. Some CDNs check, return 403. Architectural problem, not a parser problem.
- **Cloudflare / Datadome / PerimeterX challenges.** These return interstitial HTML, not the real page. The fix is a headless browser worker (Playwright on Render/Railway), intentionally out of scope here.
- **Sites that ship video URLs only in client-side JS that runs after page load.** The parser sees server-rendered HTML only.

## What's NOT here

- No PDF/EPUB reader. That was removed.
- No audio/music player. Audio files won't load.
- No image gallery scraping. Just direct image URLs.
- No Google Drive folder browser. Open the folder externally if you need to.

## v13 browser layer

The app now includes a lightweight in-app browser for quick search and link capture. Use the browser button in the top bar to search/paste a URL, preview it when the site allows iframe loading, and save the current page into Supabase. The browser keeps local device history and supports deleting one item or clearing all history.

The regular Add modal and the in-app browser both use `/api/metadata` to prefill title, notes, thumbnail, site name, and link type before saving.

Some websites block iframe previews. That is normal. The save flow still works because metadata is fetched server-side through the safe URL layer.
