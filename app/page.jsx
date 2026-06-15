import Vault from "@/components/Vault";
import AuthGate from "@/components/AuthGate";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function Page() {
  return (
    <ErrorBoundary>
      <AuthGate>
        <Vault />
      </AuthGate>
    </ErrorBoundary>
  );
}
