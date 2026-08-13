import axios from 'axios';

jest.mock('axios');
jest.mock('../../src/services/mcpService.js', () => ({
  addOrUpdateServer: jest.fn().mockResolvedValue({ success: true }),
  removeServer: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/db/connection.js', () => ({
  getAppDataSource: jest.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

// Helper to set up GitHub API mocks
const mockGitHubRepo = (defaultBranch = 'main') => {
  mockedAxios.get.mockResolvedValueOnce({ data: { default_branch: defaultBranch } });
};

const mockGitHubContents = (fileNames: string[]) => {
  mockedAxios.get.mockResolvedValueOnce({
    data: fileNames.map((name) => ({ name })),
  });
};

const mockPackageJson = (scripts: Record<string, string> = {}, extra: Record<string, unknown> = {}) => {
  const pkg = { scripts, ...extra };
  const content = Buffer.from(JSON.stringify(pkg)).toString('base64');
  mockedAxios.get.mockResolvedValueOnce({ data: { content } });
};

import { previewDeployBuild } from '../../src/services/deployBuildService.js';

describe('previewDeployBuild — plan generation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates node plan with install + build steps when scripts.build exists', async () => {
    mockGitHubRepo();
    mockGitHubContents(['package.json', 'src', 'tsconfig.json']);
    mockPackageJson({ build: 'tsc', start: 'node dist/index.js' });

    const plan = await previewDeployBuild({
      repositoryUrl: 'https://github.com/example/ts-repo',
      serverName: 'ts-server',
    });

    expect(plan.engine).toBe('node');
    const stepIds = plan.steps.map((s) => s.id);
    expect(stepIds).toContain('clone');
    expect(stepIds).toContain('install');
    expect(stepIds).toContain('build');
  });

  it('generates node plan with install only when no scripts.build', async () => {
    mockGitHubRepo();
    mockGitHubContents(['package.json', 'index.js']);
    mockPackageJson({ start: 'node index.js' }); // no build script

    const plan = await previewDeployBuild({
      repositoryUrl: 'https://github.com/example/simple-repo',
      serverName: 'simple-server',
    });

    expect(plan.engine).toBe('node');
    const stepIds = plan.steps.map((s) => s.id);
    expect(stepIds).toContain('clone');
    expect(stepIds).toContain('install');
    expect(stepIds).not.toContain('build');
  });

  it('generates python/uv plan when uv.lock present', async () => {
    mockGitHubRepo();
    mockGitHubContents(['pyproject.toml', 'uv.lock', 'src']);

    const plan = await previewDeployBuild({
      repositoryUrl: 'https://github.com/example/uv-repo',
      serverName: 'uv-server',
    });

    expect(plan.engine).toBe('python');
    const installStep = plan.steps.find((s) => s.id === 'install');
    expect(installStep).toBeDefined();
    expect(installStep?.command).toBe('uv');
    expect(installStep?.args).toContain('sync');
  });

  it('generates python/pip plan when requirements.txt present', async () => {
    mockGitHubRepo();
    mockGitHubContents(['requirements.txt', 'main.py']);

    const plan = await previewDeployBuild({
      repositoryUrl: 'https://github.com/example/pip-repo',
      serverName: 'pip-server',
    });

    expect(plan.engine).toBe('python');
    const installStep = plan.steps.find((s) => s.id === 'install');
    expect(installStep?.command).toBe('pip');
    expect(installStep?.args).toContain('requirements.txt');
  });

  it('returns unknown engine when no recognizable files found', async () => {
    mockGitHubRepo();
    mockGitHubContents(['README.md', 'LICENSE']);

    const plan = await previewDeployBuild({
      repositoryUrl: 'https://github.com/example/unknown-repo',
      serverName: 'unknown-server',
    });

    expect(plan.engine).toBe('unknown');
  });

  it('plan contains no background steps for any engine', async () => {
    mockGitHubRepo();
    mockGitHubContents(['package.json', 'tsconfig.json']);
    mockPackageJson({ build: 'tsc', start: 'node dist/index.js' });

    const plan = await previewDeployBuild({
      repositoryUrl: 'https://github.com/example/ts-repo',
      serverName: 'ts-server',
    });

    for (const step of plan.steps) {
      expect((step as any).background).toBeFalsy();
    }
  });

  it('plan does not include a start step', async () => {
    mockGitHubRepo();
    mockGitHubContents(['package.json']);
    mockPackageJson({ build: 'tsc', start: 'node dist/index.js' });

    const plan = await previewDeployBuild({
      repositoryUrl: 'https://github.com/example/ts-repo',
      serverName: 'ts-server',
    });

    const startStep = plan.steps.find(
      (s) => s.id === 'start' || s.title.toLowerCase().includes('start server'),
    );
    expect(startStep).toBeUndefined();
  });

  it('uses override plan when provided', async () => {
    mockGitHubRepo();
    mockGitHubContents(['package.json']);
    mockPackageJson({ build: 'tsc' });

    const plan = await previewDeployBuild({
      repositoryUrl: 'https://github.com/example/ts-repo',
      serverName: 'ts-server',
      plan: {
        engine: 'docker',
        steps: [{ id: 'custom', title: 'Custom step', command: 'echo' }],
        prerequisites: ['docker'],
      },
    });

    expect(plan.engine).toBe('docker');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].title).toBe('Custom step');
    expect(plan.prerequisites).toEqual(['docker']);
  });

  it('falls back gracefully when GitHub API fails', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

    const plan = await previewDeployBuild({
      repositoryUrl: 'https://github.com/example/unreachable-repo',
      serverName: 'fallback-server',
    });

    expect(plan.engine).toBe('unknown');
    expect(plan.steps.length).toBeGreaterThan(0); // at least clone step
  });

  it('treats latest as the default branch marker instead of a git checkout ref', async () => {
    mockGitHubRepo();
    mockGitHubContents(['package.json']);
    mockPackageJson({ start: 'node index.js' });

    const plan = await previewDeployBuild({
      repositoryUrl: 'https://github.com/example/simple-repo',
      serverName: 'simple-server',
      version: 'latest',
    });

    expect(plan.version).toBe('latest');
    expect(plan.steps.find((step) => step.id === 'clone')).toBeDefined();
  });

  it('detects nested monorepo subdir candidates when the root has no package manifest', async () => {
    mockGitHubRepo();
    mockGitHubContents(['nodejs', 'README.md']);
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        tree: [
          { path: 'README.md', type: 'blob' },
          { path: 'nodejs/authentik-mcp/package.json', type: 'blob' },
          { path: 'nodejs/authentik-diag-mcp/package.json', type: 'blob' },
          { path: 'nodejs/authentik-diag-mcp/src/index.ts', type: 'blob' },
        ],
      },
    });

    const plan = await previewDeployBuild({
      repositoryUrl: 'https://github.com/cdmx-in/authentik-mcp',
      serverName: 'authentik-mcp',
    });

    expect(plan.engine).toBe('unknown');
    expect(plan.monorepoSubdirCandidates).toEqual([
      'nodejs/authentik-diag-mcp',
      'nodejs/authentik-mcp',
    ]);
  });
});

describe('isFinalBuildStatus', () => {
  it('correctly identifies terminal statuses', async () => {
    const { isFinalBuildStatus } = await import('../../src/types/index.js');

    const terminalStatuses = [
      'succeeded', 'failed', 'prerequisite_error', 'clone_error',
      'install_error', 'build_error', 'network_error', 'deinstalled',
    ];
    const runningStatuses = ['queued', 'running', 'deleting'];

    for (const s of terminalStatuses) {
      expect(isFinalBuildStatus(s)).toBe(true);
    }
    for (const s of runningStatuses) {
      expect(isFinalBuildStatus(s)).toBe(false);
    }
  });
});
