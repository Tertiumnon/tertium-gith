import { describe, expect, test } from "bun:test";
import { ask, confirm, setAssumeYes } from "./prompt";

describe("prompt", () => {
  test("without a terminal, questions are refused; --yes answers yes", async () => {
    const stdin = process.stdin as { isTTY?: boolean };
    const before = stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    try {
      await expect(confirm("Remove? ")).rejects.toThrow(
        "needs a terminal to confirm",
      );
      await expect(ask("Message: ")).rejects.toThrow("needs a terminal");
      setAssumeYes(true);
      expect(await confirm("Remove? ")).toBe(true);
    } finally {
      setAssumeYes(false);
      Object.defineProperty(process.stdin, "isTTY", {
        value: before,
        configurable: true,
      });
    }
  });
});
