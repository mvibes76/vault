// Chrome desktop companion: user-triggered media-element crop.
// Crops visible pixels of a media element; no page menus, sidebars or toolbar.
const resultEl = document.querySelector("#smart-result");
const captureBtn = document.querySelector("#smart-crop");
const pickBtn = document.querySelector("#pick-image");
const selectedKey = id => "vault_smart_selected_" + id;

function findMediaRectangle() {
  const available=[];
  const vw=innerWidth,vh=innerHeight;
  for(const element of document.querySelectorAll("img,canvas,video")){
    const r=element.getBoundingClientRect();
    const style=getComputedStyle(element);
    if(style.visibility==="hidden"||style.display==="none"||Number(style.opacity)<0.2)continue;
    const left=Math.max(0,r.left),top=Math.max(0,r.top);
    const right=Math.min(vw,r.right),bottom=Math.min(vh,r.bottom);
    const width=right-left,height=bottom-top;
    if(width<95||height<95)continue;
    const centerOffset=Math.hypot((left+right)/vw-1,(top+bottom)/vh-1);
    const size=width*height;
    const boost=element.tagName==="CANVAS"?1.15:element.tagName==="IMG"?1.3:1;
    const score=size*boost*(centerOffset<1?.98:.7);
    available.push({left,top,width,height,score,kind:element.tagName.toLowerCase()});
  }
  available.sort((a,b)=>b.score-a.score);
  return {best:available[0]||null,viewportW:vw,viewportH:vh};
}
function armExactMediaPicker() {
  if(document.querySelector("#vault-media-picker-hint"))return true;
  const hint=document.createElement("div"),outline=document.createElement("div");
  hint.id="vault-media-picker-hint";
  hint.textContent="Vault: click an image, canvas or video to select · Esc cancels";
  hint.style.cssText="position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);background:#131313;color:white;padding:12px;border-radius:8px;font:13px sans-serif;pointer-events:none;max-width:95vw;";
  outline.style.cssText="position:fixed;z-index:2147483647;border:3px solid #79abf9;border-radius:4px;pointer-events:none;left:0;top:0;width:0;height:0;";
  document.body.append(hint,outline);
  const clipRect=element=>{
    const r=element.getBoundingClientRect();
    const left=Math.max(0,r.left),top=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);
    return {left,top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
  };
  const mediaFor=e=>e.target instanceof Element?e.target.closest("img,canvas,video"):null;
  const cleanup=()=>{
    document.removeEventListener("pointermove",hover,true);
    document.removeEventListener("click",choose,true);
    document.removeEventListener("keydown",cancel,true);
    hint.remove();outline.remove();
  };
  const hover=e=>{
    const el=mediaFor(e);if(!el)return;
    const r=clipRect(el);
    Object.assign(outline.style,{left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px"});
  };
  const cancel=e=>{if(e.key==="Escape"){e.preventDefault();cleanup();}};
  const choose=e=>{
    const el=mediaFor(e);if(!el)return;
    const rect=clipRect(el);
    if(rect.width<25||rect.height<25)return;
    e.preventDefault();e.stopImmediatePropagation();
    cleanup();
    chrome.runtime.sendMessage({type:"VAULT_SMART_PICK",rect,url:location.href,viewportW:innerWidth,viewportH:innerHeight},
      ()=>{});
    const msg=document.createElement("div");
    msg.textContent="Selected. Reopen Vault Capture and select Capture main image.";
    msg.style.cssText="position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);background:#131313;color:white;padding:12px;border-radius:8px;font:13px sans-serif;pointer-events:none;";
    document.body.appendChild(msg);
    setTimeout(()=>msg.remove(),2400);
  };
  document.addEventListener("pointermove",hover,true);
  document.addEventListener("click",choose,true);
  document.addEventListener("keydown",cancel,true);
  return true;
}

async function activeMediaTab(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!/^https?:\/\//i.test(tab.url||""))throw new Error("Open the generated image in a website tab first.");
  return tab;
}
captureBtn.addEventListener("click",async()=>{
  captureBtn.disabled=true;
  resultEl.textContent="Locating and cropping the image…";
  try{
    const tab=await activeMediaTab();
    const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:findMediaRectangle});
    const info=result?.[0]?.result;
    if(!info)throw new Error("Cannot inspect this page's media.");
    const saved=(await chrome.storage.session.get(selectedKey(tab.id)))[selectedKey(tab.id)];
    const rect=saved?.url===tab.url && Date.now()-saved.at<5*60*1000 ? saved.rect : info.best;
    if(!rect)throw new Error("No large visible image or canvas found. Try Pick exact image.");
    const dataUrl=await chrome.tabs.captureVisibleTab(tab.windowId,{format:"png"});
    const screenshot=new Image();screenshot.src=dataUrl;await screenshot.decode();
    const scaleX=screenshot.naturalWidth/info.viewportW;
    const scaleY=screenshot.naturalHeight/info.viewportH;
    const x=Math.max(0,Math.round(rect.left*scaleX)),y=Math.max(0,Math.round(rect.top*scaleY));
    const w=Math.min(screenshot.naturalWidth-x,Math.round(rect.width*scaleX));
    const h=Math.min(screenshot.naturalHeight-y,Math.round(rect.height*scaleY));
    if(w<25||h<25)throw new Error("Image is outside the visible area. Scroll it into view.");
    const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    canvas.getContext("2d").drawImage(screenshot,x,y,w,h,0,0,w,h);
    const png=canvas.toDataURL("image/png");
    const host=new URL(tab.url).hostname.replace(/^www\./,"").replace(/[^a-z0-9.-]/gi,"-");
    const file="Vault Captures/"+host+"-"+new Date().toISOString().replace(/[:.]/g,"-")+".png";
    const downloadId=await chrome.downloads.download({url:png,filename:file,saveAs:true,conflictAction:"uniquify"});
    if(!downloadId)throw new Error("Chrome did not start a PNG download.");
    resultEl.textContent="Saved a cropped "+w+"×"+h+" PNG. Choose Upload a permanent copy in Vault → Import Media to store this PNG privately.";
    await chrome.storage.session.remove(selectedKey(tab.id));
  }catch(e){resultEl.textContent="Capture unavailable: "+(e?.message||"Unknown error");}
  finally{captureBtn.disabled=false;}
});
pickBtn.addEventListener("click",async()=>{
  pickBtn.disabled=true;
  try{
    const tab=await activeMediaTab();
    await chrome.scripting.executeScript({target:{tabId:tab.id},func:armExactMediaPicker});
    resultEl.textContent="Click your image on the website, then reopen this extension to capture it.";
    window.close();
  }catch(e){resultEl.textContent="Image selection failed: "+(e?.message||"Unknown error");pickBtn.disabled=false;}
});
