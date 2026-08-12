# Source-Install Feature — Implementation Plan

> Branch: `feature/source-install-workflow`  
> Status: In Progress — this document tracks what is done, what is open, and how the implementation should proceed.

---

## Goal

Enable users to use MCP servers from arbitrary GitHub repositories that are **not packaged** (no npm publish, no PyPI release) — only a git clone, dependency install, and build step is needed.

The workflow is intentionally identical to official repos from the user's perspective:  
`Register → Detail Page → Build → Install (same ServerForm as official repos)`

---

## Terminology / Wording

| Concept | UI Label | Notes |
|---------|----------|-------|
| Add a repo to the market | **Register** | Was "Add to market" |
| Analyze the repo for build plan | **Detect** | Keep |
| Run clone + install + build | **Build** | Was "Deploy". No process is started. |
| Re-run a failed build | **Retry build** | |
| Remove build artifacts | **Remove build** | Was "Deinstall" |
| Add the built server to MCPHub | **Install** | Same label as official repos |
| A build execution record | **Build run** | Was "deploy job" |
| A registered custom git repo | **Custom server** | Keep |

---

## User Flow

```
Market → Local Installation → Custom
  ├─ [+ Register] → AddCustomRepoModal
  │     URL eingeben → Name + Version werden automatisch vorgeschlagen
  │     User kann Name/Version anpassen
  │     → POST /api/market/custom-servers
  │     → Redirect to Custom Server Detail
  │
  └─ Custom Server Detail Page
        Shows: README (from GitHub), metadata, "Build runs" section
        ├─ [Detect]   → GET repo metadata, derive build plan → show plan in detail
        ├─ [Build]    → POST /api/market/build-runs (clone + install + compile only, no start)
        │     Live log stream in "Build runs" sidebar
        │     Build run shows: status (running/succeeded/failed), log lines
        │     After success: [Install] button becomes active
        │
        └─ [Install]  → ServerForm (prefilled from build result, same as official repos)
              command: "node"
              args: ["dist/index.js"]  ← derived from package.json
              cwd: "/var/lib/mcphub/build-runs/<name>"
              → POST /api/servers  (existing endpoint, no changes needed)
```

### Monorepo / Variants — Decision: Variante 3 (Subdir optional at Register)

Each Custom Marketplace entry **is itself a specific subdir entry**. The detail page is always the same layout — there is no special "monorepo page".

**Register flow for monorepo:**
```
AddCustomRepoModal:
  URL:    https://github.com/cdmx-in/authentik-mcp
  Subdir: nodejs/authentik-mcp       ← optional field, auto-suggested on detect
  Name:   authentik-mcp              ← auto-derived, editable
  → POST /api/market/custom-servers  → one marketplace entry

Register again for the second variant:
  URL:    https://github.com/cdmx-in/authentik-mcp
  Subdir: nodejs/authentik-diag-mcp
  Name:   authentik-diag-mcp
  → POST /api/market/custom-servers  → second independent marketplace entry
```

When Register detects a monorepo (no package.json at root, multiple subdirs found), the modal shows a hint:
```
"Monorepo detected: 2 possible entries found.
 → authentik-mcp      (nodejs/authentik-mcp)      [Add this]
 → authentik-diag-mcp (nodejs/authentik-diag-mcp) [Add this]
 Or enter a subdir manually below."
```

**Build directory per entry:** `/var/lib/mcphub/build-runs/<serverName>-<runId>/`  
Clone always fetches the full repo root. Build steps (`npm install`, `npm run build`) run in `<installDir>/<subdir>` when subdir is set.  
Install `cwd` points to `<installDir>/<subdir>`.

**CRUD:**
- Each entry is fully independent — update/delete one entry does not affect the other.
- "Remove build" deletes the build directory for that entry only.
- If User deletes a custom server entry, associated build runs are also removed (cascade).

---

### Custom Server Detail Page Layout

The detail page is **identical for all custom repos** — with and without subdir.  
Subdir is simply displayed as a badge in the header. Build runs and Install button always belong to this specific entry.

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to list                                               │
│                                                              │
│  Authentik MCP                        [Custom]               │
│  (authentik-mcp)                                             │
│  Author: cdmx-in  ·  📁 nodejs/authentik-mcp  ← subdir badge│
│  github.com/cdmx-in/authentik-mcp                            │
│                                                              │
│                           [Install]  ← active only when      │
│                                        a succeeded build exists│
├──────────────────────────────────────────────────────────────┤
│  VARIANTS                                                     │
│                                                              │
│  Other entries registered from the same repository URL:       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  authentik-diag-mcp  ·  nodejs/authentik-diag-mcp    │   │
│  │  ⚪ No builds yet                    [View →]         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  (If no other entries from same URL: "No other variants       │
│   registered from this repository.")                          │
├──────────────────────────────────────────────────────────────┤
│  README  (loads from <subdir>/README.md, fallback: root)      │
│  [View on GitHub →]                                           │
│  (README content)                                             │
├──────────────────────────────────────────────────────────────┤
│  BUILD RUNS             ✅ Last: succeeded 4h ago  [+ Build] │
│                                                              │
│  ✅ #3  succeeded  2026-08-12 04:51  2m14s  [Install] [▼]   │
│  ❌ #2  build_error 2026-08-11 22:47  0m43s  [Retry]  [▼]   │
│  ❌ #1  clone_error 2026-08-11 21:12  1m02s  [Retry]  [▼]   │
│                                                              │
│  ▼ (expanded log for selected run)                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Cloning repository...                                 │   │
│  │ > npm install                                         │   │
│  │ > npm run build                                       │   │
│  │ ✅ Build succeeded                                    │   │
│  └──────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────┤
│                    [Edit Custom Repo]  [Delete Custom Repo]   │
└──────────────────────────────────────────────────────────────┘
```

**Key rules:**
- **Variants section** always shown. If no other entries from same URL exist: "No other variants registered from this repository."
- **[Install] in header** = disabled until at least one `succeeded` build run exists. Tooltip: "Build first to enable install." Opens prefilled ServerForm for the most recent succeeded build.
- **[Install] on build run row** = opens prefilled ServerForm for that specific build.
- **[▼] on build run row** = inline log expansion (accordion only for the log, not the whole section).
- **[+ Build] button** = opens Detect flow as modal/slide-over (replaces current embedded wizard).
- **README** loads from `<subdir>/README.md` first, then root `README.md` as fallback.
- **Subdir badge** only shown when `subdir` is set; hidden for non-monorepo entries.

---

### Variants Section — data source

The Variants section queries all custom entries that share the same `repository.url` as the current entry, excluding itself:

```typescript
// In frontend: after loading the current custom server
const variants = allCustomServers.filter(
  s => s.repository?.url === currentServer.repository?.url && s.name !== currentServer.name
);
```

No new API endpoint needed — already loaded as part of market server list.

---

## What is already implemented (keep / fix)

### Backend ✅ Keep (with fixes)
| File | Status | Action |
|------|--------|--------|
| `src/services/deployBuildService.ts` | Core working, bugs present | Fix (see below) |
| `src/controllers/deployBuildController.ts` | Complete | Keep, rename endpoints |
| `src/db/entities/DeployBuildJob.ts` | Complete | Keep, rename entity |
| `src/routes/index.ts` (market/deploy/* routes) | Complete | Keep, adjust path names |
| `src/services/marketService.ts` (custom server CRUD) | Complete | Keep |
| `src/controllers/marketController.ts` (custom server CRUD) | Complete | Keep |

### Frontend ✅ Keep (with fixes)
| File | Status | Action |
|------|--------|--------|
| `frontend/src/components/AddCustomRepoModal.tsx` | Complete | Keep, minor wording |
| `frontend/src/components/DeployWizardSidepane.tsx` | Complete | Rename → `BuildRunSidepane.tsx`, fix wording |
| `frontend/src/components/MarketServerDetail.tsx` | Working | Extract sub-components |
| `frontend/src/pages/MarketPage.tsx` | Working | Extract custom-related state/handlers |

---

## Bugs to Fix

### Critical — Blocks all repos

**B1: Node repos: missing `npm run build` step**  
All target repos (technitium, warden-mcp, limesurvey, mantic, npm-plus) require TypeScript compilation.  
`generatePlan` in `deployBuildService.ts` currently generates only `npm install` + `npm start`.  
Fix: Add build step detection from `package.json`:
```
if scripts.build exists → add step: npm run build
```

**B2: Build must NOT start the process**  
Currently `generatePlan` adds a `background: true` step (`npm start` / `python3 -m ...`).  
`executeDeployBuildJob` launches this as a detached child process.  
Fix: Remove all `background: true` steps from plan generation. Remove process-start logic from execute.  
The `processPid` field and `monitorBackgroundStart`/`verifyBackgroundHealthAfterStart` functions become unused — remove.

**B3: `registerServerFromInstall` called automatically after build**  
Currently after a successful build the server is auto-added to MCPHub.  
Fix: Remove the `registerServerFromInstall` auto-call from `executeDeployBuildJob`.  
`registerServerFromInstall` will be called only when User explicitly clicks Install.

**B4: Python start step is a copy-paste bug**  
```typescript
// Wrong: copies install step
args: ['-m', 'pip', 'install', '-e', '.'],
background: true,
```
Fix: Remove entirely (see B2).

**B5: `checkTooling` is a stub — does not actually check**  
Currently only logs "Checking node..." without running any command.  
Fix: Use `spawn('node', ['--version'])` etc. to actually verify prerequisites. Fail early with clear message.

### Medium — Bad UX

**B6: Polling never stops**  
In `MarketPage.tsx`, `setInterval` polls job status every 2s but never clears when job reaches terminal state (`succeeded`, `failed`, any error status).  
Fix: Clear interval in polling callback when `isFinalStatus(job.status)`.

**B7: Double server registration**  
Backend auto-registers (B3 above) AND frontend calls `POST /api/servers` after confirmation. Will be resolved by fixing B3.

**B8: `deinstallDeployBuildJob` does not remove the job from DB**  
Job remains forever with status `deinstalled`.  
Fix: Either hard-delete from DB, or add a `hide` flag and filter in list endpoint.

### Minor — Code quality

**B9: `writeJobs()` is dead code** — defined but never called. Remove.  
**B10: `readJobs()` is a trivial alias** for `loadJobs()`. Inline or remove.  
**B11: All Deploy types defined locally in service** — not exported to `src/types/index.ts`. Move.  
**B12: Frontend uses `any` for all Job/Plan objects** — import and use `WizardJob`/`WizardPlan` types from Sidepane or move to `frontend/src/types/index.ts`.

---

## New Features to Implement

### F1: Start-command detection from build artifacts

After successful build, read `package.json` to derive the best start command:

```
Priority order for node:
  1. scripts.start  → use as-is (e.g. "node dist/index.js")
  2. bin entries    → first bin value (e.g. "./dist/index.js")
  3. main field     → "node " + main
  4. Fallback       → "node index.js"
```

For python:
```
  1. pyproject.toml [project.scripts] → first entry name (CLI command)
  2. uv.lock present → "uv run <script>"
  3. main.py present → "python3 main.py"
  4. Fallback        → "python3 -m <package_name>"
```

Store detected start command in `DeployBuildJob.detectedStartCommand` (new field).

### F2: Prefilled Install form (ServerForm)

When User clicks [Install] from a succeeded build run:
- Open existing `ServerForm` modal (same as Servers → Add Server)  
- Prefill with:

```typescript
// Node example (technitium-mcp-secure):
{
  name: "technitium-mcp-secure",
  config: {
    type: "stdio",
    command: "node",
    args: ["dist/index.js"],
    cwd: "/var/lib/mcphub/build-runs/technitium-mcp-secure-<id>",
    env: {}
  }
}

// Python example (semaphore-mcp):
{
  name: "semaphore-mcp",
  config: {
    type: "stdio",
    command: "semaphore-mcp",  // CLI entry from pyproject.toml
    args: [],
    cwd: "/var/lib/mcphub/build-runs/semaphore-mcp-<id>",
    env: {}
  }
}
```

User can change anything in the form — same UX as official repos.  
Multiple installs from same build: User changes `name` + adjusts `args`/`env` to create variant (e.g. diagnostic vs. full).

### F3: Monorepo / Subdir support

Add optional `subdir` field to:
- `AddCustomRepoModal` (optional input, auto-suggested if detected)  
- `RegisterCustomServer` API
- `MarketServer` type (`repository.subdir?: string`)
- `DeployBuildPlan` / `DeployBuildJob`

Detection logic in `analyzeRepository`:
```
1. Check root for package.json / pyproject.toml
2. If not found: scan subdirs 1 level deep for package.json
3. If multiple found: return list of candidates
4. Store candidates in plan for UI to show
```

Build uses `path.join(cloneDir, subdir)` as working directory for install/build steps.

### F4: Build run logs in DB

Already implemented: `DeployBuildJob.logs: string[]` stored in DB (via `simple-json` column).  
What needs to be verified/improved:
- Every step appends lines via `addLogLine` + `persistJob` → ✅ already done
- Build run list clearly shows `status` + `createdAt` + `completedAt` → ✅ in entity
- UI must show: ✅ succeeded (green) / ❌ failed with error type (red) / 🔄 running (spinner)
- Error type classification already implemented (7 categories) → keep

### F5: Fix real `checkTooling`

```typescript
// Replace stub with actual checks:
const checkTool = (cmd: string, args: string[]): Promise<boolean> =>
  new Promise(resolve => {
    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('close', code => resolve(code === 0));
    child.on('error', () => resolve(false));
  });

// For node engine: check node, npm
// For python engine: check python3 / uv
// For docker: check docker
// If missing: set status 'prerequisite_error', clear error message
```

---

## Frontend Modularization

`MarketPage.tsx` is currently a 600+ line monolith mixing Cloud, Local, Registry and Custom concerns. Extract:

### New components to create:

```
frontend/src/components/custom/
  ├─ CustomServerList.tsx        # Grid/list of custom servers in Market tab
  ├─ CustomServerDetail.tsx      # Detail view for custom servers (extracts from MarketServerDetail)
  ├─ CustomBuildRunSidepane.tsx  # Renamed DeployWizardSidepane + fixed wording
  ├─ CustomBuildRunList.tsx      # "Build runs" section: list of runs with status
  ├─ CustomBuildRunLogViewer.tsx # Log viewer panel (extracted from Sidepane)
  └─ AddCustomRepoModal.tsx      # Move here from components/ root (already exists)
```

### MarketPage.tsx extraction:

```
frontend/src/hooks/
  └─ useCustomBuildRuns.ts   # All build-run state + API calls extracted from MarketPage
                              # (replaces 200+ lines of deployBuild* state in MarketPage)
```

After extraction, `MarketPage.tsx` only:
- Manages tab switching (local/cloud/registry)
- Renders tab-specific list + detail via sub-components
- Passes no deploy-build state directly

### MarketServerDetail.tsx:

Extract from the existing file:
- `CustomServerActions.tsx` — Edit/Delete buttons for custom servers
- `BuildTemplateSection.tsx` — "Build template" section (currently embedded in MarketServerDetail)  
- Keep `deploymentSection?: React.ReactNode` prop as injection point for `CustomBuildRunSidepane`

---

## Artifacts to Remove

| File / Code | Action |
|-------------|--------|
| `tests/services/sourceInstallService.test.ts` | Delete or rewrite to import `deployBuildService` |
| `deployBuildService.ts: writeJobs()` | Delete |
| `deployBuildService.ts: readJobs()` | Inline as `loadJobs()` call |
| `deployBuildService.ts: monitorBackgroundStart()` | Delete (no longer needed after B2) |
| `deployBuildService.ts: verifyBackgroundHealthAfterStart()` | Delete (no longer needed after B2) |
| `deployBuildService.ts: runBackgroundCommand()` | Delete (no longer needed after B2) |
| `DeployBuildJob.processPid` field | Remove field + DB column |
| All `background: true` steps in `generatePlan` | Remove |
| `registerServerFromInstall` auto-call in `executeDeployBuildJob` | Remove auto-call (keep function for future explicit use) |

---

## API Changes (rename for consistency)

Current paths use `/market/deploy/*` which is inconsistent with "build" terminology.

| Old | New | Change type |
|-----|-----|-------------|
| `POST /market/deploy/preview` | `POST /api/market/build-runs/preview` | Rename |
| `POST /market/deploy` | `POST /api/market/build-runs` | Rename |
| `GET /market/deploy/jobs` | `GET /api/market/build-runs` | Rename |
| `GET /market/deploy/jobs/:jobId` | `GET /api/market/build-runs/:runId` | Rename |
| `POST /market/deploy/jobs/:jobId/retry` | `POST /api/market/build-runs/:runId/retry` | Rename |
| `POST /market/deploy/jobs/:jobId/deinstall` | `DELETE /api/market/build-runs/:runId` | Rename + method |

> Keep old paths as aliases during transition if needed.

---

## DB Changes

### `DeployBuildJob` entity — fields to add:

```typescript
@Column({ type: 'varchar', length: 512, name: 'detected_start_command', nullable: true })
detectedStartCommand?: string;

@Column({ type: 'varchar', length: 512, name: 'subdir', nullable: true })
subdir?: string;
```

### `DeployBuildJob` entity — fields to remove:

```typescript
processPid  // Remove: no process started during build
```

---

## Implementation Order

### Phase 1 — Bug fixes (unblock all target repos)
1. **B2** Remove background start steps from plan + execute
2. **B3** Remove auto-register from executeDeployBuildJob
3. **B1** Add `npm run build` step detection from package.json
4. **B5** Fix `checkTooling` to actually spawn checks
5. **B6** Fix polling stop on terminal status
6. **B9/B10** Remove dead code (writeJobs, readJobs alias)
7. **B11/B12** Move types to central files

### Phase 2 — Core new features
8. **F1** Start-command detection from post-build package.json
9. **F2** Prefilled ServerForm on Install click
10. **F3** Subdir / Monorepo support (needed for authentik-mcp)
11. **F5** Real checkTooling

### Phase 3 — Modularization
12. Extract `useCustomBuildRuns.ts` hook from MarketPage
13. Create `frontend/src/components/custom/` sub-components
14. Extract `CustomBuildRunList` and `CustomBuildRunLogViewer`
15. Rename `DeployWizardSidepane` → `CustomBuildRunSidepane`

### Phase 4 — Cleanup
16. Delete `tests/services/sourceInstallService.test.ts` or fix
17. Rename API routes
18. DB migration: add `detectedStartCommand`, `subdir`; remove `processPid`
19. Remove artifacts listed above

---

## Target Repos Reference

| Repo | Engine | Subdir | Build cmd | Start cmd | Notes |
|------|--------|--------|-----------|-----------|-------|
| `rosschurchill/technitium-mcp-secure` | node/ts | — | `npm run build` (tsc) | `node dist/index.js` | |
| `ofershap/mcp-server-npm-plus` | node/ts | — | `npm run build` (tsup) | `./dist/index.js` (bin) | no `start` script |
| `icoretech/warden-mcp` | node/ts | — | `npm run build` (tsc) | `node dist/server.js` | |
| `TonisOrmisson/limesurvey-mcp` | node/ts | — | `npm run build` | `node dist/index.js` | |
| `Cbrown35/mantic-MCP` | node/ts | — | `npm run build` (tsc) | `./build/index.js` (bin) | no `start` script |
| `cdmx-in/authentik-mcp` | node/ts | `nodejs/authentik-mcp` | `npm run build` | `node dist/index.js` | monorepo — 2 subdirs |
| `cdmx-in/authentik-mcp` | node/ts | `nodejs/authentik-diag-mcp` | `npm run build` | `node dist/index.js` | monorepo — 2 subdirs |
| `rello/nextcloud-dynamic-mcp-server` | python | — | `pip install -r requirements.txt` | `python3 main.py` | |
| `Camusama/uptime-kuma-mcp-server` | python/uv | — | `uv sync` | `uv run uptime-kuma-mcp` | |
| `cloin/semaphore-mcp` | python/uv | — | `uv sync` | `semaphore-mcp` (pyproject script) | |
| `tetra-2023/homarr-mcp` | python/uv | — | `uv sync` | via pyproject scripts | |
| `cbcoutinho/nextcloud-mcp-server` | python/uv | — | `uv sync` | complex — has .mcpb | check separately |

---

## Open Questions / Decisions

- [ ] **Python: uv vs pip fallback** — prefer `uv` if `uv.lock` present, fall back to `pip install -e .`  
- [ ] **cbcoutinho/nextcloud-mcp-server** — uses `.mcpb` (MCPHub bundle format). Might work natively via existing upload endpoint. Investigate separately.  
- [ ] **Polling vs SSE for build logs** — currently polling every 2s. For long builds (npm install) this works but is inefficient. SSE upgrade is optional/future.  
- [ ] **Hard delete vs soft delete** for build runs — current code sets `status: 'deinstalled'`. Propose: hard delete from DB on explicit "Remove build".
