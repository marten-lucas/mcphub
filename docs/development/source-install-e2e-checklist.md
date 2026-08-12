# Source-Install E2E Checklist

## Access
- [ ] Open `https://mcp.cloud.kiga-gramschatz.de/market/`
- [ ] Login with `admin / admin123`
- [ ] Confirm the Market UI loads without a white screen

## Test Data
- Non-monorepo: `https://github.com/rosschurchill/technitium-mcp-secure`
- Monorepo: `https://github.com/cdmx-in/authentik-mcp`
- Subdirs:
  - `nodejs/authentik-mcp`
  - `nodejs/authentik-diag-mcp`

## Custom Repo CRUD — Non-monorepo
- [ ] Open existing or create `technitium-mcp-secure`
- [ ] Detail page opens successfully
- [ ] README renders
- [ ] Variants section is shown
- [ ] Variants section reports no other variants
- [ ] Edit custom repo and confirm changes persist
- [ ] Try to create the same repo with the same server name and confirm a conflict error is shown

## Build — Non-monorepo
- [ ] Detect works
- [ ] Build plan is shown
- [ ] Engine detection is correct
- [ ] Build steps look correct
- [ ] Build starts successfully
- [ ] Build logs stream
- [ ] Build reaches a terminal state
- [ ] Build succeeds
- [ ] Install becomes enabled only after a successful build
- [ ] Install form is prefilled correctly
- [ ] Install completes successfully

## Build CRUD — Non-monorepo
- [ ] Build run list only shows runs for the current repo entry
- [ ] Retry works for failed build statuses
- [ ] Remove build works

## Monorepo / Variants
- [ ] Register `authentik-mcp` with subdir `nodejs/authentik-mcp`
- [ ] Register `authentik-diag-mcp` with subdir `nodejs/authentik-diag-mcp`
- [ ] Both entries appear independently
- [ ] Variants section links each entry to the other
- [ ] Subdir-specific README or root fallback loads correctly

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
