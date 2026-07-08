"use client";

import { useState } from "react";
import { BrowserServerError } from "open-browser-sdk";
import { browserServer } from "@/lib/browserServer";

export default function RecordingPage() {
  const [id, setId] = useState("");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setUrl(null);

    try {
      // Goes through the server (SDK -> /browser/:id/recording), which mints a
      // short-lived signed URL. The debug app never touches S3 or credentials.
      const signedUrl = await browserServer.getSessionRecordingUrl(id.trim());
      setUrl(signedUrl);
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
      <h1>Get Recording</h1>
      <p>
        Fetch a session&apos;s recording by browser id. The server returns a
        short-lived signed URL, so the private object plays and downloads
        directly.
      </p>
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
        <button type="submit" disabled={loading || !id.trim()}>
          {loading ? "Fetching..." : "Get recording"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {url && (
        <div className="recording">
          <video controls src={url} style={{ maxWidth: "100%" }} />
          <p>
            <a href={url} target="_blank" rel="noreferrer">
              Open / download mp4
            </a>
          </p>
        </div>
      )}
    </main>
  );
}
