import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { Repository } from 'typeorm';
import { addOrUpdateServer, removeServer } from './mcpService.js';
import type { ServerConfig } from '../types/index.js';
import { getAppDataSource } from '../db/connection.js';
import DeployBuildJobEntity from '../db/entities/DeployBuildJob.js';

export type DeployBuildStatus = 
  | 'queued' 
  | 'running' 
  | 'succeeded' 
  | 'failed'
  | 'prerequisite_error'
  | 'clone_error'
  | 'install_error'
  | 'build_error'
  | 'network_error'
  | 'deleting' 
  | 'deinstalled';

export interface DeployBuildStep {
  id: string;
  title: string;
  command: string;
  args?: string[];
  cwd?: string;
  optional?: boolean;
}

export interface DeployBuildPlan {
  id: string;
  repositoryUrl: string;
  serverName: string;
  version?: string;
  installRoot: string;
  installDir: string;
  engine: 'node' | 'python' | 'docker' | 'unknown';
  steps: DeployBuildStep[];
  prerequisites: string[];
}

export interface DeployBuildJob {
  id: string;
  repositoryUrl: string;
  serverName: string;
  version?: string;
  status: DeployBuildStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  installRoot: string;
  installDir: string;
  engine: 'node' | 'python' | 'docker' | 'unknown';
  plan: DeployBuildPlan;
  logs: string[];
  error?: string;
}

interface PreviewInstallInput {
  repositoryUrl: string;
  serverName?: string;
  version?: string;
}

interface DeployBuildPlanInput {
  id?: string;
  repositoryUrl?: string;
  serverName?: string;
  version?: string;
  installRoot?: string;
  installDir?: string;
  engine?: 'node' | 'python' | 'docker' | 'unknown';
  steps?: DeployBuildStep[];
  prerequisites?: string[];
}

interface DeployBuildRequest extends PreviewInstallInput {
  plan?: DeployBuildPlanInput;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const JOBS_FILE = path.join(DATA_DIR, 'deploy-build-jobs.json');
const INSTALL_ROOT = path.resolve(process.env.MCPHUB_DEPLOY_BUILD_ROOT || '/var/lib/mcphub/deploy-builds');
const MAX_LOG_LINES = 200;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const SUSPECT_COMMAND_PATTERN = /(?:^|\s)(?:sudo|su|sh|bash|zsh|fish|cmd|powershell|pwsh|eval|exec|source|\.)(?:$|\s)/i;
const SUSPECT_ARG_PATTERN = /[;&|`$<>]/;
const SENSITIVE_VALUE_PATTERN = /(token|secret|password|authorization)=([^,\s]+)/gi;
const BEARER_PATTERN = /\b(Bearer)\s+([A-Za-z0-9._-]+)/gi;

const isDatabaseMode = (): boolean =>
  process.env.USE_DB !== undefined ? process.env.USE_DB === 'true' : Boolean(process.env.DB_URL);

const ensureStorage = async (): Promise<void> => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(INSTALL_ROOT, { recursive: true });
  try {
    await fs.access(JOBS_FILE);
  } catch {
    await fs.writeFile(JOBS_FILE, '[]', 'utf8');
  }
};

const getDeployJobRepository = (): Repository<DeployBuildJobEntity> =>
  getAppDataSource().getRepository(DeployBuildJobEntity);

const mapEntityToJob = (entity: DeployBuildJobEntity): DeployBuildJob => ({
  id: entity.id,
  repositoryUrl: entity.repositoryUrl,
  serverName: entity.serverName,
  version: entity.version ?? undefined,
  status: entity.status as DeployBuildStatus,
  createdAt: entity.createdAt instanceof Date ? entity.createdAt.toISOString() : new Date(entity.createdAt).toISOString(),
  updatedAt: entity.updatedAt instanceof Date ? entity.updatedAt.toISOString() : new Date(entity.updatedAt).toISOString(),
  startedAt: entity.startedAt ? new Date(entity.startedAt).toISOString() : undefined,
  completedAt: entity.completedAt ? new Date(entity.completedAt).toISOString() : undefined,
  installRoot: entity.installRoot,
  installDir: entity.installDir,
  engine: entity.engine,
  plan: entity.plan as unknown as DeployBuildPlan,
  logs: Array.isArray(entity.logs) ? entity.logs : [],
  error: entity.error ?? undefined,
});

const mapJobToEntity = (job: DeployBuildJob): DeployBuildJobEntity =>
  Object.assign(new DeployBuildJobEntity(), {
    id: job.id,
    repositoryUrl: job.repositoryUrl,
    serverName: job.serverName,
    version: job.version ?? null,
    status: job.status,
    createdAt: new Date(job.createdAt),
    updatedAt: new Date(job.updatedAt),
    startedAt: job.startedAt ? new Date(job.startedAt) : null,
    completedAt: job.completedAt ? new Date(job.completedAt) : null,
    installRoot: job.installRoot,
    installDir: job.installDir,
    engine: job.engine,
    plan: job.plan,
    logs: job.logs,
    error: job.error ?? null,
  });

const loadJobs = async (): Promise<DeployBuildJob[]> => {
  if (isDatabaseMode()) {
    const jobs = await getDeployJobRepository().find({ order: { updatedAt: 'DESC' } });
    return jobs.map(mapEntityToJob);
  }

  await ensureStorage();
  const raw = await fs.readFile(JOBS_FILE, 'utf8');
  return JSON.parse(raw) as DeployBuildJob[];
};

const persistJob = async (job: DeployBuildJob): Promise<void> => {
  if (isDatabaseMode()) {
    await getDeployJobRepository().save(mapJobToEntity(job));
    return;
  }

  const jobs = await loadJobs();
  const nextJobs = jobs.some((entry) => entry.id === job.id)
    ? jobs.map((entry) => (entry.id === job.id ? job : entry))
    : [...jobs, job];
  await ensureStorage();
  await fs.writeFile(JOBS_FILE, JSON.stringify(nextJobs, null, 2), 'utf8');
};

const updateJob = async (
  jobId: string,
  updater: (job: DeployBuildJob) => DeployBuildJob,
): Promise<DeployBuildJob | null> => {
  const job = await getDeployBuildJob(jobId);
  if (!job) {
    return null;
  }

  const nextJob = updater(job);
  await persistJob(nextJob);
  return nextJob;
};

const preflightInstallDirectory = async (
  installDir: string,
  log: (line: string) => void,
): Promise<void> => {
  try {
    await fs.access(installDir);
    log(`Target folder exists and will be deleted before deploy: ${installDir}`);
  } catch {
    log(`Target folder does not exist yet: ${installDir}`);
  }

  await fs.mkdir(path.dirname(installDir), { recursive: true });
};


const addLogLine = (job: DeployBuildJob, line: string): DeployBuildJob => {
  const logs = [...job.logs];
  if (logs.length >= MAX_LOG_LINES) {
    logs.shift();
  }
  logs.push(line);
  return { ...job, logs };
};

const maskSensitiveData = (line: string): string => {
  let masked = line.replace(SENSITIVE_VALUE_PATTERN, '$1=***');
  masked = masked.replace(BEARER_PATTERN, '$1 ***');
  return masked;
};

const assertSafeCommand = (command: string, args?: string[]): void => {
  if (SUSPECT_COMMAND_PATTERN.test(command)) {
    throw new Error(`Command '${command}' appears to be shell-related or suspicious`);
  }
  (args || []).forEach((arg) => {
    if (SUSPECT_ARG_PATTERN.test(arg)) {
      throw new Error(`Argument '${arg}' contains suspicious shell characters`);
    }
  });
};

const ensureInstallDirWithinRoot = async (installDir: string): Promise<void> => {
  const resolvedInstallDir = path.resolve(installDir);
  const resolvedRoot = path.resolve(INSTALL_ROOT);
  const relativePath = path.relative(resolvedRoot, resolvedInstallDir);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Installation directory must be within ${INSTALL_ROOT}`);
  }
};


const checkTooling = async (engine: string, log: (msg: string) => void): Promise<void> => {
  log('Checking prerequisites...');
  const toolsToCheck = [];

  if (engine === 'node') {
    toolsToCheck.push({ cmd: 'node', arg: '--version' }, { cmd: 'npm', arg: '--version' });
  } else if (engine === 'python') {
    toolsToCheck.push(
      { cmd: 'python3', arg: '--version' },
      { cmd: 'python3', arg: ['-m', 'pip', '--version'] },
    );
  } else if (engine === 'docker') {
    toolsToCheck.push(
      { cmd: 'docker', arg: '--version' },
      { cmd: 'docker', arg: ['compose', '--version'] },
    );
  }

  for (const tool of toolsToCheck) {
    log(`Checking ${tool.cmd}...`);
  }
};

const runCommand = async (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; log: (line: string) => void; timeoutMs?: number },
): Promise<void> => {
  assertSafeCommand(command, args);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Command timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`));
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: options.env ?? process.env,
      shell: false,
    });

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      callback();
    };

    child.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
      lines.forEach((line) => options.log(maskSensitiveData(line)));
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
      lines.forEach((line) => options.log(maskSensitiveData(line)));
    });

    child.on('close', (code) => {
      finish(() => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      });
    });

    child.on('error', (err) => {
      finish(() => reject(err));
    });
  });
};


const analyzeRepository = async (repositoryUrl: string, _serverName: string): Promise<{
  engine: 'node' | 'python' | 'docker' | 'unknown';
  prerequisites: string[];
  defaultBranch: string;
  owner: string;
  repo: string;
  fileNames: string[];
}> => {
  try {
    const urlParts = repositoryUrl.replace(/\.git$/, '').split('/');
    const owner = urlParts[urlParts.length - 2];
    const repo = urlParts[urlParts.length - 1];

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const repoInfo = await axios.get(`${apiUrl}`, { timeout: 10000 });
    const defaultBranch = repoInfo.data.default_branch || 'main';

    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/contents/?ref=${defaultBranch}`;
    const contentsRes = await axios.get(treeUrl, { timeout: 10000 });
    const fileNames = (contentsRes.data as any[]).map((item) => item.name);

    if (fileNames.includes('package.json')) {
      return { engine: 'node', prerequisites: ['node', 'npm', 'git'], defaultBranch, owner, repo, fileNames };
    } else if (fileNames.includes('pyproject.toml') || fileNames.includes('setup.py') || fileNames.includes('requirements.txt')) {
      return { engine: 'python', prerequisites: ['python3', 'pip', 'git'], defaultBranch, owner, repo, fileNames };
    } else if (fileNames.includes('Dockerfile') || fileNames.includes('docker-compose.yml')) {
      return { engine: 'docker', prerequisites: ['docker', 'docker-compose', 'git'], defaultBranch, owner, repo, fileNames };
    }

    return { engine: 'unknown', prerequisites: ['git'], defaultBranch, owner, repo, fileNames };
  } catch (error) {
    console.warn('Failed to analyze repository', { repositoryUrl, error });
  }

  return { engine: 'unknown', prerequisites: ['git'], defaultBranch: 'main', owner: '', repo: '', fileNames: [] };
};

const generatePlan = async (input: DeployBuildRequest): Promise<DeployBuildPlan> => {
  const { repositoryUrl, serverName: inputServerName, version } = input;
  if (!repositoryUrl) {
    throw new Error('Repository URL is required');
  }

  const serverName = inputServerName || 'source-server-' + randomUUID().slice(0, 8);
  const planId = input.plan?.id ?? `plan-${randomUUID()}`;
  const installDir =
    input.plan?.installDir ?? path.join(INSTALL_ROOT, `${serverName}-${planId.slice(-8)}`);
  const { engine, prerequisites, defaultBranch, owner, repo, fileNames } = await analyzeRepository(repositoryUrl, serverName);

  const baseSteps: DeployBuildStep[] = [
    {
      id: 'clone',
      title: 'Clone repository',
      command: 'git',
      args: ['clone', '--depth', '1', repositoryUrl, installDir],
      cwd: path.dirname(installDir),
    },
  ];

  if (engine === 'node') {
    baseSteps.push({
      id: 'install',
      title: 'Install npm dependencies',
      command: 'npm',
      args: ['install', '--include=dev'],
      cwd: installDir,
    });

    // Check if package.json has a build script
    let hasBuildScript = false;
    if (owner && repo && fileNames.includes('package.json')) {
      try {
        const pkgJsonUrl = `https://api.github.com/repos/${owner}/${repo}/contents/package.json?ref=${defaultBranch}`;
        const pkgJsonRes = await axios.get(pkgJsonUrl, { timeout: 10000 });
        const content = Buffer.from(pkgJsonRes.data.content, 'base64').toString('utf8');
        const pkgJson = JSON.parse(content);
        hasBuildScript = Boolean(pkgJson?.scripts?.build);
      } catch {
        // If we can't read package.json, assume no build script
      }
    }

    if (hasBuildScript) {
      baseSteps.push({
        id: 'build',
        title: 'Build project',
        command: 'npm',
        args: ['run', 'build'],
        cwd: installDir,
      });
    }
  } else if (engine === 'python') {
    const hasUvLock = fileNames.includes('uv.lock');
    const hasRequirements = fileNames.includes('requirements.txt');

    if (hasUvLock) {
      baseSteps.push({
        id: 'install',
        title: 'Install dependencies with uv',
        command: 'uv',
        args: ['sync'],
        cwd: installDir,
      });
    } else if (hasRequirements) {
      baseSteps.push({
        id: 'install',
        title: 'Install Python dependencies',
        command: 'pip',
        args: ['install', '-r', 'requirements.txt'],
        cwd: installDir,
      });
    } else {
      baseSteps.push({
        id: 'install',
        title: 'Install Python package',
        command: 'pip',
        args: ['install', '-e', '.'],
        cwd: installDir,
      });
    }
  } else if (engine === 'docker') {
    baseSteps.push({
      id: 'build',
      title: 'Build Docker image',
      command: 'docker',
      args: ['compose', 'build'],
      cwd: installDir,
    });
  } else {
    baseSteps.push({
      id: 'review',
      title: 'Review repository structure',
      command: 'ls',
      args: ['-la'],
      cwd: installDir,
      optional: true,
    });
  }

  const steps = input.plan?.steps?.length ? input.plan.steps.map((step, index) => ({ ...step, id: step.id || `step-${index + 1}` })) : baseSteps;

  return {
    id: planId,
    repositoryUrl: input.plan?.repositoryUrl ?? input.repositoryUrl,
    serverName: input.plan?.serverName ?? serverName,
    version: input.plan?.version ?? input.version,
    installRoot: input.plan?.installRoot ?? INSTALL_ROOT,
    installDir: input.plan?.installDir ?? installDir,
    engine: (input.plan?.engine ?? engine) as 'node' | 'python' | 'docker' | 'unknown',
    steps,
    prerequisites: input.plan?.prerequisites ?? prerequisites,
  };
};

const generateServerConfigFromJob = (job: DeployBuildJob): ServerConfig => {
  const config: ServerConfig = {
    type: job.engine === 'docker' ? 'sse' : 'stdio',
    description: `Source-installed from ${job.repositoryUrl}${job.version ? ` (${job.version})` : ''}`,
    enabled: true,
  };

  if (job.engine === 'docker') {
    config.url = 'http://localhost:3000';
  } else if (job.engine === 'node') {
    config.command = 'npm';
    config.args = ['start'];
    config.cwd = job.installDir;
    config.env = {};
  } else if (job.engine === 'python') {
    config.command = 'python3';
    config.args = ['-m', 'mcp', 'run', job.serverName];
    config.cwd = job.installDir;
    config.env = {};
  }

  return config;
};

export const previewDeployBuild = async (input: DeployBuildRequest): Promise<DeployBuildPlan> => {
  return generatePlan(input);
};

export const createDeployBuildJob = async (input: DeployBuildRequest): Promise<DeployBuildJob> => {
  const plan = await generatePlan(input);
  const job: DeployBuildJob = {
    id: `job-${randomUUID()}`,
    repositoryUrl: plan.repositoryUrl,
    serverName: plan.serverName,
    version: plan.version,
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    installRoot: plan.installRoot,
    installDir: plan.installDir,
    engine: plan.engine,
    plan,
    logs: ['Installation job created.'],
  };
  await persistJob(job);
  return job;
};

export const getDeployBuildJobs = async (): Promise<DeployBuildJob[]> => {
  return loadJobs();
};

export const getDeployBuildJob = async (jobId: string): Promise<DeployBuildJob | null> => {
  const jobs = await loadJobs();
  return jobs.find((job) => job.id === jobId) ?? null;
};

export const retryDeployBuildJob = async (jobId: string): Promise<DeployBuildJob | null> => {
  return updateJob(jobId, (job) => ({
    ...job,
    status: 'queued',
    updatedAt: new Date().toISOString(),
    error: undefined,
    logs: [...job.logs, 'Retry requested.'],
  }));
};

export const registerServerFromInstall = async (jobId: string): Promise<boolean> => {
  const job = await getDeployBuildJob(jobId);
  if (!job || job.status !== 'succeeded') {
    return false;
  }

  try {
    const serverConfig = generateServerConfigFromJob(job);
    const result = await addOrUpdateServer(job.serverName, serverConfig, true);
    if (result.success) {
      await persistJob({
        ...job,
        updatedAt: new Date().toISOString(),
        logs: [...job.logs, `Server '${job.serverName}' registered successfully.`],
      });
      return true;
    }
  } catch (error) {
    console.error('Failed to register server from install job', { jobId, error });
  }
  return false;
};

export const deinstallDeployBuildJob = async (jobId: string): Promise<DeployBuildJob | null> => {
  const job = await getDeployBuildJob(jobId);
  if (!job) {
    return null;
  }

  const nextJob: DeployBuildJob = {
    ...job,
    status: 'deleting',
    updatedAt: new Date().toISOString(),
    logs: [...job.logs, 'Starting deinstallation.'],
  };
  await persistJob(nextJob);

  try {
    // Remove server from MCP registry if it was successfully registered
    if (job.status === 'succeeded') {
      try {
        await removeServer(job.serverName);
        await updateJob(jobId, (currentJob) =>
          addLogLine(currentJob, `Removed server '${job.serverName}' from registry.`),
        );
      } catch (serverError) {
        await updateJob(jobId, (currentJob) =>
          addLogLine(
            currentJob,
            `Warning: Failed to remove server from registry: ${serverError instanceof Error ? serverError.message : String(serverError)}`,
          ),
        );
      }
    }

    await fs.rm(nextJob.installDir, { recursive: true, force: true });
    return updateJob(jobId, (currentJob) => ({
      ...currentJob,
      status: 'deinstalled',
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      logs: [...currentJob.logs, `Removed install directory ${nextJob.installDir}.`],
    }));
  } catch (error) {
    return updateJob(jobId, (currentJob) => ({
      ...currentJob,
      status: 'failed',
      updatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      logs: [...currentJob.logs, `Deinstallation failed: ${error instanceof Error ? error.message : String(error)}`],
    }));
  }
};

export const executeDeployBuildJob = async (jobId: string): Promise<void> => {
  const job = await getDeployBuildJob(jobId);
  if (!job) {
    return;
  }

  const persist = async (nextJob: DeployBuildJob): Promise<void> => {
    await persistJob(nextJob);
  };

  let currentJob: DeployBuildJob = {
    ...job,
    status: 'running' as DeployBuildStatus,
    updatedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
  };
  currentJob = addLogLine(currentJob, 'Starting installation job.');
  await persist(currentJob);

  try {
    await checkTooling(currentJob.engine, (line) => {
      currentJob = addLogLine(currentJob, line);
      void persist(currentJob);
    });

    await ensureInstallDirWithinRoot(currentJob.installDir);

    currentJob = addLogLine(currentJob, `Using install root ${currentJob.installDir}`);
    await persist(currentJob);

    await preflightInstallDirectory(currentJob.installDir, (line) => {
      currentJob = addLogLine(currentJob, line);
      void persist(currentJob);
    });

    await fs.rm(currentJob.installDir, { recursive: true, force: true });
    await fs.mkdir(path.dirname(currentJob.installDir), { recursive: true });

    currentJob = addLogLine(currentJob, 'Cloning repository...');
    await persist(currentJob);
    await runCommand('git', ['clone', '--depth', '1', currentJob.repositoryUrl, currentJob.installDir], {
      cwd: path.dirname(currentJob.installDir),
      log: (line) => {
        currentJob = addLogLine(currentJob, line);
        void persist(currentJob);
      },
    });

    const version = currentJob.version;
    if (typeof version === 'string' && version.trim()) {
      currentJob = addLogLine(currentJob, `Checking out ${version}...`);
      await persist(currentJob);
      await runCommand('git', ['checkout', version], {
        cwd: currentJob.installDir,
        log: (line) => {
          currentJob = addLogLine(currentJob, line);
          void persist(currentJob);
        },
      });
    }

    for (const step of currentJob.plan.steps) {
      if (!step.command || step.id === 'clone') {
        continue;
      }
      try {
        currentJob = addLogLine(currentJob, `Running: ${step.title}`);
        await persist(currentJob);
        await runCommand(step.command, step.args ?? [], {
          cwd: step.cwd ?? currentJob.installDir,
          env: process.env,
          log: (line) => {
            currentJob = addLogLine(currentJob, line);
            void persist(currentJob);
          },
        });
      } catch (error) {
        if (step.optional) {
          currentJob = addLogLine(currentJob, `Optional step failed and was skipped: ${step.title}`);
          await persist(currentJob);
          continue;
        }
        throw error;
      }
    }

    currentJob = addLogLine(currentJob, 'Installation completed.');
    currentJob = { ...currentJob, status: 'succeeded', updatedAt: new Date().toISOString(), completedAt: new Date().toISOString() };
    await persist(currentJob);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    currentJob = addLogLine(currentJob, `Installation failed: ${errorMessage}`);
    
    // Classify error based on message content
    let errorStatus: DeployBuildStatus = 'failed';
    
    if (errorMessage.includes('command not found') || errorMessage.includes('ENOENT')) {
      errorStatus = 'prerequisite_error';
      currentJob = addLogLine(currentJob, 'ERROR_TYPE: Missing prerequisite (git, npm, python, docker, etc.)');
    } else if (errorMessage.includes('fatal:') || errorMessage.includes('clone') || errorMessage.includes('repository')) {
      errorStatus = 'clone_error';
      currentJob = addLogLine(currentJob, 'ERROR_TYPE: Failed to clone repository');
    } else if (errorMessage.includes('npm install') || errorMessage.includes('pip install') || errorMessage.includes('poetry install')) {
      errorStatus = 'install_error';
      currentJob = addLogLine(currentJob, 'ERROR_TYPE: Dependency installation failed');
    } else if (errorMessage.includes('build') || errorMessage.includes('compile') || errorMessage.includes('tsc')) {
      errorStatus = 'build_error';
      currentJob = addLogLine(currentJob, 'ERROR_TYPE: Build/compile step failed');
    } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('network')) {
      errorStatus = 'network_error';
      currentJob = addLogLine(currentJob, 'ERROR_TYPE: Network error (DNS, connection, timeout)');
    }
    
    currentJob = {
      ...currentJob,
      status: errorStatus,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      error: errorMessage,
    };
    await persist(currentJob);
  }
};
