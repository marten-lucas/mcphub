import React, { useEffect, useMemo, useRef } from 'react';
import { CheckCircle2, Circle, Loader2, TerminalSquare, X, AlertTriangle, Rocket } from 'lucide-react';

type WizardJob = {
  id: string;
  repositoryUrl: string;
  serverName: string;
  version?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'deleting' | 'deinstalled';
  logs?: string[];
  plan?: {
    steps?: Array<{ id: string; title: string; background?: boolean; optional?: boolean }>;
  };
  error?: string;
};

type WizardPlan = {
  repositoryUrl: string;
  serverName: string;
  version?: string;
  engine: string;
  prerequisites?: string[];
  steps?: Array<{ id: string; title: string; command?: string; args?: string[] }>;
  selectedPort?: number;
};

interface DeployWizardSidepaneProps {
  open: boolean;
  repositoryUrl: string;
  serverName: string;
  version: string;
  preview: WizardPlan | null;
  planDraftJson: string;
  submitting: boolean;
  confirmOpen: boolean;
  confirmPlan: WizardPlan | null;
  jobs: WizardJob[];
  selectedJob: WizardJob | null;
  selectedJobId: string | null;
  onClose: () => void;
  onRepositoryChange: (value: string) => void;
  onServerNameChange: (value: string) => void;
  onVersionChange: (value: string) => void;
  onPlanDraftJsonChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  onOpenJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onDeinstallJob: (jobId: string) => void;
}

const stageItems = [
  { id: 'source', label: 'Source' },
  { id: 'detect', label: 'Detect' },
  { id: 'plan', label: 'Build plan' },
  { id: 'review', label: 'Review' },
  { id: 'console', label: 'Console log' },
  { id: 'result', label: 'Build erfolgreich' },
];

const DeployWizardSidepane: React.FC<DeployWizardSidepaneProps> = ({
  open,
  repositoryUrl,
  serverName,
  version,
  preview,
  planDraftJson,
  submitting,
  confirmOpen,
  confirmPlan,
  jobs,
  selectedJob,
  selectedJobId,
  onClose,
  onRepositoryChange,
  onServerNameChange,
  onVersionChange,
  onPlanDraftJsonChange,
  onSubmit,
  onConfirm,
  onCancelConfirm,
  onOpenJob,
  onRetryJob,
  onDeinstallJob,
}) => {
  const logRef = useRef<HTMLPreElement | null>(null);

  const currentStageIndex = useMemo(() => {
    if (selectedJob?.status === 'succeeded') return 5;
    if (selectedJob?.status === 'failed') return 4;
    if (selectedJob) return 4;
    if (confirmOpen) return 3;
    if (preview) return 2;
    return 0;
  }, [confirmOpen, preview, selectedJob]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [selectedJob?.logs?.length, selectedJob?.status]);

  if (!open) return null;

  const hasActiveJob = Boolean(selectedJob);
  const consoleLines = selectedJob?.logs?.length ? selectedJob.logs : ['No log output yet.'];

  const renderStage = (index: number, label: string) => {
    const completed = index < currentStageIndex;
    const active = index === currentStageIndex;
    return (
      <div key={label} className="flex items-center gap-2 min-w-0">
        {completed ? (
          <CheckCircle2 size={14} className="text-green-600" />
        ) : active ? (
          <Loader2 size={14} className="animate-spin text-[var(--hub-ink)]" />
        ) : (
          <Circle size={14} className="text-[var(--hub-ink-3)]" />
        )}
        <span className={`text-[12px] truncate ${active ? 'font-medium text-[var(--hub-ink)]' : 'text-[var(--hub-ink-3)]'}`}>
          {label}
        </span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="Close deploy wizard"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[1180px] bg-[var(--hub-bg)] shadow-2xl border-l border-[var(--hub-line)] flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-[var(--hub-line)]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] bg-[var(--hub-surface)] border border-[var(--hub-line)]">
                <Rocket size={12} />
                Deploy
              </span>
              <span className="text-[11px] text-[var(--hub-ink-3)]">Wizard ends with Build erfolgreich</span>
            </div>
            <h2 className="text-lg font-semibold text-[var(--hub-ink)]">Deploy custom repo</h2>
            <p className="text-sm text-[var(--hub-ink-3)] truncate max-w-[720px]">
              {repositoryUrl || 'Repository URL'}
            </p>
          </div>
          <button type="button" className="hub-icon-btn sm" onClick={onClose}>
            <X size={13} />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-[var(--hub-line)]">
          <div className="grid gap-2 md:grid-cols-6">{stageItems.map((stage, index) => renderStage(index, stage.label))}</div>
        </div>

        <div className="flex-1 overflow-hidden grid lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
          <div className="overflow-y-auto px-6 py-5 border-r border-[var(--hub-line)]">
            {!hasActiveJob ? (
              <form onSubmit={onSubmit} className="space-y-4">
                <section className="hub-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-[var(--hub-ink)]">1. Source</h3>
                    <span className="text-[11px] text-[var(--hub-ink-3)]">Clone the repo first</span>
                  </div>
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
                  <div className="grid gap-4 md:grid-cols-2 mt-4">
                    <label className="block">
                      <span className="text-sm font-medium text-[var(--hub-ink-2)]">Build name</span>
                      <input
                        className="hub-input mt-1 w-full"
                        value={serverName}
                        onChange={(e) => onServerNameChange(e.target.value)}
                        placeholder="authentik-mcp"
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
                </section>

                {preview && (
                  <section className="hub-card p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-[var(--hub-ink)]">2. Detect & plan</h3>
                      <span className="text-[11px] text-[var(--hub-ink-3)] uppercase tracking-wide">
                        {preview.engine}
                      </span>
                    </div>

                    <div>
                      <div className="text-[12px] text-[var(--hub-ink-3)] mb-1">Steps</div>
                      <ul className="space-y-1.5">
                        {preview.steps?.map((step) => (
                          <li key={step.id} className="flex items-start gap-2 text-sm">
                            <span className="text-[var(--hub-ink-3)]">•</span>
                            <span>{step.title}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

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
                )}

                {!confirmOpen ? (
                  <section className="hub-card p-4">
                    <h3 className="text-sm font-semibold text-[var(--hub-ink)] mb-2">3. Review</h3>
                    <p className="text-sm text-[var(--hub-ink-3)]">
                      Confirm the repository, check the generated plan, then start the deployment.
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="text-[12px] text-[var(--hub-ink-3)]">
                        The wizard stops at <span className="font-medium text-[var(--hub-ink)]">Build erfolgreich</span>.
                      </div>
                      <button type="submit" className="hub-btn primary" disabled={submitting}>
                        {submitting ? 'Preparing…' : 'Deploy'}
                      </button>
                    </div>
                  </section>
                ) : confirmPlan ? (
                  <section className="hub-card p-4">
                    <h3 className="text-sm font-semibold text-[var(--hub-ink)] mb-2">4. Confirm</h3>
                    <div className="text-sm text-[var(--hub-ink-2)] space-y-1">
                      <div>Repository: {confirmPlan.repositoryUrl}</div>
                      <div>Engine: {confirmPlan.engine}</div>
                      <div>Steps: {confirmPlan.steps?.length || 0}</div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <button type="button" className="hub-btn ghost" onClick={onCancelConfirm} disabled={submitting}>
                        Back
                      </button>
                      <button type="button" className="hub-btn primary" onClick={onConfirm} disabled={submitting}>
                        {submitting ? 'Starting…' : 'Confirm & deploy'}
                      </button>
                    </div>
                  </section>
                ) : null}
              </form>
            ) : (
              <div className="space-y-4">
                <section className="hub-card p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--hub-ink)]">4. Execution</h3>
                      <p className="text-sm text-[var(--hub-ink-3)] truncate">
                        {selectedJob.serverName} {selectedJob.version ? `· ${selectedJob.version}` : ''}
                      </p>
                    </div>
                    <span className="rounded-full px-2 py-1 text-[11px] uppercase tracking-wide bg-[var(--hub-surface)] border border-[var(--hub-line)]">
                      {selectedJob.status}
                    </span>
                  </div>

                  {selectedJob.status === 'succeeded' ? (
                    <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                      Build erfolgreich. The build template is ready for Add server.
                    </div>
                  ) : selectedJob.status === 'failed' ? (
                    <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900 flex gap-2">
                      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                      <div>{selectedJob.error || 'Deployment failed.'}</div>
                    </div>
                  ) : (
                    <div className="rounded border border-[var(--hub-line)] bg-[var(--hub-surface)] p-3 text-sm text-[var(--hub-ink-2)]">
                      The deployment is running in the background.
                    </div>
                  )}
                </section>

              </div>
            )}
          </div>

          <div className="overflow-y-auto px-6 py-5">
            <section className="hub-card p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[var(--hub-ink)]">5. Console log</h3>
                <TerminalSquare size={14} className="text-[var(--hub-ink-3)]" />
              </div>
              <pre
                ref={logRef}
                className="max-h-[34rem] overflow-auto whitespace-pre-wrap rounded border border-[var(--hub-line)] bg-[var(--hub-bg-2)] p-3 text-xs leading-5"
              >
                {consoleLines.join('\n')}
              </pre>
            </section>

            <section className="hub-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[var(--hub-ink)]">Recent deployments</h3>
                <span className="text-[11px] text-[var(--hub-ink-3)]">{jobs.length}</span>
              </div>
              <div className="space-y-2">
                {jobs.slice(0, 5).map((job) => (
                  <div
                    key={job.id}
                    className={`rounded border px-3 py-2 ${selectedJobId === job.id ? 'border-[var(--hub-ink)] bg-[var(--hub-surface)]' : 'border-[var(--hub-line)]'}`}
                  >
                    <button
                      type="button"
                      className="text-left w-full"
                      onClick={() => onOpenJob(job.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium truncate">{job.serverName || job.repositoryUrl}</div>
                        <span className="text-[11px] uppercase tracking-wide text-[var(--hub-ink-3)]">
                          {job.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--hub-ink-3)] truncate">{job.repositoryUrl}</div>
                    </button>
                    <div className="mt-2 flex gap-2">
                      {job.status === 'failed' && (
                        <button type="button" className="hub-btn ghost" onClick={() => onRetryJob(job.id)}>
                          Retry
                        </button>
                      )}
                      {(job.status === 'succeeded' || job.status === 'failed' || job.status === 'deinstalled') && (
                        <button type="button" className="hub-btn ghost" onClick={() => onDeinstallJob(job.id)}>
                          Deinstall
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default DeployWizardSidepane;
