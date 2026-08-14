import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import CustomBuildRunSidepane from '@/components/custom/CustomBuildRunSidepane';
import MCPRouterApiKeyError from '@/components/MCPRouterApiKeyError';
import AddCustomRepoModal from '@/components/AddCustomRepoModal';
import Pagination from '@/components/ui/Pagination';
import CursorPagination from '@/components/ui/CursorPagination';
import { BuildRunFilters, useCustomBuildRuns } from '@/hooks/useCustomBuildRuns';

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
    fetchMarketServers: fetchLocalMarketServers,
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
  const [deployBuildOpen, setDeployBuildOpen] = useState(false);
  const [deployBuildRepo, setDeployBuildRepo] = useState('');
  const [deployBuildName, setDeployBuildName] = useState('');
  const [deployBuildVersion, setDeployBuildVersion] = useState('');
  const [deployBuildSubdir, setDeployBuildSubdir] = useState('');
  const [deployBuildTargetDir, setDeployBuildTargetDir] = useState('');
  const [deployBuildTargetDirTouched, setDeployBuildTargetDirTouched] = useState(false);
  const [deployBuildPreview, setDeployBuildPreview] = useState<any>(null);
  const [deployBuildPlanDraftJson, setDeployBuildPlanDraftJson] = useState('');
  const [deployBuildSubmitting, setDeployBuildSubmitting] = useState(false);
  const [deployBuildConfirmOpen, setDeployBuildConfirmOpen] = useState(false);
  const [deployBuildConfirmPlan, setDeployBuildConfirmPlan] = useState<any>(null);
  const [deployBuildDeleteAck, setDeployBuildDeleteAck] = useState(false);

  const isCustomMarketServer = (server: MarketServer) =>
    (server.categories || []).some((category) => category.toLowerCase() === 'custom') ||
    Boolean(server.repository?.url);

  const normalizeRepoUrl = (repositoryUrl: string): string => {
    return repositoryUrl
      .trim()
      .replace(/^git@/, '')
      .replace(/^ssh:\/\//, 'https://')
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '');
  };

  const selectedBuildRunFilters = useMemo<BuildRunFilters | undefined>(() => {
    if (
      currentTab !== 'local'
      || !selectedServer
      || !isCustomMarketServer(selectedServer)
      || !selectedServer.repository?.url
    ) {
      return undefined;
    }

    return {
      serverName: selectedServer.name,
      repositoryUrl: selectedServer.repository.url,
      subdir: selectedServer.repository.subdir,
    };
  }, [currentTab, selectedServer]);

  const {
    jobs: deployBuildJobs,
    selectedJobId: deployBuildSelectedJobId,
    selectedJob: deployBuildSelectedJob,
    setSelectedJobId: setDeployBuildSelectedJobId,
    setSelectedJob: setDeployBuildSelectedJob,
    openJob: openBuildJob,
    retryJob: retryBuildJob,
    deinstallJob: deinstallBuildJob,
    reloadJob: reloadBuildJob,
  } = useCustomBuildRuns(selectedBuildRunFilters);
  const [installedCloudServers, setInstalledCloudServers] = useState<Set<string>>(new Set());
  const [installedRegistryServers, setInstalledRegistryServers] = useState<Set<string>>(new Set());
  const [addCustomRepoModalOpen, setAddCustomRepoModalOpen] = useState(false);
  const [editingCustomServer, setEditingCustomServer] = useState<MarketServer | null>(null);

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

  const handleBackToList = () => {
    setAddCustomRepoModalOpen(false);
    navigate(`/market?tab=${currentTab}`);
  };

  const deriveDeployBuildDefaults = (repoUrl: string) => {
    const trimmed = repoUrl.trim();
    if (!trimmed) {
      return { serverName: '', version: '' };
    }

    const normalizedUrl = trimmed.replace(/^git@/, '').replace(/^ssh:\/\//, 'https://');
    const explicitRefMatch = trimmed.match(/[?&]ref=([^&#]+)/i);
    const pathRefMatch = trimmed.match(/\/(?:tree|blob|releases\/tag|archive\/refs\/tags|archive)\/([^/?#]+)/i);
    const versionFromUrl = explicitRefMatch?.[1] || pathRefMatch?.[1] || '';

    let host = '';
    let path = '';

    try {
      const parsedUrl = new URL(normalizedUrl);
      host = parsedUrl.hostname.toLowerCase();
      path = parsedUrl.pathname.replace(/\/+$/, '');
    } catch {
      const scpLikeMatch = trimmed.match(/^(?:[^@]+@)?([^:]+):([^/]+)\/([^/]+?)(?:\.git)?(?:\/)?$/i);
      if (scpLikeMatch) {
        host = scpLikeMatch[1].toLowerCase();
        path = `/${scpLikeMatch[2]}/${scpLikeMatch[3]}`;
      }
    }

    if (!host || !path) {
      return { serverName: '', version: '' };
    }

    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) {
      return { serverName: '', version: '' };
    }

    const repoSlug = segments[1].replace(/\.git$/i, '');
    const serverName = repoSlug
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[_\s]+/g, '-')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    return {
      serverName,
      version: decodeURIComponent(versionFromUrl).replace(/^refs\/heads\//i, '').replace(/^refs\/tags\//i, ''),
    };
  };

  const deriveDeployBuildTargetDir = (server: string) => {
    const normalizedName = server.trim() || 'deployment';
    return `/var/lib/mcphub/deploy-builds/${normalizedName}`;
  };

  const parentDir = (targetDir: string) => {
    const normalized = targetDir.replace(/[\\/]+$/, '');
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash > 0 ? normalized.slice(0, lastSlash) : normalized;
  };

  const applyTargetDirToPlan = (plan: any, targetDir: string) => {
    const resolvedTargetDir = targetDir.trim();
    if (!resolvedTargetDir) {
      return plan;
    }

    const resolvedInstallDir = resolvedTargetDir.replace(/[\\/]+$/, '');
    const resolvedInstallRoot = parentDir(resolvedInstallDir);
    const normalizedPlanSubdir = typeof plan?.subdir === 'string'
      ? plan.subdir.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
      : (typeof deployBuildSubdir === 'string' ? deployBuildSubdir.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '');
    const resolvedWorkDir = normalizedPlanSubdir ? `${resolvedInstallDir}/${normalizedPlanSubdir}` : resolvedInstallDir;

    return {
      ...plan,
      subdir: normalizedPlanSubdir || undefined,
      installRoot: resolvedInstallRoot,
      installDir: resolvedInstallDir,
      steps: Array.isArray(plan.steps)
        ? plan.steps.map((step: any) => {
            if (!step || typeof step !== 'object') return step;

            const nextStep = { ...step };
            if (nextStep.id === 'clone' && Array.isArray(nextStep.args) && nextStep.args.length > 0) {
              nextStep.args = [...nextStep.args];
              nextStep.args[nextStep.args.length - 1] = resolvedInstallDir;
              nextStep.cwd = resolvedInstallRoot;
            } else if (typeof nextStep.cwd === 'string') {
              const normalizedCwd = nextStep.cwd.replace(/[\\/]+$/, '');
              if (normalizedCwd === plan.installRoot || normalizedCwd === plan.installDir || normalizedCwd === (plan.subdir ? `${plan.installDir}/${plan.subdir}` : plan.installDir)) {
                nextStep.cwd = normalizedPlanSubdir ? resolvedWorkDir : resolvedInstallDir;
              }
            }

            return nextStep;
          })
        : plan.steps,
    };
  };

  const openDeployBuildModal = (repo = '', name = '', version = '', subdir = '') => {
    const derivedDefaults = deriveDeployBuildDefaults(repo);
    const resolvedName = name || derivedDefaults.serverName;
    const resolvedVersion = version || derivedDefaults.version;

    setDeployBuildRepo(repo);
    setDeployBuildName(resolvedName);
    setDeployBuildVersion(resolvedVersion);
    setDeployBuildSubdir(subdir);
    setDeployBuildTargetDir(deriveDeployBuildTargetDir(resolvedName || derivedDefaults.serverName));
    setDeployBuildTargetDirTouched(false);
    setDeployBuildPreview(null);
    setDeployBuildPlanDraftJson('');
    setDeployBuildSubmitting(false);
    setDeployBuildSelectedJobId(null);
    setDeployBuildSelectedJob(null);
    setDeployBuildConfirmOpen(false);
    setDeployBuildConfirmPlan(null);
    setDeployBuildDeleteAck(false);
    setDeployBuildOpen(true);
  };

  const handleOpenAddCustomRepoModal = useCallback(() => {
    setDeployBuildOpen(false);
    setDeployBuildConfirmOpen(false);
    setDeployBuildConfirmPlan(null);
    setEditingCustomServer(null);
    setAddCustomRepoModalOpen(true);
  }, []);

  const handleEditCustomRepo = useCallback((server: MarketServer) => {
    setDeployBuildOpen(false);
    setDeployBuildConfirmOpen(false);
    setDeployBuildConfirmPlan(null);
    setEditingCustomServer(server);
    setAddCustomRepoModalOpen(true);
  }, []);

  const handleCloseAddCustomRepoModal = useCallback(() => {
    setAddCustomRepoModalOpen(false);
    setEditingCustomServer(null);
  }, []);

  const handleCustomRepoModalSuccess = useCallback(
    (serverName: string, _mode: 'add' | 'edit') => {
      handleCloseAddCustomRepoModal();
      if (currentTab === 'local') {
        void fetchLocalMarketServers();
        void filterLocalByCategory(selectedLocalCategory || '');
        navigate(`/market/${encodeURIComponent(serverName)}?tab=local`);
      }
    },
    [
      currentTab,
      fetchLocalMarketServers,
      filterLocalByCategory,
      handleCloseAddCustomRepoModal,
      navigate,
      selectedLocalCategory,
    ],
  );

  const handleDeployBuildRepoChange = (value: string) => {
    setDeployBuildRepo(value);

    if (!value.trim()) {
      setDeployBuildName('');
      setDeployBuildVersion('');
      if (!deployBuildTargetDirTouched) {
        setDeployBuildTargetDir(deriveDeployBuildTargetDir('deployment'));
      }
      return;
    }

    const derivedDefaults = deriveDeployBuildDefaults(value);
    setDeployBuildName((prev) => {
      const nextName = prev.trim() ? prev : derivedDefaults.serverName;
      if (!deployBuildTargetDirTouched) {
        setDeployBuildTargetDir(deriveDeployBuildTargetDir(nextName || derivedDefaults.serverName));
      }
      return nextName;
    });
    setDeployBuildVersion((prev) => (prev.trim() ? prev : derivedDefaults.version));
  };

  const handleDeployBuildNameChange = (value: string) => {
    setDeployBuildName(value);
    if (!deployBuildTargetDirTouched) {
      setDeployBuildTargetDir(deriveDeployBuildTargetDir(value));
    }
  };

  const handleDeployBuildTargetDirChange = (value: string) => {
    setDeployBuildTargetDir(value);
    setDeployBuildTargetDirTouched(true);
    setDeployBuildDeleteAck(false);
  };

  const handleLocalInstall = async (
    server: MarketServer,
    payload: { name: string; config: ServerConfig },
  ) => {
    try {
      setInstalling(true);
      const success = await installLocalServer(server, payload);
      if (success) {
        showToast(t('market.installSuccess', { serverName: payload.name || server.display_name }), 'success');
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

  const handleOpenDeployBuildJob = async (jobId: string) => {
    await openBuildJob(jobId);
  };

  const handleRetryDeployBuildJob = async (jobId: string) => {
    try {
      await retryBuildJob(jobId);
      showToast('Build retry started.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to retry build', 'error');
    }
  };

  const handleDeinstallDeployBuildJob = async (jobId: string) => {
    try {
      await deinstallBuildJob(jobId);
      showToast('Build removal started.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to remove build', 'error');
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

    openDeployBuildModal(repoUrl, serverName);
  };

  const resetDeployBuildModal = useCallback(() => {
    setDeployBuildOpen(false);
    setDeployBuildRepo('');
    setDeployBuildName('');
    setDeployBuildVersion('');
    setDeployBuildSubdir('');
    setDeployBuildTargetDir('');
    setDeployBuildTargetDirTouched(false);
    setDeployBuildPreview(null);
    setDeployBuildPlanDraftJson('');
    setDeployBuildSelectedJobId(null);
    setDeployBuildSelectedJob(null);
    setDeployBuildConfirmOpen(false);
    setDeployBuildConfirmPlan(null);
    setDeployBuildDeleteAck(false);
  }, []);

  const handleDeployBuildSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deployBuildRepo.trim()) {
      showToast('Repository URL is required.', 'error');
      return;
    }

    try {
      setDeployBuildSubmitting(true);
      const resolvedTargetDir = deployBuildTargetDir.trim();
      if (!resolvedTargetDir) {
        throw new Error('Target folder is required.');
      }

      let planDraft = null as any;
      if (deployBuildPlanDraftJson.trim()) {
        try {
          planDraft = JSON.parse(deployBuildPlanDraftJson);
        } catch {
          throw new Error('Plan JSON is invalid. Fix the JSON before starting the install.');
        }
      }

      if (planDraft && !Array.isArray(planDraft.steps)) {
        throw new Error('Plan JSON must include a steps array.');
      }

      const previewResult = await apiPost('/market/build-runs/preview', {
        repositoryUrl: deployBuildRepo.trim(),
        serverName: deployBuildName.trim() || undefined,
        version: deployBuildVersion.trim() || undefined,
        subdir: deployBuildSubdir.trim() || undefined,
        plan: planDraft ?? undefined,
      });

      if (!previewResult.success) {
        throw new Error(previewResult.message || 'Failed to preview installation plan');
      }

      const basePlan = planDraft ?? previewResult.data;
      const nextPlan = applyTargetDirToPlan(basePlan, resolvedTargetDir);
      setDeployBuildPreview(applyTargetDirToPlan(previewResult.data, resolvedTargetDir));
      setDeployBuildPlanDraftJson(JSON.stringify(nextPlan, null, 2));

      // Show confirmation dialog instead of starting immediately
      setDeployBuildConfirmPlan(nextPlan);
      setDeployBuildConfirmOpen(true);
      setDeployBuildDeleteAck(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to preview installation', 'error');
    } finally {
      setDeployBuildSubmitting(false);
    }
  };

  const handleDeployBuildConfirm = async () => {
    if (!deployBuildConfirmPlan || !deployBuildRepo.trim()) {
      showToast('Installation plan is missing. Please try again.', 'error');
      return;
    }

    try {
      setDeployBuildSubmitting(true);

      const planForDeploy = applyTargetDirToPlan(deployBuildConfirmPlan, deployBuildTargetDir.trim());
      const installResult = await apiPost('/market/build-runs', {
        repositoryUrl: deployBuildRepo.trim(),
        serverName: deployBuildName.trim() || undefined,
        version: deployBuildVersion.trim() || undefined,
        subdir: deployBuildSubdir.trim() || undefined,
        plan: planForDeploy,
      });

      if (!installResult.success) {
        throw new Error(installResult.message || 'Failed to start installation');
      }

      setDeployBuildSelectedJobId(installResult.data?.id ?? null);
      setDeployBuildSelectedJob(installResult.data ?? null);
      if (installResult.data?.id) {
        await reloadBuildJob(installResult.data.id);
      }
      showToast(`Build started for ${deployBuildConfirmPlan.serverName}.`, 'success');
      setDeployBuildConfirmOpen(false);
      setDeployBuildConfirmPlan(null);
      setDeployBuildDeleteAck(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to start build', 'error');
    } finally {
      setDeployBuildSubmitting(false);
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

  const deployWizard = (
    <CustomBuildRunSidepane
      open={deployBuildOpen}
      repositoryUrl={deployBuildRepo}
      serverName={deployBuildName}
      version={deployBuildVersion}
      subdir={deployBuildSubdir}
      targetDir={deployBuildTargetDir}
      preview={deployBuildPreview}
      planDraftJson={deployBuildPlanDraftJson}
      submitting={deployBuildSubmitting}
      confirmOpen={deployBuildConfirmOpen}
      confirmPlan={deployBuildConfirmPlan}
      destructiveAck={deployBuildDeleteAck}
      jobs={deployBuildJobs}
      selectedJob={deployBuildSelectedJob}
      selectedJobId={deployBuildSelectedJobId}
      onClose={resetDeployBuildModal}
      onRepositoryChange={handleDeployBuildRepoChange}
      onServerNameChange={handleDeployBuildNameChange}
      onVersionChange={setDeployBuildVersion}
      onSubdirChange={setDeployBuildSubdir}
      onTargetDirChange={handleDeployBuildTargetDirChange}
      onPlanDraftJsonChange={setDeployBuildPlanDraftJson}
      onSubmit={handleDeployBuildSubmit}
      onConfirm={handleDeployBuildConfirm}
      onDestructiveAckChange={setDeployBuildDeleteAck}
      onCancelConfirm={() => {
        setDeployBuildConfirmOpen(false);
        setDeployBuildConfirmPlan(null);
        setDeployBuildDeleteAck(false);
      }}
      onOpenJob={(jobId) => void handleOpenDeployBuildJob(jobId)}
      onRetryJob={(jobId) => void handleRetryDeployBuildJob(jobId)}
      onDeinstallJob={(jobId) => void handleDeinstallDeployBuildJob(jobId)}
    />
  );

  const addCustomRepoOverlay = (
    <AddCustomRepoModal
      isOpen={addCustomRepoModalOpen}
      onClose={handleCloseAddCustomRepoModal}
      onSuccess={handleCustomRepoModalSuccess}
      mode={editingCustomServer ? 'edit' : 'add'}
      initialServer={editingCustomServer}
    />
  );

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

  const orderedCategories = (() => {
    const categories = (localCategories || []).filter(Boolean);
    const officialCategories = categories.filter((category) => category.toLowerCase() !== 'custom');
    const customCategories = categories.filter((category) => category.toLowerCase() === 'custom');
    const ordered = [...officialCategories];

    if (customCategories.length > 0) {
      if (officialCategories.length > 0) {
        ordered.push('separator');
      }
      ordered.push(...customCategories);
    }

    return ordered;
  })();

  const localVariants =
    currentTab === 'local' && selectedServer?.repository?.url
      ? allLocalServers
          .filter((entry) =>
            isCustomMarketServer(entry)
            && Boolean(entry.repository?.url)
            && normalizeRepoUrl(entry.repository.url) === normalizeRepoUrl(selectedServer.repository!.url)
            && entry.name !== selectedServer.name,
          )
          .map((entry) => ({
            name: entry.name,
            displayName: entry.display_name || entry.name,
            subdir: entry.repository?.subdir,
            version: entry.version,
          }))
      : [];

  const hasSuccessfulBuildForSelectedServer = deployBuildJobs.some(
    (job) => job.status === 'succeeded',
  );

  const latestSuccessfulBuildForSelectedServer = deployBuildJobs.find(
    (job) => job.status === 'succeeded',
  );

  const installConfigFromLatestBuild = latestSuccessfulBuildForSelectedServer
    ? (() => {
        const detectedParts = latestSuccessfulBuildForSelectedServer.detectedStartCommand
          ? latestSuccessfulBuildForSelectedServer.detectedStartCommand.trim().split(/\s+/)
          : [];
        const command = detectedParts[0] || (latestSuccessfulBuildForSelectedServer.engine === 'python' ? 'python3' : 'node');
        const args = detectedParts.length > 1
          ? detectedParts.slice(1)
          : latestSuccessfulBuildForSelectedServer.engine === 'python'
            ? ['main.py']
            : ['index.js'];
        const cwd = latestSuccessfulBuildForSelectedServer.subdir
          ? `${latestSuccessfulBuildForSelectedServer.installDir}/${latestSuccessfulBuildForSelectedServer.subdir}`
          : latestSuccessfulBuildForSelectedServer.installDir;

        return {
          type: 'stdio' as const,
          command,
          args,
          cwd,
          env: {},
        };
      })()
    : undefined;

  const showInlineDeploy = Boolean(
    selectedServer && currentTab === 'local' && isCustomMarketServer(selectedServer),
  );

  useEffect(() => {
    if (!showInlineDeploy || !selectedServer) {
      return;
    }
    openDeployBuildModal(
      selectedServer.repository?.url || '',
      selectedServer.name || '',
      selectedServer.version || '',
      selectedServer.repository?.subdir || '',
    );
  }, [showInlineDeploy, selectedServer?.name, selectedServer?.repository?.url, selectedServer?.repository?.subdir, selectedServer?.version]);

  if (selectedServer) {
    return (
      <div className="w-full">
        <MarketServerDetail
          server={selectedServer}
          onBack={handleBackToList}
          onInstall={handleLocalInstall}
          installLabel={showInlineDeploy ? 'Install' : undefined}
          canInstall={!showInlineDeploy || hasSuccessfulBuildForSelectedServer}
          installConfig={showInlineDeploy ? installConfigFromLatestBuild : undefined}
          installing={installing}
          isInstalled={isServerInstalled(selectedServer.name)}
          variants={localVariants}
          onSelectVariant={(variantName) => navigate(`/market/${encodeURIComponent(variantName)}?tab=local`)}
          deploymentSection={
            showInlineDeploy ? (
              <CustomBuildRunSidepane
                open
                embedded
                repositoryUrl={deployBuildRepo}
                serverName={deployBuildName}
                version={deployBuildVersion}
                subdir={deployBuildSubdir}
                targetDir={deployBuildTargetDir}
                preview={deployBuildPreview}
                planDraftJson={deployBuildPlanDraftJson}
                submitting={deployBuildSubmitting}
                confirmOpen={deployBuildConfirmOpen}
                confirmPlan={deployBuildConfirmPlan}
                destructiveAck={deployBuildDeleteAck}
                jobs={deployBuildJobs}
                selectedJob={deployBuildSelectedJob}
                selectedJobId={deployBuildSelectedJobId}
                onRepositoryChange={handleDeployBuildRepoChange}
                onServerNameChange={handleDeployBuildNameChange}
                onVersionChange={setDeployBuildVersion}
                onTargetDirChange={handleDeployBuildTargetDirChange}
                onPlanDraftJsonChange={setDeployBuildPlanDraftJson}
                onSubmit={handleDeployBuildSubmit}
                onConfirm={handleDeployBuildConfirm}
                onDestructiveAckChange={setDeployBuildDeleteAck}
                onCancelConfirm={() => {
                  setDeployBuildConfirmOpen(false);
                  setDeployBuildConfirmPlan(null);
                  setDeployBuildDeleteAck(false);
                }}
                onOpenJob={(jobId) => void handleOpenDeployBuildJob(jobId)}
                onRetryJob={(jobId) => void handleRetryDeployBuildJob(jobId)}
                onDeinstallJob={(jobId) => void handleDeinstallDeployBuildJob(jobId)}
              />
            ) : null
          }
          onDelete={() => {
            setSelectedServer(null);
            void fetchLocalMarketServers();
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set('tab', 'local');
              return next;
            });
          }}
          onEdit={handleEditCustomRepo}
        />
        {addCustomRepoOverlay}
      </div>
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

      {addCustomRepoOverlay}
      {!selectedServer && deployWizard}

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
              {orderedCategories.map((cat) => {
                if (cat === 'separator') {
                  return (
                    <div key="custom-separator" className="my-2 border-t border-[var(--hub-line)]" />
                  );
                }

                return (
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
                );
              })}
              <button
                onClick={handleOpenAddCustomRepoModal}
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
                + add to market
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
