# Vault Chrome extension v2.0

Desktop Chrome companion for MVibes Vault V40.

## Install
1. Download this feature branch as a ZIP from GitHub and unzip.
2. Go to `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**.
3. Select the folder `extensions/vault-media-capture`.
4. Pin the extension. If needed, set **Vault destination** to the HTTPS Vault website URL. The default is `https://vault-mikevibes76.vercel.app`.

## Save one image
Right-click an image and choose **Save image to Vault**.
A separate Vault window opens. Sign in if prompted, then select **Inbox**, an existing collection or nested gallery, or create a new folder.
Review the image and press **Save to Vault**. The website, not the extension, saves the record under your authenticated Supabase account.

Right-click **Add image to Vault capture queue** to accumulate individual photos without immediately opening a window.

## Save entire galleries
Open the gallery and scroll so lazy-loaded images appear.
Click the extension icon, select **Find images on page**, and select individual images or click **Select all**.
Up to 300 distinct image/video URLs can be sent per batch. Click **Choose folder & save** and complete the save in the Vault popup window.

The existing copy/paste/CSV/public Google Sheets URL importer remains available.

## Privacy and limitations
- The extension does not read Vault cookies, passwords, or Supabase tokens.
- Only explicitly selected URLs are handed to the signed-in Vault website.
- Duplicate captures use Vault's stable item keys, and repeated captures keep existing notes, tags, and covers.
- Saving links is **not downloading image bytes**. Restricted, expiring, or 403-blocked image URLs can still be unusable later. For permanent originals, obtain files through a permitted source download and upload them separately.
- The extension does not bypass paywalls, access controls, or DRM.
- Chrome for iPhone cannot install desktop Chrome extensions.
- Unpacked extensions require reloading after local code changes.
