import { describe, expect, test } from "bun:test";
import { latestVersion, nextVersion, parseSemver } from "./versions";

describe("parseSemver", () => {
  test("accepts 1.2.3 and v1.2.3", () => {
    expect(parseSemver("1.2.3")).toEqual([1, 2, 3]);
    expect(parseSemver("v1.2.3")).toEqual([1, 2, 3]);
  });

  test("rejects anything that is not a full version", () => {
    expect(parseSemver("1.2")).toBeUndefined();
    expect(parseSemver("latest")).toBeUndefined();
    expect(parseSemver("release/1.0.0")).toBeUndefined();
  });
});

describe("latestVersion", () => {
  test("compares numerically, not as text", () => {
    expect(latestVersion(["v1.2.0", "v1.10.0", "v1.9.9"])).toEqual([1, 10, 0]);
  });

  test("ignores non-version tags", () => {
    expect(latestVersion(["latest", "v2.0.0", "nightly"])).toEqual([2, 0, 0]);
  });

  test("undefined when there are no version tags", () => {
    expect(latestVersion([])).toBeUndefined();
    expect(latestVersion(["latest"])).toBeUndefined();
  });
});

describe("nextVersion", () => {
  test("release (minor) bumps the minor and resets the patch", () => {
    expect(nextVersion(["v1.2.1"], "minor")).toBe("1.3.0");
  });

  test("hotfix (patch) bumps the patch of the latest tag", () => {
    expect(nextVersion(["v1.2.1"], "patch")).toBe("1.2.2");
  });

  test("uses the highest tag, not the last one listed", () => {
    expect(nextVersion(["v1.2.0", "v1.10.0", "v1.9.9"], "minor")).toBe(
      "1.11.0",
    );
  });

  test("starts from 0.0.0 when there are no tags", () => {
    expect(nextVersion([], "minor")).toBe("0.1.0");
    expect(nextVersion([], "patch")).toBe("0.0.1");
  });
});
