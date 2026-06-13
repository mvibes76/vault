# Media Vault v4

Personal multimedia platform: Google Sheets as the source, Supabase for sync, with VR and 3D viewing.

## Features

- Sheet tabs = collections, with tags and VR format columns
- Auth (Supabase email/password), favorites, watch progress, custom folders — synced across devices
- Sidebar navigation: collections, media types, favorites, continue watching, your folders
- Metadata scraper: any link (Mixkit, Reddit, articles) gets real thumbnails and playable video when available
- Google Drive folder browser
- 4 gallery views: large grid, small grid, masonry, list + fullscreen slideshow
- 3D model viewer: OBJ, GLB/GLTF, STL with orbit, lighting, wireframe
- VR video player: 360, 180, SBS, top-bottom, anaglyph — WebXR with Oculus controller support
- Mute buttons everywhere video plays

---

## Setup (15 minutes total)

### 1. Supabase (5 min)
1. Go to supabase.com → New Project
2. Once created: SQL Editor → paste contents of `sql/schema.sql` → Run
3. Settings → API → copy your **Project URL** and **anon public key**
4. Optional: Authentication → Providers → Email → turn OFF "Confirm email" for instant signups

### 2. Deploy to Vercel (5 min)
```bash
npm install
npx vercel
```
Then in Vercel dashboard → your project → Settings → Environment Variables, add:
```
NEXT_PUBLIC_SUPABASE_URL = https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = your-anon-key
```
Redeploy after adding env vars: `npx vercel --prod`

### 3. Sheet setup (5 min)
Row 1 of every tab:

| url | title | note | tags | format |
|-----|-------|------|------|--------|
| https://... | My video | optional | funny, cars | 360 |

- **tags**: comma separated, become filter pills
- **format**: leave blank for normal. For VR content use: `360`, `180`, `sbs`, `sbs360`, `sbs180`, `tb`, or `anaglyph`

Share the sheet: Anyone with the link can view.

---

## VR formats explained

| format | What it is |
|--------|-----------|
| `360` | Full sphere video, look anywhere |
| `180` | Half sphere (front only) |
| `sbs` | 3D side-by-side on a flat virtual screen |
| `sbs360` | 3D side-by-side, full sphere |
| `sbs180` | 3D side-by-side, half sphere (most VR content) |
| `tb` | 3D top-bottom on flat screen |
| `anaglyph` | Red/cyan 3D — works on any screen with paper glasses |

In headset: **Trigger = play/pause. Grip squeeze = exit VR.** Works in the Quest browser — just open your vault URL.

---

## 3D models

Add a Drive link or direct URL to a `.glb`, `.gltf`, `.obj`, or `.stl` file. Click it in the vault → opens the 3D viewer. GLB files with animations auto-play their first animation. Blender: export as GLB for best results (Blender's .blend files are not web-viewable — always export).

---

## Google Drive automation (Apps Script)

This makes Drive folders self-organize into your sheet:
- Drop a file in a watched folder → row auto-added to the matching sheet tab
- Create a new subfolder → new tab auto-created in the sheet

**Setup:**
1. Open your Google Sheet → Extensions → Apps Script
2. Paste this code:

```javascript
// ════════════════════════════════════════════════════
// MEDIA VAULT DRIVE SYNC
// Watches a parent Drive folder. Each subfolder = a sheet tab.
// Files in subfolders auto-append as rows.
// ════════════════════════════════════════════════════

const PARENT_FOLDER_ID = "PASTE_YOUR_PARENT_FOLDER_ID_HERE";

function syncDriveToSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const parent = DriveApp.getFolderById(PARENT_FOLDER_ID);
  const subfolders = parent.getFolders();

  while (subfolders.hasNext()) {
    const folder = subfolders.next();
    const tabName = folder.getName();

    // Create tab if missing
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      sheet.appendRow(["url", "title", "note", "tags", "format"]);
    }

    // Existing URLs in the tab (skip duplicates)
    const data = sheet.getDataRange().getValues();
    const existingUrls = new Set(data.slice(1).map(r => r[0]));

    // Add new files
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const url = "https://drive.google.com/file/d/" + file.getId() + "/view";
      if (!existingUrls.has(url)) {
        sheet.appendRow([url, file.getName(), "", "", ""]);
      }
    }
  }
}
```

3. Replace `PARENT_FOLDER_ID` — it's the long string in your folder's URL: `drive.google.com/drive/folders/THIS_PART`
4. Run it once manually (it'll ask for permissions, approve)
5. Automate it: click the clock icon (Triggers) → Add Trigger → `syncDriveToSheet` → Time-driven → Every 10 minutes (or hour)

Now your workflow is: drop files into Drive folders → they appear in your vault on next Sync. Zero manual sheet editing.

## Troubleshooting the current 3D / VR issues

### OBJ Drive links

If a Drive link has no `.obj` extension in the URL, the viewer now sniffs the first few KB of the file before choosing a loader. This prevents OBJ files exported from Blender from being sent into the GLTF loader.

Best sheet setup for OBJ:

| url | title | format |
|-----|-------|--------|
| https://drive.google.com/file/d/.../view | cars.obj | obj |

The title or format should include `obj`, `glb`, `gltf`, or `stl` when possible.

### 3D 180 / SBS 180 video

Use `sbs180` for most 3D VR180 files. Use `180` only for mono VR180 files. The desktop preview shows the left eye for stereo files; Quest/WebXR uses both eyes.

Drive videos should be public. The `/api/file` proxy supports browser Range requests so large files can stream instead of waiting for a full download.

### Supabase sync across devices

To see the same sheet, favorites, folders, and progress on every device:

1. Run `sql/schema.sql` in Supabase SQL Editor.
2. Add these Vercel environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY
```

3. Redeploy Vercel.
4. Create an account or sign in inside the app.
5. Connect the Google Sheet once. It saves to the `user_settings` table.

If the app opens without a login screen, Supabase is not configured in the deployed environment.

---

## Stack
Next.js 16 · Supabase (auth + data) · Three.js (3D + VR/WebXR) · Google Sheets (content source) · Vercel


## Torrent resolver integration

This build supports Google Sheet rows where `type` is `torrent` and `url` is either a `magnet:` link or an `https://... .torrent` URL.

Add this env var in Vercel:

```txt
NEXT_PUBLIC_TORRENT_RESOLVER_URL=https://your-render-service.onrender.com
```

Sheet example:

```txt
title | url | type | view | note
VR Test | magnet:?xt=urn:btih:... | torrent | sbs180 | browser-playable VR video
PDF Manual | magnet:?xt=urn:btih:... | torrent | pdf | reference PDF
Poster | magnet:?xt=urn:btih:... | torrent | image | image file
Model | magnet:?xt=urn:btih:... | torrent | model | 3D model
```

Phase 1 supports browser-playable torrent files:

- `.mp4`, `.m4v`, `.mov`, `.webm`
- `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.avif`, `.bmp`
- `.pdf`
- `.obj`, `.glb`, `.gltf`, `.stl`

MKV is intentionally not converted yet. Unsupported files show external open/copy URL fallback.
