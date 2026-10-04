"use client";
import { useEffect, useState } from "react";
import { SYNC_V2_ENABLED, getEntitySyncState, subscribeOutbox } from "@/lib/sync-outbox";

export default function SyncBadge({ entityType="item", entityKey }) {
  const [state,setState]=useState(null);
  useEffect(()=>{
    if(!SYNC_V2_ENABLED) return;
    const refresh=()=>setState(getEntitySyncState(entityType,entityKey));
    refresh();
    return subscribeOutbox(refresh);
  },[entityType,entityKey]);
  if(!SYNC_V2_ENABLED || !state) return null;
  const error=state==="error";
  return (
    <div
      aria-label={error?"Not synced":"Syncing"}
      title={error?"Not synced — retry from sync banner":"Syncing to cloud"}
      style={{
        position:"absolute",left:8,bottom:8,zIndex:7,
        padding:"3px 7px",borderRadius:999,
        background:error?"rgba(130,35,35,0.92)":"rgba(110,78,10,0.92)",
        border:"1px solid rgba(255,255,255,0.18)",
        color:"#fff",fontSize:9,fontWeight:800,letterSpacing:0.25,
        backdropFilter:"blur(8px)"
      }}
    >
      {error?"Not synced":"Syncing"}
    </div>
  );
}
