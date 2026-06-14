# Video Vault v15 Notes

## Browser fix

The in-app browser no longer attempts to load Google search pages inside an iframe. Google and most search engines block iframe embedding, which caused the white stalled loading screen on mobile.

## New behavior

- Search terms call `/api/browser-search`.
- Results render inside the app as a clean saveable list.
- Results are forced to US/English parameters.
- Destination pages can still be previewed when they allow iframe viewing.
- If a site blocks iframe preview, the app shows a clear blocked-preview state instead of an infinite loader.
- Each result can be saved directly to the vault without previewing.

## New API route

- `/api/browser-search?q=` fetches DuckDuckGo HTML results using US/English locale and returns parsed result cards.

