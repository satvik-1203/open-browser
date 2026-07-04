"use client";

import { useState } from "react";

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
      const res = await fetch("/api/browser/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? `request failed with status ${res.status}`);
      } else {
        setResponse(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
