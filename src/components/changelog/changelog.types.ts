// The commit subjects of one release, ready to be written as a changelog entry.
export interface ReleaseNotes {
  version: string;
  date: string;
  subjects: string[];
}
