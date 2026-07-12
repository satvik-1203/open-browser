/**
 * content.ts
 *
 * Landing-page content for Open Browser.
 * Pure, strongly-typed data — no runtime imports, no React, no JSX.
 * A page builder consumes the exported `content` object to render the site.
 */

/* -------------------------------------------------------------------------- */
/*  Shared shapes                                                             */
/* -------------------------------------------------------------------------- */

export interface Cta {
  label: string;
  href: string;
}

export interface Hero {
  eyebrow: string;
  headline: string;
  subhead: string;
  primaryCta: Cta;
  secondaryCta: Cta;
}

export interface Stat {
  value: string;
  label: string;
}

/**
 * `id` maps to an icon in the page builder.
 * Keep the union in sync with the icon registry.
 */
export type FeatureId =
  | "openSource"
  | "manage"
  | "observability"
  | "adapters"
  | "sdk"
  | "stealth"
  | "sandboxed"
  | "contexts"
  | "metrics";

export interface Feature {
  id: FeatureId;
  title: string;
  tagline: string;
  description: string;
}

export interface Adapter {
  name: string;
  note: string;
}

export interface HowItWorksStep {
  step: number;
  title: string;
  description: string;
}

export interface FinalCta {
  headline: string;
  subhead: string;
  primaryCta: Cta;
  secondaryCta: Cta;
}

export interface FooterLink {
  label: string;
  href: string;
}

export interface Footer {
  tagline: string;
  links: FooterLink[];
  note: string;
}

export interface Content {
  hero: Hero;
  stats: Stat[];
  features: Feature[];
  adapters: Adapter[];
  howItWorks: HowItWorksStep[];
  finalCta: FinalCta;
  footer: Footer;
}

/* -------------------------------------------------------------------------- */
/*  Shared links                                                              */
/* -------------------------------------------------------------------------- */

const links = {
  github: "https://github.com/satvik-1203/open-browser",
  docs: "#docs",
  npm: "https://www.npmjs.com/package/open-browser-sdk",
  quickstart: "#quickstart",
} as const;

/* -------------------------------------------------------------------------- */
/*  Content                                                                   */
/* -------------------------------------------------------------------------- */

export const content: Content = {
  hero: {
    eyebrow: "Open-source browser infrastructure",
    headline: "Thousands of browsers, one command",
    subhead:
      "Spin up sandboxed, headless Chromium at scale for AI agents and automation. Self-host anywhere, connect over CDP in seconds.",
    primaryCta: { label: "Get started", href: links.docs },
    secondaryCta: { label: "Star on GitHub", href: links.github },
  },

  stats: [
    { value: "1000s", label: "Concurrent browsers per host" },
    { value: "1", label: "Command to deploy" },
    { value: "MIT", label: "Open-source license" },
    { value: "∞", label: "No per-browser limits" },
  ],

  features: [
    {
      id: "openSource",
      title: "Open source",
      tagline: "MIT-licensed, yours to run.",
      description:
        "Self-host anywhere with no vendor lock-in and no per-browser pricing games. Read the code, fork it, ship it.",
    },
    {
      id: "manage",
      title: "Manage browsers",
      tagline: "Start, stop, inspect — over one API.",
      description:
        "Create and tear down sessions with a single call. Open Browser handles the lifecycle, cleanup, and process management for you.",
    },
    {
      id: "observability",
      title: "Observability",
      tagline: "See every session, live.",
      description:
        "Watch CPU, memory, connection state, and status for each browser in real time. Stream logs and session recordings without extra wiring.",
    },
    {
      id: "adapters",
      title: "Storage adapters",
      tagline: "Recordings land in your bucket.",
      description:
        "Amazon S3, Google Cloud Storage, and Cloudflare R2 work out of the box. Session recordings and artifacts sync automatically, and the interface is pluggable.",
    },
    {
      id: "sdk",
      title: "TypeScript SDK",
      tagline: "A browser in a few lines.",
      description:
        "The typed open-browser-sdk starts a browser and hands you a webSocketDebuggerUrl. Connect with Puppeteer or Playwright — no glue code.",
    },
    {
      id: "stealth",
      title: "Stealth browsers",
      tagline: "Built to pass as human.",
      description:
        "Evade bot detection with realistic fingerprints, rotating proxies, and custom user agents. Reach the pages that block ordinary automation.",
    },
    {
      id: "sandboxed",
      title: "Sandboxed",
      tagline: "Full isolation, every session.",
      description:
        "Each browser runs in its own sandbox. One session can never read, touch, or interfere with another.",
    },
    {
      id: "contexts",
      title: "Contexts",
      tagline: "Bring your own state.",
      description:
        "Seed cookies, localStorage, user agent, and viewport per session. Resume authenticated flows without re-logging in.",
    },
    {
      id: "metrics",
      title: "Metrics",
      tagline: "Data for autoscaling and cost control.",
      description:
        "Query per-browser and per-host CPU, memory, and uptime through the API. Scale on real usage and keep spend predictable.",
    },
  ],

  adapters: [
    { name: "Amazon S3", note: "Recordings and artifacts to your bucket." },
    { name: "Google Cloud Storage", note: "Native GCS uploads, no proxy." },
    { name: "Cloudflare R2", note: "Zero-egress object storage." },
    { name: "+ more", note: "Pluggable adapter interface — bring your own." },
  ],

  howItWorks: [
    {
      step: 1,
      title: "Deploy",
      description:
        "Stand up Open Browser on your own infrastructure with a single command. No account, no waitlist.",
    },
    {
      step: 2,
      title: "Connect",
      description:
        "Start a browser with the SDK and connect Puppeteer or Playwright over the returned CDP endpoint.",
    },
    {
      step: 3,
      title: "Scale",
      description:
        "Run thousands of isolated sessions in parallel and autoscale on live per-host metrics.",
    },
  ],

  finalCta: {
    headline: "Give your agents room to run",
    subhead:
      "Deploy Open Browser in one command and connect your first session in minutes. Cheap, parallel, and fully in your control.",
    primaryCta: { label: "Read the docs", href: links.docs },
    secondaryCta: { label: "Install the SDK", href: links.npm },
  },

  footer: {
    tagline: "Make deploying and accessing browsers cheap and easy.",
    links: [
      { label: "GitHub", href: links.github },
      { label: "Docs", href: links.docs },
      { label: "npm", href: links.npm },
      { label: "Quickstart", href: links.quickstart },
    ],
    note: "Open Browser — MIT licensed. Built for automation at scale.",
  },
};

export default content;
