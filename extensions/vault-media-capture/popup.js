const itemsEl = document.querySelector("#items");
const statusEl = document.querySelector("#state");
const copyBtn = document.querySelector("#copy");
const sendBtn = document.querySelector("#send");
const sheetText = document.querySelector("#sheet-text");
const sheetResult = document.querySelector("#sheet-result");
const unknownAsImage = document.querySelector("#unknown-as-image");
const vaultUrlInput = document.querySelector("#vault-url");
const vaultHostLabel = document.querySelector("#vault-host-label");
const vaultUrlResult = document.querySelector("#vault-url-result");
const DEFAULT_VAULT = "https://vault-mikevibes76.vercel.app";
const selectedEl = document.querySelector("#selected");
const selected = new Set();
const saved = new Map();
let currentTab;
let activeFilter = "all";

function normalize(raw) {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|adnxs\.com|taboola\.com|outbrain\.com)$/.test(url.hostname) || /(?:^|\/)(?:ads?|preroll|midroll|postroll|vast|sponsored)(?:\/|[-_.]|$)/i.test(url.pathname)) return "";
    url.hash = "";
    return url.href;
  } catch { return ""; }
}
function add(item) {
  const url = normalize(item?.url);
  if (!url || !["image", "video"].includes(item?.type)) return;
  const previous = saved.get(url);
  saved.set(url, { ...previous, ...item, url, title: item.title || previous?.title || (item.type === "image" ? "Image" : "Video"), sourcePage: item.sourcePage || previous?.sourcePage || currentTab?.url || "" });
}
function render() {
  const entries = [...saved.values()].filter((item) => activeFilter === "all" || item.type === activeFilter);
  itemsEl.replaceChildren();
  for (const item of entries) {
    const label = document.createElement("label");
    label.className = "row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox"; checkbox.checked = selected.has(item.url);
    checkbox.addEventListener("change", () => { if (checkbox.checked) selected.add(item.url); else selected.delete(item.url); updateStatus(); });
    const details = document.createElement("div");
    if (item.type === "image" && item.thumbnail) {
      const thumb = document.createElement("img");
      thumb.className = "item-thumb";
      thumb.alt = "";
      thumb.loading = "lazy";
      thumb.referrerPolicy = "no-referrer";
      thumb.src = item.thumbnail;
      thumb.addEventListener("error", () => { thumb.style.display = "none"; }, { once:true });
      label.append(thumb);
    }
    const title = document.createElement("strong"); title.textContent = item.title;
    const url = document.createElement("span"); url.textContent = item.url; url.title = item.url;
    details.append(title, url); label.append(checkbox, details); itemsEl.append(label);
  }
  statusEl.textContent = saved.size + " media link" + (saved.size === 1 ? "" : "s") + " detected in this tab";
  updateStatus();
}
function updateStatus() {
  selectedEl.textContent = selected.size + " selected" + (selected.size > 300 ? " (300 per batch)" : "");
  copyBtn.disabled = selected.size === 0;
  sendBtn.disabled = selected.size === 0;
}
function scanDOM() {
  const map = new Map();
  const IMAGE = /\.(?:jpe?g|png|webp|avif|gif|bmp)(?:$|[?#])/i;
  function absolute(raw) {
    try {
      if (!raw || /^(?:blob|data|javascript):/i.test(raw)) return "";
      const u=new URL(raw, location.href);
      return ["http:","https:"].includes(u.protocol) && !u.username && !u.password ? u.href : "";
    } catch { return ""; }
  }
  function bestSrcset(raw) {
    const list=String(raw||"").split(",").map(v=>{
      const m=v.trim().match(/^(\S+)(?:\s+(\d+)(?:w|x))?/);
      return m?{url:absolute(m[1]),size:Number(m[2]||0)}:null;
    }).filter(x=>x?.url);
    return list.sort((a,b)=>b.size-a.size)[0]?.url||"";
  }
  function add(url,type,title,thumbnail,sourceKind) {
    const resolved=absolute(url);
    if(!resolved||map.has(resolved)||map.size>=300)return;
    map.set(resolved,{url:resolved,type,title:String(title||"Image").slice(0,180),
      thumbnail:absolute(thumbnail)||resolved,sourceKind,sourcePage:location.href});
  }
  for(const img of [...document.querySelectorAll("img")].slice(0,500)){
    if(img.naturalWidth && img.naturalWidth<56 || img.naturalHeight && img.naturalHeight<56)continue;
    const thumb=absolute(img.currentSrc||bestSrcset(img.getAttribute("srcset"))||img.getAttribute("data-src")||img.src);
    const title=img.alt||img.title||document.title||"Image";
    const parent=img.closest("a[href]");
    const full=absolute(parent?.getAttribute("data-full")||parent?.getAttribute("data-original")||
      img.getAttribute("data-full")||img.getAttribute("data-original")||img.getAttribute("data-zoom"));
    const linked=absolute(parent?.href);
    if(full)add(full,"image",title,thumb,"browser-original-candidate");
    if(linked&&IMAGE.test(linked))add(linked,"image",title,thumb,"browser-linked-full-image");
    const bigger=bestSrcset(img.getAttribute("data-srcset")||img.getAttribute("srcset"));
    if(bigger&&bigger!==thumb)add(bigger,"image",title,thumb,"browser-srcset");
    if(thumb)add(thumb,"image",title,thumb,"browser-visible-image");
  }
  for(const node of [...document.querySelectorAll("video,source,meta[property='og:video'],meta[property='og:image']")].slice(0,120)){
    const tag=node.tagName.toLowerCase();
    const type=tag==="video"||tag==="source"&&node.parentElement?.tagName.toLowerCase()==="video"||
      node.getAttribute("property")==="og:video"?"video":"image";
    const media=node.currentSrc||node.src||node.getAttribute("content")||"";
    if(media)add(media,type,node.alt||node.title||document.title,
      type==="video"?(node.poster||""):"","browser-page-media");
  }
  for(const node of [...document.querySelectorAll("[data-original],[data-full],[style*='background-image']")].slice(0,220)){
    const direct=absolute(node.getAttribute("data-original")||node.getAttribute("data-full"));
    if(direct)add(direct,"image",node.title||document.title,"","browser-original-candidate");
    const m=String(node.getAttribute("style")||"").match(/background-image\s*:\s*url\(['"]?([^'")]+)/i);
    if(m)add(m[1],"image",node.title||document.title,"","browser-background-image");
  }
  return [...map.values()];
}
async function fetchCaptured() {
  const response = await chrome.runtime.sendMessage({ type: "VAULT_CAPTURE_GET", tabId: currentTab.id });
  for (const item of response?.items || []) add(item);
}
async function scanPage() {
  if (!currentTab?.id) return;
  try {
    await fetchCaptured();
    const frames = await chrome.scripting.executeScript({ target: { tabId: currentTab.id, allFrames: true }, func: scanDOM });
    for(const frame of frames || [])for(const item of frame.result || [])add(item);
    render();
  } catch (error) {
    render();
    statusEl.textContent = "Network requests captured. Page inspection not permitted: " + (error.message || "Restricted tab");
  }
}
async function start() {
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!currentTab?.id) { statusEl.textContent = "Open a website to capture media."; return; }
  await loadVaultDestination();
  await scanPage();
}
document.querySelector("#scan").addEventListener("click", scanPage);
document.querySelector("#all").addEventListener("click", () => {
  for (const item of saved.values()) if (activeFilter === "all" || item.type === activeFilter) selected.add(item.url);
  render();
});
document.querySelector("#clear").addEventListener("click", () => { selected.clear(); render(); });
document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
  render();
}));
function selectedItems() {
  return [...saved.values()].filter(item=>selected.has(item.url)).slice(0,300);
}
function makePayload(items) {
  return JSON.stringify({format:"vault-extension-capture-v2",sourcePage:currentTab?.url||"",items},null,2);
}
copyBtn.addEventListener("click", async () => {
  const items=selectedItems();
  try {
    await navigator.clipboard.writeText(makePayload(items));
    statusEl.textContent="Copied "+items.length+" captured links as JSON for backup.";
  } catch (error) {statusEl.textContent="Copy failed: "+(error.message||"Clipboard unavailable");}
});
function safeVaultOrigin(raw) {
  try {
    const url=new URL(String(raw||"").trim());
    return url.protocol==="https:"&&!url.username&&!url.password?url.origin:"";
  }catch{return "";}
}
async function loadVaultDestination(){
  const config=await chrome.storage.local.get("vault_import_origin").catch(()=>({}));
  const origin=safeVaultOrigin(config.vault_import_origin)||DEFAULT_VAULT;
  vaultUrlInput.value=origin;
  vaultHostLabel.textContent=new URL(origin).hostname;
  return origin;
}
document.querySelector("#save-vault-url").addEventListener("click",async()=>{
  const origin=safeVaultOrigin(vaultUrlInput.value);
  if(!origin){vaultUrlResult.textContent="Enter an HTTPS Vault address without a username or password.";return;}
  try{
    await chrome.storage.local.set({vault_import_origin:origin});
    vaultHostLabel.textContent=new URL(origin).hostname;
    vaultUrlResult.textContent="Destination saved. Selected items will be sent here.";
  }catch(error){vaultUrlResult.textContent="Could not save destination: "+(error?.message||"Unknown error");}
});
sendBtn.addEventListener("click",async()=>{
  const items=selectedItems();
  if(!items.length)return;
  sendBtn.disabled=true;
  try{
    const response=await chrome.runtime.sendMessage({
      type:"VAULT_OPEN_PICKER",
      items,origin:safeVaultOrigin(vaultUrlInput.value)||DEFAULT_VAULT,
    });
    if(!response?.ok)throw new Error(response?.error||"Could not open the Vault folder picker.");
    statusEl.textContent="Opened folder picker for "+response.count+" items. Choose a collection, then save in Vault.";
  }catch(error){statusEl.textContent="Send failed: "+(error?.message||"Unknown error")+". Use Copy selected instead.";}
  finally{updateStatus();}
});
document.querySelector("#sheet-add").addEventListener("click",()=>{
  const parser=globalThis.VaultBatchParser;
  if(!parser){sheetResult.textContent="Sheet parser is unavailable. Reload the extension.";return;}
  const result=parser.parseSpreadsheetRows(sheetText.value,{
    unknownAsImage:unknownAsImage.checked,
    sourcePage:currentTab?.url||"",
  });
  let newCount=0;
  for(const item of result.items){
    if(!saved.has(item.url)){newCount++;selected.add(item.url);}
    add(item);
  }
  render();
  sheetResult.textContent=newCount+" new links added; "+result.duplicates+" repeated, "+
    result.invalid+" invalid, "+result.unrecognized+" unrecognized. "+
    (result.unrecognized?"For extensionless image URLs, check the option above and retry.":"Ready to send to Vault.");
});
document.querySelector("#sheet-load").addEventListener("click",async()=>{
  const parser=globalThis.VaultBatchParser;
  const source=document.querySelector("#sheet-link").value;
  const csvUrl=parser?.sheetCsvExportUrl(source);
  if(!csvUrl){sheetResult.textContent="Use a Google Sheets link ending in /edit or /view. For private sheets, copy cells or export CSV instead.";return;}
  sheetResult.textContent="Loading public sheet CSV…";
  try{
    const response=await fetch(csvUrl,{credentials:"omit",redirect:"follow",cache:"no-store"});
    const type=String(response.headers.get("content-type")||"").toLowerCase();
    if(!response.ok||type.includes("text/html")){
      throw new Error("This sheet isn't publicly accessible as CSV. Copy its cells or export a CSV file instead.");
    }
    const body=await response.text();
    if(body.length>1_000_000)throw new Error("Sheet is too large; use a smaller CSV export (under 1 MB).");
    sheetText.value=body;
    document.querySelector("#sheet-add").click();
  }catch(e){sheetResult.textContent=e.message||"Could not load Google Sheets CSV.";}
});
document.querySelector("#sheet-file").addEventListener("change",async event=>{
  const file=event.target.files?.[0];
  event.target.value="";
  if(!file)return;
  if(file.size>1_000_000){sheetResult.textContent="Choose a CSV/TSV file under 1 MB.";return;}
  try{
    sheetText.value=await file.text();
    document.querySelector("#sheet-section").open=true;
    document.querySelector("#sheet-add").click();
  }catch(error){sheetResult.textContent="Could not read the file: "+(error?.message||"Unknown error");}
});
start().catch((error) => { statusEl.textContent = "Cannot inspect tab: " + (error.message || "Unavailable"); });
