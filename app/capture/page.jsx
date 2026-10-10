import AuthGate from "@/components/AuthGate";
import ErrorBoundary from "@/components/ErrorBoundary";
import ExtensionCapture from "@/components/ExtensionCapture";

export const metadata = {title:"Save to Vault",description:"Choose a collection for browser-captured media."};
export default function CapturePage() {
  return <ErrorBoundary><AuthGate><ExtensionCapture /></AuthGate></ErrorBoundary>;
}
