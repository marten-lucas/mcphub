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
    };
    tags?: string[];
    version?: string;
  } | null;
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
  const [versionInput, setVersionInput] = useState('latest');
  const [tagsInput, setTagsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setRepositoryUrl('');
    setServerName('');
    setVersionInput('latest');
    setTagsInput('');
    setError(null);
  };

  const parseTags = (value: string): string[] =>
    value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

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

    const normalizedUrl = trimmed.replace(/^git@/, '').replace(/^ssh:\/\//, 'https://');
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

  const deriveTagsFromRepositoryUrl = (value: string): string[] => {
    try {
      const parsedUrl = new URL(value);
      const host = parsedUrl.hostname.replace(/^www\./, '');
      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
      const tags = new Set<string>();

      if (host.includes('github')) tags.add('github');
      else if (host.includes('gitlab')) tags.add('gitlab');
      else if (host.includes('bitbucket')) tags.add('bitbucket');
      else tags.add('git');

      if (pathSegments[0]) tags.add(pathSegments[0]);
      if (pathSegments[1]) {
        const repoSlug = pathSegments[1].replace(/\.(git|zip|tar)$/i, '');
        repoSlug
          .split(/[-_./]+/)
          .filter((segment) => segment.length > 1)
          .forEach((segment) => tags.add(segment));
      }

      return Array.from(tags).slice(0, 6);
    } catch {
      return [];
    }
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
      setVersionInput(derivedVersion || 'latest');
      setTagsInput(initialServer.tags?.join(', ') || '');
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

      try {
        new URL(repositoryUrl);
      } catch {
        setError('Invalid repository URL format');
        return;
      }

      const tags = parseTags(tagsInput);
      const normalizedTags = tags.length > 0 ? tags : deriveTagsFromRepositoryUrl(repositoryUrl);

      if (mode === 'edit' && initialServer) {
        const result = await apiPut(`/market/custom-servers/${encodeURIComponent(initialServer.name)}`, {
          newServerName: serverName.trim(),
          repositoryUrl,
          version: resolvedVersion,
          tags: normalizedTags,
        });

        if (result.success) {
          showToast({
            type: 'success',
            message: `Custom server "${serverName}" updated successfully`,
          });
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
          tags: normalizedTags,
        });

        if (result.success) {
          showToast({
            type: 'success',
            message: `Custom server "${serverName}" registered successfully`,
          });
          resetForm();
          onClose();
          onSuccess?.(serverName.trim(), 'add');
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
      setTagsInput('');
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

    const suggestedTags = deriveTagsFromRepositoryUrl(value);
    if (suggestedTags.length > 0 && !tagsInput.trim()) {
      setTagsInput(suggestedTags.join(', '));
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

          <label className="block">
            <span className="text-sm font-medium">Tags</span>
            <input
              className="hub-input mt-1 w-full"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="github, mcp, custom"
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
