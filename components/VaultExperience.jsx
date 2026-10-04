import { redirect } from "next/navigation";
import { Suspense } from "react";
import Vault from "@/components/Vault";
import VaultV2 from "@/components/vault-v2/VaultV2";
import AuthGate from "@/components/AuthGate";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function VaultExperience({ route = "home" }) {
  const enabled = process.env.NEXT_PUBLIC_VAULT_UI_V2 === "true";
  if (!enabled && route !== "home") redirect("/");

  return (
    <ErrorBoundary>
      <AuthGate>
        {enabled ? (
          <Suspense fallback={<div style={{minHeight:"100dvh",background:"#070707",color:"#f7f7f8",display:"grid",placeItems:"center",fontFamily:"Inter,-apple-system,sans-serif"}}>Loading Vault…</div>}>
            <VaultV2 route={route} />
          </Suspense>
        ) : <Vault />}
      </AuthGate>
    </ErrorBoundary>
  );
}
