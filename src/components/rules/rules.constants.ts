// Pure branch rules, no git calls, so they can be tested without a repository.

// Containers collect work and are never worked on directly.
export const CONTAINER = /^(develop|main|release\/.+|hotfix\/.+)$/;

// Branches a merge can land in.
export const TARGET = /^(main|develop|release\/.+|hotfix\/.+)$/;
