# Changelog

## 0.3.2 - 2026-10-19

- feat(sync): two-way sync of one branch with origin
- docs: add support link
- docs: remove project.json, replaced by project.yml
- docs: project attributes in project.yml
- docs: add project.json attributes
- docs: use the scoped package name as the project title
- docs: license under MIT (was ISC)

## 0.3.1 - 2026-10-18

- chore(hooks): run typecheck, format check and lint before each commit
- feat(flow): name work branches develop--<goal>, merge --main, merge -r/-h picker
- feat: switch -r/-h to newest container, save --all stages first

## 0.3.0 - 2026-10-17

- feat(merge): --develop merges this branch into develop
- fix(remove): print the branch list before asking to remove them
- feat(finish): gith finish --current-release and --current-hotfix
- feat(merge): pick the branch and the target; delete the merged work branch
- feat(remove): gith remove without -b opens the branch list
- feat(picker): arrow keys replace number entry; empty pockets says so
- feat(switch): gith switch lists local and origin branches to pick from
- feat(switch): --release and --hotfix switch to the newest release or hotfix

## 0.2.0 - 2026-10-17

- feat(changelog): write CHANGELOG.md as its own commit
- feat(changelog): gith changelog writes a release entry from commits

