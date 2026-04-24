import * as readline from "node:readline";
import pc from "picocolors";
import { S_BAR } from "@clack/prompts";

// Two-line progress renderer. clack's progress bar is single-line; here we manage two lines (info above, bar below) by moving the cursor up and clearing each redraw. `lastRowCount` tracks the visual rows the last paint used (accounting for terminal soft-wrap) so the erase step lands on the right row.

export interface DualProgress {
  start(barLabel: string, initialInfo?: string): void;
  advance(step?: number, info?: string): void;
  message(text: string): void;
  stop(finalMessage: string): void;
}

interface DualProgressOptions {
  max: number;
  barWidth?: number;
  stream?: NodeJS.WriteStream;
}

const HIDE_CURSOR = "\x1B[?25l";
const SHOW_CURSOR = "\x1B[?25h";
const ANSI_SGR = /\x1B\[[0-9;]*m/g;

function visualLength(s: string): number {
  return s.replace(ANSI_SGR, "").length;
}

export function dualProgress({
  max,
  barWidth = 30,
  stream = process.stdout,
}: DualProgressOptions): DualProgress {
  let current = 0;
  let infoText = "";
  let barLabel = "";
  let active = false;
  let lastRowCount = 0;

  const BAR_FILL = "━";
  const prefix = `${pc.gray(S_BAR)}  `;
  const safeMax = Math.max(1, max);

  function bar(): string {
    const filled = Math.min(barWidth, Math.floor((current / safeMax) * barWidth));
    const empty = barWidth - filled;
    return `${pc.magenta(BAR_FILL.repeat(filled))}${pc.dim(BAR_FILL.repeat(empty))} ${current}/${max} ${barLabel}`;
  }

  function draw(): void {
    const cols = stream.columns || 80;
    const line1 = `${prefix}${infoText || pc.dim("…")}`;
    const line2 = `${prefix}${bar()}`;
    const rows =
      Math.max(1, Math.ceil(visualLength(line1) / cols)) +
      Math.max(1, Math.ceil(visualLength(line2) / cols));
    stream.write(`${line1}\n${line2}\n`);
    lastRowCount = rows;
  }

  function erase(): void {
    readline.moveCursor(stream, 0, -lastRowCount);
    readline.cursorTo(stream, 0);
    readline.clearScreenDown(stream);
  }

  return {
    start(label: string, initialInfo = ""): void {
      barLabel = label;
      infoText = initialInfo;
      stream.write(HIDE_CURSOR);
      // Static separator so the block visually nests under clack's existing tree.
      stream.write(`${pc.gray(S_BAR)}\n`);
      draw();
      active = true;
    },
    advance(step = 1, info?: string): void {
      if (!active) return;
      current = Math.min(max, current + step);
      if (info !== undefined) infoText = info;
      erase();
      draw();
    },
    message(text: string): void {
      if (!active) return;
      infoText = text;
      erase();
      draw();
    },
    stop(finalMessage: string): void {
      if (!active) return;
      erase();
      stream.write(SHOW_CURSOR);
      stream.write(`${prefix}${finalMessage}\n`);
      active = false;
    },
  };
}
