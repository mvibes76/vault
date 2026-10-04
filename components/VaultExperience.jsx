import { redirect } from "next/navigation";
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
        {enabled ? <VaultV2 route={route} /> : <Vault />}
      </AuthGate>
    </ErrorBoundary>
  );
}
