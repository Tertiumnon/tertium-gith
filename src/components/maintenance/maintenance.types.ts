// pair: the local branch and its origin copy together (the default). local or remote: one side only.
export type Scope = "pair" | "local" | "remote";

export interface Option {
  name: string;
  label: string;
}

// The newest commit time on each side of a branch, in unix seconds.
export interface Sides {
  local?: number;
  origin?: number;
}
