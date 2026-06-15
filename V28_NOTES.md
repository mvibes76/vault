# Video Vault v28

## Patch

- Fixed gallery/slideshow thumbnails showing broken image icons.
- Gallery covers now fall back through:
  1. explicit gallery cover
  2. item thumbnail
  3. direct image URL when the item itself is an image
  4. provider thumbnail candidates
  5. clean folder/gallery placeholder
- Slideshow uses the same fallback chain.
- No Supabase schema changes.
