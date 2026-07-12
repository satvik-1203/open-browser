"use client";

import { useState } from "react";
import { highlight } from "./highlight";
import type { CodeSample } from "./samples";

interface CodeTabsProps {
  samples: CodeSample[];
}

export function CodeTabs({ samples }: CodeTabsProps) {
  const [activeId, setActiveId] = useState(samples[0]?.id ?? "");
  const active = samples.find((s) => s.id === activeId) ?? samples[0];

  if (!active) return null;

  return (
    <div className="code-card">
      <div className="code-tablist" role="tablist" aria-label="Code examples">
        {samples.map((sample) => (
          <button
            key={sample.id}
            type="button"
            role="tab"
            id={`tab-${sample.id}`}
            aria-selected={sample.id === active.id}
            aria-controls={`panel-${sample.id}`}
            tabIndex={sample.id === active.id ? 0 : -1}
            className="code-tab"
            onClick={() => setActiveId(sample.id)}
          >
            {sample.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${active.id}`}
        aria-labelledby={`tab-${active.id}`}
      >
        <div className="code-filebar">
          <span className="code-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          {active.filename ? (
            <span className="code-filename">{active.filename}</span>
          ) : (
            <span className="code-filename">{active.language}</span>
          )}
        </div>

        <p className="code-desc">{active.description}</p>

        <div className="code-scroll">
          <pre className="code-block">
            <code>{highlight(active.code, active.language)}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

export default CodeTabs;
