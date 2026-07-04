"use client";

import { useState } from "react";
import { BrowserServerError } from "sdk";
import { browserServer } from "@/lib/browserServer";

export default function StartPage() {
  const [url, setUrl] = useState("");
  const [headless, setHeadless] = useState(true);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const data = await browserServer.start({ url: url || undefined, headless });
      setResponse(data);
    } catch (err) {
      setError(err instanceof BrowserServerError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="narrow">
      <h1>Start Browser</h1>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="url">URL (optional)</label>
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
          />
        </div>
        <div className="field checkbox">
          <input
            id="headless"
            type="checkbox"
            checked={headless}
            onChange={(e) => setHeadless(e.target.checked)}
          />
          <label htmlFor="headless">headless</label>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Starting..." : "Start"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {response !== null && <pre>{JSON.stringify(response, null, 2)}</pre>}
    </main>
  );
}
