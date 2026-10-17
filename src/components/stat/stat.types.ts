import type { PERIODS } from "./stat.constants";

export type Period = (typeof PERIODS)[number];

export interface Range {
  label: string;
  since?: string;
  until?: string;
}

export interface Commit {
  hash: string;
  author: string;
  date: Date;
  subject: string;
  added: number;
  deleted: number;
  files: string[];
}

export interface Row {
  stat: string;
  value: string;
  detail: string;
}
