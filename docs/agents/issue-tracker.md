# Issue tracker: GitHub

Issues and specs live in GitHub Issues. Use the `gh` CLI from the repository root; infer the GitHub repository from its remote.

## Operations

- Create an issue: `gh issue create --title "..." --body-file <file>`.
- Read a ticket: `gh issue view <number> --comments`.
- List tickets: `gh issue list --state open --json number,title,labels`; add label filters when needed.
- Update an issue: `gh issue edit <number> --body-file <file>`.
- Comment: `gh issue comment <number> --body-file <file>`.
- Apply or remove labels: `gh issue edit <number> --add-label "..." --remove-label "..."`.
- Close an issue: `gh issue close <number>`.

Write multiline text to a temporary file and pass it with `--body-file`.

When a skill says "publish to the issue tracker", create a GitHub issue. When it says "fetch the relevant ticket", read the issue and its comments.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Dependencies and decision maps

Use GitHub's native issue dependencies to record blocking edges. If unavailable, record `Blocked by: #<number>` in the ticket body.

For wayfinding, use one map issue labelled `wayfinder:map` and child issues labelled `wayfinder:<type>` (`research`, `prototype`, `grilling`, or `task`). Link children as native sub-issues; if unavailable, use a task list in the map and `Part of #<map>` in each child.

A ticket is ready when all its blockers are closed. Claim it by assigning it to the implementing developer. Record decisions in the relevant ticket and update the map when resolving it.
