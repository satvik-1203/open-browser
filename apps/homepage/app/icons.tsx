/**
 * icons.tsx
 *
 * One inline-SVG icon per FeatureId, drawn in the same geometric line style as
 * the brand mark: 24x24 viewBox, currentColor stroke, 2px weight, rounded caps
 * and joins, no fills, no color literals. Use `featureIcon(id)` to resolve the
 * component for a given feature.
 */
import type { FeatureId } from "./content";
import type { JSX, SVGProps } from "react";

export interface IconProps {
  size?: number;
  className?: string;
}

type PathContent = SVGProps<SVGSVGElement>["children"];

function svg(paths: PathContent) {
  function Icon({ size = 24, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        {paths}
      </svg>
    );
  }
  return Icon;
}

/* open source — a branch / fork */
const OpenSourceIcon = svg(
  <>
    <circle cx="6" cy="5" r="2.2" />
    <circle cx="6" cy="19" r="2.2" />
    <circle cx="18" cy="8" r="2.2" />
    <path d="M6 7.2v9.6" />
    <path d="M6 12h6a4 4 0 0 0 4-4v-.2" />
  </>
);

/* manage — sliders */
const ManageIcon = svg(
  <>
    <path d="M4 7h11" />
    <path d="M20 7h-2" />
    <path d="M4 17h5" />
    <path d="M20 17h-6" />
    <circle cx="16.5" cy="7" r="2" />
    <circle cx="11.5" cy="17" r="2" />
  </>
);

/* observability — eye with pulse */
const ObservabilityIcon = svg(
  <>
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
    <circle cx="12" cy="12" r="2.5" />
  </>
);

/* adapters — plug into a stack */
const AdaptersIcon = svg(
  <>
    <path d="M9 3v4" />
    <path d="M15 3v4" />
    <path d="M6 7h12v3a6 6 0 0 1-12 0V7Z" />
    <path d="M12 16v5" />
  </>
);

/* sdk — code brackets */
const SdkIcon = svg(
  <>
    <path d="M8 6 3 12l5 6" />
    <path d="m16 6 5 6-5 6" />
    <path d="M13.5 4 10.5 20" />
  </>
);

/* stealth — mask / ghost face */
const StealthIcon = svg(
  <>
    <path d="M5 4h14v9a7 7 0 0 1-14 0V4Z" />
    <path d="M9 9.5h.01" />
    <path d="M15 9.5h.01" />
    <path d="M9.5 14a3 3 0 0 0 5 0" />
  </>
);

/* sandboxed — shield */
const SandboxedIcon = svg(
  <>
    <path d="M12 3 5 6v5c0 4.2 2.9 7.8 7 9 4.1-1.2 7-4.8 7-9V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </>
);

/* contexts — stacked layers */
const ContextsIcon = svg(
  <>
    <path d="M12 3 3 8l9 5 9-5-9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </>
);

/* metrics — bar chart */
const MetricsIcon = svg(
  <>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 20v-6" />
    <path d="M13 20v-9" />
    <path d="M18 20v-4" />
  </>
);

export const featureIcons: Record<FeatureId, (props: IconProps) => JSX.Element> = {
  openSource: OpenSourceIcon,
  manage: ManageIcon,
  observability: ObservabilityIcon,
  adapters: AdaptersIcon,
  sdk: SdkIcon,
  stealth: StealthIcon,
  sandboxed: SandboxedIcon,
  contexts: ContextsIcon,
  metrics: MetricsIcon,
};

export function featureIcon(id: FeatureId): (props: IconProps) => JSX.Element {
  return featureIcons[id];
}
