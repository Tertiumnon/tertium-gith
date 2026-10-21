import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { isDryRun } from "../git/git";
import type { PickOption } from "./prompt.types";
import { moveIndex, toggled } from "./prompt.utils";

// Set by --yes: every question is answered yes, for scripts. Still shown in dry runs.
let assumeYes = false;

export function setAssumeYes(on: boolean): void {
  assumeYes = on;
}

// Asks a yes/no question. Enter means yes. Needs a terminal, so nothing is confirmed by accident.
// A dry run assumes yes, and only says what it would ask.
export async function confirm(question: string): Promise<boolean> {
  if (isDryRun()) {
    console.log(`dry run: would ask: ${question}`);
    return true;
  }
  if (assumeYes) {
    console.log(`${question}yes (--yes)`);
    return true;
  }
  if (!process.stdin.isTTY)
    throw new Error(
      "this needs a terminal to confirm; pass --yes to skip the question.",
    );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "" || answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

// Asks for a line of text. Needs a terminal. A dry run only says what it would ask, and answers
// with a placeholder so the commands it prints still make sense.
export async function ask(question: string): Promise<string> {
  if (isDryRun()) {
    console.log(`dry run: would ask: ${question}`);
    return "<message>";
  }
  if (!process.stdin.isTTY)
    throw new Error("needs a terminal to ask; pass -m <message>.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

// An arrow-key list. Up and down move, Enter confirms. With `multi`, Space checks an item and
// Enter confirms the checked ones. Escape or Ctrl+C cancels and returns nothing. The list is
// redrawn in place, so it always shows the current highlight. Needs a terminal.
export async function select(
  question: string,
  options: PickOption[],
  multi: boolean,
): Promise<string[]> {
  if (!process.stdin.isTTY) throw new Error("this needs a terminal to pick.");
  return new Promise((resolve) => {
    const stdin = process.stdin;
    let index = 0;
    let checked = new Set<number>();
    let drawnLines = 0;

    const draw = () => {
      if (drawnLines > 0) process.stdout.write(`\x1b[${drawnLines}A\x1b[0J`);
      const hint = multi
        ? "space checks, enter confirms, esc cancels"
        : "enter selects, esc cancels";
      const lines = [`${question} (${hint})`];
      options.forEach((option, i) => {
        const cursor = i === index ? ">" : " ";
        const mark = multi ? (checked.has(i) ? "[x]" : "[ ]") : "";
        lines.push(`${cursor} ${mark} ${option.label}`.replace(/ +$/, ""));
      });
      process.stdout.write(`${lines.join("\n")}\n`);
      drawnLines = lines.length;
    };

    const finish = (picked: string[]) => {
      stdin.off("keypress", onKey);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
      resolve(picked);
    };

    const onKey = (
      _text: string | undefined,
      key: { name?: string; ctrl?: boolean } | undefined,
    ) => {
      if (!key) return;
      if ((key.ctrl && key.name === "c") || key.name === "escape") {
        finish([]);
        return;
      }
      if (key.name === "return") {
        const picked = multi
          ? [...checked]
              .sort((a, b) => a - b)
              .map((i) => options[i]?.name ?? "")
          : [options[index]?.name ?? ""];
        finish(picked.filter(Boolean));
        return;
      }
      if (key.name === "up") index = moveIndex(index, -1, options.length);
      else if (key.name === "down") index = moveIndex(index, 1, options.length);
      else if (key.name === "space" && multi) checked = toggled(checked, index);
      draw();
    };

    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("keypress", onKey);
    draw();
  });
}
