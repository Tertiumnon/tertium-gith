export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

// Only the fields this command reads. Other keys in package.json are kept as they are.
export interface PackageJson {
  scripts?: {
    lint?: string;
    typecheck?: string;
    test?: string;
    prepare?: string;
  };
  dependencies?: { typescript?: string };
  devDependencies?: { typescript?: string };
}
