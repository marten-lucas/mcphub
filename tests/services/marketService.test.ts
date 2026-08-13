import fs from 'fs';
import { jest } from '@jest/globals';

jest.mock('fs', () => ({
  __esModule: true,
  default: {
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
  },
}));

jest.mock('../../src/utils/path.js', () => ({
  getConfigFilePath: jest.fn(() => '/tmp/custom-servers.json'),
}));

jest.mock('../../src/services/deployBuildService.js', () => ({
  previewDeployBuild: jest.fn(),
}));

import { previewDeployBuild } from '../../src/services/deployBuildService.js';
import { registerCustomServersFromRepository } from '../../src/services/marketService.js';

const mockedPreviewDeployBuild = previewDeployBuild as jest.MockedFunction<typeof previewDeployBuild>;
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('registerCustomServersFromRepository', () => {
  let storedCustomServersJson = '{}';

  beforeEach(() => {
    jest.clearAllMocks();
    storedCustomServersJson = '{}';

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockImplementation(() => storedCustomServersJson);
    mockedFs.writeFileSync.mockImplementation((_, content) => {
      storedCustomServersJson = String(content);
    });
  });

  it('auto-registers sibling entries for monorepo candidates discovered at repo root', async () => {
    mockedPreviewDeployBuild.mockResolvedValue({
      id: 'plan-1',
      repositoryUrl: 'https://github.com/cdmx-in/authentik-mcp',
      serverName: 'authentik-root',
      version: 'latest',
      installRoot: '/tmp',
      installDir: '/tmp/install',
      engine: 'unknown',
      steps: [],
      prerequisites: ['git'],
      monorepoSubdirCandidates: [
        'nodejs/authentik-mcp',
        'nodejs/authentik-diag-mcp',
      ],
    });

    const result = await registerCustomServersFromRepository(
      'authentik-root',
      'https://github.com/cdmx-in/authentik-mcp',
      [],
      'latest',
    );

    expect(result.autoDetectedVariants).toBe(true);
    expect(result.primaryServerName).toBe('authentik-mcp');
    expect(result.newlyCreatedCount).toBe(2);
    expect(result.createdServers.map((server) => server.name)).toEqual([
      'authentik-mcp',
      'authentik-diag-mcp',
    ]);

    const persisted = JSON.parse(storedCustomServersJson) as Record<string, { repository?: { subdir?: string } }>;
    expect(Object.keys(persisted)).toEqual(['authentik-mcp', 'authentik-diag-mcp']);
    expect(persisted['authentik-mcp']?.repository?.subdir).toBe('nodejs/authentik-mcp');
    expect(persisted['authentik-diag-mcp']?.repository?.subdir).toBe('nodejs/authentik-diag-mcp');
  });

  it('reuses already registered sibling variants and only creates missing ones', async () => {
    storedCustomServersJson = JSON.stringify({
      'authentik-diag-mcp': {
        name: 'authentik-diag-mcp',
        display_name: 'Authentik diag mcp',
        description: 'Custom MCP server from https://github.com/cdmx-in/authentik-mcp',
        repository: {
          type: 'git-repository',
          url: 'https://github.com/cdmx-in/authentik-mcp',
          subdir: 'nodejs/authentik-diag-mcp',
        },
        homepage: 'https://github.com/cdmx-in/authentik-mcp',
        author: { name: 'cdmx-in' },
        license: 'Unknown',
        is_official: false,
        categories: ['Custom'],
        tags: ['Custom'],
        examples: [],
        installations: {},
        arguments: {},
        tools: [],
        version: 'latest',
      },
    });

    mockedPreviewDeployBuild.mockResolvedValue({
      id: 'plan-2',
      repositoryUrl: 'https://github.com/cdmx-in/authentik-mcp',
      serverName: 'authentik-root',
      version: 'latest',
      installRoot: '/tmp',
      installDir: '/tmp/install',
      engine: 'unknown',
      steps: [],
      prerequisites: ['git'],
      monorepoSubdirCandidates: [
        'nodejs/authentik-mcp',
        'nodejs/authentik-diag-mcp',
      ],
    });

    const result = await registerCustomServersFromRepository(
      'authentik-root',
      'https://github.com/cdmx-in/authentik-mcp',
      [],
      'latest',
    );

    expect(result.autoDetectedVariants).toBe(true);
    expect(result.newlyCreatedCount).toBe(1);
    expect(result.createdServers.map((server) => server.name)).toEqual([
      'authentik-mcp',
      'authentik-diag-mcp',
    ]);
  });
});
