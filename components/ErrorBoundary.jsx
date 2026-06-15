"use client";
import { Component } from "react";

const box = {
  minHeight: "100dvh",
  background: "#000",
  color: "rgba(255,255,255,0.9)",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const card = {
  width: "min(560px, 100%)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 18,
  background: "rgba(255,255,255,0.045)",
  padding: 22,
  boxShadow: "0 24px 80px rgba(0,0,0,0.65)",
};

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ error, info });
    try {
      const payload = {
        message: error?.message || String(error),
        stack: error?.stack || "",
        componentStack: info?.componentStack || "",
        at: new Date().toISOString(),
      };
      localStorage.setItem("vv_last_runtime_error", JSON.stringify(payload));
      console.error("[vault:error-boundary]", payload);
    } catch {}
  }

  reset = () => this.setState({ hasError: false, error: null, info: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={box}>
        <div style={card}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Vault recovered from a screen error</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, marginBottom: 14 }}>
            The app caught the crash instead of leaving you on a broken screen. Reload first. If it repeats, open Settings → Diagnostics and export a backup before changing more data.
          </div>
          <pre style={{ maxHeight: 160, overflow: "auto", fontSize: 11, color: "rgba(255,180,180,0.85)", background: "rgba(255,70,70,0.06)", border: "1px solid rgba(255,70,70,0.12)", borderRadius: 12, padding: 12, whiteSpace: "pre-wrap" }}>
            {this.state.error?.message || "Unknown error"}
          </pre>
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button onClick={() => window.location.reload()} style={primary}>Reload app</button>
            <button onClick={this.reset} style={secondary}>Try to continue</button>
          </div>
        </div>
      </div>
    );
  }
}

const primary = { padding: "11px 16px", background: "#fff", color: "#000", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" };
const secondary = { padding: "11px 16px", background: "transparent", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, fontWeight: 700, cursor: "pointer" };
