export interface Worktree {
  path: string;
  head: string;
  branch?: string;
  bare: boolean;
  locked: boolean;
  prunable: boolean;
}
