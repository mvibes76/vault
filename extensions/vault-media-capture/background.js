// MV3 Network observer. The browser extension can see actual media fetches,
// unlike a third-party iframe. It never fetches media, bypasses access control,
// modifies requests, or transmits URLs to another service.
const MAX_ITEMS = 200;
const TTL_MS = 60 * 60 * 1000;
const state = new Map();
const flushTimers = new Map();
const MEDIA_URL = /\.(?:mp4|m4v|mov|webm|m3u8|mp3|m4a|aac|ogg|ogv|jpe?g|png|webp|avif|gif)(?:$|[?#])/i;
const VIDEO_CONTENT = /^(?:video\/|application\/(?:vnd\.apple\.mpegurl|x-mpegurl|mpegurl))/i;
const IMAGE_CONTENT = /^image\/(?!svg)/i;
const AD_HOST = /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|adnxs\.com|taboola\.com|outbrain\.com|criteo\.com|adsrvr\.org|pubmatic\.com|rubiconproject\.com|spotxchange\.com)$/i;
const AD_PATH = /(?:^|\/)(?:ads?|adserver|preroll|midroll|postroll|sponsored|vast|vpaid)(?:\/|[-_.]|$)/i;

function normalize(raw) {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || AD_HOST.test(url.hostname) || AD_PATH.test(url.pathname)) return "";
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^utm_|^(?:gclid|fbclid|dclid|igshid)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  } catch { return ""; }
}
function inferType(url, headers = []) {
  const type = headers.find((header) => header.name?.toLowerCase() === "content-type")?.value || "";
  if (VIDEO_CONTENT.test(type)) return "video";
  if (IMAGE_CONTENT.test(type)) return "image";
  if (/\.(?:mp4|m4v|mov|webm|m3u8|ogg|ogv)(?:$|[?#])/i.test(url)) return "video";
  if (/\.(?:jpe?g|png|webp|avif|gif)(?:$|[?#])/i.test(url)) return "image";
  return "";
}
function record(detail, headers) {
  if (detail.tabId < 0 || !detail.url || !["media", "xmlhttprequest", "image", "other"].includes(detail.type)) return;
  const url = normalize(detail.url);
  if (!url) return;
  const type = inferType(url, headers);
  if (!type) return;
  const map = state.get(detail.tabId) || new Map();
  if (!map.has(url) && map.size >= MAX_ITEMS) map.delete(map.keys().next().value);
  const old = map.get(url);
  const item = {
    url, type, title: old?.title || (type === "video" ? "Captured video" : "Captured image"),
    sourcePage: old?.sourcePage || normalize(detail.initiator || detail.documentUrl || ""),
    sourceKind: "browser-network-capture", capturedAt: Date.now(),
  };
  map.set(url, item);
  state.set(detail.tabId, map);
  schedulePersist(detail.tabId);
}
function schedulePersist(tabId) {
  if (flushTimers.has(tabId)) return;
  flushTimers.set(tabId, setTimeout(async () => {
    flushTimers.delete(tabId);
    const map = state.get(tabId);
    if (!map) return;
    try { await chrome.storage.session.set({ ["vault_media_" + tabId]: Array.from(map.values()) }); } catch {}
  }, 450));
}

chrome.webRequest.onBeforeRequest.addListener((details) => {
  if (MEDIA_URL.test(details.url)) record(details);
}, { urls: ["<all_urls>"] });
chrome.webRequest.onHeadersReceived.addListener((details) => {
  if (details.statusCode < 200 || details.statusCode >= 400) return;
  record(details, details.responseHeaders || []);
}, { urls: ["<all_urls>"] }, ["responseHeaders"]);

chrome.tabs.onRemoved.addListener((tabId) => {
  state.delete(tabId);
  chrome.storage.session.remove("vault_media_" + tabId).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status !== "loading" || !change.url) return;
  state.delete(tabId);
  chrome.storage.session.remove("vault_media_" + tabId).catch(() => {});
});



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "VAULT_SMART_PICK") {
    const tabId=sender.tab?.id;
    const rect=message.rect;
    if(!Number.isInteger(tabId)||!rect || ![rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)) {
      sendResponse({ok:false});return;
    }
    chrome.storage.session.set({["vault_smart_selected_"+tabId]:{
      url:message.url,rect,viewportW:message.viewportW,viewportH:message.viewportH,at:Date.now(),
    }}).then(()=>sendResponse({ok:true})).catch(()=>sendResponse({ok:false}));
    return true;
  }
  if (message?.type !== "VAULT_CAPTURE_GET" || !Number.isInteger(message.tabId)) return;
  (async () => {
    let entries = Array.from(state.get(message.tabId)?.values() || []);
    if (!entries.length) {
      const stored = await chrome.storage.session.get("vault_media_" + message.tabId).catch(() => ({}));
      entries = stored["vault_media_" + message.tabId] || [];
    }
    const now = Date.now();
    entries = entries.filter((item) => now - Number(item.capturedAt || now) <= TTL_MS);
    sendResponse({ items: entries });
  })().catch(() => sendResponse({ items: [] }));
  return true;
});


// User-triggered capture handoff. The extension never accesses Supabase credentials.
const DEFAULT_VAULT_ORIGIN = "https://vault-mikevibes76.vercel.app";
const JOB_PREFIX = "vault_import_job_";
const running = new Set();

function safeVaultOrigin(raw) {
  try {
    const u = new URL(String(raw || "").trim());
    if (u.protocol !== "https:" || !u.hostname || u.username || u.password) return "";
    return u.origin;
  } catch { return ""; }
}
async function vaultOrigin() {
  const config = await chrome.storage.local.get("vault_import_origin").catch(() => ({}));
  return safeVaultOrigin(config.vault_import_origin) || DEFAULT_VAULT_ORIGIN;
}
function cleanSelection(input) {
  const items = [], seen = new Set();
  for (const item of (Array.isArray(input) ? input : [])) {
    const url = normalize(item?.url);
    if (!url || seen.has(url) || !["image","video"].includes(item?.type)) continue;
    seen.add(url);
    items.push({
      url, type: item.type,
      title: String(item.title || "").slice(0,180),
      thumbnail: normalize(item.thumbnail) || (item.type === "image" ? url : ""),
      sourcePage: normalize(item.sourcePage) || url,
    });
    if (items.length === 300) break;
  }
  return items;
}
function injectIntoVaultPage(payload) {
  try { return window.__vaultCaptureImport?.(payload) === true; }
  catch { return false; }
}
async function deliver(tabId) {
  if (running.has(tabId)) return;
  running.add(tabId);
  try {
    const all = await chrome.storage.session.get(JOB_PREFIX + tabId).catch(() => ({}));
    const job = all[JOB_PREFIX + tabId];
    if (!job || job.expires < Date.now()) {
      await chrome.storage.session.remove(JOB_PREFIX + tabId).catch(() => {});
      return;
    }
    // AuthGate may need the user to sign in before the React importer mounts.
    // Retries are bounded and session storage preserves the job across worker wakeups.
    for (let attempt=0; attempt<120; attempt++) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab) break;
      try {
        const url = new URL(tab.url || "");
        if (url.origin !== job.origin || url.pathname !== "/capture") break;
        const reply = await chrome.scripting.executeScript({
          target: {tabId}, world: "MAIN", func: injectIntoVaultPage, args: [job.payload],
        });
        if (reply?.[0]?.result === true) {
          await chrome.storage.session.remove(JOB_PREFIX + tabId);
          break;
        }
      } catch { /* Wait until the Vault capture page is ready. */ }
      await new Promise(resolve => setTimeout(resolve,750));
    }
  } finally { running.delete(tabId); }
}
async function openFolderPicker(items, requestedOrigin) {
  const cleaned = cleanSelection(items);
  if (!cleaned.length) throw new Error("Choose an image or gallery before saving.");
  const origin = safeVaultOrigin(requestedOrigin) || await vaultOrigin();
  const browserWindow = await chrome.windows.create({
    url: origin + "/capture", type: "popup", width: 760, height: 820, focused: true,
  });
  const tabId = browserWindow.tabs?.[0]?.id;
  if (!Number.isInteger(tabId)) throw new Error("Could not open Vault's folder picker.");
  const payload = {
    format: "vault-extension-capture-v2",
    jobId: Date.now().toString(36) + "-" + tabId,
    items: cleaned,
  };
  await chrome.storage.session.set({
    [JOB_PREFIX + tabId]: {origin, payload, expires:Date.now()+5*60*1000},
  });
  void deliver(tabId);
  return {ok:true,count:cleaned.length,tabId};
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({id:"vault_save_image",title:"Save image to Vault",contexts:["image"]},
    () => {void chrome.runtime.lastError;});
  chrome.contextMenus.create({id:"vault_queue_image",title:"Add image to Vault capture queue",contexts:["image"]},
    () => {void chrome.runtime.lastError;});
});
chrome.contextMenus.onClicked.addListener((info,tab) => {
  if (!["vault_save_image","vault_queue_image"].includes(info.menuItemId)) return;
  if (!Number.isInteger(tab?.id)) return;
  const thumbnail = normalize(info.srcUrl || "");
  if (!thumbnail) return;
  const linked = normalize(info.linkUrl || "");
  const original = /\.(?:jpe?g|png|webp|gif|avif|bmp)(?:$|[?#])/i.test(linked) ? linked : thumbnail;
  const item = {
    url:original, type:"image", title:"Captured image",
    thumbnail, sourcePage:normalize(tab.url || "") || original,
  };
  const captured = state.get(tab.id) || new Map();
  captured.set(original,item);
  state.set(tab.id,captured);
  schedulePersist(tab.id);
  if (info.menuItemId === "vault_save_image") {
    void openFolderPicker([item]).catch(error => console.warn("[Vault]",error.message));
  }
});
chrome.tabs.onUpdated.addListener((tabId,change) => {
  if (change.status === "complete") void deliver(tabId);
});
chrome.tabs.onRemoved.addListener(tabId => {
  running.delete(tabId);
  chrome.storage.session.remove(JOB_PREFIX + tabId).catch(() => {});
});
chrome.runtime.onMessage.addListener((message,sender,sendResponse) => {
  if (message?.type !== "VAULT_OPEN_PICKER") return;
  openFolderPicker(message.items,message.origin).then(sendResponse)
    .catch(error => sendResponse({ok:false,error:error.message || "Could not open Vault."}));
  return true;
});
