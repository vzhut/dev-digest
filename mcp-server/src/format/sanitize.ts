// Model- and PR-derived text is untrusted: it is shown to another LLM. Strip anything that
// can hide or fake structure (terminal escapes, control and bidi/zero-width characters),
// collapse whitespace and cap the length.

// CSI (ESC [ … final), OSC (ESC ] … BEL | ESC \), and any other two-char ESC sequence.
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b[@-_]/g;
// C0 (except \t \n \r, handled separately), DEL, C1.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
// Zero-width, bidi embedding/override/isolate, BOM.
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;

export interface SanitizeOptions {
  /** Keep line breaks (at most one blank line) — for code snippets and markdown. */
  multiline?: boolean;
}

export function sanitizeText(input: string, max: number, opts: SanitizeOptions = {}): string {
  let s = input.replace(ANSI, '').replace(CONTROL, '').replace(INVISIBLE, '');
  if (opts.multiline) {
    s = s
      .replace(/\r\n?/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n');
  } else {
    s = s.replace(/\s+/g, ' ');
  }
  s = s.trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
