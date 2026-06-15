# Video Vault v32 — Hardening

v32 freezes new concepts and tightens the app.

## Added

- App-level `ErrorBoundary` so render crashes show a recovery screen instead of a blank/broken app.
- Settings → Diagnostics tab.
- `/api/health` route to verify server-side env configuration.
- Settings → Backup tab.
- JSON backup export.
- CSV export.
- Stored last runtime error in `localStorage` for debugging.

## Fixed / hardened

- Invalid folder routes now return to Everything instead of crashing.
- Folder card generation skips malformed folder rows.
- Search no longer assumes every tag is a string.
- Legacy Sheet tab parser now accepts all reference URLs instead of silently dropping non-video links.
- Removed duplicate Cover Library note field in Settings.

## Schema

No Supabase schema update is required for v32.

## Test checklist

- Open app normally.
- Open folders and child galleries.
- Open Settings → Diagnostics.
- Export JSON backup.
- Export CSV.
- Search with mixed tag data.
- Open an invalid/missing folder route and confirm it does not crash.
