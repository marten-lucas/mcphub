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
    display_name?: string;
    repository?: {
      url?: string;
    };
    tags?: string[];
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
  const [displayName, setDisplayName] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setRepositoryUrl('');
    setServerName('');
    setDisplayName('');
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
      setRepositoryUrl(initialServer.repository?.url || '');
      setServerName(initialServer.name || '');
      setDisplayName(initialServer.display_name || initialServer.name || '');
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
          displayName: displayName.trim() || undefined,
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
      setTagsInput('');
      return;
    }

    const derivedServerName = deriveServerNameFromRepositoryUrl(value);
    if (derivedServerName && !serverName.trim()) {
      setServerName(derivedServerName);
    }

    const suggestedTags = deriveTagsFromRepositoryUrl(value);
    if (suggestedTags.length > 0 && !tagsInput.trim()) {
      setTagsInput(suggestedTags.join(', '));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md mx-4">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">
            {mode === 'edit' ? 'Edit custom repo' : 'Add to market'}
          </h2>
          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="text-gray-500 hover:text-gray-700"
            disabled={loading}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="serverName" className="block text-sm font-medium mb-2">
              Server Name *
            </label>
            <input
              id="serverName"
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="e.g., my-custom-mcp"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">
              Unique identifier for this custom server
            </p>
          </div>

          <div>
            <label htmlFor="displayName" className="block text-sm font-medium mb-2">
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Optional display label"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="repositoryUrl" className="block text-sm font-medium mb-2">
              Repository URL *
            </label>
            <input
              id="repositoryUrl"
              type="text"
              value={repositoryUrl}
              onChange={(e) => handleRepositoryUrlChange(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">
              Git repository URL (must be accessible from this server)
            </p>
          </div>

          <div>
            <label htmlFor="tagsInput" className="block text-sm font-medium mb-2">
              Tags
            </label>
            <input
              id="tagsInput"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="github, mcp, custom"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">
              Comma-separated tags. Suggestions are prefilled from the repository URL.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => {
                resetForm();
                onClose();
              }}
              className="flex-1 px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? (mode === 'edit' ? 'Updating...' : 'Adding...') : mode === 'edit' ? 'Save' : 'Add to market'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddCustomRepoModal;
