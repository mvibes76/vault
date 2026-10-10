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


// Extension-initiated Save to Vault uses the website's existing import form.
// No Vault credentials or cookies are handled by the extension.
const VAULT_DEFAULT_URL="https://vault-preview-temp-9tnwnrk1f-elicastas-projects.vercel.app";
const pendingImport=new Map();
function isMediaUrl(url) {
  return /\.(?:jpe?g|png|webp|avif|gif|bmp|mp4|webm|m4v|mov|m3u8)(?:$|[?#])/i.test(url);
}
function safeVaultOrigin(raw) {
  try {
    const u=new URL(String(raw||"").trim());
    if(u.protocol!=="https:"||u.username||u.password||!u.hostname||u.hostname==="localhost")return "";
    return u.origin;
  }catch{return "";}
}
function cleanImportItems(items) {
  const list=[],seen=new Set();
  for(const item of (Array.isArray(items)?items:[]).slice(0,350)){
    const url=normalize(item?.url);
    if(!url||seen.has(url)||!["image","video"].includes(item?.type))continue;
    seen.add(url);
    list.push({
      url,type:item.type,
      title:String(item.title|| (item.type==="image"?"Saved image":"Saved video")).slice(0,180),
      thumbnail:normalize(item.thumbnail)|| (item.type==="image"?url:""),
      sourcePage:normalize(item.sourcePage)||url,
      sourceKind:item.sourceKind==="spreadsheet-import"?"browser-network-capture":
        /^browser-/.test(item.sourceKind||"")?item.sourceKind:"browser-network-capture",
    });
    if(list.length>=300)break;
  }
  return list;
}
async function configuredVaultOrigin(){
  const settings=await chrome.storage.local.get("vault_import_origin").catch(()=>({}));
  return safeVaultOrigin(settings.vault_import_origin)||VAULT_DEFAULT_URL;
}
function insertIntoVaultPage(payload) {
  const control='textarea[aria-label="Browser-captured media links"]';
  return new Promise(resolve=>{
    let tries=0;
    const timer=setInterval(()=>{
      const field=document.querySelector(control);
      if(field){
        clearInterval(timer);
        const proto=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value");
        proto?.set?.call(field,payload);
        field.dispatchEvent(new Event("input",{bubbles:true}));
        field.dispatchEvent(new Event("change",{bubbles:true}));
        setTimeout(()=>{
          const button=Array.from(document.querySelectorAll("button"))
            .find(b=>b.textContent?.trim()==="Review captured media");
          if(button&&!button.disabled)button.click();
          resolve(true);
        },350);
      }else if(++tries>=120){clearInterval(timer);resolve(false);}
    },500);
  });
}
async function tryVaultDelivery(tabId, tabUrl) {
  const job=pendingImport.get(tabId);
  if(!job||job.busy||Date.now()>job.expiresAt)return;
  try{
    const current=new URL(tabUrl||"");
    if(current.origin!==job.origin||current.pathname!=="/import")return;
  }catch{return;}
  job.busy=true;
  try {
    const result=await chrome.scripting.executeScript({
      target:{tabId},world:"MAIN",func:insertIntoVaultPage,args:[job.payload],
    });
    if(result?.[0]?.result===true) pendingImport.delete(tabId);
  }catch { /* Users may be signing in; retry when the page reloads. */ }
  finally{job.busy=false;}
}
async function launchVaultImport(items, rawOrigin) {
  const cleaned=cleanImportItems(items);
  if(!cleaned.length)throw new Error("Select images or videos before importing.");
  const origin=safeVaultOrigin(rawOrigin)||await configuredVaultOrigin();
  const payload=JSON.stringify({format:"vault-media-capture-v1",items:cleaned});
  const tab=await chrome.tabs.create({url:origin+"/import",active:true});
  if(!Number.isInteger(tab?.id))throw new Error("Could not open Vault.");
  pendingImport.set(tab.id,{origin,payload,expiresAt:Date.now()+5*60*1000,busy:false});
  if(tab.status==="complete")tryVaultDelivery(tab.id,tab.url);
  return {ok:true,count:cleaned.length,tabId:tab.id};
}
chrome.runtime.onInstalled.addListener(()=>{
  chrome.contextMenus.create({id:"vault_save_image",title:"Save image to Vault",contexts:["image"]},()=>{void chrome.runtime.lastError;});
  chrome.contextMenus.create({id:"vault_queue_image",title:"Add image to Vault capture queue",contexts:["image"]},()=>{void chrome.runtime.lastError;});
});
chrome.contextMenus.onClicked.addListener((info,tab)=>{
  if(!["vault_save_image","vault_queue_image"].includes(info.menuItemId))return;
  if(!Number.isInteger(tab?.id))return;
  const image=normalize(info.srcUrl||"");
  if(!image)return;
  const linked=normalize(info.linkUrl||"");
  const full=isMediaUrl(linked)?linked:image;
  const item={url:full,type:"image",title:"Saved image",thumbnail:image,
    sourcePage:normalize(tab.url||"")||full,sourceKind:"browser-linked-full-image"};
  const map=state.get(tab.id)||new Map();
  map.set(full,item);
  state.set(tab.id,map);
  schedulePersist(tab.id);
  if(info.menuItemId==="vault_save_image")launchVaultImport([item]).catch(()=>{});
});
chrome.tabs.onUpdated.addListener((tabId,change,tab)=>{
  if(change.status==="complete")tryVaultDelivery(tabId,tab?.url);
});
chrome.tabs.onRemoved.addListener(tabId=>pendingImport.delete(tabId));
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(msg?.type!=="VAULT_OPEN_IMPORT")return;
  launchVaultImport(msg.items,msg.origin).then(sendResponse).catch(e=>sendResponse({ok:false,error:e.message}));
  return true;
});
