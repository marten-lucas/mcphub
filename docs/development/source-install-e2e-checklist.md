# Source-Install E2E Checklist

## Access
- [x] Open `https://mcp.cloud.kiga-gramschatz.de/market/`
- [x] Login with `admin / admin123`
- [x] Confirm the Market UI loads without a white screen
- [x] Deploy the feature branch to CT303 using the repo/branch pinned to `marten-lucas/mcphub:feature/source-install-workflow`
- [x] Rebuild the container and verify the app serves the latest assets

## Test Data
- Non-monorepo: `https://github.com/rosschurchill/technitium-mcp-secure`
- Monorepo: `https://github.com/cdmx-in/authentik-mcp`
- Subdirs:
  - `nodejs/authentik-mcp`
  - `nodejs/authentik-diag-mcp`

## Custom Repo CRUD — Non-monorepo
- [x] Open existing or create `technitium-mcp-secure`
- [x] Detail page opens successfully
- [x] README renders
- [x] Variants section is shown
- [x] Variants section reports no other variants
- [x] Edit custom repo and confirm changes persist
- [x] Try to create the same repo with the same server name and confirm a conflict error is shown

## Build — Non-monorepo
- [x] Detect works
- [x] Build plan is shown
- [x] Engine detection is correct
- [x] Build steps look correct
- [x] Build starts successfully
- [x] Build logs stream
- [x] Build reaches a terminal state
- [x] Build succeeds
- [x] Install becomes enabled only after a successful build
- [x] Install form is prefilled correctly
- [x] Install completes successfully
- [x] Live browser validation on `https://github.com/cdmx-in/authentik-mcp` succeeded end-to-end from custom repo detect → build → install

## Build CRUD — Non-monorepo
- [x] Build run list only shows runs for the current repo entry
- [ ] Retry works for failed build statuses
- [ ] Remove build works

## Monorepo / Variants
- [x] Registering `https://github.com/cdmx-in/authentik-mcp` at repo root auto-creates the `authentik-mcp` and `authentik-diag-mcp` custom entries
- [x] `authentik-mcp` resolves and preserves `nodejs/authentik-mcp` through detail → build flow
- [x] `authentik-diag-mcp` resolves and preserves `nodejs/authentik-diag-mcp` through detail → build flow
- [x] Both entries appear independently in Market search results
- [x] Variants section links each entry to the other
- [x] Subdir-specific README or root fallback loads correctly
- [x] Fix applied: selected `subdir` is now preserved across preview/build/install requests and used as the working directory for install/build steps
- [x] Live-browser blocker resolved: the app was serving stale frontend assets earlier; the current deployment is serving the updated custom-source install UI and the workflow now completes successfully in-browser
- [x] Validation status: code compiles cleanly with `pnpm build`, and live E2E validation against a real custom repo completed successfully

## Build Scoping — Variants
- [x] Build `authentik-mcp`
- [x] Confirm its runs do not appear under `authentik-diag-mcp`

## Delete Custom Repo
- [ ] Delete a custom repo without cascade
- [ ] Recreate it and produce at least one build run
- [ ] Delete the repo with cascade enabled
- [ ] Confirm associated build runs are removed

## Regression
- [ ] `/market/` continues to load after refresh
- [ ] Other market views still work
- [ ] No obvious UI regressions remain

## Notes
- Existing findings:
  - Custom repo detail runtime error from helper hoisting — fixed
  - Install button label and gating bug — fixed
  - `latest` checkout bug during build — fixed
  - Install form command/args prefill from successful build — fixed
  - Install flow preserved `cwd` and respected custom payload/name — fixed
  - Duplicate custom repo creation returns a 409 conflict with a user-visible error message
  - Root monorepo registration now detects nested package manifests and auto-registers sibling variant entries
  - Re-running monorepo registration is conflict-safe when some sibling variants already exist
