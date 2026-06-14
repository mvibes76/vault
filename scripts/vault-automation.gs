/**
 * VIDEO VAULT v16 — Google Sheet mirror webhook
 *
 * Supabase/app is source of truth. This script mirrors app-added links into one
 * sheet tab named "Vault Library" and supports deletes + batch imports.
 *
 * Deploy as Apps Script Web App:
 *  - Execute as: Me
 *  - Who has access: Anyone
 *  - Copy web app URL into Vercel env: SHEETS_WEBHOOK_URL
 */

const VAULT_SHEET_NAME = 'Vault Library';
const HEADERS = [
  'Item Key', 'Title', 'URL', 'Folder', 'Tags', 'Notes', 'Type', 'Source',
  'Thumbnail', 'Cover Mode', 'Cover Fit', 'Cover X', 'Cover Y', 'Created At', 'Updated At', 'Last Action'
];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getOrCreateVaultSheet_(ss);

    if (Array.isArray(payload.items)) {
      const stats = { upserted: 0, deleted: 0, skipped: 0 };
      payload.items.forEach(function(item) {
        const action = item.action || payload.action || 'upsert';
        const res = processItem_(sheet, Object.assign({}, item, { action: action }));
        if (res.action === 'delete') stats.deleted++;
        else if (res.action === 'upsert') stats.upserted++;
        else stats.skipped++;
      });
      return json_({ ok: true, action: payload.action || 'batch', stats: stats });
    }

    const result = processItem_(sheet, payload);
    return json_({ ok: true, action: result.action, itemKey: result.itemKey });
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

function processItem_(sheet, payload) {
  if (!payload.url && !payload.item_key && !payload.key) {
    return { action: 'skipped', itemKey: '' };
  }

  const itemKey = payload.key || payload.item_key || makeKey_(payload.url);
  const row = findRowByKey_(sheet, itemKey);
  const now = new Date().toISOString();

  if (payload.action === 'delete') {
    if (row > 1) sheet.deleteRow(row);
    return { action: 'delete', itemKey: itemKey };
  }

  const values = [
    itemKey,
    payload.title || payload.name || payload.url || '',
    payload.url || '',
    payload.folder || '',
    Array.isArray(payload.tags) ? payload.tags.join(', ') : (payload.tags || ''),
    payload.note || payload.notes || '',
    payload.type || 'link',
    payload.source || '',
    payload.thumbnail || '',
    payload.cover_mode || '',
    payload.cover_fit || '',
    payload.cover_position_x || '',
    payload.cover_position_y || '',
    payload.addedAt || payload.created_at || now,
    now,
    payload.action || 'upsert'
  ];

  if (row > 1) sheet.getRange(row, 1, 1, HEADERS.length).setValues([values]);
  else sheet.appendRow(values);

  return { action: 'upsert', itemKey: itemKey };
}

function getOrCreateVaultSheet_(ss) {
  let sheet = ss.getSheetByName(VAULT_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(VAULT_SHEET_NAME);
  const first = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (first.join('') !== HEADERS.join('')) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRowByKey_(sheet, key) {
  const last = sheet.getLastRow();
  if (last < 2) return -1;
  const values = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(key)) return i + 2;
  }
  return -1;
}

function makeKey_(url) {
  let h = 0;
  const s = String(url || '');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return 'k' + Math.abs(h);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
