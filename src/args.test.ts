import { describe, expect, test } from "bun:test";
import { onlyOne, parseFlags } from "./args";

describe("value flags: a single dash always takes a value", () => {
  test("short and long single-dash forms store the value", () => {
    expect(parseFlags(["-b", "x"]).get("branch")).toBe("x");
    expect(parseFlags(["-branch", "x"]).get("branch")).toBe("x");
    expect(parseFlags(["-l", "10"]).get("limit")).toBe("10");
    expect(parseFlags(["-limit", "10"]).get("limit")).toBe("10");
    expect(parseFlags(["-n", "wip"]).get("name")).toBe("wip");
    expect(parseFlags(["-m", "msg"]).get("message")).toBe("msg");
    expect(parseFlags(["-count", "3"]).get("count")).toBe("3");
  });

  test("a single dash without a value is an error", () => {
    expect(() => parseFlags(["-b"])).toThrow("-b needs a value");
    expect(() => parseFlags(["-b", "--remote"])).toThrow("-b needs a value");
    expect(() => parseFlags(["-limit"])).toThrow("-limit needs a value");
  });

  test("a double dash is an error for a value flag, with the right spelling", () => {
    expect(() => parseFlags(["--limit", "10"])).toThrow(
      "--limit takes a value; write -limit <value>.",
    );
    expect(() => parseFlags(["--branch", "x"])).toThrow(
      "--branch takes no value",
    );
    expect(() => parseFlags(["--message", "x"])).toThrow(
      "--message takes a value; write -message <value>.",
    );
  });
});

describe("auto flags: -x <value> is explicit, --x alone picks automatically", () => {
  test("--branch, --release and --hotfix alone are stored as empty", () => {
    expect(parseFlags(["--branch"]).get("branch")).toBe("");
    expect(parseFlags(["--release"]).get("release")).toBe("");
    expect(parseFlags(["--hotfix"]).get("hotfix")).toBe("");
    expect(parseFlags(["--branch", "--remote"]).has("remote")).toBe(true);
  });

  test("the auto flags take an explicit value only with a single dash", () => {
    expect(parseFlags(["-r", "1.0"]).get("release")).toBe("1.0");
    expect(parseFlags(["-release", "1.0"]).get("release")).toBe("1.0");
    expect(parseFlags(["-h", "1.0"]).get("hotfix")).toBe("1.0");
    expect(parseFlags(["-hotfix", "1.0"]).get("hotfix")).toBe("1.0");
    expect(() => parseFlags(["--release", "1.0"])).toThrow(
      "--release takes no value. For an explicit value use -release <value>.",
    );
    expect(() => parseFlags(["-r"])).toThrow("-r needs a value");
    expect(() => parseFlags(["-r", "--patch"])).toThrow("-r needs a value");
  });
});

describe("switches: a double dash only", () => {
  test("switches are stored as true with --", () => {
    for (const name of [
      "patch",
      "minor",
      "major",
      "remote",
      "local",
      "tags",
      "commits",
      "graph",
      "stashes",
      "obsolete",
    ]) {
      expect(parseFlags([`--${name}`]).get(name)).toBe("true");
    }
  });

  test("a single dash is an error for a switch", () => {
    expect(() => parseFlags(["-remote"])).toThrow(
      "-remote is a switch; write --remote.",
    );
    expect(() => parseFlags(["-patch"])).toThrow(
      "-patch is a switch; write --patch.",
    );
    expect(() => parseFlags(["-local"])).toThrow(
      "-local is a switch; write --local.",
    );
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
