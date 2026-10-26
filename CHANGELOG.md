# Changelog

## 0.4.0 - 2026-10-26

- fix: stage changelog in version lifecycle
- fix command rules and refresh gith branding
- feat: style commit graph with colored lanes and details
- feat: add informative push and pull commands and prompt-free save
- docs(manifest): update project.yml to the flat layout
- feat(setup): add gith setup -n npm
- docs(manifest): update project.yml to the flat layout
- chore(project): use block style project.yml
- feat(setup): add gith setup -n npm

## 0.3.3 - 2026-10-21

- feat(save): commit locally, ask before amend and push; feat(sync): sync current branch
- docs(readme): summary line from the repository description
- docs(readme): drop sections that only point to other files
- docs: move install and development notes from the README to docs/
- fix(project): write project.yml in block style
- chore(project): publish on site

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

