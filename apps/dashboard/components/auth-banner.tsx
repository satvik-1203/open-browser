import { Brand } from "@/components/brand";

/** Real open-browser-sdk snippet — communicates the product and fills the panel. */
function CodeCard() {
  return (
    <div className="w-full max-w-sm overflow-hidden rounded border border-white/15 bg-black/25 shadow-xl backdrop-blur-sm">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3.5 py-2.5">
        <span className="size-2.5 rounded-full bg-white/25" />
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="ml-2 font-mono text-[11px] text-white/50">
          automation.ts
        </span>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-white/85">
        <code>
          <span className="text-indigo-300">import</span> {"{ BrowserServer }"}{" "}
          <span className="text-indigo-300">from</span>{" "}
          <span className="text-emerald-300">&quot;open-browser-sdk&quot;</span>;
          {"\n\n"}
          <span className="text-indigo-300">const</span> ob ={" "}
          <span className="text-indigo-300">new</span>{" "}
          <span className="text-sky-300">BrowserServer</span>({"{ hostUrl }"});
          {"\n"}
          <span className="text-indigo-300">const</span> {"{ id }"} ={" "}
          <span className="text-indigo-300">await</span> ob.
          <span className="text-sky-300">start</span>({"{"}
          {"\n"}
          {"  "}url:{" "}
          <span className="text-emerald-300">&quot;https://acme.com&quot;</span>,
          {"\n"}
          {"  "}record: <span className="text-indigo-300">true</span>,{"\n"}
          {"});"}
          {"\n"}
          <span className="text-indigo-300">await</span> ob.
          <span className="text-sky-300">stop</span>(id);
        </code>
      </pre>
    </div>
  );
}

/** Shared auth banner (warm dark ink) used on both sign-in and sign-up. */
export function AuthBanner() {
  return (
    <div className="bg-foreground text-background relative flex h-full flex-col justify-between overflow-hidden p-12">
      {/* dot-grid texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "radial-gradient(currentColor 1px, transparent 1.5px)",
          backgroundSize: "24px 24px",
        }}
      />
      {/* glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 45% at 25% 15%, rgba(47,111,224,0.28), transparent 70%)",
        }}
      />

      <div className="relative">
        <Brand variant="mono" />
      </div>

      <div className="relative flex flex-col gap-8">
        <CodeCard />
        <div className="max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">
            Automate any browser.
          </h2>
          <p className="mt-3 max-w-sm text-sm opacity-75">
            Launch, control, and record real browsers through a single API — no
            infrastructure to manage.
          </p>
        </div>
      </div>

      <p className="relative text-xs opacity-60">
        Free to start. No credit card required.
      </p>
    </div>
  );
}
