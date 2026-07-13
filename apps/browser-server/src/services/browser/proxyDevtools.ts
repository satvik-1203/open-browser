import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";

const wss = new WebSocketServer({ noServer: true });

export function proxyDevtools(
  upstreamUrl: string,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  onClientFrame?: (raw: string) => void,
): void {
  wss.handleUpgrade(req, socket, head, (client) => {
    const upstream = new WebSocket(upstreamUrl);
    const pending: Array<{ data: WebSocket.RawData; isBinary: boolean }> = [];

    const close = () => {
      client.close();
      upstream.close();
    };

    client.on("message", (data, isBinary) => {
      // Tee the client→browser command frames (the actions the automation
      // drives) to the recorder before forwarding. Best-effort and text-only:
      // CDP frames are JSON text, and a failing tap must never disrupt the proxy.
      if (onClientFrame && !isBinary) {
        try {
          onClientFrame(data.toString());
        } catch {
          // Ignore — recording a frame must not break the live session.
        }
      }
      if (upstream.readyState === WebSocket.OPEN)
        upstream.send(data, { binary: isBinary });
      else pending.push({ data, isBinary });
    });
    client.on("close", close);
    client.on("error", close);

    upstream.on("open", () => {
      for (const { data, isBinary } of pending.splice(0))
        upstream.send(data, { binary: isBinary });
    });
    upstream.on("message", (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN)
        client.send(data, { binary: isBinary });
    });
    upstream.on("close", close);
    upstream.on("error", close);
  });
}
