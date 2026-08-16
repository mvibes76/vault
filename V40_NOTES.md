# Vault V40 — Vault OS

## Product changes

- Reframed Vault as a private media library instead of a utility dashboard.
- Rebuilt Home around resume, save, collections, and recent media.
- Added universal Search / Paste command surface.
- Added Inbox for save-now-organize-later capture.
- Split Library and Collections into separate destinations.
- Rebuilt mobile navigation: Home, Library, Add, Search, Collections.
- Simplified Add Media into a fast default path with advanced details collapsed.
- Expanded search to title, URL, notes, tags, folder, source, and site metadata.
- Refreshed the dark UI with graphite surfaces, artwork-led hierarchy, larger radii, and a cool single accent.
- Updated cards and navigation hierarchy.
- Renamed the playback relay to Smart Relay.

## Engineering changes

- Added same-site request gating to `/api/stream`.
- Added per-client Smart Relay request limiting.
- Removed wildcard CORS from the stream relay response.
- Added `X-Content-Type-Options: nosniff` and same-origin resource policy on relayed media.
- Added stable UUID folder relationship migration with legacy name-field sync triggers.
- Added tested domain helpers for media classification, Inbox membership, and search.
- Updated backup version to V40.
- Updated PWA cache key from V11 to V40.
- Removed disconnected legacy component files, including the stale XR implementation.
- Moved V11–V39 release notes into `docs/history/`.

## Tests added

- Smart Relay same-origin gate.
- Cross-site relay rejection.
- Relay rate-limit window reset.
- Media kind classification.
- Multi-field Vault search.
- Inbox classification.

## Migration

Run `sql/v40-stable-folder-ids.sql` against an existing Supabase database.

The current app remains backward-compatible with name-based folder fields, so code deployment does not require an all-at-once data rewrite.
