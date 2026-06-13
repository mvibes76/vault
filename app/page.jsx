import Vault from "@/components/Vault";
import AuthGate from "@/components/AuthGate";

export default function Page() {
  return (
    <AuthGate>
      <Vault />
    </AuthGate>
  );
}
