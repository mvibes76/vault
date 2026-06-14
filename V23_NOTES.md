# Video Vault v23 Notes

## Cover control layer

v23 adds per-item and Cover Library cover behavior controls.

### Add/Edit item

The Add/Edit Vault modal now has **Cover behavior**:

- **Auto**: uses Cover Library rules when they match.
- **Original**: keeps the provider/metadata/source cover and bypasses Cover Library matching.
- **Custom**: uses a pasted cover URL and bypasses Cover Library matching.

The modal also includes card-cover sizing controls:

- **Fill crop**: fills the 4:5 card frame.
- **Fit full**: shows the whole cover image inside the card frame.
- Horizontal and vertical crop sliders for Fill crop mode.

### Google Sheets import

Sheets still require only a URL column, but v23 supports these optional cover fields:

- `Thumbnail`, `Thumb`, `Image`, `Poster`, `Cover`, `Cover URL`, or `Custom Cover`
- `Cover Mode`, `Cover Behavior`, or `Use Original Cover`
- `Cover Fit`, `Cover Sizing`, `Sizing`, or `Fit`
- `Cover X` / `Crop X`
- `Cover Y` / `Crop Y`

If a Sheet row includes a Thumbnail/Cover URL, it is treated as a custom/manual cover and bypasses automatic Cover Library matching.

If `Use Original Cover` is true/yes/1, or Cover Mode is `original`, the item keeps its original source cover and bypasses Cover Library matching.

### Cover Library

Cover Library entries now also support sizing/crop controls. When a cover rule matches an item, the crop settings from the library cover are applied to the item card preview.

## Supabase

Run the latest `sql/schema.sql` after deploying v23. It adds safe columns to `vault_items` and `vault_covers`:

- `cover_mode`
- `cover_fit`
- `cover_position_x`
- `cover_position_y`

## Google Sheet mirror

Replace `scripts/vault-automation.gs` if you want the Sheet mirror to include the new cover fields.
