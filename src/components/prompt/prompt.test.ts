import { describe, expect, test } from "bun:test";
import { ask, confirm, select, setAssumeYes } from "./prompt";
import { moveIndex, toggled } from "./prompt.utils";

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

describe("arrow-key picker", () => {
  test("up and down wrap around the list", () => {
    expect(moveIndex(0, -1, 3)).toBe(2);
    expect(moveIndex(2, 1, 3)).toBe(0);
    expect(moveIndex(1, 1, 3)).toBe(2);
    expect(moveIndex(0, 1, 0)).toBe(0);
  });

  test("space toggles a checked item on and off", () => {
    const once = toggled(new Set(), 1);
    expect([...once]).toEqual([1]);
    expect([...toggled(once, 1)]).toEqual([]);
  });

  test("refuses without a terminal, so nothing waits for keys", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    await expect(
      select("Pick?", [{ name: "a", label: "a" }], false),
    ).rejects.toThrow("needs a terminal");
  });
});
