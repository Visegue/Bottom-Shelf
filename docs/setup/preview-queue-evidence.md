# Preview queue and merge-evidence acceptance (#18)

## Automatic delivery

[#17](https://github.com/Visegue/Bottom-Shelf/issues/17) closed after
[PR #36](https://github.com/Visegue/Bottom-Shelf/pull/36), head
`89962d76e96c99e87d5639bff115512f737764b5`, passed
[automatic preview 43237298699](https://github.com/Visegue/Bottom-Shelf/actions/runs/43237298699).
Control main was `6eb5104410a2b0c770472fa423af2c24fbe0429d`. Isolated
quality/browser checks, scoped migration/history and real SQL/storage checks,
pristine source upload and alias smoke passed at
`https://bottom-shelf-pr-36.visegue.vercel.app`.

## Actual queue exercise

[PR #37](https://github.com/Visegue/Bottom-Shelf/pull/37) ran while three revisions
of [PR #38](https://github.com/Visegue/Bottom-Shelf/pull/38) entered the same
persistent-preview queue. Recorded API snapshots showed the #38 runs pending
while #37 ran. No running migration was cancelled.

| PR head                                        | Preview run                                                                     | Result                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| #37 `84a4547326e1a301ace1abab8a140ca6adfdf2ba` | [43240993177](https://github.com/Visegue/Bottom-Shelf/actions/runs/43240993177) | Successful scoped SQL/storage and deployment/alias smoke              |
| #38 `f83ba8bfe451d734fb47a14abec3e241279b91f8` | [43239977706](https://github.com/Visegue/Bottom-Shelf/actions/runs/43239977706) | Superseded; stopped at approval, no candidate execution or deployment |
| #38 `7a51efe258616126b1bbf46209f0893d7c06ceaf` | [43240015720](https://github.com/Visegue/Bottom-Shelf/actions/runs/43240015720) | Superseded; stopped at approval, no candidate execution or deployment |

The third #38 head is `bd6278f6c0fd27a0ad66a33b4fcd19ed96745673`.
[Run 43240090613](https://github.com/Visegue/Bottom-Shelf/actions/runs/43240090613)
first failed closed during a GitHub metadata read. A controlled retry on the
unchanged head passed approval and isolated candidate checks. Final publication
and new-reporter evidence are recorded after the run finishes.

## Compatibility and failure evidence

[CI 43241000368](https://github.com/Visegue/Bottom-Shelf/actions/runs/43241000368)
passed quality, end-to-end and real disposable-Postgres `migration-compatibility`
on #37 head `84a4547326e1a301ace1abab8a140ca6adfdf2ba`. Local verification also
passed format/lint/types/build, 43 script tests, 22 desktop/mobile browser cases,
real local Postgres compatibility and actionlint with the documented supported
`queue: max` exception.

The SQL test uses the actual migration transaction runner and old/current app
modules. It verifies empty bootstrap, repeated migration, upgrade with retained
data, old app code after new writes, restricted runtime permissions and rollback
of a failed pending transaction. S3 is deterministic in that job; actual private
S3/Neon target checks are provided separately by preview runs.

Regression fault injection verifies HTTP 402/429, failed Vercel builds, alias
smoke failure and explicit recovery failure. No live quota exhaustion, data
reset, plan upgrade or stable-Auth change was performed. Future inventory and
production/rollback compatibility remain #14/#19.

## Required-check activation

The existing active `main` ruleset is **24995300**. Preserve its branch targeting,
reviews, linear history, deletion/force-push rules and existing maintainer bypass.
Preserve `strict_required_status_checks_policy: true`. Its current required
contexts are `quality` and `end-to-end`, both GitHub Actions integration **15368**.
After actual protected-main status evidence exists, add only:

```json
[
  { "context": "migration-compatibility", "integration_id": 15368 },
  { "context": "Preview / verified", "integration_id": 15368 }
]
```

Do not substitute the main-context `preview` job. Verify missing, failed and
skipped evidence remains blocking for non-bypass users. The existing authorized
maintainer bypass remains an explicit recovery route. Writing this document or
merging workflow code does not change the ruleset. The connector has no
ruleset-write operation and the cloud browser is signed out; activation remains
unverified until an authorized GitHub session is available.
