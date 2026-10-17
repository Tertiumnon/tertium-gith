import type { Check } from "./doctor.types";

export function check(
  name: string,
  test: () => string | undefined,
  failure: "fail" | "warn" = "fail",
): Check {
  return {
    name,
    run: () => {
      try {
        const problem = test();
        return problem === undefined
          ? { level: "ok", detail: "" }
          : { level: failure, detail: problem };
      } catch (error) {
        return {
          level: failure,
          detail:
            error instanceof Error
              ? (error.message.split("\n")[0] ?? "")
              : String(error),
        };
      }
    },
  };
}
