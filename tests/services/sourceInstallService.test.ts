import axios from 'axios';
import { previewSourceInstall } from '../../src/services/sourceInstallService.js';

jest.mock('axios');

describe('previewSourceInstall', () => {
  it('builds a node-based plan for package.json repositories', async () => {
    const mockedAxios = axios as unknown as { get: jest.Mock };
    mockedAxios.get
      .mockResolvedValueOnce({ data: { default_branch: 'main' } })
      .mockResolvedValueOnce({ data: [{ name: 'package.json' }, { name: 'src' }] });

    const plan = await previewSourceInstall({
      repositoryUrl: 'https://github.com/example/demo-repo',
      serverName: 'demo-server',
    });

    expect(plan.engine).toBe('node');
    expect(plan.steps[0].title).toBe('Clone repository');
    expect(plan.steps[1].title).toBe('Install npm dependencies');
    expect(plan.prerequisites).toEqual(expect.arrayContaining(['node', 'npm']));
  });

  it('uses an overridden plan when provided', async () => {
    const mockedAxios = axios as unknown as { get: jest.Mock };
    mockedAxios.get
      .mockResolvedValueOnce({ data: { default_branch: 'main' } })
      .mockResolvedValueOnce({ data: [{ name: 'package.json' }, { name: 'src' }] });

    const plan = await previewSourceInstall({
      repositoryUrl: 'https://github.com/example/demo-repo',
      serverName: 'demo-server',
      plan: {
        engine: 'docker',
        steps: [{ id: 'custom', title: 'Custom step', command: 'echo hello' }],
        prerequisites: ['docker'],
      },
    });

    expect(plan.engine).toBe('docker');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].title).toBe('Custom step');
    expect(plan.prerequisites).toEqual(['docker']);
  });
});
