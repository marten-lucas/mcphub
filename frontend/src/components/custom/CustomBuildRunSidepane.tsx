import React from 'react';
import { AlertTriangle, Rocket, X } from 'lucide-react';
import { BuildRun, BuildRunStatus } from '@/types';
import CustomBuildRunLogViewer from '@/components/custom/CustomBuildRunLogViewer';

type WizardJob = BuildRun;

type WizardPlan = {
  repositoryUrl: string;
  serverName: string;
  version?: string;
  engine: string;
  prerequisites?: string[];
  steps?: Array<{ id: string; title: string; command?: string; args?: string[] }>;
  selectedPort?: number;
  installDir?: string;
};

interface CustomBuildRunSidepaneProps {
  open: boolean;
  embedded?: boolean;
  repositoryUrl: string;
  serverName: string;
  version: string;
  targetDir: string;
  preview: WizardPlan | null;
  planDraftJson: string;
  submitting: boolean;
  confirmOpen: boolean;
  confirmPlan: WizardPlan | null;
  destructiveAck: boolean;
  jobs: WizardJob[];
  selectedJob: WizardJob | null;
  selectedJobId: string | null;
  onClose?: () => void;
  onRepositoryChange: (value: string) => void;
  onServerNameChange: (value: string) => void;
  onVersionChange: (value: string) => void;
  onTargetDirChange: (value: string) => void;
  onPlanDraftJsonChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  onDestructiveAckChange?: (value: boolean) => void;
  onOpenJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onDeinstallJob: (jobId: string) => void;
}

const CustomBuildRunSidepane: React.FC<CustomBuildRunSidepaneProps> = ({
  open,
  embedded = false,
  repositoryUrl,
  serverName,
  version,
  targetDir,
  preview,
  planDraftJson,
  submitting,
  confirmOpen,
  confirmPlan,
  destructiveAck,
  jobs,
  selectedJob,
  selectedJobId,
  onClose,
  onRepositoryChange,
  onServerNameChange,
  onVersionChange,
  onTargetDirChange,
  onPlanDraftJsonChange,
  onSubmit,
  onConfirm,
  onCancelConfirm,
  onDestructiveAckChange,
  onOpenJob,
  onRetryJob,
  onDeinstallJob,
}) => {
  if (!open) return null;

  const retryableStatuses = new Set<BuildRunStatus>([
    'failed',
    'prerequisite_error',
    'clone_error',
    'install_error',
    'build_error',
    'network_error',
  ]);
  const isRetryableBuildStatus = (status?: BuildRunStatus): boolean =>
    Boolean(status && retryableStatuses.has(status));

  const containerClass = embedded ? 'w-full mt-6' : 'w-full lg:w-[33vw] lg:min-w-[33vw] lg:shrink-0';
  const panelClass = embedded
    ? 'overflow-hidden rounded border border-[var(--hub-line)] bg-[var(--hub-bg)] shadow-2xl flex flex-col'
    : 'sticky top-6 h-[calc(100vh-3rem)] overflow-hidden rounded border border-[var(--hub-line)] bg-[var(--hub-bg)] shadow-2xl flex flex-col';

  return (
    <div className={containerClass}>
      <aside className={panelClass}>
        <div className="flex items-start justify-between gap-4 border-b border-[var(--hub-line)] px-6 py-5">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--hub-line)] bg-[var(--hub-surface)] px-2 py-0.5 text-[11px]">
                <Rocket size={12} />
                Build
              </span>
              <span className="text-[11px] text-[var(--hub-ink-3)]">Install workflow</span>
            </div>
            <h2 className="text-lg font-semibold text-[var(--hub-ink)]">Build custom repo</h2>
            <p className="max-w-[720px] truncate text-sm text-[var(--hub-ink-3)]">
              {repositoryUrl || 'Repository URL'}
            </p>
          </div>
          {!embedded && onClose ? (
            <button type="button" className="hub-icon-btn sm" onClick={onClose}>
              <X size={13} />
            </button>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <form onSubmit={onSubmit} className="space-y-4">
            <section className="hub-card p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--hub-ink)]">Detect</h3>
                  <p className="text-sm text-[var(--hub-ink-3)]">Detect the repo and derive the build plan.</p>
                </div>
                <button type="submit" className="hub-btn primary" disabled={submitting}>
                  {submitting ? 'Detecting…' : 'Detect'}
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-[var(--hub-ink-2)]">Repository URL</span>
                  <input
                    className="hub-input mt-1 w-full"
                    value={repositoryUrl}
                    onChange={(e) => onRepositoryChange(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-[var(--hub-ink-2)]">Version / tag</span>
                  <input
                    className="hub-input mt-1 w-full"
                    value={version}
                    onChange={(e) => onVersionChange(e.target.value)}
                    placeholder="main or v1.2.3"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-[var(--hub-ink-2)]">Build name</span>
                <input
                  className="hub-input mt-1 w-full"
                  value={serverName}
                  onChange={(e) => onServerNameChange(e.target.value)}
                  placeholder="authentik-mcp"
                />
              </label>
            </section>

            <section className="hub-card p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--hub-ink)]">Build plan</h3>
                  <p className="text-sm text-[var(--hub-ink-3)]">Review the generated plan and adjust JSON if needed.</p>
                </div>
                <span className="text-[11px] uppercase tracking-wide text-[var(--hub-ink-3)]">
                  {preview?.engine || 'pending'}
                </span>
              </div>

              {preview ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded border border-[var(--hub-line)] bg-[var(--hub-surface)] p-3 text-sm">
                      <div className="text-[11px] text-[var(--hub-ink-3)]">Detected steps</div>
                      <div className="font-medium text-[var(--hub-ink)]">{preview.steps?.length || 0}</div>
                    </div>
                    <div className="rounded border border-[var(--hub-line)] bg-[var(--hub-surface)] p-3 text-sm">
                      <div className="text-[11px] text-[var(--hub-ink-3)]">Selected port</div>
                      <div className="font-medium text-[var(--hub-ink)]">{preview.selectedPort || 'auto'}</div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {preview.steps?.map((step) => (
                      <div key={step.id} className="flex items-start gap-2 text-sm">
                        <span className="text-[var(--hub-ink-3)]">•</span>
                        <span>{step.title}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded border border-dashed border-[var(--hub-line)] bg-[var(--hub-surface)] p-4 text-sm text-[var(--hub-ink-3)]">
                  Click Detect first to generate a plan.
                </div>
              )}

              <label className="block">
                <span className="text-[12px] text-[var(--hub-ink-3)]">Target folder</span>
                <input
                  className="hub-input mt-1 w-full font-mono text-xs"
                  value={targetDir}
                  onChange={(e) => onTargetDirChange(e.target.value)}
                  placeholder="/var/lib/mcphub/deploy-builds/technitium-mcp-secure"
                />
                <p className="mt-1 text-[11px] text-[var(--hub-ink-3)]">
                  Recommended: /var/lib/mcphub/deploy-builds/&lt;repo-name&gt; (persistent)
                </p>
              </label>

              <label className="block">
                <span className="text-[12px] text-[var(--hub-ink-3)]">Plan override (JSON)</span>
                <textarea
                  className="hub-input mt-1 min-h-56 w-full font-mono text-xs"
                  value={planDraftJson}
                  onChange={(e) => onPlanDraftJsonChange(e.target.value)}
                  spellCheck={false}
                />
              </label>
            </section>

            <section className="hub-card p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--hub-ink)]">Build</h3>
                  <p className="text-sm text-[var(--hub-ink-3)] truncate">
                    {selectedJob?.serverName || serverName}{' '}
                    {selectedJob?.version ? `· ${selectedJob.version}` : version ? `· ${version}` : ''}
                  </p>
                </div>
                <span className="rounded-full border border-[var(--hub-line)] bg-[var(--hub-surface)] px-2 py-1 text-[11px] uppercase tracking-wide">
                  {selectedJob?.status || (submitting ? 'starting' : 'ready')}
                </span>
              </div>

              {selectedJob?.status === 'succeeded' ? (
                <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                  Build erfolgreich. Die Install-Konfiguration kann jetzt im Add-server-Dialog verwendet werden.
                </div>
              ) : isRetryableBuildStatus(selectedJob?.status) ? (
                <div className="flex gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  <div>{selectedJob?.error || 'Build failed.'}</div>
                </div>
              ) : (
                <div className="rounded border border-[var(--hub-line)] bg-[var(--hub-surface)] p-3 text-sm text-[var(--hub-ink-2)]">
                  {submitting ? 'Starting build…' : 'Click Build to start clone, install and compile.'}
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <button type="button" className="hub-btn ghost" onClick={onCancelConfirm}>
                  Clear
                </button>
                <button
                  type="button"
                  className="hub-btn primary"
                  onClick={onConfirm}
                  disabled={submitting || !preview || !destructiveAck}
                >
                  {submitting ? 'Building…' : 'Build'}
                </button>
              </div>
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  <div className="space-y-2">
                    <p className="font-medium">
                      This build will delete the target folder before cloning.
                    </p>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={destructiveAck}
                        onChange={(e) => onDestructiveAckChange?.(e.target.checked)}
                      />
                      <span>
                        I understand that <span className="font-mono">{targetDir}</span> will be removed and recreated.
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <CustomBuildRunLogViewer job={selectedJob} />
            </section>
          </form>

          <section className="hub-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--hub-ink)]">Recent build runs</h3>
              <span className="text-[11px] text-[var(--hub-ink-3)]">{jobs.length}</span>
            </div>
            <div className="space-y-2">
              {jobs.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  className={`rounded border px-3 py-2 ${selectedJobId === job.id ? 'border-[var(--hub-ink)] bg-[var(--hub-surface)]' : 'border-[var(--hub-line)]'}`}
                >
                  <button type="button" className="w-full text-left" onClick={() => onOpenJob(job.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-medium">{job.serverName || job.repositoryUrl}</div>
                      <span className="text-[11px] uppercase tracking-wide text-[var(--hub-ink-3)]">
                        {job.status}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-[var(--hub-ink-3)]">{job.repositoryUrl}</div>
                  </button>
                  <div className="mt-2 flex gap-2">
                    {isRetryableBuildStatus(job.status) && (
                      <button type="button" className="hub-btn ghost" onClick={() => onRetryJob(job.id)}>
                        Retry
                      </button>
                    )}
                    {(job.status === 'succeeded' || isRetryableBuildStatus(job.status) || job.status === 'deinstalled') && (
                      <button type="button" className="hub-btn ghost" onClick={() => onDeinstallJob(job.id)}>
                        Remove build
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
};

export default CustomBuildRunSidepane;
