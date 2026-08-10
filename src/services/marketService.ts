import fs from 'fs';
import { MarketServer } from '../types/index.js';
import { getConfigFilePath } from '../utils/path.js';

// Get path to the servers.json file
export const getServersJsonPath = (): string => {
  return getConfigFilePath('servers.json', 'Servers');
};

// Get custom servers JSON path
export const getCustomServersPath = (): string => {
  return getConfigFilePath('custom-servers.json', 'Servers');
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
    
    // Mark all custom servers with Custom tag
    Object.values(customServers).forEach((server) => {
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

// Register a custom server from repository URL
export const registerCustomServer = (
  serverName: string,
  repositoryUrl: string,
  tags: string[] = [],
  version?: string,
): MarketServer => {
  const customServers = getCustomServers();
  const resolvedTags = ensureCustomTag(tags.length > 0 ? tags : deriveTagsFromRepositoryUrl(repositoryUrl));
  const resolvedVersion = typeof version === 'string' && version.trim() ? version.trim() : 'latest';

  // Create a new market server entry for custom repo
  const newServer: MarketServer = {
    name: serverName,
    display_name: serverName.charAt(0).toUpperCase() + serverName.slice(1).replace(/-/g, ' '),
    description: `Custom MCP server from ${repositoryUrl}`,
    repository: {
      type: 'git-repository',
      url: repositoryUrl,
    },
    homepage: repositoryUrl,
    author: { name: 'User' },
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

  customServers[serverName] = newServer;

  // Write back to file
  const customPath = getCustomServersPath();
  fs.writeFileSync(customPath, JSON.stringify(customServers, null, 2), 'utf8');

  return newServer;
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
  }
): MarketServer => {
  const customServers = getCustomServers();

  if (!customServers[serverName]) {
    throw new Error(`Custom server "${serverName}" not found`);
  }

  const server = customServers[serverName];

  if (updates.newServerName && updates.newServerName !== serverName) {
    if (customServers[updates.newServerName]) {
      throw new Error(`Custom server "${updates.newServerName}" already exists`);
    }

    customServers[updates.newServerName] = server;
    delete customServers[serverName];
    server.name = updates.newServerName;
  }

  if (updates.repositoryUrl) {
    server.repository = {
      type: 'git-repository',
      url: updates.repositoryUrl,
    };
    server.homepage = updates.repositoryUrl;
    server.description = `Custom MCP server from ${updates.repositoryUrl}`;
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
export const deleteCustomServer = (serverName: string): void => {
  const customServers = getCustomServers();
  
  if (!customServers[serverName]) {
    throw new Error(`Custom server "${serverName}" not found`);
  }
  
  delete customServers[serverName];
  
  // Write back to file
  const customPath = getCustomServersPath();
  fs.writeFileSync(customPath, JSON.stringify(customServers, null, 2), 'utf8');
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
