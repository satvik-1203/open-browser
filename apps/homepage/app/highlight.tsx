/**
 * Tiny, dependency-free syntax highlighter for the code samples.
 *
 * The production build runs offline, so rather than pull in a highlighter we
 * tokenize just enough TypeScript/JS and shell to color the samples on this
 * page. It is deliberately shallow: worst case a token stays plain — it never
 * throws or mangles the source, which is all a marketing snippet needs.
 */

import type { ReactNode } from "react";

interface Token {
  type: "comment" | "keyword" | "string" | "number" | "fn" | "type" | "const" | "plain";
  value: string;
}

const KEYWORDS = new Set([
  "import", "from", "export", "default", "const", "let", "var", "function",
  "return", "async", "await", "new", "class", "extends", "implements",
  "interface", "type", "enum", "public", "private", "protected", "readonly",
  "static", "of", "in", "if", "else", "for", "while", "do", "switch", "case",
  "break", "continue", "try", "catch", "finally", "throw", "typeof",
  "instanceof", "void", "delete", "yield", "as", "satisfies", "keyof",
  "namespace", "declare", "get", "set", "this", "super",
]);

const LITERALS = new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]);

function classifyIdent(word: string, code: string, end: number): Token["type"] {
  if (KEYWORDS.has(word)) return "keyword";
  if (LITERALS.has(word)) return "const";
  let i = end;
  while (i < code.length && (code[i] === " " || code[i] === "\t")) i++;
  if (code[i] === "(") return "fn";
  if (/^[A-Z]/.test(word)) return "type";
  return "plain";
}

function tokenizeTs(code: string): Token[] {
  // Order: comments, template/double/single strings, numbers, identifiers.
  // Gaps between matches (whitespace, punctuation) fall through as "plain".
  const re =
    /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|[^\\`])*`)|("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|(\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_$][\w$]*)/g;
  const out: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const pushPlain = (s: string) => {
    if (s) out.push({ type: "plain", value: s });
  };
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) pushPlain(code.slice(last, m.index));
    if (m[1] || m[2]) out.push({ type: "comment", value: m[0] });
    else if (m[3] || m[4] || m[5]) out.push({ type: "string", value: m[0] });
    else if (m[6]) out.push({ type: "number", value: m[0] });
    else if (m[7]) out.push({ type: classifyIdent(m[7], code, re.lastIndex), value: m[7] });
    last = re.lastIndex;
  }
  pushPlain(code.slice(last));
  return out;
}

function tokenizeBash(code: string): Token[] {
  const out: Token[] = [];
  code.split("\n").forEach((line, idx) => {
    if (idx > 0) out.push({ type: "plain", value: "\n" });
    if (line.trimStart().startsWith("#")) {
      out.push({ type: "comment", value: line });
      return;
    }
    let seenCmd = false;
    for (const part of line.split(/(\s+)/)) {
      if (part === "") continue;
      if (/^\s+$/.test(part)) out.push({ type: "plain", value: part });
      else if (/^(["']).*\1$/.test(part)) out.push({ type: "string", value: part });
      else if (part.startsWith("-")) out.push({ type: "keyword", value: part });
      else if (!seenCmd) {
        out.push({ type: "fn", value: part });
        seenCmd = true;
      } else out.push({ type: "plain", value: part });
    }
  });
  return out;
}

export function highlight(code: string, language: string): ReactNode {
  const tokens = language === "bash" ? tokenizeBash(code) : tokenizeTs(code);
  return tokens.map((tok, i) =>
    tok.type === "plain" ? (
      tok.value
    ) : (
      <span key={i} className={`tok-${tok.type}`}>
        {tok.value}
      </span>
    ),
  );
}
