/**
 * Build the Daytona snapshot that browser sessions run in.
 *
 * Mirrors `docker/browser.Dockerfile`'s runtime layer, minus everything that
 * only the server needs: the sandbox runs Chrome and nothing else. The two
 * additions over the existing `chrome-small` snapshot are `xvfb`/`xauth` —
 * without a virtual display Chrome cannot start HEADFUL, and headful is the
 * whole reason this product is less bot-detectable than a plain headless one.
 *
 * Usage: node scripts/build-daytona-snapshot.mjs [snapshot-name]
 */
import { Daytona, Image } from '@daytonaio/sdk'
import fs from 'node:fs'
import path from 'node:path'

function loadEnv() {
  const file = path.join(process.cwd(), '.env')
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => [
        line.slice(0, line.indexOf('=')).trim(),
        line.slice(line.indexOf('=') + 1).trim(),
      ]),
  )
}

const env = { ...loadEnv(), ...process.env }
const name = process.argv[2] || env.DAYTONA_SNAPSHOT || 'ob-chrome-headful'

// Same dependency-closure trick as the server Dockerfile: install Google's real
// chrome-stable from their apt repo rather than Debian's chromium, because
// `fingerprint.ts` derives the advertised UA from the actual binary and a stale
// build makes Google expire logins (which silently destroys saved contexts).
const image = Image.base('debian:bookworm-slim').dockerfileCommands([
  'ENV DEBIAN_FRONTEND=noninteractive',
  `RUN apt-get update \\
  && apt-get install -y --no-install-recommends \\
    bash ca-certificates fonts-liberation fonts-noto-color-emoji gnupg wget \\
    xdg-utils procps tar xvfb xauth \\
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 \\
    libdbus-1-3 libdrm2 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 \\
    libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \\
    libu2f-udev libuuid1 libvulkan1 libx11-6 libx11-xcb1 libxcb1 \\
    libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \\
  && wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /usr/share/keyrings/google-chrome.gpg \\
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \\
  && apt-get update \\
  && apt-get install -y --no-install-recommends google-chrome-stable \\
  && rm -rf /var/lib/apt/lists/*`,
  'RUN google-chrome --version && Xvfb -help >/dev/null 2>&1 || true',
])

const daytona = new Daytona({ apiKey: env.DAYTONA_API_KEY, apiUrl: env.DAYTONA_URL })

console.log(`building snapshot "${name}" …`)
const started = Date.now()
await daytona.snapshot.create(
  {
    name,
    image,
    // Headful Chrome on 1 CPU / 2 GB (what `chrome-small` allots) is tight
    // enough to stall on heavy pages, and the profile restore/pack for a
    // context is CPU-bound tar work on top of that.
    resources: { cpu: 2, memory: 4, disk: 10 },
    entrypoint: ['sleep', 'infinity'],
  },
  { onLogs: (line) => process.stdout.write(line.endsWith('\n') ? line : `${line}\n`) },
)
console.log(`snapshot "${name}" ready in ${Math.round((Date.now() - started) / 1000)}s`)
