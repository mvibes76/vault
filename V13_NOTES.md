# Video Vault v13 Notes

v13 adds a lightweight in-app browser layer without changing the core source-of-truth model.

## Source of truth

- Supabase remains the real vault.
- Google Sheet remains a one-page mirror named `Vault Library`.
- The browser history is local to the device through `localStorage`.

## New pieces

### In-app browser

New component:

```txt
components/InAppBrowser.jsx
```

Open it from the top bar. It supports:

- search/address bar
- URL navigation
- lightweight iframe preview
- local browser history
- delete one history item
- clear all history
- open original link externally
- quick-save current page into Vault

Some sites block iframe previews with `X-Frame-Options` or CSP. That is expected. The link can still be saved because metadata extraction happens server-side.

### Metadata extraction

New route:

```txt
/api/metadata?url=
```

It uses the existing safe URL validation and extracts:

- title
- description
- thumbnail
- site name
- content type
- basic type: link/image/video

This route is used by:

- Quick Add modal
- In-app browser quick-save panel

### Quick Add prefill

The regular Add modal now reads metadata after a URL is pasted and fills empty title/note fields. It also stores thumbnail/type/siteName on the vault item.

## Not included yet

- Full headless browser scraping
- Search API integration
- Cloud-synced browser history
- Google Drive folder crawling
- External Germany relay

Those are separate upgrades. v13 keeps the app simple.
