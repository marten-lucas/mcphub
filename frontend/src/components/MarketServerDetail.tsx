import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useToast } from '@/contexts/ToastContext';
import { MarketServer, MarketServerInstallation } from '@/types';
import ServerForm from './ServerForm';
import { detectVariables } from '../utils/variableDetection';
import { apiDelete } from '@/utils/fetchInterceptor';

import { ServerConfig } from '@/types';

interface MarketServerDetailProps {
  server: MarketServer;
  onBack: () => void;
  onInstall: (server: MarketServer, config: ServerConfig) => void;
  installing?: boolean;
  isInstalled?: boolean;
  onDelete?: (serverName: string) => void;
  onEdit?: (server: MarketServer) => void;
  buildTemplateServers?: Array<{
    name: string;
    version?: string;
  }>;
}

const MarketServerDetail: React.FC<MarketServerDetailProps> = ({
  server,
  onBack,
  onInstall,
  installing = false,
  isInstalled = false,
  onDelete,
  onEdit,
  buildTemplateServers = [],
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [modalVisible, setModalVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<any>(null);
  const [detectedVariables, setDetectedVariables] = useState<string[]>([]);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [githubMeta, setGithubMeta] = useState<{ owner?: string; repo?: string; defaultBranch?: string; htmlUrl?: string } | null>(null);
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [readmeError, setReadmeError] = useState<string | null>(null);

  const isCustomServer =
    (server.categories || []).some((category) => category?.toLowerCase() === 'custom') ||
    (server.tags || []).some((tag) => tag?.toLowerCase() === 'custom');

  const parseGitHubRepository = (repositoryUrl: string) => {
    try {
      const normalizedUrl = repositoryUrl.trim().replace(/^git@/, '').replace(/^ssh:\/\//, 'https://');
      const parsedUrl = new URL(normalizedUrl);

      if (!parsedUrl.hostname.toLowerCase().includes('github.com')) {
        return null;
      }

      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
      if (pathSegments.length < 2) {
        return null;
      }

      return {
        owner: pathSegments[0],
        repo: pathSegments[1].replace(/\.git$/i, ''),
      };
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadRepositoryDetails = async () => {
      const repositoryUrl = server.repository?.url?.trim();
      const parsedRepository = repositoryUrl ? parseGitHubRepository(repositoryUrl) : null;

      if (!parsedRepository) {
        if (!cancelled) {
          setGithubMeta(null);
          setReadmeContent(null);
          setReadmeLoading(false);
          setReadmeError(null);
        }
        return;
      }

      if (!cancelled) {
        setReadmeLoading(true);
        setReadmeError(null);
      }

      try {
        const metadataResponse = await fetch(
          `https://api.github.com/repos/${parsedRepository.owner}/${parsedRepository.repo}`,
          {
            headers: {
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'mcphub',
            },
          },
        );

        if (!metadataResponse.ok) {
          throw new Error('Repository metadata not available');
        }

        const metadata = await metadataResponse.json();
        const resolvedMeta = {
          owner: metadata.owner?.login || parsedRepository.owner,
          repo: metadata.name || parsedRepository.repo,
          defaultBranch: metadata.default_branch || 'main',
          htmlUrl: metadata.html_url || `https://github.com/${parsedRepository.owner}/${parsedRepository.repo}`,
        };

        if (!cancelled) {
          setGithubMeta(resolvedMeta);
        }

        const readmeCandidates = [
          `https://raw.githubusercontent.com/${parsedRepository.owner}/${parsedRepository.repo}/${resolvedMeta.defaultBranch}/README.md`,
          `https://raw.githubusercontent.com/${parsedRepository.owner}/${parsedRepository.repo}/${resolvedMeta.defaultBranch}/README`,
          `https://raw.githubusercontent.com/${parsedRepository.owner}/${parsedRepository.repo}/${resolvedMeta.defaultBranch}/readme.md`,
          `https://raw.githubusercontent.com/${parsedRepository.owner}/${parsedRepository.repo}/${resolvedMeta.defaultBranch}/readme`,
          `https://raw.githubusercontent.com/${parsedRepository.owner}/${parsedRepository.repo}/${resolvedMeta.defaultBranch}/docs/README.md`,
        ];

        let loadedReadme: string | null = null;

        for (const candidate of readmeCandidates) {
          const readmeResponse = await fetch(candidate);
          if (readmeResponse.ok) {
            loadedReadme = await readmeResponse.text();
            break;
          }
        }

        if (!cancelled) {
          if (loadedReadme) {
            setReadmeContent(loadedReadme);
            setReadmeError(null);
          } else {
            setReadmeContent(null);
            setReadmeError('README not available for this repository.');
          }
        }
      } catch {
        if (!cancelled) {
          setGithubMeta(null);
          setReadmeContent(null);
          setReadmeError('README could not be loaded from GitHub.');
        }
      } finally {
        if (!cancelled) {
          setReadmeLoading(false);
        }
      }
    };

    void loadRepositoryDetails();

    return () => {
      cancelled = true;
    };
  }, [server.repository?.url]);

  // Helper function to determine button state
  const getButtonProps = () => {
    if (isInstalled) {
      return {
        className: 'bg-green-600 cursor-default px-4 py-2 rounded text-sm font-medium text-white',
        disabled: true,
        text: t('server.added', { defaultValue: 'Added' }),
      };
    } else if (installing) {
      return {
        className:
          'bg-gray-400 cursor-not-allowed px-4 py-2 rounded text-sm font-medium text-white',
        disabled: true,
        text: t('server.adding', { defaultValue: 'Adding...' }),
      };
    } else {
      return {
        className:
          'hub-btn primary',
        disabled: false,
        text: t('server.addServer'),
      };
    }
  };

  const toggleModal = () => {
    setModalVisible(!modalVisible);
    setError(null); // Clear any previous errors when toggling modal
    setConfirmationVisible(false);
    setPendingPayload(null);
  };

  const deriveServerIdentifier = (repositoryUrl?: string) => {
    if (!repositoryUrl) {
      return '';
    }

    try {
      const parsedUrl = new URL(repositoryUrl);
      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
      const repoSegment = pathSegments[pathSegments.length - 1]?.replace(/\.(git|zip|tar)$/i, '') || '';

      if (!repoSegment) {
        return '';
      }

      return repoSegment
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[_\s]+/g, '-')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
    } catch {
      return '';
    }
  };

  const handleConfirmInstall = async () => {
    if (pendingPayload) {
      await proceedWithInstall(pendingPayload);
      setConfirmationVisible(false);
      setPendingPayload(null);
    }
  };

  const proceedWithInstall = async (payload: any) => {
    try {
      setError(null);
      onInstall(server, payload.config);
      setModalVisible(false);
    } catch (err) {
      console.error('Error installing server:', err);
      setError(t('errors.serverInstall'));
    }
  };

  const handleInstall = () => {
    if (!isInstalled) {
      toggleModal();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!isCustomServer) return;

    const serverIdentifier =
      server.name || deriveServerIdentifier(server.repository?.url) || server.repository?.url || server.display_name || '';

    setDeleting(true);
    try {
      const response = await apiDelete(`/market/custom-servers/${encodeURIComponent(serverIdentifier)}`);
      if (response.success) {
        showToast(`Custom server "${server.display_name || server.name || 'Custom server'}" deleted successfully`, 'success');
        onDelete?.(serverIdentifier);
        onBack();
      } else {
        setError(response.message || 'Failed to delete custom server');
      }
    } catch (err) {
      console.error('Error deleting custom server:', err);
      setError('Failed to delete custom server');
    } finally {
      setDeleting(false);
      setDeleteConfirmVisible(false);
    }
  };

  // Get the preferred installation configuration based on priority:
  // npm > uvx > default
  const getPreferredInstallation = (): MarketServerInstallation | undefined => {
    if (!server.installations) {
      return undefined;
    }

    if (server.installations.npm) {
      return server.installations.npm;
    } else if (server.installations.uvx) {
      return server.installations.uvx;
    } else if (server.installations.default) {
      return server.installations.default;
    }

    // If none of the preferred types are available, get the first available installation type
    const installTypes = Object.keys(server.installations);
    if (installTypes.length > 0) {
      return server.installations[installTypes[0]];
    }

    return undefined;
  };

  const handleSubmit = async (payload: any) => {
    try {
      // Check for variables in the payload
      const variables = detectVariables(payload);

      if (variables.length > 0) {
        // Show confirmation dialog
        setDetectedVariables(variables);
        setPendingPayload(payload);
        setConfirmationVisible(true);
      } else {
        // Install directly if no variables found
        await proceedWithInstall(payload);
      }
    } catch (err) {
      console.error('Error processing server installation:', err);
      setError(t('errors.serverInstall'));
    }
  };

  const buttonProps = getButtonProps();
  const preferredInstallation = getPreferredInstallation();
  const orderedCategories = (() => {
    const categories = (server.categories || []).filter(Boolean);
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
  const authorName = githubMeta?.owner || server.author?.name || t('market.unknown');
  const repositoryName = githubMeta?.repo || server.name;
  const readmeForRender =
    readmeContent?.trim().startsWith('```') && readmeContent.trim().endsWith('```')
      ? readmeContent.trim().replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '')
      : readmeContent;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div className="mb-4">
        <button onClick={onBack} className="text-gray-600 hover:text-gray-900 flex items-center">
          <svg
            className="h-5 w-5 mr-1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
          {t('market.backToList')}
        </button>
      </div>

      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center flex-wrap">
            {server.display_name}
            <span className="text-sm font-normal text-gray-500 ml-2">({server.name})</span>
            <span className="text-sm font-normal text-gray-600 ml-4">
              {t('market.author')}: {authorName} • {t('market.license')}: {server.license} •{' '}
              <span className="font-medium text-gray-700">{repositoryName}</span>
              <a
                href={server.repository.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline ml-1"
              >
                {t('market.repository')}
              </a>
            </span>
          </h2>
        </div>

        <div className="flex items-center">
          {server.is_official ? (
            <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 text-sm font-normal px-4 py-2 rounded mr-2 flex items-center label-primary">
              {t('market.official')}
            </span>
          ) : isCustomServer ? (
            <span className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 text-sm font-normal px-4 py-2 rounded mr-2 flex items-center">
              {t('market.custom', { defaultValue: 'Custom' })}
            </span>
          ) : null}
          <button
            onClick={handleInstall}
            disabled={buttonProps.disabled}
            className={buttonProps.className}
          >
            {buttonProps.text}
          </button>
        </div>
      </div>

      <p className="text-gray-700 mb-6">{server.description}</p>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">README</h3>
          {githubMeta && (
            <a
              href={githubMeta.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              View on GitHub
            </a>
          )}
        </div>

        {isCustomServer && (
          <div className="mb-6 rounded border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Build template</h3>
              <span className="text-sm text-gray-500">
                {buildTemplateServers.length} server{buildTemplateServers.length === 1 ? '' : 's'}
              </span>
            </div>
            {buildTemplateServers.length > 0 ? (
              <ul className="space-y-2">
                {buildTemplateServers.map((entry) => (
                  <li
                    key={entry.name}
                    className="flex items-center justify-between gap-3 rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-gray-900">{entry.name}</span>
                    {entry.version ? (
                      <span className="text-xs text-gray-500">v{entry.version}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-600">No servers are using this build template yet.</p>
            )}
          </div>
        )}
        {readmeLoading ? (
          <div className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            Loading README from GitHub...
          </div>
        ) : readmeForRender ? (
          <div className="max-h-[60vh] overflow-auto rounded border border-gray-200 bg-white p-6">
            <article className="max-w-none text-gray-800 leading-7" style={{ overflowWrap: 'anywhere' }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 className="text-4xl font-semibold mb-5 pb-2 border-b border-gray-200">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-3xl font-semibold mt-8 mb-4 pb-2 border-b border-gray-200">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-2xl font-semibold mt-7 mb-3">{children}</h3>,
                  p: ({ children }) => <p className="mb-4">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>,
                  li: ({ children }) => <li>{children}</li>,
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {children}
                    </a>
                  ),
                  code: ({ className, children, ...props }) => {
                    const isInline = !className;
                    if (isInline) {
                      return (
                        <code className="px-1 py-0.5 rounded bg-gray-100 text-[0.9em]" {...props}>
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code className={`${className} text-sm`} {...props}>
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => (
                    <pre className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-4 overflow-x-auto">{children}</pre>
                  ),
                }}
              >
                {readmeForRender}
              </ReactMarkdown>
            </article>
          </div>
        ) : (
          <div className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            {readmeError || 'No README was found for this repository.'}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-between items-center gap-3">
        <div className="flex gap-2">
          {isCustomServer && onEdit && (
            <button
              onClick={() => onEdit(server)}
              className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded border border-blue-200"
            >
              Edit Custom Repo
            </button>
          )}
          {isCustomServer && (
            <button
              onClick={() => setDeleteConfirmVisible(true)}
              disabled={deleting}
              className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded border border-red-200 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete Custom Repo'}
            </button>
          )}
        </div>
        <button
          onClick={handleInstall}
          disabled={buttonProps.disabled}
          className={buttonProps.className}
        >
          {buttonProps.text}
        </button>
      </div>

      {modalVisible && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <ServerForm
            onSubmit={handleSubmit}
            onCancel={toggleModal}
            modalTitle={`${t('server.addServer')}: ${server.display_name}`}
            formError={error}
            initialData={{
              name: server.name,
              status: 'disconnected',
              config: preferredInstallation
                ? {
                    command: preferredInstallation.command || '',
                    args: preferredInstallation.args || [],
                    env: preferredInstallation.env || {},
                  }
                : undefined,
            }}
          />
        </div>
      )}

      {confirmationVisible && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="hub-card p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {t('server.confirmVariables')}
            </h3>
            <p className="text-gray-600 mb-4">{t('server.variablesDetected')}</p>
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h4 className="text-sm font-medium text-yellow-800">
                    {t('server.detectedVariables')}:
                  </h4>
                  <ul className="mt-1 text-sm text-yellow-700">
                    {detectedVariables.map((variable, index) => (
                      <li key={index} className="font-mono">
                        ${`{${variable}}`}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <p className="text-gray-600 text-sm mb-6">{t('server.confirmVariablesMessage')}</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setConfirmationVisible(false);
                  setPendingPayload(null);
                }}
                className="hub-btn"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmInstall}
                className="hub-btn primary"
              >
                {t('server.confirmAndAdd', { defaultValue: 'Confirm and Add' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmVisible && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="hub-card p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Delete Custom Repository
            </h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete the custom repository "{server.display_name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirmVisible(false)}
                className="hub-btn"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded font-medium hover:bg-red-700 disabled:opacity-50"
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketServerDetail;
