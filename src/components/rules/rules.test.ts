import { describe, expect, test } from "bun:test";
import { containerBase, containerName, isContainer, isTarget } from "./rules";

describe("containers", () => {
  test("develop, main, release/* and hotfix/* are containers", () => {
    expect(isContainer("develop")).toBe(true);
    expect(isContainer("main")).toBe(true);
    expect(isContainer("release/1.2.0")).toBe(true);
    expect(isContainer("hotfix/1.2.1")).toBe(true);
  });

  test("goal-named branches are not containers", () => {
    expect(isContainer("login-redirect")).toBe(false);
    expect(isContainer("feat/x")).toBe(false);
  });
});

describe("targets", () => {
  test("only main, develop, release/* and hotfix/* are valid targets", () => {
    expect(isTarget("main")).toBe(true);
    expect(isTarget("develop")).toBe(true);
    expect(isTarget("release/1.2.0")).toBe(true);
    expect(isTarget("hotfix/1.2.1")).toBe(true);
    expect(isTarget("login")).toBe(false);
    expect(isTarget("release")).toBe(false);
  });
});

describe("container names and bases", () => {
  test("release comes from develop, hotfix from main", () => {
    expect(containerName("release", "1.2.0")).toBe("release/1.2.0");
    expect(containerBase("release")).toBe("develop");
    expect(containerName("hotfix", "1.2.1")).toBe("hotfix/1.2.1");
    expect(containerBase("hotfix")).toBe("main");
  });
});
