"use client";

import { useState } from "react";
import { BrowserServerError } from "open-browser-sdk";
import { browserServer } from "@/lib/browserServer";

export default function StopPage() {
  const [id, setId] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const data = await browserServer.stop(id);
      setResponse(data);
    } catch (err) {
      setError(
        err instanceof BrowserServerError
          ? (err as Error).message
          : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="narrow">
      <h1>Stop Browser</h1>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="id">Browser id</label>
          <input
            id="id"
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="browser id returned from /start"
          />
        </div>
        <button type="submit" disabled={loading || !id}>
          {loading ? "Stopping..." : "Stop"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {response !== null && <pre>{JSON.stringify(response, null, 2)}</pre>}
    </main>
  );
}
