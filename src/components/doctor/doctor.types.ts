export interface Check {
  name: string;
  run: () => { level: "ok" | "warn" | "fail"; detail: string };
}
