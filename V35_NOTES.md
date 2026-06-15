# Video Vault v35 — Sheet Sources

## Added

- Hardwired the requested Google Sheet as the first/default import source:
  - Sheet ID: `1G5Urk7D9iavQdGYREYYctIP_R5Vtzq74h3vB67jx21s`
  - Default tab/gid: `gid:355378672`
- Added saved Sheet Sources in Settings.
- Added import dropdown to choose saved Sheet source.
- Added tab/gid import support. Use either normal tab names or `gid:355378672`.
- Added local + Supabase persistence for sheet sources.
- Kept link-based access only. No OAuth, Drive API, or Google console setup.

## Supabase

Run `sql/schema.sql` to add:

```sql
alter table user_settings add column if not exists sheet_sources jsonb default '[]'::jsonb;
alter table user_settings add column if not exists default_sheet_source_id text default 'vault-library-default';
```

## Notes

The Sheet must be shared as “Anyone with the link can view” for import scanning to work.
