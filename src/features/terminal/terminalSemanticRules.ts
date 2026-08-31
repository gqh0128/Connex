import type { TerminalSemanticTokenKind } from "./terminalThemeProfiles";

export type TerminalSemanticMatch = {
  start: number;
  end: number;
  kind: TerminalSemanticTokenKind;
  priority: number;
};

type TerminalSemanticRule = {
  findMatches: (text: string) => TerminalSemanticMatch[];
};

const RULES: readonly TerminalSemanticRule[] = [
  { findMatches: findPromptMatches },
  createRegexRule("url", 90, /\bhttps?:\/\/[^\s"'<>`]+/giu, trimUrlEnd),
  createRegexRule("option", 80, /(?<![\w-])--[A-Za-z0-9][A-Za-z0-9-]*/g),
  createRegexRule("environment", 70, /\$[A-Za-z_][A-Za-z0-9_]*/g),
  createRegexRule(
    "path",
    60,
    /(?<![\w:])(?:~|\.{1,2})?\/[A-Za-z0-9._~@%+,:=-]+(?:\/[A-Za-z0-9._~@%+,:=-]+)*/g,
  ),
  { findMatches: findIpv4Matches },
];

export function findTerminalSemanticMatches(text: string): TerminalSemanticMatch[] {
  const candidates = RULES.flatMap((rule) => rule.findMatches(text)).sort(
    (left, right) =>
      right.priority - left.priority ||
      left.start - right.start ||
      left.end - right.end,
  );
  const accepted: TerminalSemanticMatch[] = [];

  for (const candidate of candidates) {
    if (
      candidate.end <= candidate.start ||
      accepted.some(
        (existing) => candidate.start < existing.end && candidate.end > existing.start,
      )
    ) {
      continue;
    }
    accepted.push(candidate);
  }

  return accepted.sort((left, right) => left.start - right.start);
}

function createRegexRule(
  kind: TerminalSemanticTokenKind,
  priority: number,
  pattern: RegExp,
  normalizeEnd: (value: string) => number = (value) => value.length,
): TerminalSemanticRule {
  return {
    findMatches(text) {
      const expression = new RegExp(pattern.source, pattern.flags);
      const matches: TerminalSemanticMatch[] = [];

      for (const match of text.matchAll(expression)) {
        if (match.index === undefined || !match[0]) {
          continue;
        }
        const length = normalizeEnd(match[0]);
        matches.push({
          start: match.index,
          end: match.index + length,
          kind,
          priority,
        });
      }

      return matches;
    },
  };
}

function findPromptMatches(text: string): TerminalSemanticMatch[] {
  const match =
    /^([A-Za-z_][\w.-]*@[A-Za-z0-9][A-Za-z0-9.-]*):((?:~|\/)[^\s$#]*)(?:[$#])(?=\s|$)/.exec(
      text,
    );
  if (!match) {
    return [];
  }

  const hostStart = match.index;
  const pathStart = hostStart + match[1].length + 1;
  return [
    {
      start: hostStart,
      end: hostStart + match[1].length,
      kind: "host",
      priority: 100,
    },
    {
      start: pathStart,
      end: pathStart + match[2].length,
      kind: "path",
      priority: 100,
    },
  ];
}

function findIpv4Matches(text: string): TerminalSemanticMatch[] {
  const matches: TerminalSemanticMatch[] = [];
  const expression = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g;

  for (const match of text.matchAll(expression)) {
    if (match.index === undefined) {
      continue;
    }
    const [address, port] = match[0].split(":");
    const isAddressValid = address
      .split(".")
      .every((octet) => Number(octet) >= 0 && Number(octet) <= 255);
    const isPortValid =
      port === undefined || (Number(port) >= 1 && Number(port) <= 65_535);
    if (!isAddressValid || !isPortValid) {
      continue;
    }
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      kind: "host",
      priority: 50,
    });
  }

  return matches;
}

function trimUrlEnd(value: string) {
  return value.replace(/[),.;:!?\]}]+$/u, "").length;
}
