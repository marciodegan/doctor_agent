import React, { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Terminal, Shield, Globe, Cpu, AlertTriangle, RefreshCw } from "lucide-react";

export function Debug() {
  console.log("[Debug] Rendering");
  return (
    <div style={{ background: '#000', color: '#0f0', padding: '20px', minHeight: '100vh', fontFamily: 'monospace' }}>
      <h1>NEXUS_DEBUG_MODE</h1>
      <p>App is rendering. If you see this, the core routing is working.</p>
      <button onClick={() => window.location.hash = ""}>Back to App</button>
    </div>
  );
}
