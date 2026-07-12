export interface CodeSample {
  id: string;
  label: string;
  language: string;
  filename?: string;
  description: string;
  code: string;
}

export const samples: CodeSample[] = [
  {
    id: "install",
    label: "Install",
    language: "bash",
    filename: "install.sh",
    description: "Deploy the Open Browser server, then add the TypeScript SDK to your project.",
    code: `# 1. Deploy the Open Browser server (Docker is the quickest path)
docker run -p 3001:3001 ghcr.io/open-browser/server:latest

# 2. Add the SDK to your project
pnpm add open-browser-sdk
# or: npm install open-browser-sdk`,
  },
  {
    id: "quickstart",
    label: "Quickstart",
    language: "typescript",
    filename: "quickstart.ts",
    description: "Start a browser, connect Puppeteer over CDP, take a screenshot, then stop it.",
    code: `import { BrowserServer } from "open-browser-sdk";
import puppeteer from "puppeteer";

const server = new BrowserServer({ hostUrl: "http://localhost:3001" });

async function main() {
  const session = await server.start({ headless: true });

  const browser = await puppeteer.connect({
    browserWSEndpoint: session.webSocketDebuggerUrl,
  });

  const page = await browser.newPage();
  await page.goto("https://example.com");
  await page.screenshot({ path: "example.png" });

  await browser.disconnect();
  await server.stop(session.id);
}

main();`,
  },
  {
    id: "stealth",
    label: "Stealth",
    language: "typescript",
    filename: "stealth.ts",
    description: "Route through a proxy with a custom user agent and viewport to control your fingerprint.",
    code: `import { BrowserServer } from "open-browser-sdk";

const server = new BrowserServer({ hostUrl: "http://localhost:3001" });

async function main() {
  const session = await server.start({
    headless: true,
    viewport: { width: 1920, height: 1080 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    proxy: {
      server: "http://proxy.example.com:8080",
      username: "user",
      password: "secret",
    },
  });

  console.log("CDP endpoint:", session.webSocketDebuggerUrl);
  await server.stop(session.id);
}

main();`,
  },
  {
    id: "contexts",
    label: "Auth state",
    language: "typescript",
    filename: "contexts.ts",
    description: "Seed cookies, localStorage, and a user agent to bring your own authenticated context.",
    code: `import { BrowserServer } from "open-browser-sdk";

const server = new BrowserServer({ hostUrl: "http://localhost:3001" });

async function main() {
  const session = await server.start({
    url: "https://app.example.com/dashboard",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/125.0.0.0 Safari/537.36",
    initialCookie: [
      {
        name: "session_token",
        value: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        domain: ".example.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ],
    localstorage: {
      "feature-flags": JSON.stringify({ beta: true }),
      "locale": "en-US",
    },
  });

  console.log("Authenticated session:", session.id);
  await server.stop(session.id);
}

main();`,
  },
  {
    id: "recording",
    label: "Recording",
    language: "typescript",
    filename: "recording.ts",
    description: "Record a session to your configured object store and fetch the playback URL afterwards.",
    code: `import { BrowserServer } from "open-browser-sdk";
import puppeteer from "puppeteer";

const server = new BrowserServer({ hostUrl: "http://localhost:3001" });

async function main() {
  // record: true requires a storage adapter (S3/GCS/R2) configured on the server.
  const session = await server.start({ headless: true, record: true });

  const browser = await puppeteer.connect({
    browserWSEndpoint: session.webSocketDebuggerUrl,
  });
  const page = await browser.newPage();
  await page.goto("https://example.com");
  await browser.disconnect();

  await server.stop(session.id);

  const recordingUrl = await server.getSessionRecordingUrl(session.id);
  console.log("Recording available at:", recordingUrl);
}

main();`,
  },
  {
    id: "metrics",
    label: "Metrics",
    language: "typescript",
    filename: "metrics.ts",
    description: "Read server-wide resource usage and per-browser metrics sorted by CPU.",
    code: `import { BrowserServer } from "open-browser-sdk";

const server = new BrowserServer({ hostUrl: "http://localhost:3001" });

async function main() {
  const { server: host } = await server.getServerMetrics();
  console.log(\`CPU: \${host.cpu.usagePercent}% across \${host.cpu.cores} cores\`);
  console.log(\`Memory: \${host.memory.usagePercent}% used\`);

  const { items, total } = await server.getBrowserMetrics({
    sortBy: "cpu",
    order: "desc",
  });
  console.log(\`\${total} browsers running\`);
  for (const b of items) {
    console.log(\`\${b.id} -> cpu \${b.cpuPercent}% mem \${b.memoryBytes} bytes\`);
  }
}

main();`,
  },
  {
    id: "playwright",
    label: "Playwright",
    language: "typescript",
    filename: "playwright.ts",
    description: "Framework-agnostic: connect Playwright over CDP instead of Puppeteer.",
    code: `import { BrowserServer } from "open-browser-sdk";
import { chromium } from "playwright";

const server = new BrowserServer({ hostUrl: "http://localhost:3001" });

async function main() {
  const session = await server.start({ headless: true });

  const browser = await chromium.connectOverCDP(session.webSocketDebuggerUrl);
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://example.com");
  await page.screenshot({ path: "example.png" });

  await browser.close();
  await server.stop(session.id);
}

main();`,
  },
];
