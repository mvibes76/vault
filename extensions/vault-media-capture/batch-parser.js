// Google Sheets copy/paste or CSV export -> existing vault-media-capture-v1.
// Runs entirely in the Chrome extension. Nothing is fetched from Google Sheets.
(function(root) {
  "use strict";
  const IMAGE = /\.(?:jpe?g|png|gif|webp|avif|bmp|heic|heif)(?:$|[?#])/i;
  const VIDEO = /\.(?:mp4|m4v|mov|webm|ogv|m3u8)(?:$|[?#])/i;
  const HEADERS = {
    url:["url","image url","media url","file url","link","image link","video url","src","source url","direct url","original url"],
    title:["title","name","caption","description","image title"],
    type:["type","media type","kind","format"],
    sourcePage:["source page","sourcepage","page url","page link","website","origin"],
    thumbnail:["thumbnail","thumb","preview","cover","thumbnail url"],
  };
  const normalizeHeader = x => String(x||"").trim().toLowerCase().replace(/[_-]/g," ").replace(/\s+/g," ");
  function cleanUrl(raw) {
    try {
      const input = String(raw||"").trim();
      if(!/^https?:\/\//i.test(input) || /[\u0000-\u001f\u007f]/.test(input))return "";
      const u=new URL(input);
      if(u.username||u.password || !u.hostname) return "";
      u.hash="";
      return u.href;
    }catch{return "";}
  }
  function inferType(url,explicit="") {
    const kind=String(explicit||"").trim().toLowerCase();
    if(["image","photo","picture","img"].includes(kind))return "image";
    if(["video","clip","movie"].includes(kind))return "video";
    if(IMAGE.test(url))return "image";
    if(VIDEO.test(url))return "video";
    return "";
  }
  function parseDelimited(text,delimiter=",") {
    const rows=[];let row=[],field="",quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){
        if(quoted&&text[i+1]==='"'){field+='"';i++;}
        else quoted=!quoted;
      }else if(c===delimiter&&!quoted){row.push(field);field="";}
      else if((c==="\n"||c==="\r")&&!quoted){
        if(c==="\r"&&text[i+1]==="\n")i++;
        row.push(field);
        if(row.some(x=>x.trim()))rows.push(row);
        if(rows.length>=1500)break;
        row=[];field="";
      }else field+=c;
    }
    if(row.length||field){row.push(field);if(row.some(x=>x.trim()))rows.push(row);}
    return rows;
  }
  function chooseColumn(header,name) {
    return header.findIndex(v=>HEADERS[name].includes(normalizeHeader(v)));
  }
  function extractRows(raw,options={}) {
    const input=String(raw||"").trim().slice(0,1_000_000);
    if(!input)return {items:[],duplicates:0,invalid:0,unrecognized:0,total:0};
    const separator=input.includes("\t")?"\t":",";
    const rows=parseDelimited(input,separator);
    const headings=rows[0]||[];
    const urlIx=chooseColumn(headings,"url");
    const hasHeader=urlIx>=0;
    const ix=name=>hasHeader?chooseColumn(headings,name):-1;
    const indexes={url:hasHeader?urlIx:0,title:ix("title"),type:ix("type"),sourcePage:ix("sourcePage"),thumbnail:ix("thumbnail")};
    const seen=new Set(),items=[];let duplicates=0,invalid=0,unrecognized=0,total=0;
    const source=options.sourcePage?cleanUrl(options.sourcePage):"";
    for(const row of rows.slice(hasHeader?1:0)){
      if(!row.some(v=>String(v).trim()))continue;
      total++;
      let rawUrl=row[indexes.url]||"";
      if(!hasHeader){
        // Google Sheets copy of selected multiple columns without headers.
        const candidate=row.find(value=>/^https?:\/\//i.test(String(value||"").trim()));
        if(candidate)rawUrl=candidate;
      }
      const url=cleanUrl(rawUrl);
      if(!url){invalid++;continue;}
      if(seen.has(url)){duplicates++;continue;}
      const explicit=indexes.type>=0?row[indexes.type]:"";
      const type=inferType(url,explicit)||((options.unknownAsImage===true)?"image":"");
      if(!type){unrecognized++;continue;}
      seen.add(url);
      const title=(indexes.title>=0?row[indexes.title]:"")||"";
      items.push({
        url,type,title:String(title).trim().slice(0,180)||(type==="image"?"Sheet image":"Sheet video"),
        thumbnail:indexes.thumbnail>=0?cleanUrl(row[indexes.thumbnail]):"",
        sourcePage:(indexes.sourcePage>=0?cleanUrl(row[indexes.sourcePage]):"")||source||url,
        sourceKind:"spreadsheet-import",
      });
      if(items.length>=300)break;
    }
    return {items,duplicates,invalid,unrecognized,total};
  }
  function sheetCsvExportUrl(raw) {
    try {
      const u=new URL(String(raw||"").trim());
      if(u.protocol!=="https:"||u.hostname!=="docs.google.com"||u.username||u.password)return "";
      const match=u.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{10,})\/(?:edit|view|export|htmlview)?\/?$/);
      if(!match)return "";
      const gid=String(u.searchParams.get("gid")||u.hash.match(/gid=(\d+)/)?.[1]||"0");
      if(!/^\d{1,12}$/.test(gid))return "";
      return "https://docs.google.com/spreadsheets/d/"+match[1]+"/export?format=csv&gid="+gid;
    }catch{return "";}
  }
  const api={parseSpreadsheetRows:extractRows,parseDelimited,cleanUrl,inferType,sheetCsvExportUrl};
  root.VaultBatchParser=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
