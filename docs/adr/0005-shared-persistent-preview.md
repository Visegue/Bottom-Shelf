# Use one persistent shared preview environment

Use one fixed Neon preview branch, private image bucket and stable Vercel Preview address, separate from development and the deployed test app. On 19 October 2026 the user chose this simpler topology over automated resources per PR: CI needs only scoped database/storage credentials and a project-scoped Vercel token, with no Neon management API key, GitHub administration token or encrypted resource registry.

This supersedes the per-PR lifecycle in ADR 0002 and preview-discard rule in ADR 0003. Reviewed revisions deploy serially, preserve preview data and move the shared address only after migration and smoke checks pass; closing a PR does not delete data. Concurrent PR versions can affect each other through the shared schema/data, so migrations must remain compatible with the previous app. Revisit per-PR isolation when actual parallel work, migration conflicts or usage justify its operating cost.
