"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabase";
import {captureKey,normalizeCapture} from "@/lib/capture";

const PENDING="vault:extension-capture-v2";
const inputStyle={width:"100%",boxSizing:"border-box",borderRadius:10,padding:12,background:"#191919",border:"1px solid #383838",color:"#fff",fontSize:13};
const actionStyle={border:0,borderRadius:10,padding:"12px 16px",background:"#eee",color:"#111",fontWeight:700,cursor:"pointer"};
const panelStyle={background:"#111",border:"1px solid #303030",borderRadius:16,padding:17,marginTop:15};

function folderPath(folder,all) {
  const path=[folder.name],seen=new Set([folder.name.toLowerCase()]);
  let parent=folder.parent_folder;
  for(let i=0;i<8&&parent;i++) {
    const found=all.find(row=>row.name.toLowerCase()===parent.toLowerCase());
    if(!found||seen.has(found.name.toLowerCase())) break;
    path.unshift(found.name);seen.add(found.name.toLowerCase());parent=found.parent_folder;
  }
  return path.join(" / ");
}
export default function ExtensionCapture() {
  const [items,setItems]=useState([]);
  const [folders,setFolders]=useState([]);
  const [folder,setFolder]=useState("");
  const [search,setSearch]=useState("");
  const [newFolder,setNewFolder]=useState("");
  const [userId,setUserId]=useState("");
  const [saving,setSaving]=useState(false);
  const [creating,setCreating]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [result,setResult]=useState("");

  const receive=useCallback(payload=>{
    if(payload?.format!=="vault-extension-capture-v2")return false;
    const normalized=normalizeCapture(payload);
    if(!normalized.length)return false;
    setItems(normalized);setError("");setResult("");
    try{sessionStorage.setItem(PENDING,JSON.stringify({payload,expiry:Date.now()+1200000}));}catch{}
    return true;
  },[]);

  useEffect(()=>{
    window.__vaultCaptureImport=receive;
    try{
      const saved=JSON.parse(sessionStorage.getItem(PENDING)||"null");
      if(saved?.expiry>Date.now())receive(saved.payload);
      else sessionStorage.removeItem(PENDING);
    }catch{sessionStorage.removeItem(PENDING);}
    return ()=>{if(window.__vaultCaptureImport===receive)delete window.__vaultCaptureImport;};
  },[receive]);

  const refresh=useCallback(async id=>{
    const {data,error:requestError}=await supabase.from("vault_folders")
      .select("name,parent_folder,kind").eq("user_id",id).order("name");
    if(requestError)throw requestError;
    setFolders(data||[]);
  },[]);

  useEffect(()=>{
    let mounted=true;
    async function load(){
      if(!supabase){setError("Vault is not connected to Supabase.");setLoading(false);return;}
      const {data,error:authError}=await supabase.auth.getUser();
      if(!mounted)return;
      if(authError||!data?.user){setError("Please sign in to Vault.");setLoading(false);return;}
      setUserId(data.user.id);
      try{await refresh(data.user.id);}
      catch(err){if(mounted)setError(err.message||"Could not load collections.");}
      if(mounted)setLoading(false);
    }
    void load();
    return ()=>{mounted=false;};
  },[refresh]);

  const choices=useMemo(()=>folders.map(row=>({...row,path:folderPath(row,folders)}))
    .filter(row=>row.path.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>a.path.localeCompare(b.path)),[folders,search]);

  const create=async()=>{
    const name=newFolder.trim().slice(0,110);
    if(!name||creating||saving||!userId)return;
    if(folders.some(row=>row.name.toLowerCase()===name.toLowerCase())) {
      setError("That collection already exists. Select it below.");return;
    }
    setCreating(true);setError("");
    try{
      const {error:insertError}=await supabase.from("vault_folders").insert({
        user_id:userId,name,kind:"folder",display_mode:"grid",parent_folder:folder||null,
      });
      if(insertError)throw insertError;
      await refresh(userId);
      setFolder(name);setSearch("");setNewFolder("");
    }catch(err){setError(err.message||"Could not create collection.");}
    finally{setCreating(false);}
  };

  const save=async()=>{
    if(!items.length||!userId||saving||loading)return;
    if(folder&&!folders.some(row=>row.name===folder)){setError("Please choose an existing collection.");return;}
    setSaving(true);setError("");setResult("");
    let count=0;
    try{
      for(let offset=0;offset<items.length;offset+=50){
        const batch=items.slice(offset,offset+50),keys=batch.map(row=>captureKey(row.url));
        const {data:existing,error:readError}=await supabase.from("vault_items")
          .select("*").eq("user_id",userId).in("item_key",keys);
        if(readError)throw readError;
        const previous=new Map((existing||[]).map(row=>[row.item_key,row]));
        const rows=batch.map(item=>{
          const key=captureKey(item.url),old=previous.get(key);
          return {
            user_id:userId,item_key:key,url:item.url,
            title:old?.title||item.title,note:old?.note||"",tags:old?.tags||[],
            source:old?.source||"extract",folder:folder||null,
            thumbnail:old?.thumbnail||item.thumbnail||null,
            thumbnail_source:old?.thumbnail_source||(item.thumbnail?"original":null),
            cover_mode:old?.cover_mode||"auto",cover_fit:old?.cover_fit||"cover",
            cover_position_x:old?.cover_position_x??50,cover_position_y:old?.cover_position_y??50,
            type:old?.type&&old.type!=="link"?old.type:item.type,
            updated_at:new Date().toISOString(),
          };
        });
        const {error:writeError}=await supabase.from("vault_items")
          .upsert(rows,{onConflict:"user_id,item_key"});
        if(writeError)throw writeError;
        count+=rows.length;
      }
      try{sessionStorage.removeItem(PENDING);}catch{}
      setItems([]);setResult("Saved "+count+" items to "+(folder||"Inbox")+".");
    }catch(err){setError("Saved "+count+" of "+items.length+". "+(err.message||"Save failed.")+" Retry safely without duplicates.");}
    finally{setSaving(false);}
  };

  return <main style={{background:"#050505",color:"#f3f3f3",minHeight:"100dvh",padding:"28px 18px 65px",fontFamily:"Inter,sans-serif"}}>
    <div style={{maxWidth:690,margin:"0 auto"}}>
      <div style={{fontSize:11,letterSpacing:2,color:"#999",fontWeight:700}}>VAULT / BROWSER CAPTURE</div>
      <h1 style={{fontSize:30,margin:"10px 0 7px",letterSpacing:-.7}}>Save to Vault</h1>
      <p style={{fontSize:13,color:"#aaa",lineHeight:1.6}}>Select a collection or gallery, review the images, then save.</p>
      <section style={panelStyle}>
        <h2 style={{fontSize:15,margin:"0 0 12px"}}>Destination</h2>
        <button type="button" onClick={()=>setFolder("")} aria-pressed={!folder}
          style={{...actionStyle,width:"100%",textAlign:"left",background:folder?"#242424":"#fff",color:folder?"#fff":"#111",marginBottom:12}}>Inbox <span style={{float:"right",fontSize:11,opacity:.6}}>Unsorted</span></button>
        <input style={inputStyle} value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search folders or galleries" aria-label="Search Vault folders" />
        <div style={{maxHeight:220,overflowY:"auto",margin:"10px 0"}}>
          {choices.map(row=><button type="button" key={row.name} onClick={()=>setFolder(row.name)} aria-pressed={folder===row.name}
            style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,width:"100%",borderRadius:9,
              border:"1px solid "+(folder===row.name?"#fff":"#303030"),background:folder===row.name?"#eee":"#1b1b1b",
              color:folder===row.name?"#111":"#eee",padding:12,marginBottom:5,cursor:"pointer",textAlign:"left",fontSize:12}}>
            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.path}</span>
            <span style={{fontSize:10,opacity:.6}}>{row.kind==="gallery"?"Gallery":"Folder"}</span>
          </button>)}
          {!loading&&!choices.length&&<div style={{padding:12,fontSize:12,color:"#999"}}>No matching collections</div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <input value={newFolder} onChange={event=>setNewFolder(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void create();}}
            style={{...inputStyle,flex:1}} aria-label="New collection name" placeholder={folder?"New folder inside selected":"New collection name"} />
          <button type="button" disabled={!userId||!newFolder.trim()||creating} onClick={create} style={{...actionStyle,opacity:creating?.5:1}}>{creating?"Creating…":"Create"}</button>
        </div>
      </section>
      <section style={panelStyle}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h2 style={{fontSize:15,margin:"0 0 10px"}}>Selected media</h2>
          <small style={{color:"#aaa"}}>{items.length} / 300</small>
        </div>
        {!items.length&&<p style={{fontSize:13,color:"#999",lineHeight:1.6}}>Right-click an image to save it, or select images from a gallery using the Chrome extension.</p>}
        <div style={{maxHeight:310,overflowY:"auto"}}>
          {items.map(item=><div key={item.url} style={{display:"flex",gap:12,alignItems:"center",borderBottom:"1px solid #262626",padding:"10px 0"}}>
            <div style={{height:52,width:52,background:"#292929",borderRadius:8,overflow:"hidden",flexShrink:0}}>
              {!!item.thumbnail&&<img alt="" src={item.thumbnail} referrerPolicy="no-referrer" style={{height:"100%",width:"100%",objectFit:"cover"}}/>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,whiteSpace:"nowrap",textOverflow:"ellipsis",overflow:"hidden"}}>{item.title}</div>
              <div style={{fontSize:10,color:"#888",whiteSpace:"nowrap",textOverflow:"ellipsis",overflow:"hidden",marginTop:3}} title={item.url}>{item.url}</div>
            </div>
            <button type="button" onClick={()=>setItems(prev=>prev.filter(row=>row.url!==item.url))} aria-label={"Remove "+item.title} style={{background:"none",border:0,color:"#ddd",cursor:"pointer",padding:10,fontSize:20}}>×</button>
          </div>)}
        </div>
      </section>
      {!!error&&<p role="alert" style={{color:"#ffb4b4",background:"#321818",borderRadius:10,padding:13,fontSize:12}}>{error}</p>}
      {!!result&&<p role="status" style={{color:"#aff4bc",background:"#18301e",borderRadius:10,padding:13,fontSize:12}}>{result}</p>}
      <button type="button" disabled={!userId||!items.length||saving||loading} onClick={save}
        style={{...actionStyle,width:"100%",padding:17,marginTop:17,opacity:!userId||!items.length||saving?.5:1}}>
        {saving?"Saving…":"Save "+items.length+" item"+(items.length===1?"":"s")+" to "+(folder||"Inbox")}
      </button>
      <p style={{fontSize:11,color:"#777",lineHeight:1.65}}>This saves image URLs, not permanent originals. Images protected by 403 responses or expiring addresses may not open in Vault.</p>
      <a style={{color:"#ddd",fontSize:12}} href="/">Open Vault library</a>
    </div>
  </main>;
}
