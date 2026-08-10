import { Request, Response } from 'express';
import {
  createSourceInstallJob,
  deinstallSourceInstallJob,
  getSourceInstallJob,
  getSourceInstallJobs,
  previewSourceInstall,
  retrySourceInstallJob,
} from '../services/sourceInstallService.js';

const isAdmin = (req: Request): boolean => Boolean((req as Request & { user?: { isAdmin?: boolean } }).user?.isAdmin);

const getUsername = (req: Request): string => {
  return (req as Request & { user?: { username?: string; name?: string } }).user?.username
    || (req as Request & { user?: { username?: string; name?: string } }).user?.name
    || 'unknown';
};

const auditLog = (action: string, username: string, details: any, success: boolean): void => {
  const timestamp = new Date().toISOString();
  console.log(`[AUDIT] ${timestamp} | action=${action} | user=${username} | success=${success} | details=${JSON.stringify(details)}`);
};

export const previewSourceInstallHandler = async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ success: false, message: 'Only admins can preview source installs' });
    return;
  }

  const username = getUsername(req);
  try {
    const { repositoryUrl, serverName, version, plan: planInput } = req.body ?? {};
    if (typeof repositoryUrl !== 'string' || !repositoryUrl.trim()) {
      res.status(400).json({ success: false, message: 'repositoryUrl is required' });
      auditLog('preview-source-install', username, { repositoryUrl, serverName, error: 'invalid_repo' }, false);
      return;
    }

    const plan = await previewSourceInstall({ repositoryUrl, serverName, version, plan: planInput });
    auditLog('preview-source-install', username, { repositoryUrl, serverName, version, engine: plan.engine }, true);
    res.json({ success: true, data: plan });
  } catch (error) {
    auditLog('preview-source-install', username, { error: error instanceof Error ? error.message : 'unknown' }, false);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to preview installation' });
  }
};

export const createSourceInstallHandler = async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ success: false, message: 'Only admins can create source installs' });
    return;
  }

  const username = getUsername(req);
  try {
    const { repositoryUrl, serverName, version, plan: planInput } = req.body ?? {};
    if (typeof repositoryUrl !== 'string' || !repositoryUrl.trim()) {
      res.status(400).json({ success: false, message: 'repositoryUrl is required' });
      auditLog('create-source-install', username, { repositoryUrl, serverName, error: 'invalid_repo' }, false);
      return;
    }

    const job = await createSourceInstallJob({ repositoryUrl, serverName, version, plan: planInput });
    auditLog('create-source-install', username, { repositoryUrl, serverName, version, jobId: job.id }, true);
    res.status(202).json({ success: true, data: job });
  } catch (error) {
    auditLog('create-source-install', username, { error: error instanceof Error ? error.message : 'unknown' }, false);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to start installation' });
  }
};

export const listSourceInstallJobsHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const jobs = await getSourceInstallJobs();
    res.json({ success: true, data: jobs });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to list installation jobs' });
  }
};

export const getSourceInstallJobHandler = async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ success: false, message: 'Only admins can inspect source installs' });
    return;
  }

  try {
    const job = await getSourceInstallJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ success: false, message: 'Installation job not found' });
      return;
    }
    res.json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to fetch installation job' });
  }
};

export const retrySourceInstallHandler = async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ success: false, message: 'Only admins can retry source installs' });
    return;
  }

  const username = getUsername(req);
  const jobId = req.params.jobId;
  try {
    const retried = await retrySourceInstallJob(jobId);
    if (!retried) {
      res.status(404).json({ success: false, message: 'Installation job not found' });
      auditLog('retry-source-install', username, { jobId, error: 'not_found' }, false);
      return;
    }
    auditLog('retry-source-install', username, { jobId, serverName: retried.serverName }, true);
    res.status(202).json({ success: true, data: retried });
  } catch (error) {
    auditLog('retry-source-install', username, { jobId, error: error instanceof Error ? error.message : 'unknown' }, false);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to retry installation' });
  }
};

export const deinstallSourceInstallHandler = async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ success: false, message: 'Only admins can uninstall source installs' });
    return;
  }

  const username = getUsername(req);
  const jobId = req.params.jobId;
  try {
    const deinstalled = await deinstallSourceInstallJob(jobId);
    if (!deinstalled) {
      res.status(404).json({ success: false, message: 'Installation job not found' });
      auditLog('deinstall-source-install', username, { jobId, error: 'not_found' }, false);
      return;
    }
    auditLog('deinstall-source-install', username, { jobId, serverName: deinstalled.serverName }, true);
    res.json({ success: true, data: deinstalled });
  } catch (error) {
    auditLog('deinstall-source-install', username, { jobId, error: error instanceof Error ? error.message : 'unknown' }, false);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to uninstall installation' });
  }
};
