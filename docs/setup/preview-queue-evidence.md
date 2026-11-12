# Preview queue acceptance (#18)

This documentation-only PR exercises the existing shared preview queue while
another trusted PR is being verified. No application, migration, Auth or private
data changes are required.

Record actual PR/run/SHA identities after the queue and stale-head exercise.
Earlier queued revisions must fail approval after the head advances; the latest
revision must deploy without moving another PR's alias.

Queue exercise revision two: this head is deliberately superseded before its
queued preview may publish an alias.

Queue exercise revision three: this is the current candidate for publication;
the two preceding queued revisions must stop before deployment.
