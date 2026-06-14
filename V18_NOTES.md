# Video Vault v18 Notes

## Folder identity fix

Folder matching is now case-insensitive while display casing is preserved from the existing folder.

- Existing `Main` + imported `main` => item goes to `Main`
- Existing `videos` + imported `Videos` => item goes to `videos`
- No existing match + imported `main` => new folder displays as `main`

This applies to Google Sheet imports, quick-add folder creation, move-folder actions, and folder deletion cleanup.

## No schema change required

Deploy app code only. The current v16 schema is still valid.
