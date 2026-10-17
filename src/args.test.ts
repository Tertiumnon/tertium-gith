import { describe, expect, test } from "bun:test";
import { onlyOne, parseFlags } from "./args";

describe("branch flag", () => {
  test("short, single-dash long and double-dash long forms take a value", () => {
    for (const form of [
      ["-b", "x"],
      ["-branch", "x"],
      ["--branch", "x"],
    ]) {
      expect(parseFlags(form).get("branch")).toBe("x");
    }
  });

  test("a value is optional: without one the flag is stored as empty", () => {
    expect(parseFlags(["-b"]).get("branch")).toBe("");
    expect(parseFlags(["--branch", "--remote"]).get("branch")).toBe("");
    expect(parseFlags(["-b", "--remote"]).has("remote")).toBe(true);
  });
});

describe("release and hotfix: -x <version> is explicit, --x is auto", () => {
  test("single-dash forms take an explicit version", () => {
    for (const form of [
      ["-r", "1.0"],
      ["-release", "1.0"],
    ]) {
      expect(parseFlags(form).get("release")).toBe("1.0");
    }
    for (const form of [
      ["-h", "1.0"],
      ["-hotfix", "1.0"],
    ]) {
      expect(parseFlags(form).get("hotfix")).toBe("1.0");
    }
  });

  test("double-dash forms mean auto, stored as empty", () => {
    expect(parseFlags(["--release"]).get("release")).toBe("");
    expect(parseFlags(["--hotfix"]).get("hotfix")).toBe("");
  });

  test("double-dash forms take no value", () => {
    expect(() => parseFlags(["--release", "1.0"])).toThrow(
      "--release takes no value",
    );
    expect(() => parseFlags(["--hotfix", "1.2.1"])).toThrow(
      "--hotfix takes no value",
    );
  });

  test("single-dash forms need a version", () => {
    expect(() => parseFlags(["-r"])).toThrow("-r needs a value");
    expect(() => parseFlags(["-hotfix"])).toThrow("-hotfix needs a value");
    expect(() => parseFlags(["-r", "--patch"])).toThrow("-r needs a value");
  });
});

describe("release kinds", () => {
  test("switches work in both dash forms and are stored as true", () => {
    expect(parseFlags(["--patch"]).get("patch")).toBe("true");
    expect(parseFlags(["-patch"]).get("patch")).toBe("true");
    expect(parseFlags(["--minor"]).get("minor")).toBe("true");
    expect(parseFlags(["-major"]).get("major")).toBe("true");
  });
});

describe("parseFlags errors", () => {
  test("unknown option is rejected", () => {
    expect(() => parseFlags(["--nope"])).toThrow("unknown option '--nope'");
    expect(() => parseFlags(["-constructor"])).toThrow("unknown option");
  });

  test("repeating a flag is rejected", () => {
    expect(() => parseFlags(["-r", "1.0", "--release"])).toThrow(
      "given more than once",
    );
  });
});

describe("onlyOne", () => {
  test("returns the single present flag", () => {
    expect(
      onlyOne(parseFlags(["-r", "1.0"]), ["branch", "release", "hotfix"]),
    ).toBe("release");
  });

  test("returns undefined when none is present", () => {
    expect(
      onlyOne(parseFlags([]), ["branch", "release", "hotfix"]),
    ).toBeUndefined();
  });

  test("rejects more than one", () => {
    expect(() =>
      onlyOne(parseFlags(["-r", "1.0", "-h", "1.1"]), ["release", "hotfix"]),
    ).toThrow("use only one of");
  });
});

describe("switches added for gith", () => {
  test("hooks, force, remote and both work in both dash forms", () => {
    for (const name of ["hooks", "force", "remote", "both"]) {
      expect(parseFlags([`-${name}`]).get(name)).toBe("true");
      expect(parseFlags([`--${name}`]).get(name)).toBe("true");
    }
  });
});
