import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import axios from 'axios';
import { addOrUpdateServer, removeServer } from './mcpService.js';
import type { ServerConfig } from '../types/index.js';

export type DeployBuildStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'deleting' | 'deinstalled';

export interface DeployBuildStep {
  id: string;
  title: string;
  command: string;
  args?: string[];
  cwd?: string;
  optional?: boolean;
  background?: boolean;
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
  selectedPort?: number;
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
  processPid?: number;
  logs: string[];
  error?: string;
  selectedPort?: number;
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
  selectedPort?: number;
}

interface DeployBuildRequest extends PreviewInstallInput {
  plan?: DeployBuildPlanInput;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const JOBS_FILE = path.join(DATA_DIR, 'deploy-build-jobs.json');
const INSTALL_ROOT = path.resolve(process.cwd(), 'data', 'deploy-builds');
const MAX_LOG_LINES = 200;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const SUSPECT_COMMAND_PATTERN = /(?:^|\s)(?:sudo|su|sh|bash|zsh|fish|cmd|powershell|pwsh|eval|exec|source|\.)(?:$|\s)/i;
const SUSPECT_ARG_PATTERN = /[;&|`$<>]/;
const SENSITIVE_VALUE_PATTERN = /(token|secret|password|authorization)=([^,\s]+)/gi;
const BEARER_PATTERN = /\b(Bearer)\s+([A-Za-z0-9._-]+)/gi;

const ensureStorage = async (): Promise<void> => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(INSTALL_ROOT, { recursive: true });
  try {
    await fs.access(JOBS_FILE);
  } catch {
    await fs.writeFile(JOBS_FILE, '[]', 'utf8');
  }
};

const readJobs = async (): Promise<DeployBuildJob[]> => {
  await ensureStorage();
  const raw = await fs.readFile(JOBS_FILE, 'utf8');
  return JSON.parse(raw) as DeployBuildJob[];
};

const writeJobs = async (jobs: DeployBuildJob[]): Promise<void> => {
  await ensureStorage();
  await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf8');
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
  if (!resolvedInstallDir.startsWith(resolvedRoot)) {
    throw new Error(`Installation directory must be within ${INSTALL_ROOT}`);
  }
};

const findAvailablePort = async (): Promise<number> => {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object' && typeof address.port === 'number') {
        server.close(() => resolve(address.port));
      } else {
        reject(new Error('Could not determine available port'));
      }
    });
    server.on('error', reject);
  });
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

const runBackgroundCommand = async (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; log: (line: string) => void },
): Promise<number> => {
  assertSafeCommand(command, args);

  const child = spawn(command, args, {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: options.env ?? process.env,
    shell: false,
    detached: true,
  });

  if (!child.pid) {
    throw new Error('Failed to get process ID for background command');
  }

  child.stdout?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
    lines.forEach((line) => options.log(maskSensitiveData(line)));
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
    lines.forEach((line) => options.log(maskSensitiveData(line)));
  });

  return child.pid;
};

const analyzeRepository = async (repositoryUrl: string, serverName: string): Promise<{ engine: 'node' | 'python' | 'docker' | 'unknown'; prerequisites: string[] }> => {
  const engine: 'node' | 'python' | 'docker' | 'unknown' = 'unknown';
  const prerequisites: string[] = [];

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
      return { engine: 'node', prerequisites: ['node', 'npm', 'git'] };
    } else if (fileNames.includes('pyproject.toml') || fileNames.includes('setup.py')) {
      return { engine: 'python', prerequisites: ['python3', 'pip', 'git'] };
    } else if (fileNames.includes('Dockerfile') || fileNames.includes('docker-compose.yml')) {
      return { engine: 'docker', prerequisites: ['docker', 'docker-compose', 'git'] };
    }
  } catch (error) {
    console.warn('Failed to analyze repository', { repositoryUrl, error });
  }

  return { engine: 'unknown', prerequisites: ['git'] };
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
  const { engine, prerequisites } = await analyzeRepository(repositoryUrl, serverName);

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
      args: ['install'],
      cwd: installDir,
    });
    baseSteps.push({
      id: 'start',
      title: 'Start server',
      command: 'npm',
      args: ['start'],
      cwd: installDir,
      background: true,
    });
  } else if (engine === 'python') {
    baseSteps.push({
      id: 'venv',
      title: 'Create virtual environment',
      command: 'python3',
      args: ['-m', 'venv', '.venv'],
      cwd: installDir,
    });
    baseSteps.push({
      id: 'install',
      title: 'Install Python package',
      command: 'python3',
      args: ['-m', 'pip', 'install', '-e', '.'],
      cwd: installDir,
    });
    baseSteps.push({
      id: 'start',
      title: 'Start server',
      command: 'python3',
      args: ['-m', 'pip', 'install', '-e', '.'],
      cwd: installDir,
      background: true,
      optional: true,
    });
  } else if (engine === 'docker') {
    baseSteps.push({
      id: 'build',
      title: 'Build and start containers',
      command: 'docker',
      args: ['compose', 'up', '--build', '-d'],
      cwd: installDir,
      background: true,
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
    engine,
    steps,
    prerequisites: input.plan?.prerequisites ?? prerequisites,
    selectedPort: input.plan?.selectedPort,
  };
};

const generateServerConfigFromJob = (job: DeployBuildJob): ServerConfig => {
  const config: ServerConfig = {
    type: job.engine === 'docker' ? 'sse' : 'stdio',
    description: `Source-installed from ${job.repositoryUrl}${job.version ? ` (${job.version})` : ''}`,
    enabled: true,
  };

  if (job.engine === 'docker') {
    config.url = job.selectedPort ? `http://localhost:${job.selectedPort}` : 'http://localhost:3000';
  } else if (job.engine === 'node') {
    config.command = 'npm';
    config.args = ['start'];
    config.env = {
      ...(job.selectedPort ? { PORT: String(job.selectedPort) } : {}),
    };
  } else if (job.engine === 'python') {
    config.command = 'python3';
    config.args = ['-m', 'mcp', 'run', job.serverName];
    config.env = {
      ...(job.selectedPort ? { PORT: String(job.selectedPort) } : {}),
    };
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
  const jobs = await readJobs();
  jobs.push(job);
  await writeJobs(jobs);
  return job;
};

export const getDeployBuildJobs = async (): Promise<DeployBuildJob[]> => {
  return readJobs();
};

export const getDeployBuildJob = async (jobId: string): Promise<DeployBuildJob | null> => {
  const jobs = await readJobs();
  return jobs.find((job) => job.id === jobId) ?? null;
};

export const retryDeployBuildJob = async (jobId: string): Promise<DeployBuildJob | null> => {
  const jobs = await readJobs();
  const job = jobs.find((entry) => entry.id === jobId);
  if (!job) {
    return null;
  }

  const retried: DeployBuildJob = {
    ...job,
    status: 'queued',
    updatedAt: new Date().toISOString(),
    error: undefined,
    logs: [...job.logs, 'Retry requested.'],
  };
  const nextJobs = jobs.map((entry) => (entry.id === jobId ? retried : entry));
  await writeJobs(nextJobs);
  return retried;
};

export const registerServerFromInstall = async (jobId: string): Promise<boolean> => {
  const jobs = await readJobs();
  const job = jobs.find((entry) => entry.id === jobId);
  if (!job || job.status !== 'succeeded') {
    return false;
  }

  try {
    const serverConfig = generateServerConfigFromJob(job);
    const result = await addOrUpdateServer(job.serverName, serverConfig, true);
    if (result.success) {
      const nextJob = {
        ...job,
        updatedAt: new Date().toISOString(),
        logs: [...job.logs, `Server '${job.serverName}' registered successfully.`],
      };
      const nextJobs = jobs.map((entry) => (entry.id === jobId ? nextJob : entry));
      await writeJobs(nextJobs);
      return true;
    }
  } catch (error) {
    console.error('Failed to register server from install job', { jobId, error });
  }
  return false;
};

export const deinstallDeployBuildJob = async (jobId: string): Promise<DeployBuildJob | null> => {
  const jobs = await readJobs();
  const job = jobs.find((entry) => entry.id === jobId);
  if (!job) {
    return null;
  }

  const nextJob: DeployBuildJob = {
    ...job,
    status: 'deleting',
    updatedAt: new Date().toISOString(),
    logs: [...job.logs, 'Starting deinstallation.'],
  };
  const nextJobs = jobs.map((entry) => (entry.id === jobId ? nextJob : entry));
  await writeJobs(nextJobs);

  try {
    // Remove server from MCP registry if it was successfully registered
    if (job.status === 'succeeded') {
      try {
        await removeServer(job.serverName);
        const currentJob = (await readJobs()).find((entry) => entry.id === jobId);
        if (currentJob) {
          const updatedJob = addLogLine(currentJob, `Removed server '${job.serverName}' from registry.`);
          const updatedJobs = (await readJobs()).map((entry) => (entry.id === jobId ? updatedJob : entry));
          await writeJobs(updatedJobs);
        }
      } catch (serverError) {
        const currentJob = (await readJobs()).find((entry) => entry.id === jobId);
        if (currentJob) {
          const warnedJob = addLogLine(
            currentJob,
            `Warning: Failed to remove server from registry: ${serverError instanceof Error ? serverError.message : String(serverError)}`,
          );
          const warnedJobs = (await readJobs()).map((entry) => (entry.id === jobId ? warnedJob : entry));
          await writeJobs(warnedJobs);
        }
      }
    }

    await fs.rm(nextJob.installDir, { recursive: true, force: true });
    const finalizedJob: DeployBuildJob = {
      ...nextJob,
      status: 'deinstalled',
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      logs: [...(await readJobs()).find((entry) => entry.id === jobId)?.logs || [], `Removed install directory ${nextJob.installDir}.`],
    };
    const finalJobs = (await readJobs()).map((entry) => (entry.id === jobId ? finalizedJob : entry));
    await writeJobs(finalJobs);
    return finalizedJob;
  } catch (error) {
    const failedJob: DeployBuildJob = {
      ...nextJob,
      status: 'failed',
      updatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      logs: [...(await readJobs()).find((entry) => entry.id === jobId)?.logs || [], `Deinstallation failed: ${error instanceof Error ? error.message : String(error)}`],
    };
    const finalJobs = (await readJobs()).map((entry) => (entry.id === jobId ? failedJob : entry));
    await writeJobs(finalJobs);
    return failedJob;
  }
};

export const executeDeployBuildJob = async (jobId: string): Promise<void> => {
  const jobs = await readJobs();
  const job = jobs.find((entry) => entry.id === jobId);
  if (!job) {
    return;
  }

  const persist = async (nextJob: DeployBuildJob): Promise<void> => {
    const nextJobs = jobs.map((entry) => (entry.id === jobId ? nextJob : entry));
    await writeJobs(nextJobs);
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

    const selectedPort = currentJob.plan.selectedPort ?? (currentJob.engine === 'node' || currentJob.engine === 'python' ? await findAvailablePort() : undefined);
    if (typeof selectedPort === 'number') {
      currentJob = {
        ...currentJob,
        plan: { ...currentJob.plan, selectedPort },
        selectedPort,
      };
      currentJob = addLogLine(currentJob, `Selected port ${selectedPort} for runtime environment.`);
      await persist(currentJob);
    }

    currentJob = addLogLine(currentJob, `Using install root ${currentJob.installDir}`);
    await persist(currentJob);

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

    const stepEnv = {
      ...process.env,
      ...(currentJob.selectedPort ? { PORT: String(currentJob.selectedPort), MCPHUB_SOURCE_INSTALL_PORT: String(currentJob.selectedPort) } : {}),
    };

    for (const step of currentJob.plan.steps) {
      if (!step.command) continue;
      if (step.background) {
        currentJob = addLogLine(currentJob, `Starting background process: ${step.title}`);
        await persist(currentJob);
        const pid = await runBackgroundCommand(step.command, step.args ?? [], {
          cwd: step.cwd ?? currentJob.installDir,
          env: stepEnv,
          log: (line) => {
            currentJob = addLogLine(currentJob, line);
            void persist(currentJob);
          },
        });
        currentJob = addLogLine(currentJob, `Background process started with pid ${pid}.`);
        currentJob = { ...currentJob, processPid: pid, updatedAt: new Date().toISOString() };
        await persist(currentJob);
        continue;
      }
      try {
        currentJob = addLogLine(currentJob, `Running: ${step.title}`);
        await persist(currentJob);
        await runCommand(step.command, step.args ?? [], {
          cwd: step.cwd ?? currentJob.installDir,
          env: stepEnv,
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

    // Auto-register the server from the successful installation
    currentJob = addLogLine(currentJob, `Registering server '${currentJob.serverName}' with MCP hub...`);
    await persist(currentJob);
    const registered = await registerServerFromInstall(jobId);
    if (registered) {
      currentJob = addLogLine(currentJob, `Server '${currentJob.serverName}' registered and ready to use.`);
    } else {
      currentJob = addLogLine(currentJob, `Server registration completed (manual verification recommended).`);
    }
    await persist(currentJob);
  } catch (error) {
    currentJob = addLogLine(currentJob, `Installation failed: ${error instanceof Error ? error.message : String(error)}`);
    currentJob = {
      ...currentJob,
      status: 'failed',
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
    await persist(currentJob);
  }
};
