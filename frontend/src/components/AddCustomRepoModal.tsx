import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { apiPost, apiPut } from '@/utils/fetchInterceptor';

interface AddCustomRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (serverName: string, mode: 'add' | 'edit') => void;
  mode?: 'add' | 'edit';
  initialServer?: {
    name: string;
    repository?: {
      url?: string;
      subdir?: string;
    };
    tags?: string[];
    version?: string;
  } | null;
}

interface CustomServerRegistrationResult {
  createdServers?: Array<{ name: string }>;
  primaryServerName?: string;
  autoDetectedVariants?: boolean;
  newlyCreatedCount?: number;
}

const AddCustomRepoModal: React.FC<AddCustomRepoModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  mode = 'add',
  initialServer,
}) => {
  const { showToast } = useToast();

  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [serverName, setServerName] = useState('');
  const [subdirInput, setSubdirInput] = useState('');
  const [versionInput, setVersionInput] = useState('latest');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setRepositoryUrl('');
    setServerName('');
    setSubdirInput('');
    setVersionInput('latest');
    setError(null);
  };

  const deriveServerNameFromRepositoryUrl = (value: string): string => {
    try {
      const parsedUrl = new URL(value);
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

  const deriveVersionFromRepositoryUrl = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'latest';
    }

    const explicitRefMatch = trimmed.match(/[?&]ref=([^&#]+)/i);
    const pathRefMatch = trimmed.match(/\/(?:tree|blob|releases\/tag|archive\/refs\/tags|archive)\/([^/?#]+)/i);
    const versionFromUrl = explicitRefMatch?.[1] || pathRefMatch?.[1] || '';

    if (!versionFromUrl) {
      return 'latest';
    }

    return decodeURIComponent(versionFromUrl)
      .replace(/^refs\/heads\//i, '')
      .replace(/^refs\/tags\//i, '');
  };

  const isSupportedRepositoryUrl = (value: string): boolean => {
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }

    try {
      const parsedUrl = new URL(trimmed);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'ssh:') {
        return true;
      }
    } catch {
      // fall through to scp-style URL check
    }

    return /^(?:[^@\s]+@)?[^:\s]+:[^/\s]+\/[^/\s]+(?:\.git)?(?:\/)?$/i.test(trimmed);
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (mode === 'edit' && initialServer) {
      const repoUrl = initialServer.repository?.url || '';
      const derivedVersion = initialServer.version || deriveVersionFromRepositoryUrl(repoUrl);
      setRepositoryUrl(repoUrl);
      setServerName(initialServer.name || '');
      setSubdirInput(initialServer.repository?.subdir || '');
      setVersionInput(derivedVersion || 'latest');
      setError(null);
      return;
    }

    resetForm();
  }, [isOpen, mode, initialServer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!repositoryUrl.trim() || !serverName.trim()) {
        setError('Repository URL and server name are required');
        return;
      }

      const resolvedVersion = versionInput.trim() || 'latest';
      const resolvedSubdir = subdirInput.trim();

      if (!isSupportedRepositoryUrl(repositoryUrl)) {
        setError('Invalid repository URL format');
        return;
      }

      if (mode === 'edit' && initialServer) {
        const result = await apiPut(`/market/custom-servers/${encodeURIComponent(initialServer.name)}`, {
          newServerName: serverName.trim(),
          repositoryUrl,
          version: resolvedVersion,
          subdir: resolvedSubdir || undefined,
        });

        if (result.success) {
          showToast(`Custom server "${serverName}" updated successfully`, 'success');
          resetForm();
          onClose();
          onSuccess?.(serverName.trim(), 'edit');
        } else {
          setError(result.message || 'Failed to update custom server');
        }
      } else {
        const result = await apiPost('/market/custom-servers', {
          serverName: serverName.trim(),
          repositoryUrl,
          version: resolvedVersion,
          subdir: resolvedSubdir || undefined,
        });

        if (result.success) {
          const registrationResult = (result.data ?? null) as CustomServerRegistrationResult | null;
          const createdServers = Array.isArray(registrationResult?.createdServers)
            ? registrationResult.createdServers
            : [];
          const primaryServerName = registrationResult?.primaryServerName?.trim() || serverName.trim();
          const createdCount = createdServers.length;
          const newlyCreatedCount = typeof registrationResult?.newlyCreatedCount === 'number'
            ? registrationResult.newlyCreatedCount
            : createdCount;

          showToast(
            registrationResult?.autoDetectedVariants && createdCount > 1
              ? newlyCreatedCount > 0
                ? `Registered ${newlyCreatedCount} new custom server variants from "${repositoryUrl}".`
                : `All ${createdCount} custom server variants from "${repositoryUrl}" are already registered.`
              : `Custom server "${primaryServerName}" registered successfully`,
            'success',
          );
          resetForm();
          onClose();
          onSuccess?.(primaryServerName, 'add');
        } else {
          setError(result.message || 'Failed to register custom server');
        }
      }
    } catch (err) {
      setError(mode === 'edit' ? 'Failed to update custom server' : 'Failed to register custom server');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRepositoryUrlChange = (value: string) => {
    setRepositoryUrl(value);

    if (!value.trim()) {
      setServerName('');
      setVersionInput('latest');
      return;
    }

    const derivedServerName = deriveServerNameFromRepositoryUrl(value);
    if (derivedServerName && !serverName.trim()) {
      setServerName(derivedServerName);
    }

    const derivedVersion = deriveVersionFromRepositoryUrl(value);
    if (!versionInput.trim()) {
      setVersionInput(derivedVersion);
    } else if (versionInput === 'latest' && derivedVersion !== 'latest') {
      setVersionInput(derivedVersion);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="hub-card w-full max-w-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">
              {mode === 'edit' ? 'Edit custom repo' : 'Add to market'}
            </h2>
            <p className="text-sm text-[var(--hub-ink-3)]">
              {mode === 'edit'
                ? 'Update the repository registration and version/tag for this custom server.'
                : 'Register a custom repository in the marketplace so it can be installed later.'}
            </p>
          </div>
          <button
            type="button"
            className="hub-icon-btn sm"
            onClick={() => {
              resetForm();
              onClose();
            }}
            disabled={loading}
          >
            <X size={13} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded border border-[var(--hub-line)] bg-[var(--hub-surface)] p-3 text-sm text-[var(--hub-ink-2)]">
              {error}
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium">Repository URL</span>
            <input
              className="hub-input mt-1 w-full"
              type="text"
              value={repositoryUrl}
              onChange={(e) => handleRepositoryUrlChange(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              disabled={loading}
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Server name</span>
            <input
              className="hub-input mt-1 w-full"
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="my-custom-mcp"
              disabled={loading}
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Subdirectory (optional)</span>
            <input
              className="hub-input mt-1 w-full"
              type="text"
              value={subdirInput}
              onChange={(e) => setSubdirInput(e.target.value)}
              placeholder="packages/my-server or apps/diagnostic"
              disabled={loading}
            />
            <span className="mt-1 block text-xs text-[var(--hub-ink-3)]">
              Leave empty for repo root. Useful for monorepos and multi-server repos.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Version / tag</span>
            <input
              className="hub-input mt-1 w-full"
              type="text"
              value={versionInput}
              onChange={(e) => setVersionInput(e.target.value)}
              placeholder="latest or v1.2.3"
              disabled={loading}
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="hub-btn ghost"
              onClick={() => {
                resetForm();
                onClose();
              }}
              disabled={loading}
            >
              Cancel
            </button>
            <button type="submit" className="hub-btn primary" disabled={loading}>
              {loading ? (mode === 'edit' ? 'Updating...' : 'Adding...') : mode === 'edit' ? 'Save' : 'Add to market'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddCustomRepoModal;
