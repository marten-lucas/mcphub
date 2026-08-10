import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Search, AlertCircle, X, ChevronDown } from 'lucide-react';
import {
  MarketServer,
  CloudServer,
  ServerConfig,
  RegistryServerEntry,
  RegistryServerData,
} from '@/types';
import { useMarketData } from '@/hooks/useMarketData';
import { useCloudData } from '@/hooks/useCloudData';
import { useRegistryData } from '@/hooks/useRegistryData';
import { useToast } from '@/contexts/ToastContext';
import { apiGet, apiPost } from '@/utils/fetchInterceptor';
import MarketServerCard from '@/components/MarketServerCard';
import MarketServerDetail from '@/components/MarketServerDetail';
import CloudServerCard from '@/components/CloudServerCard';
import CloudServerDetail from '@/components/CloudServerDetail';
import RegistryServerCard from '@/components/RegistryServerCard';
import RegistryServerDetail from '@/components/RegistryServerDetail';
import MCPRouterApiKeyError from '@/components/MCPRouterApiKeyError';
import Pagination from '@/components/ui/Pagination';
import CursorPagination from '@/components/ui/CursorPagination';

const MarketPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { serverName } = useParams<{ serverName?: string }>();
  const { showToast } = useToast();

  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'cloud';

  const {
    servers: localServers,
    allServers: allLocalServers,
    categories: localCategories,
    loading: localLoading,
    error: localError,
    setError: setLocalError,
    searchServers: searchLocalServers,
    filterByCategory: filterLocalByCategory,
    filterByTag: filterLocalByTag,
    selectedCategory: selectedLocalCategory,
    selectedTag: selectedLocalTag,
    installServer: installLocalServer,
    fetchServerByName: fetchLocalServerByName,
    isServerInstalled,
    currentPage: localCurrentPage,
    totalPages: localTotalPages,
    changePage: changeLocalPage,
    serversPerPage: localServersPerPage,
    changeServersPerPage: changeLocalServersPerPage,
  } = useMarketData();

  const {
    servers: cloudServers,
    allServers: allCloudServers,
    loading: cloudLoading,
    error: cloudError,
    setError: setCloudError,
    fetchServerTools,
    callServerTool,
    currentPage: cloudCurrentPage,
    totalPages: cloudTotalPages,
    changePage: changeCloudPage,
    serversPerPage: cloudServersPerPage,
    changeServersPerPage: changeCloudServersPerPage,
  } = useCloudData();

  const {
    servers: registryServers,
    allServers: allRegistryServers,
    loading: registryLoading,
    error: registryError,
    setError: setRegistryError,
    searchServers: searchRegistryServers,
    clearSearch: clearRegistrySearch,
    fetchServerByName: fetchRegistryServerByName,
    fetchServerVersions: fetchRegistryServerVersions,
    currentPage: registryCurrentPage,
    totalPages: registryTotalPages,
    hasNextPage: registryHasNextPage,
    hasPreviousPage: registryHasPreviousPage,
    changePage: changeRegistryPage,
    goToNextPage: goToRegistryNextPage,
    goToPreviousPage: goToRegistryPreviousPage,
    serversPerPage: registryServersPerPage,
    changeServersPerPage: changeRegistryServersPerPage,
  } = useRegistryData();

  const [selectedServer, setSelectedServer] = useState<MarketServer | null>(null);
  const [selectedCloudServer, setSelectedCloudServer] = useState<CloudServer | null>(null);
  const [selectedRegistryServer, setSelectedRegistryServer] = useState<RegistryServerEntry | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [registrySearchQuery, setRegistrySearchQuery] = useState('');
  const [installing, setInstalling] = useState(false);
  const [sourceInstallOpen, setSourceInstallOpen] = useState(false);
  const [sourceInstallRepo, setSourceInstallRepo] = useState('');
  const [sourceInstallName, setSourceInstallName] = useState('');
  const [sourceInstallVersion, setSourceInstallVersion] = useState('');
  const [sourceInstallPreview, setSourceInstallPreview] = useState<any>(null);
  const [sourceInstallPlanDraft, setSourceInstallPlanDraft] = useState<any>(null);
  const [sourceInstallPlanDraftJson, setSourceInstallPlanDraftJson] = useState('');
  const [sourceInstallSubmitting, setSourceInstallSubmitting] = useState(false);
  const [sourceInstallJobs, setSourceInstallJobs] = useState<any[]>([]);
  const [sourceInstallSelectedJobId, setSourceInstallSelectedJobId] = useState<string | null>(null);
  const [sourceInstallSelectedJob, setSourceInstallSelectedJob] = useState<any>(null);
  const [sourceInstallConfirmOpen, setSourceInstallConfirmOpen] = useState(false);
  const [sourceInstallConfirmPlan, setSourceInstallConfirmPlan] = useState<any>(null);
  const [installedCloudServers, setInstalledCloudServers] = useState<Set<string>>(new Set());
  const [installedRegistryServers, setInstalledRegistryServers] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadServerDetails = async () => {
      if (serverName) {
        if (currentTab === 'cloud') {
          const server = cloudServers.find((s) => s.name === serverName);
          if (server) setSelectedCloudServer(server);
          else navigate('/market?tab=cloud');
        } else if (currentTab === 'registry') {
          const serverEntry = await fetchRegistryServerByName(serverName);
          if (serverEntry) setSelectedRegistryServer(serverEntry);
          else navigate('/market?tab=registry');
        } else {
          const server = await fetchLocalServerByName(serverName);
          if (server) setSelectedServer(server);
          else navigate('/market?tab=local');
        }
      } else {
        setSelectedServer(null);
        setSelectedCloudServer(null);
        setSelectedRegistryServer(null);
      }
    };
    loadServerDetails();
  }, [
    serverName,
    currentTab,
    cloudServers,
    fetchLocalServerByName,
    fetchRegistryServerByName,
    navigate,
  ]);

  const switchTab = (tab: 'local' | 'cloud' | 'registry') => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tab);
    setSearchParams(newParams);
    if (serverName) navigate('/market?' + newParams.toString());
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentTab === 'local') searchLocalServers(searchQuery);
    else if (currentTab === 'registry') searchRegistryServers(registrySearchQuery);
  };

  const handleCategoryClick = (category: string) => {
    if (currentTab === 'local') filterLocalByCategory(category);
  };

  const handleClearFilters = () => {
    if (currentTab === 'local') {
      setSearchQuery('');
      filterLocalByCategory('');
      filterLocalByTag('');
    } else if (currentTab === 'registry') {
      setRegistrySearchQuery('');
      clearRegistrySearch();
    }
  };

  const handleServerClick = (server: MarketServer | CloudServer | RegistryServerEntry) => {
    if (currentTab === 'cloud') {
      const cloudServer = server as CloudServer;
      navigate(`/market/${cloudServer.name}?tab=cloud`);
    } else if (currentTab === 'registry') {
      const registryServer = server as RegistryServerEntry;
      const name = registryServer.server?.name;
      if (name) navigate(`/market/${encodeURIComponent(name)}?tab=registry`);
    } else {
      const marketServer = server as MarketServer;
      navigate(`/market/${marketServer.name}?tab=local`);
    }
  };

  const handleBackToList = () => navigate(`/market?tab=${currentTab}`);

  const openSourceInstallModal = (repo = '', name = '', version = '') => {
    setSourceInstallRepo(repo);
    setSourceInstallName(name);
    setSourceInstallVersion(version);
    setSourceInstallPreview(null);
    setSourceInstallPlanDraft(null);
    setSourceInstallPlanDraftJson('');
    setSourceInstallSubmitting(false);
    setSourceInstallConfirmOpen(false);
    setSourceInstallConfirmPlan(null);
    setSourceInstallOpen(true);
  };

  const handleLocalInstall = async (server: MarketServer, config: ServerConfig) => {
    try {
      setInstalling(true);
      const success = await installLocalServer(server, config);
      if (success) {
        showToast(t('market.installSuccess', { serverName: server.display_name }), 'success');
      }
    } finally {
      setInstalling(false);
    }
  };

  const handleCloudInstall = async (server: CloudServer, config: ServerConfig) => {
    try {
      setInstalling(true);
      const payload = { name: server.name, config };
      const result = await apiPost('/servers', payload);
      if (!result.success) {
        showToast(result?.message || t('server.addError'), 'error');
        return;
      }
      setInstalledCloudServers((prev) => new Set(prev).add(server.name));
      showToast(t('cloud.installSuccess', { name: server.title || server.name }), 'success');
    } catch (error) {
      showToast(
        t('cloud.installError', { error: error instanceof Error ? error.message : String(error) }),
        'error',
      );
    } finally {
      setInstalling(false);
    }
  };

  const loadSourceInstallJobs = useCallback(async () => {
    try {
      const result = await apiGet('/market/source-install/jobs');
      if (result.success && Array.isArray(result.data)) {
        setSourceInstallJobs(result.data);
        if (sourceInstallSelectedJobId) {
          const selected = result.data.find((job: any) => job.id === sourceInstallSelectedJobId);
          if (selected) {
            setSourceInstallSelectedJob(selected);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load source install jobs', error);
    }
  }, [sourceInstallSelectedJobId]);

  useEffect(() => {
    void loadSourceInstallJobs();

    const intervalId = window.setInterval(() => {
      void loadSourceInstallJobs();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [loadSourceInstallJobs]);

  const handleOpenSourceInstallJob = async (jobId: string) => {
    try {
      const result = await apiGet(`/market/source-install/jobs/${jobId}`);
      if (result.success) {
        setSourceInstallSelectedJobId(jobId);
        setSourceInstallSelectedJob(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch source install job', error);
    }
  };

  const handleRetrySourceInstallJob = async (jobId: string) => {
    try {
      const result = await apiPost(`/market/source-install/jobs/${jobId}/retry`);
      if (!result.success) {
        throw new Error(result.message || 'Failed to retry installation');
      }
      showToast('Retry started.', 'success');
      await handleOpenSourceInstallJob(result.data.id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to retry installation', 'error');
    }
  };

  const handleDeinstallSourceInstallJob = async (jobId: string) => {
    try {
      const result = await apiPost(`/market/source-install/jobs/${jobId}/deinstall`);
      if (!result.success) {
        throw new Error(result.message || 'Failed to deinstall installation');
      }
      showToast('Deinstallation started.', 'success');
      await handleOpenSourceInstallJob(result.data.id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to deinstall installation', 'error');
    }
  };

  const handleInstallFromSource = (server: CloudServer | RegistryServerEntry) => {
    let repoUrl = '';
    let serverName = '';

    if ('server' in server) {
      // RegistryServerEntry
      const registryServer = (server as RegistryServerEntry).server;
      if (registryServer?.remotes && registryServer.remotes.length > 0) {
        repoUrl = registryServer.remotes[0].url || '';
      }
      serverName = registryServer?.name || '';
    } else {
      // CloudServer
      const cloudServer = server as CloudServer;
      if (cloudServer.github) {
        repoUrl = cloudServer.github;
      }
      serverName = cloudServer.name || '';
    }

    if (!repoUrl) {
      showToast('Could not find repository URL for this server.', 'error');
      return;
    }

    openSourceInstallModal(repoUrl, serverName);
  };

  const resetSourceInstallModal = useCallback(() => {
    setSourceInstallOpen(false);
    setSourceInstallRepo('');
    setSourceInstallName('');
    setSourceInstallVersion('');
    setSourceInstallPreview(null);
    setSourceInstallPlanDraft(null);
    setSourceInstallPlanDraftJson('');
  }, []);

  const handleSourceInstallSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceInstallRepo.trim()) {
      showToast('Repository URL is required.', 'error');
      return;
    }

    try {
      setSourceInstallSubmitting(true);

      let planDraft = null as any;
      if (sourceInstallPlanDraftJson.trim()) {
        try {
          planDraft = JSON.parse(sourceInstallPlanDraftJson);
        } catch {
          throw new Error('Plan JSON is invalid. Fix the JSON before starting the install.');
        }
      }

      if (planDraft && !Array.isArray(planDraft.steps)) {
        throw new Error('Plan JSON must include a steps array.');
      }

      const previewResult = await apiPost('/market/source-install/preview', {
        repositoryUrl: sourceInstallRepo.trim(),
        serverName: sourceInstallName.trim() || undefined,
        version: sourceInstallVersion.trim() || undefined,
        plan: planDraft ?? undefined,
      });

      if (!previewResult.success) {
        throw new Error(previewResult.message || 'Failed to preview installation plan');
      }

      const nextPlan = planDraft ?? previewResult.data;
      setSourceInstallPreview(previewResult.data);
      setSourceInstallPlanDraft(nextPlan);
      setSourceInstallPlanDraftJson(JSON.stringify(nextPlan, null, 2));

      // Show confirmation dialog instead of starting immediately
      setSourceInstallConfirmPlan(nextPlan);
      setSourceInstallConfirmOpen(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to preview installation', 'error');
    } finally {
      setSourceInstallSubmitting(false);
    }
  };

  const handleSourceInstallConfirm = async () => {
    if (!sourceInstallConfirmPlan || !sourceInstallRepo.trim()) {
      showToast('Installation plan is missing. Please try again.', 'error');
      return;
    }

    try {
      setSourceInstallSubmitting(true);

      const installResult = await apiPost('/market/source-install', {
        repositoryUrl: sourceInstallRepo.trim(),
        serverName: sourceInstallName.trim() || undefined,
        version: sourceInstallVersion.trim() || undefined,
        plan: sourceInstallConfirmPlan,
      });

      if (!installResult.success) {
        throw new Error(installResult.message || 'Failed to start installation');
      }

      setSourceInstallSelectedJobId(installResult.data?.id ?? null);
      setSourceInstallSelectedJob(installResult.data ?? null);
      showToast(`Source install started for ${sourceInstallConfirmPlan.serverName}.`, 'success');
      setSourceInstallConfirmOpen(false);
      setSourceInstallConfirmPlan(null);
      resetSourceInstallModal();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to start source install', 'error');
    } finally {
      setSourceInstallSubmitting(false);
    }
  };

  const handleRegistryInstall = async (server: RegistryServerData, config: ServerConfig) => {
    try {
      setInstalling(true);
      const payload = { name: server.name, config };
      const result = await apiPost('/servers', payload);
      if (!result.success) {
        showToast(result?.message || t('server.addError'), 'error');
        return;
      }
      setInstalledRegistryServers((prev) => new Set(prev).add(server.name));
      showToast(t('registry.installSuccess', { name: server.title || server.name }), 'success');
    } catch (error) {
      showToast(
        t('registry.installError', { error: error instanceof Error ? error.message : String(error) }),
        'error',
      );
    } finally {
      setInstalling(false);
    }
  };

  const handleCallTool = async (
    name: string,
    toolName: string,
    args: Record<string, any>,
  ) => {
    try {
      const result = await callServerTool(name, toolName, args);
      showToast(t('cloud.toolCallSuccess', { toolName }), 'success');
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!isMCPRouterApiKeyError(errorMessage)) {
        showToast(t('cloud.toolCallError', { toolName, error: errorMessage }), 'error');
      }
      throw error;
    }
  };

  const isMCPRouterApiKeyError = (errorMessage: string) =>
    errorMessage === 'MCPROUTER_API_KEY_NOT_CONFIGURED' ||
    errorMessage.toLowerCase().includes('mcprouter api key not configured');

  const handlePageChange = (page: number) => {
    if (currentTab === 'local') changeLocalPage(page);
    else if (currentTab === 'registry') changeRegistryPage(page);
    else changeCloudPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleChangeItemsPerPage = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = parseInt(e.target.value, 10);
    if (currentTab === 'local') changeLocalServersPerPage(v);
    else if (currentTab === 'registry') changeRegistryServersPerPage(v);
    else changeCloudServersPerPage(v);
  };

  if (selectedServer) {
    return (
      <MarketServerDetail
        server={selectedServer}
        onBack={handleBackToList}
        onInstall={handleLocalInstall}
        installing={installing}
        isInstalled={isServerInstalled(selectedServer.name)}
      />
    );
  }

  if (selectedCloudServer) {
    return (
      <CloudServerDetail
        serverName={selectedCloudServer.name}
        onBack={handleBackToList}
        onCallTool={handleCallTool}
        fetchServerTools={fetchServerTools}
        onInstall={handleCloudInstall}
        installing={installing}
        isInstalled={installedCloudServers.has(selectedCloudServer.name)}
      />
    );
  }

  if (selectedRegistryServer) {
    return (
      <RegistryServerDetail
        serverEntry={selectedRegistryServer}
        onBack={handleBackToList}
        onInstall={handleRegistryInstall}
        installing={installing}
        isInstalled={installedRegistryServers.has(selectedRegistryServer.server.name)}
        fetchVersions={fetchRegistryServerVersions}
      />
    );
  }

  const tabs: { id: 'cloud' | 'local' | 'registry'; label: string; sourceLabel: string; sourceUrl: string }[] = [
    { id: 'cloud', label: t('cloud.title'), sourceLabel: 'MCPRouter', sourceUrl: 'https://mcprouter.co' },
    { id: 'local', label: t('market.title'), sourceLabel: 'MCPM', sourceUrl: 'https://mcpm.sh' },
    {
      id: 'registry',
      label: t('registry.title'),
      sourceLabel: t('registry.official'),
      sourceUrl: 'https://registry.modelcontextprotocol.io',
    },
  ];

  const isLocalTab = currentTab === 'local';
  const isRegistryTab = currentTab === 'registry';
  const servers = isLocalTab ? localServers : isRegistryTab ? registryServers : cloudServers;
  const allServers = isLocalTab
    ? allLocalServers
    : isRegistryTab
      ? allRegistryServers
      : allCloudServers;
  const categories = isLocalTab ? localCategories : [];
  const loading = isLocalTab ? localLoading : isRegistryTab ? registryLoading : cloudLoading;
  const error = isLocalTab ? localError : isRegistryTab ? registryError : cloudError;
  const setError = isLocalTab ? setLocalError : isRegistryTab ? setRegistryError : setCloudError;
  const selectedCategory = isLocalTab ? selectedLocalCategory : '';
  const selectedTag = isLocalTab ? selectedLocalTag : '';
  const currentPage = isLocalTab
    ? localCurrentPage
    : isRegistryTab
      ? registryCurrentPage
      : cloudCurrentPage;
  const totalPages = isLocalTab
    ? localTotalPages
    : isRegistryTab
      ? registryTotalPages
      : cloudTotalPages;
  const serversPerPage = isLocalTab
    ? localServersPerPage
    : isRegistryTab
      ? registryServersPerPage
      : cloudServersPerPage;

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="hub-h1">{t('nav.market')}</h1>
          <p className="hub-sub">
            {tabs.map((tab) => tab.label).join(' · ')}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5">
        <div style={{ borderBottom: '1px solid var(--hub-line)' }}>
          <nav className="flex -mb-px gap-1.5">
            {tabs.map((tab) => {
              const active = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  className="py-2 px-3 transition-colors text-[14px]"
                  style={{
                    borderBottom: '2px solid ' + (active ? 'var(--hub-ink)' : 'transparent'),
                    color: active ? 'var(--hub-ink)' : 'var(--hub-ink-3)',
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  {tab.label}
                  <a
                    href={tab.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hub-mono ml-1.5"
                    style={{ fontSize: 11, color: 'var(--hub-ink-3)' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    ({tab.sourceLabel})
                  </a>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {error && (
        <>
          {!isLocalTab && isMCPRouterApiKeyError(error) ? (
            <MCPRouterApiKeyError />
          ) : (
            <div
              className="hub-card flex items-center justify-between gap-3 mb-4"
              style={{
                padding: '10px 14px',
                borderColor: 'oklch(0.85 0.1 25)',
                background: 'oklch(0.97 0.03 25)',
                color: 'oklch(0.4 0.18 25)',
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle size={14} className="flex-shrink-0" />
                <span className="truncate text-[13px]">{error}</span>
              </div>
              <button className="hub-icon-btn sm" onClick={() => setError(null)}>
                <X size={13} />
              </button>
            </div>
          )}
        </>
      )}

      {sourceInstallOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="hub-card w-full max-w-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Install from Git URL</h2>
                <p className="text-sm text-[var(--hub-ink-3)]">
                  Preview and launch source-based MCP server installs from Git repos.
                </p>
              </div>
              <button className="hub-icon-btn sm" onClick={resetSourceInstallModal}>
                <X size={13} />
              </button>
            </div>
            <form onSubmit={handleSourceInstallSubmit} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium">Repository URL</span>
                <input
                  className="hub-input mt-1 w-full"
                  value={sourceInstallRepo}
                  onChange={(e) => setSourceInstallRepo(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  required
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium">Server name</span>
                  <input
                    className="hub-input mt-1 w-full"
                    value={sourceInstallName}
                    onChange={(e) => setSourceInstallName(e.target.value)}
                    placeholder="my-mcp-server"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Version / tag</span>
                  <input
                    className="hub-input mt-1 w-full"
                    value={sourceInstallVersion}
                    onChange={(e) => setSourceInstallVersion(e.target.value)}
                    placeholder="main or v1.2.3"
                  />
                </label>
              </div>
              {sourceInstallPreview && (
                <div className="rounded border border-[var(--hub-line)] bg-[var(--hub-surface)] p-3">
                  <div className="text-sm font-semibold mb-2">Install plan</div>
                  <div className="text-sm text-[var(--hub-ink-3)] mb-2">
                    Engine: <span className="font-medium text-[var(--hub-ink)]">{sourceInstallPreview.engine}</span>
                  </div>
                  <textarea
                    className="hub-input mt-2 min-h-48 w-full font-mono text-xs"
                    value={sourceInstallPlanDraftJson}
                    onChange={(e) => setSourceInstallPlanDraftJson(e.target.value)}
                    spellCheck={false}
                  />
                  <ul className="mt-3 space-y-1 text-sm">
                    {sourceInstallPreview.steps.map((step: any) => (
                      <li key={step.id} className="flex items-start gap-2">
                        <span className="text-[var(--hub-ink-3)]">•</span>
                        <span>{step.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="hub-btn ghost" onClick={resetSourceInstallModal}>
                  Cancel
                </button>
                <button type="submit" className="hub-btn primary" disabled={sourceInstallSubmitting}>
                  {sourceInstallSubmitting ? 'Starting…' : 'Preview & install'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sourceInstallConfirmOpen && sourceInstallConfirmPlan && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="hub-card w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-3">Confirm Installation</h2>
            <div className="space-y-3 mb-6 text-sm">
              <div>
                <span className="text-[var(--hub-ink-3)]">Server name:</span>
                <div className="font-medium">{sourceInstallConfirmPlan.serverName}</div>
              </div>
              <div>
                <span className="text-[var(--hub-ink-3)]">Repository:</span>
                <div className="hub-mono text-[11px] truncate">{sourceInstallConfirmPlan.repositoryUrl}</div>
              </div>
              <div>
                <span className="text-[var(--hub-ink-3)]">Engine:</span>
                <div className="font-medium">{sourceInstallConfirmPlan.engine}</div>
              </div>
              <div>
                <span className="text-[var(--hub-ink-3)]">Installation steps:</span>
                <ul className="mt-1 space-y-1 ml-3">
                  {sourceInstallConfirmPlan.steps.map((step: any) => (
                    <li key={step.id} className="text-[11px] flex items-start gap-1.5">
                      <span className="text-[var(--hub-ink-3)]">•</span>
                      <span>{step.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="bg-[var(--hub-bg-2)] border border-[var(--hub-line)] rounded p-3 mb-4 text-[12px] text-[var(--hub-ink-2)]">
              Installation will be executed in the background. You can monitor progress in the logs below.
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="hub-btn ghost"
                onClick={() => {
                  setSourceInstallConfirmOpen(false);
                  setSourceInstallConfirmPlan(null);
                }}
                disabled={sourceInstallSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="hub-btn primary"
                onClick={handleSourceInstallConfirm}
                disabled={sourceInstallSubmitting}
              >
                {sourceInstallSubmitting ? 'Starting…' : 'Confirm & Start'}
              </button>
            </div>
          </div>
        </div>
      )}

      {sourceInstallJobs.length > 0 && (
        <div className="hub-card p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Source installs</h3>
            <span className="text-[11px]" style={{ color: 'var(--hub-ink-3)' }}>
              Auto-refresh every 5s
            </span>
          </div>
          <div className="space-y-2">
            {sourceInstallJobs.slice(0, 5).map((job) => (
              <div
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--hub-line)] px-3 py-2"
              >
                <button
                  type="button"
                  className="text-left text-sm font-medium"
                  onClick={() => void handleOpenSourceInstallJob(job.id)}
                >
                  {job.serverName || job.repositoryUrl}
                </button>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-[var(--hub-surface)] px-2 py-1 text-[11px] uppercase tracking-wide">
                    {job.status}
                  </span>
                  {job.status === 'failed' && (
                    <button
                      type="button"
                      className="hub-btn ghost"
                      onClick={() => void handleRetrySourceInstallJob(job.id)}
                    >
                      Retry
                    </button>
                  )}
                  {(job.status === 'succeeded' || job.status === 'failed' || job.status === 'deinstalled') && (
                    <button
                      type="button"
                      className="hub-btn ghost"
                      onClick={() => void handleDeinstallSourceInstallJob(job.id)}
                    >
                      Deinstall
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {sourceInstallSelectedJob && (
            <div className="mt-4 rounded border border-[var(--hub-line)] bg-[var(--hub-surface)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">
                  Logs for {sourceInstallSelectedJob.serverName}
                </div>
                <span className="text-[11px] uppercase tracking-wide">{sourceInstallSelectedJob.status}</span>
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">
                {sourceInstallSelectedJob.logs?.join('\n') || 'No logs yet.'}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Search bar */}
      {(isLocalTab || isRegistryTab) && (
        <form onSubmit={handleSearch} className="hub-card flex items-center gap-2 px-3 mb-5" style={{ padding: 6 }}>
          <Search size={16} style={{ color: 'var(--hub-ink-3)', margin: '0 6px 0 6px' }} />
          <input
            type="text"
            value={isRegistryTab ? registrySearchQuery : searchQuery}
            onChange={(e) => {
              if (isRegistryTab) setRegistrySearchQuery(e.target.value);
              else setSearchQuery(e.target.value);
            }}
            placeholder={
              isRegistryTab ? t('registry.searchPlaceholder') : t('market.searchPlaceholder')
            }
            className="flex-1 bg-transparent outline-none"
            style={{ height: 32, fontSize: 14, color: 'var(--hub-ink)' }}
          />
          <button type="submit" className="hub-btn">
            {t('common.search')}
          </button>
          {((isLocalTab && (searchQuery || selectedCategory || selectedTag)) ||
            (isRegistryTab && registrySearchQuery)) && (
            <button type="button" onClick={handleClearFilters} className="hub-btn ghost">
              {t('common.clear')}
            </button>
          )}
        </form>
      )}

      <div className={isLocalTab ? 'grid gap-5' : ''} style={isLocalTab ? { gridTemplateColumns: '180px 1fr' } : undefined}>
        {/* Categories sidebar (local only) */}
        {isLocalTab && (
          <div>
            <h3 className="hub-sect mb-2">{t('market.categories')}</h3>
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => filterLocalByCategory('')}
                className="flex items-center justify-between transition-colors text-[13px]"
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: !selectedCategory ? 'var(--hub-surface)' : 'transparent',
                  color: !selectedCategory ? 'var(--hub-ink)' : 'var(--hub-ink-2)',
                  border: '1px solid ' + (!selectedCategory ? 'var(--hub-line)' : 'transparent'),
                }}
              >
                <span>{t('common.all')}</span>
                <span className="hub-mono" style={{ fontSize: 11, color: 'var(--hub-ink-3)' }}>
                  {allLocalServers.length}
                </span>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleCategoryClick(cat)}
                  className="flex items-center justify-between transition-colors text-[13px]"
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: selectedCategory === cat ? 'var(--hub-surface)' : 'transparent',
                    color: selectedCategory === cat ? 'var(--hub-ink)' : 'var(--hub-ink-2)',
                    border:
                      '1px solid ' + (selectedCategory === cat ? 'var(--hub-line)' : 'transparent'),
                  }}
                >
                  <span className="truncate">{cat}</span>
                </button>
              ))}
              <button
                onClick={() => openSourceInstallModal()}
                className="w-full mt-3 transition-colors text-[13px] font-medium"
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--hub-ink-2)',
                  border: '1px dashed var(--hub-line)',
                  textAlign: 'left',
                }}
              >
                + {t('market.addCustomRepo')}
              </button>
            </div>
          </div>
        )}

        {/* Grid */}
        <div>
          {loading ? (
            <div className="hub-card p-6 text-center" style={{ color: 'var(--hub-ink-3)' }}>
              {t('app.loading')}
            </div>
          ) : servers.length === 0 ? (
            <div className="hub-card p-10 text-center" style={{ color: 'var(--hub-ink-3)' }}>
              {isLocalTab
                ? t('market.noServers')
                : isRegistryTab
                  ? t('registry.noServers')
                  : t('cloud.noServers')}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {servers.map((server, index) =>
                  isLocalTab ? (
                    <MarketServerCard
                      key={index}
                      server={server as MarketServer}
                      onClick={handleServerClick}
                    />
                  ) : isRegistryTab ? (
                    <RegistryServerCard
                      key={index}
                      serverEntry={server as RegistryServerEntry}
                      onClick={handleServerClick}
                      onInstallFromSource={handleInstallFromSource}
                    />
                  ) : (
                    <CloudServerCard
                      key={index}
                      server={server as CloudServer}
                      onClick={handleServerClick}
                      onInstallFromSource={handleInstallFromSource}
                    />
                  ),
                )}
              </div>

              <div
                className="flex items-center mt-4 text-[12px]"
                style={{ color: 'var(--hub-ink-3)' }}
              >
                <div className="flex-[2]">
                  {isLocalTab
                    ? t('market.showing', {
                        from: (currentPage - 1) * serversPerPage + 1,
                        to: Math.min(currentPage * serversPerPage, allServers.length),
                        total: allServers.length,
                      })
                    : isRegistryTab
                      ? t('registry.showing', {
                          from: (currentPage - 1) * serversPerPage + 1,
                          to: (currentPage - 1) * serversPerPage + servers.length,
                          total: allServers.length + (registryHasNextPage ? '+' : ''),
                        })
                      : t('cloud.showing', {
                          from: (currentPage - 1) * serversPerPage + 1,
                          to: Math.min(currentPage * serversPerPage, allServers.length),
                          total: allServers.length,
                        })}
                </div>
                <div className="flex-[4] flex justify-center">
                  {isRegistryTab ? (
                    <CursorPagination
                      currentPage={currentPage}
                      hasNextPage={registryHasNextPage}
                      hasPreviousPage={registryHasPreviousPage}
                      onNextPage={goToRegistryNextPage}
                      onPreviousPage={goToRegistryPreviousPage}
                    />
                  ) : (
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={handlePageChange}
                    />
                  )}
                </div>
                <div className="flex-[2] flex items-center justify-end gap-2">
                  <label htmlFor="perPage">
                    {isLocalTab
                      ? t('market.perPage')
                      : isRegistryTab
                        ? t('registry.perPage')
                        : t('cloud.perPage')}
                    :
                  </label>
                  <div className="relative">
                    <select
                      id="perPage"
                      value={serversPerPage}
                      onChange={handleChangeItemsPerPage}
                      className="hub-input pr-7"
                      style={{ height: 26, width: 70, padding: '0 6px', fontSize: 12 }}
                    >
                      <option value="6">6</option>
                      <option value="9">9</option>
                      <option value="12">12</option>
                      <option value="24">24</option>
                    </select>
                    <ChevronDown
                      size={11}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'var(--hub-ink-3)' }}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketPage;
