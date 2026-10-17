// Version math for `gith create -r` and `gith create -h` without an explicit version.
// Pure, so it can be tested without a repository.
export type Bump = "minor" | "patch";

export type Semver = [number, number, number];
