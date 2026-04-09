import { useEffect, useState } from "react";
import { Activity, CircleDot, Wifi } from "lucide-react";
import { getApiBase, isTauriEnv } from "../services/env";

type ConnectionStatus = "connected" | "disconnected" | "checking";

export function DataSourceIndicator() {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [backendVersion, setBackendVersion] = useState<string>("");

  useEffect(() => {
    checkBackend();
    const interval = setInterval(checkBackend, 15000);
    return () => clearInterval(interval);
  }, []);

  async function checkBackend() {
    try {
      const res = await fetch(`${getApiBase()}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus("connected");
        setBackendVersion(data.version || "");
        // Auto-enable backend for all services when we detect it's running
        try { localStorage.setItem("FORCE_BACKEND", "true"); } catch {}
      } else {
        setStatus("disconnected");
        try { localStorage.removeItem("FORCE_BACKEND"); } catch {}
      }
    } catch {
      setStatus("disconnected");
      try { localStorage.removeItem("FORCE_BACKEND"); } catch {}
    }
  }

  const isTauri = isTauriEnv();

  const tier =
    status === "connected"
      ? isTauri
        ? "Tauri + Live Backend"
        : "Browser + Live Backend"
      : isTauri
        ? "Tauri (No Backend)"
        : "Browser (Simulated)";

  const tierColor =
    status === "connected"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : "bg-amber-500/15 text-amber-400 border-amber-500/30";

  const Icon = status === "connected" ? Activity : status === "checking" ? Wifi : CircleDot;

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs ${tierColor} backdrop-blur-sm`}
      title={`Backend: ${getApiBase()}\nStatus: ${status}\nVersion: ${backendVersion || "N/A"}`}
    >
      <Icon className="h-3 w-3" />
      <span>{tier}</span>
      {status === "connected" && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />}
    </div>
  );
}
