import fs from 'fs';
import { MarketServer } from '../types/index.js';
import { previewDeployBuild } from './deployBuildService.js';
import { getConfigFilePath } from '../utils/path.js';

// Get path to the servers.json file
export const getServersJsonPath = (): string => {
  return getConfigFilePath('servers.json', 'Servers');
};

// Get custom servers JSON path
export const getCustomServersPath = (): string => {
  return getConfigFilePath('custom-servers.json', 'Servers');
};

const resolveCustomServerKey = (
  customServers: Record<string, MarketServer>,
  serverIdentifier: string,
): string | null => {
  if (!serverIdentifier) {
    return null;
  }

  const normalizedIdentifier = decodeURIComponent(serverIdentifier).trim();
  if (!normalizedIdentifier) {
    return null;
  }

  if (customServers[normalizedIdentifier]) {
    return normalizedIdentifier;
  }

  for (const [key, server] of Object.entries(customServers)) {
    if (server.name === normalizedIdentifier) {
      return key;
    }

    if (server.display_name === normalizedIdentifier) {
      return key;
    }

    if (server.repository?.url === normalizedIdentifier) {
      return key;
    }
  }

  return null;
};

// Load custom servers from custom-servers.json
export const getCustomServers = (): Record<string, MarketServer> => {
  try {
    const customPath = getCustomServersPath();
    if (!fs.existsSync(customPath)) {
      return {};
    }
    const data = fs.readFileSync(customPath, 'utf8');
    const customServers = JSON.parse(data) as Record<string, MarketServer>;

    Object.entries(customServers).forEach(([key, server]) => {
      server.name = key;
      server.is_official = false;
      if (!server.tags) server.tags = [];
      if (!server.tags.includes('Custom')) {
        server.tags.push('Custom');
      }
      if (!server.categories) server.categories = [];
      if (!server.categories.includes('Custom')) {
        server.categories.push('Custom');
      }
    });

    return customServers;
  } catch (error) {
    console.error('Failed to load custom servers:', error);
    return {};
  }
};

// Merge custom servers with market servers
const mergeCustomServers = (marketServers: Record<string, MarketServer>): Record<string, MarketServer> => {
  const customServers = getCustomServers();
  return { ...marketServers, ...customServers };
};

const ensureCustomTag = (tags: string[] = []): string[] => {
  const cleanedTags = tags
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (!cleanedTags.some((tag) => tag.toLowerCase() === 'custom')) {
    return [...cleanedTags, 'Custom'];
  }

  return cleanedTags;
};

const deriveGitHubOwnerFromRepositoryUrl = (repositoryUrl: string): string | null => {
  try {
    const normalizedUrl = repositoryUrl.trim().replace(/^git@/, '').replace(/^ssh:\/\//, 'https://');
    const parsedUrl = new URL(normalizedUrl);

    if (!parsedUrl.hostname.toLowerCase().includes('github.com')) {
      return null;
    }

    const pathnameSegments = parsedUrl.pathname.split('/').filter(Boolean);
    if (pathnameSegments.length >= 2) {
      return pathnameSegments[0];
    }
  } catch {
    const scpLikeMatch = repositoryUrl.match(/^(?:[^@]+@)?([^:]+):([^/]+)\/([^/]+?)(?:\.git)?(?:\/)?$/i);
    if (scpLikeMatch?.[1] && scpLikeMatch?.[2]) {
      return scpLikeMatch[2];
    }
  }

  return null;
};

const deriveTagsFromRepositoryUrl = (repositoryUrl: string): string[] => {
  try {
    const parsedUrl = new URL(repositoryUrl);
    const host = parsedUrl.hostname.replace(/^www\./, '');
    const pathnameSegments = parsedUrl.pathname.split('/').filter(Boolean);

    const tags = new Set<string>();

    if (host.includes('github')) {
      tags.add('github');
    } else if (host.includes('gitlab')) {
      tags.add('gitlab');
    } else if (host.includes('bitbucket')) {
      tags.add('bitbucket');
    } else {
      tags.add('git');
    }

    if (pathnameSegments[0]) {
      tags.add(pathnameSegments[0]);
    }

    if (pathnameSegments[1]) {
      const repoSlug = pathnameSegments[1].replace(/\.(git|zip|tar)$/i, '');
      repoSlug
        .split(/[-_./]+/)
        .filter((segment) => segment.length > 1)
        .forEach((segment) => tags.add(segment));
    }

    return ensureCustomTag(Array.from(tags).slice(0, 6));
  } catch {
    return ['Custom'];
  }
};

export const isSupportedRepositoryUrl = (repositoryUrl: string): boolean => {
  const trimmed = repositoryUrl.trim();
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

const normalizeSubdir = (subdir?: string): string | undefined => {
  if (typeof subdir !== 'string') {
    return undefined;
  }

  const normalized = subdir.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return normalized || undefined;
};

const deriveServerNameFromSubdir = (subdir: string): string => {
  const lastSegment = subdir.split('/').filter(Boolean).pop() || subdir;
  return lastSegment
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
};

const normalizeRepositoryUrl = (repositoryUrl: string): string => repositoryUrl
  .trim()
  .replace(/^git@/, '')
  .replace(/^ssh:\/\//, 'https://')
  .replace(/\.git$/i, '')
  .replace(/\/+$/, '')
  .toLowerCase();

const buildCustomServer = (
  serverName: string,
  repositoryUrl: string,
  tags: string[] = [],
  version?: string,
  subdir?: string,
): MarketServer => {
  const normalizedServerName = serverName.trim();
  const resolvedTags = ensureCustomTag(tags.length > 0 ? tags : deriveTagsFromRepositoryUrl(repositoryUrl));
  const resolvedVersion = typeof version === 'string' && version.trim() ? version.trim() : 'latest';

  return {
    name: normalizedServerName,
    display_name: normalizedServerName.charAt(0).toUpperCase() + normalizedServerName.slice(1).replace(/-/g, ' '),
    description: `Custom MCP server from ${repositoryUrl}`,
    repository: {
      type: 'git-repository',
      url: repositoryUrl,
      subdir: subdir || undefined,
    },
    homepage: repositoryUrl,
    author: { name: deriveGitHubOwnerFromRepositoryUrl(repositoryUrl) || 'User' },
    license: 'Unknown',
    is_official: false,
    categories: ['Custom'],
    tags: resolvedTags,
    examples: [],
    installations: {},
    arguments: {},
    tools: [],
    version: resolvedVersion,
  };
};

const persistCustomServers = (customServers: Record<string, MarketServer>): void => {
  const customPath = getCustomServersPath();
  fs.writeFileSync(customPath, JSON.stringify(customServers, null, 2), 'utf8');
};

const matchesRegisteredVariant = (
  server: MarketServer,
  repositoryUrl: string,
  subdir?: string,
): boolean => {
  const existingRepoUrl = server.repository?.url ? normalizeRepositoryUrl(server.repository.url) : '';
  const nextRepoUrl = normalizeRepositoryUrl(repositoryUrl);
  const existingSubdir = normalizeSubdir(server.repository?.subdir);
  const nextSubdir = normalizeSubdir(subdir);

  return existingRepoUrl === nextRepoUrl && existingSubdir === nextSubdir;
};

// Register a custom server from repository URL
export const registerCustomServer = (
  serverName: string,
  repositoryUrl: string,
  tags: string[] = [],
  version?: string,
  subdir?: string,
): MarketServer => {
  const customServers = getCustomServers();
  const normalizedServerName = serverName.trim();
  if (!normalizedServerName) {
    throw new Error('Custom server name is required');
  }
  if (customServers[normalizedServerName]) {
    throw new Error(`Custom server "${normalizedServerName}" already exists`);
  }

  const newServer = buildCustomServer(normalizedServerName, repositoryUrl, tags, version, subdir);

  customServers[normalizedServerName] = newServer;
  persistCustomServers(customServers);

  return newServer;
};

export const registerCustomServersFromRepository = async (
  serverName: string,
  repositoryUrl: string,
  tags: string[] = [],
  version?: string,
  subdir?: string,
): Promise<{
  createdServers: MarketServer[];
  primaryServerName: string;
  autoDetectedVariants: boolean;
  newlyCreatedCount: number;
}> => {
  const normalizedSubdir = normalizeSubdir(subdir);
  if (normalizedSubdir) {
    const createdServer = registerCustomServer(serverName, repositoryUrl, tags, version, normalizedSubdir);
    return {
      createdServers: [createdServer],
      primaryServerName: createdServer.name,
      autoDetectedVariants: false,
      newlyCreatedCount: 1,
    };
  }

  const previewPlan = await previewDeployBuild({
    repositoryUrl,
    serverName,
    version,
  });
  const monorepoCandidates = Array.isArray(previewPlan.monorepoSubdirCandidates)
    ? previewPlan.monorepoSubdirCandidates
      .map((candidate) => normalizeSubdir(candidate))
      .filter((candidate): candidate is string => Boolean(candidate))
    : [];

  if (monorepoCandidates.length > 1) {
    const customServers = getCustomServers();
    const resolvedServers: MarketServer[] = [];
    let hasChanges = false;
    let newlyCreatedCount = 0;

    for (const candidate of monorepoCandidates) {
      const candidateServerName = deriveServerNameFromSubdir(candidate);
      const existingServer = customServers[candidateServerName];

      if (existingServer) {
        if (!matchesRegisteredVariant(existingServer, repositoryUrl, candidate)) {
          throw new Error(`Custom server "${candidateServerName}" already exists`);
        }
        resolvedServers.push(existingServer);
        continue;
      }

      const nextServer = buildCustomServer(candidateServerName, repositoryUrl, tags, version, candidate);
      customServers[candidateServerName] = nextServer;
      resolvedServers.push(nextServer);
      hasChanges = true;
      newlyCreatedCount += 1;
    }

    if (hasChanges) {
      persistCustomServers(customServers);
    }

    return {
      createdServers: resolvedServers,
      primaryServerName: resolvedServers[0].name,
      autoDetectedVariants: true,
      newlyCreatedCount,
    };
  }

  const createdServer = registerCustomServer(serverName, repositoryUrl, tags, version);
  return {
    createdServers: [createdServer],
    primaryServerName: createdServer.name,
    autoDetectedVariants: false,
    newlyCreatedCount: 1,
  };
};

// Update a custom server (repository URL and/or display name)
export const updateCustomServer = (
  serverName: string,
  updates: {
    repositoryUrl?: string;
    displayName?: string;
    newServerName?: string;
    tags?: string[];
    version?: string;
    subdir?: string;
  }
): MarketServer => {
  const customServers = getCustomServers();
  const resolvedServerKey = resolveCustomServerKey(customServers, serverName);

  if (!resolvedServerKey) {
    throw new Error(`Custom server "${serverName}" not found`);
  }

  const server = customServers[resolvedServerKey];

  if (updates.newServerName && updates.newServerName !== resolvedServerKey) {
    if (customServers[updates.newServerName]) {
      throw new Error(`Custom server "${updates.newServerName}" already exists`);
    }

    customServers[updates.newServerName] = server;
    delete customServers[resolvedServerKey];
    server.name = updates.newServerName;
  }

  if (updates.repositoryUrl) {
    server.repository = {
      type: 'git-repository',
      url: updates.repositoryUrl,
      subdir: typeof updates.subdir === 'string' && updates.subdir.trim() ? updates.subdir.trim() : server.repository?.subdir,
    };
    server.homepage = updates.repositoryUrl;
    server.description = `Custom MCP server from ${updates.repositoryUrl}`;
    const githubOwner = deriveGitHubOwnerFromRepositoryUrl(updates.repositoryUrl);
    if (githubOwner) {
      server.author = { name: githubOwner };
    }
  } else if (typeof updates.subdir === 'string') {
    server.repository = {
      ...server.repository,
      type: server.repository?.type || 'git-repository',
      url: server.repository?.url || '',
      subdir: updates.subdir.trim() || undefined,
    };
  }

  if (typeof updates.subdir === 'string') {
    const normalizedSubdir = updates.subdir.trim();
    if (!server.repository) {
      server.repository = { type: 'git-repository', url: '', subdir: normalizedSubdir || undefined };
    } else {
      server.repository.subdir = normalizedSubdir || undefined;
    }
  }

  if (updates.displayName) {
    server.display_name = updates.displayName;
  }

  if (updates.tags) {
    server.tags = ensureCustomTag(updates.tags);
  }

  if (typeof updates.version === 'string') {
    server.version = updates.version.trim() ? updates.version.trim() : 'latest';
  }

  // Write back to file
  const customPath = getCustomServersPath();
  fs.writeFileSync(customPath, JSON.stringify(customServers, null, 2), 'utf8');

  return server;
};

// Delete a custom server
export const deleteCustomServer = (serverName: string): MarketServer => {
  const customServers = getCustomServers();
  const resolvedServerKey = resolveCustomServerKey(customServers, serverName);

  if (!resolvedServerKey) {
    throw new Error(`Custom server "${serverName}" not found`);
  }

  const deletedServer = customServers[resolvedServerKey];
  delete customServers[resolvedServerKey];

  // Write back to file
  const customPath = getCustomServersPath();
  fs.writeFileSync(customPath, JSON.stringify(customServers, null, 2), 'utf8');
  return deletedServer;
};


// Load all market servers from servers.json (merged with custom servers)
export const getMarketServers = (): Record<string, MarketServer> => {
  try {
    const serversJsonPath = getServersJsonPath();
    const data = fs.readFileSync(serversJsonPath, 'utf8');
    const serversObj = JSON.parse(data) as Record<string, MarketServer>;

    // use key as name field
    Object.entries(serversObj).forEach(([key, server]) => {
      server.name = key;
    });

    // Merge with custom servers
    const mergedServers = mergeCustomServers(serversObj);

    const sortedEntries = Object.entries(mergedServers).sort(([, serverA], [, serverB]) => {
      if (serverA.is_official && !serverB.is_official) return -1;
      if (!serverA.is_official && serverB.is_official) return 1;
      return 0;
    });

    return Object.fromEntries(sortedEntries);
  } catch (error) {
    console.error('Failed to load servers from servers.json:', error);
    return {};
  }
};

// Get a specific market server by name
export const getMarketServerByName = (name: string): MarketServer | null => {
  const servers = getMarketServers();
  return servers[name] || null;
};

// Get all categories from market servers
export const getMarketCategories = (): string[] => {
  const servers = getMarketServers();
  const categories = new Set<string>();

  Object.values(servers).forEach((server) => {
    server.categories?.forEach((category) => {
      categories.add(category);
    });
  });

  // Always include "Custom" category for manually added servers
  categories.add('Custom');

  return Array.from(categories).sort();
};

// Get all tags from market servers
export const getMarketTags = (): string[] => {
  const servers = getMarketServers();
  const tags = new Set<string>();

  Object.values(servers).forEach((server) => {
    server.tags?.forEach((tag) => {
      tags.add(tag);
    });
  });

  return Array.from(tags).sort();
};

// Search market servers by query
export const searchMarketServers = (query: string): MarketServer[] => {
  const servers = getMarketServers();
  const searchTerms = query
    .toLowerCase()
    .split(' ')
    .filter((term) => term.length > 0);

  if (searchTerms.length === 0) {
    return Object.values(servers);
  }

  return Object.values(servers).filter((server) => {
    // Search in name, display_name, description, categories, and tags
    const searchableText = [
      server.name,
      server.display_name,
      server.description,
      ...(server.categories || []),
      ...(server.tags || []),
    ]
      .join(' ')
      .toLowerCase();

    return searchTerms.some((term) => searchableText.includes(term));
  });
};

// Filter market servers by category
export const filterMarketServersByCategory = (category: string): MarketServer[] => {
  const servers = getMarketServers();

  if (!category) {
    return Object.values(servers);
  }

  if (category === 'Custom') {
    // Return only custom servers
    return Object.values(servers).filter((server) => {
      return server.categories?.includes('Custom') || server.tags?.includes('Custom');
    });
  }

  return Object.values(servers).filter((server) => {
    return server.categories?.includes(category);
  });
};

// Filter market servers by tag
export const filterMarketServersByTag = (tag: string): MarketServer[] => {
  const servers = getMarketServers();

  if (!tag) {
    return Object.values(servers);
  }

  return Object.values(servers).filter((server) => {
    return server.tags?.includes(tag);
  });
};
