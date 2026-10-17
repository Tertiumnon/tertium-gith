import { createInterface } from "node:readline/promises";
import { isDryRun } from "./git";

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
  if (assumeYes) return true;
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
