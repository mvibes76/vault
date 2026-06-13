/**
 * VAULT AUTOMATION — Google Apps Script
 * ─────────────────────────────────────
 * Paste this entire file into your Google Sheet's Apps Script editor:
 *   Extensions → Apps Script → replace everything → Save → run setup()
 *
 * What it does:
 *   1. Watches your "Vault" Drive folder for new subfolders → creates sheet tabs
 *   2. Watches those subfolders for new files → adds rows with metadata
 *   3. Uses Gemini AI to fill in title, type, tags, note for each file
 *   4. Accepts Quick Adds from the Vault app via Web App endpoint
 *
 * Setup (do this once):
 *   1. In Apps Script → Project Settings → Script Properties, add:
 *        VAULT_FOLDER_ID  = (ID from your Vault Drive folder URL)
 *        GEMINI_API_KEY   = (from aistudio.google.com → Get API key)
 *   2. Run setup() — installs the 10-minute sync trigger
 *   3. Deploy → New deployment → Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *      Copy the Web App URL → add to Vercel as SHEETS_WEBHOOK_URL
 */


// ─── Config ────────────────────────────────────────────────────────────────────

const PROPS            = PropertiesService.getScriptProperties();
const VAULT_FOLDER_ID  = () => PROPS.getProperty("VAULT_FOLDER_ID");
const GEMINI_API_KEY   = () => PROPS.getProperty("GEMINI_API_KEY");
const PROCESSED_KEY    = "PROCESSED_FILE_IDS";
const HEADER_ROW       = ["url", "title", "note", "tag", "type"];
const QUICK_ADDS_TAB   = "Quick Adds";


// ─── Setup ─────────────────────────────────────────────────────────────────────

/** Run once to install triggers. */
function setup() {
  // Remove any existing triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));

  // Sync Drive → Sheets every 10 minutes
  ScriptApp.newTrigger("syncVaultFolder")
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log("✓ Trigger installed. Running initial sync...");
  syncVaultFolder();
  Logger.log("✓ Setup complete.");
}


// ─── Main sync ─────────────────────────────────────────────────────────────────

/** Called every 10 minutes. Finds new folders and files, adds them to the sheet. */
function syncVaultFolder() {
  const folderId = VAULT_FOLDER_ID();
  if (!folderId) { Logger.log("ERROR: VAULT_FOLDER_ID not set in Script Properties."); return; }

  const sheet      = SpreadsheetApp.getActiveSpreadsheet();
  const vaultDir   = DriveApp.getFolderById(folderId);
  const processedIds = getProcessedIds();
  const newProcessed = [];

  // Scan subfolders
  const subFolders = vaultDir.getFolders();
  while (subFolders.hasNext()) {
    const folder   = subFolders.next();
    const tabName  = folder.getName();

    // Ensure a sheet tab exists for this folder
    let tab = sheet.getSheetByName(tabName);
    if (!tab) {
      tab = sheet.insertSheet(tabName);
      tab.appendRow(HEADER_ROW);
      tab.getRange(1, 1, 1, HEADER_ROW.length).setFontWeight("bold");
      Logger.log(`Created tab: ${tabName}`);
    }

    // Scan files in this folder
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const fileId = file.getId();

      if (processedIds.has(fileId)) continue; // already handled

      const url      = getFileUrl(file);
      const fileType = detectFileType(file);
      const meta     = getGeminiMetadata(file.getName(), fileType, url);

      tab.appendRow([url, meta.title, meta.note, meta.tags, meta.type]);
      newProcessed.push(fileId);
      Logger.log(`Added: ${file.getName()} → ${tabName}`);

      Utilities.sleep(500); // rate-limit Gemini calls
    }
  }

  if (newProcessed.length > 0) {
    saveProcessedIds([...processedIds, ...newProcessed]);
    Logger.log(`Sync complete. Added ${newProcessed.length} new items.`);
  }
}


// ─── Quick Adds webhook ────────────────────────────────────────────────────────

/** Web App endpoint — receives Quick Adds from the Vault app. */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.action !== "quick_add") {
      return jsonResponse({ ok: false, error: "Unknown action" });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    let tab = sheet.getSheetByName(QUICK_ADDS_TAB);
    if (!tab) {
      tab = sheet.insertSheet(QUICK_ADDS_TAB);
      tab.appendRow(HEADER_ROW);
      tab.getRange(1, 1, 1, HEADER_ROW.length).setFontWeight("bold");
    }

    // If no title was provided, ask Gemini
    let title = body.title || "";
    let tags  = body.tags  || "";
    let note  = body.note  || "";
    let type  = body.type  || "link";

    if (!title || title === body.url) {
      const meta = getGeminiMetadata(body.url, body.type, body.url);
      title = meta.title || body.url;
      tags  = tags || meta.tags;
      note  = note || meta.note;
      type  = type || meta.type;
    }

    tab.appendRow([body.url, title, note, tags, type]);
    return jsonResponse({ ok: true });
  } catch (err) {
    Logger.log("doPost error: " + err.message);
    return jsonResponse({ ok: false, error: err.message });
  }
}

/** Web App GET — health check. */
function doGet() {
  return jsonResponse({ ok: true, service: "vault-automation" });
}


// ─── Gemini ────────────────────────────────────────────────────────────────────

/**
 * Call Gemini to extract clean metadata from a filename or URL.
 * Returns { title, type, tags, note }.
 */
function getGeminiMetadata(nameOrUrl, knownType, url) {
  const apiKey = GEMINI_API_KEY();
  if (!apiKey) {
    Logger.log("GEMINI_API_KEY not set — using filename as title.");
    return { title: nameOrUrl, type: knownType || "link", tags: "", note: "" };
  }

  const prompt = `You are a media cataloger for a personal vault app.
Given this file or URL, return clean metadata.

Input: "${nameOrUrl}"
Known type: "${knownType || "unknown"}"

Return ONLY valid JSON — no explanation, no markdown, no backticks:
{
  "title": "clean readable title without technical details like resolution or codec",
  "type": "one of: youtube, video, audio, music, image, pdf, epub, doc, link",
  "tags": "3-5 comma-separated lowercase tags (genre, year, format, topic, etc.)",
  "note": "brief one-line description or leave empty"
}`;

  try {
    const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;
    const payload  = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
    };
    const response = UrlFetchApp.fetch(endpoint, {
      method: "POST",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const raw  = JSON.parse(response.getContentText());
    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    // Strip any accidental markdown fences
    const clean = text.replace(/```json|```/g, "").trim();
    const meta  = JSON.parse(clean);

    return {
      title: meta.title || nameOrUrl,
      type:  meta.type  || knownType || "link",
      tags:  Array.isArray(meta.tags) ? meta.tags.join(", ") : (meta.tags || ""),
      note:  meta.note  || "",
    };
  } catch (err) {
    Logger.log("Gemini error: " + err.message);
    return { title: nameOrUrl, type: knownType || "link", tags: "", note: "" };
  }
}


// ─── Helpers ───────────────────────────────────────────────────────────────────

function detectFileType(file) {
  const mime = file.getMimeType();
  const name = file.getName().toLowerCase();
  if (mime.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm|m4v)$/.test(name)) return "video";
  if (mime.startsWith("audio/") || /\.(mp3|flac|m4a|wav|aac|opus)$/.test(name)) return "audio";
  if (mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|avif|bmp)$/.test(name)) return "image";
  return "link";
}

function getFileUrl(file) {
  return file.getUrl();
}

function getProcessedIds() {
  const raw = PROPS.getProperty(PROCESSED_KEY) || "[]";
  return new Set(JSON.parse(raw));
}

function saveProcessedIds(ids) {
  // Keep last 5000 to avoid property size limits
  const trimmed = ids.slice(-5000);
  PROPS.setProperty(PROCESSED_KEY, JSON.stringify(trimmed));
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
