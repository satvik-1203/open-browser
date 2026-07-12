/**
 * Open Browser brand mark.
 *
 * Concept: two offset rounded-square browser windows stacked back-to-front.
 * The front window carries a minimal top bar (browser chrome); the second
 * frame peeking behind it signals PARALLELISM — "open" + "many browsers at once".
 * Monochrome, geometric, single color via currentColor so it adapts to any theme.
 */

type MarkProps = { size?: number; className?: string };

export function LogoMark({ size = 28, className }: MarkProps) {
  // A stable id keeps the occlusion mask unique-ish without hooks.
  const maskId = "ob-mark-mask";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Open Browser"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        {/* Everything visible by default... */}
        <rect x="0" y="0" width="32" height="32" fill="white" />
        {/* ...except the footprint of the front window (plus a hairline gap),
            so the back frame reads as a clean peek behind it. */}
        <rect x="2" y="11" width="19" height="19" rx="4.5" fill="black" />
      </mask>

      {/* Back window — offset up/right, masked so only its corner shows. */}
      <rect
        x="13"
        y="4"
        width="15"
        height="15"
        rx="3.5"
        stroke="currentColor"
        strokeWidth="2"
        mask={`url(#${maskId})`}
      />

      {/* Front window frame. */}
      <rect
        x="4"
        y="13"
        width="15"
        height="15"
        rx="3.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* Minimal top bar (browser chrome). */}
      <line
        x1="4"
        y1="18"
        x2="19"
        y2="18"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{
        fontFamily:
          "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
        fontSize: "1rem",
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontWeight: 400 }}>Open </span>
      <span style={{ fontWeight: 700 }}>Browser</span>
    </span>
  );
}

export function Logo({ size = 28, className }: MarkProps) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
    >
      <LogoMark size={size} />
      <Wordmark />
    </span>
  );
}

export default Logo;
