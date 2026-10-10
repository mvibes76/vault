import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const root=new URL("../",import.meta.url);
const read=(path)=>fs.readFileSync(new URL(path,root),"utf8");
const capture=await import("data:text/javascript,"+encodeURIComponent(read("lib/capture.js")));

test("URL validation denies unsafe schemes, credentials and duplicate links",()=>{
 const input={items:[
  {url:"https://photos.example/a.jpg#fragment",type:"image",title:"Portrait"},
  {url:"https://photos.example/a.jpg",type:"image"},
  {url:"javascript:alert(1)",type:"image"},
  {url:"https://user:password@photos.example/b.jpg",type:"image"},
  {url:"https://photos.example/b.mp4",type:"video"},
 ]};
 const got=capture.normalizeCapture(input);
 assert.equal(got.length,2);
 assert.equal(got[0].url,"https://photos.example/a.jpg");
 assert.equal(got[0].title,"Portrait");
 assert.equal(got[1].type,"video");
 assert.equal(capture.cleanMediaUrl("file:///tmp/foo.jpg"),"");
});
test("300 item bound and legacy Vault keys",()=>{
 const list=Array.from({length:400},(_,i)=>({url:"https://media.example/"+i+".jpg",type:"image"}));
 assert.equal(capture.normalizeCapture({items:list}).length,300);
 const legacy=url=>{let h=0;for(let i=0;i<url.length;i++){h=(h<<5)-h+url.charCodeAt(i);h|=0;}return "k"+Math.abs(h);};
 assert.equal(capture.captureKey("https://photos.example/a.jpg"),legacy("https://photos.example/a.jpg"));
});
test("Chrome gallery picker and authenticated Vault page are wired together",()=>{
 const bg=read("extensions/vault-media-capture/background.js");
 const popup=read("extensions/vault-media-capture/popup.js");
 const manifest=JSON.parse(read("extensions/vault-media-capture/manifest.json"));
 const page=read("app/capture/page.jsx");
 const component=read("components/ExtensionCapture.jsx");
 assert.match(bg,/chrome\.windows\.create/);
 assert.match(bg,/VAULT_OPEN_PICKER/);
 assert.match(bg,/world:\s*"MAIN"/);
 assert.match(bg,/vault-extension-capture-v2/);
 assert.match(popup,/VAULT_OPEN_PICKER/);
 assert.match(popup,/select\.add|selected\.add/);
 assert.match(page,/AuthGate/);
 assert.match(component,/supabase\.auth\.getUser/);
 assert.match(component,/vault_folders/);
 assert.match(component,/vault_items/);
 assert.match(component,/onConflict:"user_id,item_key"/);
 assert.equal(manifest.manifest_version,3);
 assert.ok(manifest.permissions.includes("contextMenus"));
});
test("Context menu opens the folder picker for a single photo",async()=>{
 const events={install:[],clicked:[],message:[],updated:[]},storage=new Map(),opened=[];
 const chrome={
  webRequest:{onBeforeRequest:{addListener(){}},onHeadersReceived:{addListener(){}}},
  tabs:{
   onRemoved:{addListener(){}},onUpdated:{addListener:fn=>events.updated.push(fn)},
   get:async id=>({id,url:"https://vault-mikevibes76.vercel.app/capture"}),
  },
  storage:{
   session:{
    set:async values=>Object.entries(values).forEach(([k,v])=>storage.set(k,v)),
    get:async key=>({[key]:storage.get(key)}),
    remove:async key=>storage.delete(key),
   },
   local:{get:async()=>({})},
  },
  windows:{create:async data=>{opened.push(data);return{tabs:[{id:77}]};}},
  contextMenus:{create(){},onClicked:{addListener:fn=>events.clicked.push(fn)}},
  runtime:{
   onInstalled:{addListener:fn=>events.install.push(fn)},
   onMessage:{addListener:fn=>events.message.push(fn)},
   lastError:null,
  },
  scripting:{executeScript:async()=>[{result:true}]},
 };
 vm.runInNewContext(read("extensions/vault-media-capture/background.js"),
  {chrome,URL,console,Date,Promise,setTimeout,clearTimeout,Map,Set});
 events.install.forEach(fn=>fn());
 events.clicked[0]({menuItemId:"vault_save_image",srcUrl:"https://gallery.example/img.jpg"},{id:24,url:"https://gallery.example/album"});
 await new Promise(resolve=>setTimeout(resolve,100));
 assert.equal(opened.length,1);
 assert.equal(opened[0].type,"popup");
 assert.equal(opened[0].url,"https://vault-mikevibes76.vercel.app/capture");
 assert.equal(opened[0].focused,true);
});
