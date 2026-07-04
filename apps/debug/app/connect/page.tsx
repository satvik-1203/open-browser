"use client";

import { useState } from "react";

export default function ConnectPage() {
  const [input, setInput] = useState("");
  const [debuggerUrl, setDebuggerUrl] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDebuggerUrl(input.trim() || null);
  }

  return (
    <main>
      <h1>Connect Browser</h1>
      <form onSubmit={handleSubmit} className="narrow-form">
        <div className="field">
          <label htmlFor="debuggerUrl">Debugger URL</label>
          <input
            id="debuggerUrl"
            type="url"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="http://localhost:3001/browser/<id>/devtools/inspector.html?ws=..."
          />
        </div>
        <button type="submit">Connect</button>
      </form>
      {debuggerUrl && (
        <iframe className="debugger" src={debuggerUrl} title="Browser debugger" />
      )}
    </main>
  );
}
