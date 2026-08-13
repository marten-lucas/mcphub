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

## Build CRUD — Non-monorepo
- [x] Build run list only shows runs for the current repo entry
- [ ] Retry works for failed build statuses
- [ ] Remove build works

## Monorepo / Variants
- [ ] Register `authentik-mcp` with subdir `nodejs/authentik-mcp`
- [ ] Register `authentik-diag-mcp` with subdir `nodejs/authentik-diag-mcp`
- [ ] Both entries appear independently
- [ ] Variants section links each entry to the other
- [ ] Subdir-specific README or root fallback loads correctly
- [x] Fix applied: selected `subdir` is now preserved across preview/build/install requests and used as the working directory for install/build steps
- [ ] Live-browser blocker: the currently served app still shows the stale source-install UI; the Repository subdir field is missing on the deployed page, which indicates the site is not yet running the latest branch/assets
- [x] Validation status: code compiles cleanly with `pnpm build`; the remaining live smoke check is to redeploy the branch and repeat the subdir-based flow

## Build Scoping — Variants
- [ ] Build `authentik-mcp`
- [ ] Confirm its runs do not appear under `authentik-diag-mcp`

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
