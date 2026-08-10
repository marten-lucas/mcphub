import { Request, Response } from 'express';
import {
  createDeployBuildJob,
  deinstallDeployBuildJob,
  getDeployBuildJob,
  getDeployBuildJobs,
  executeDeployBuildJob,
  previewDeployBuild,
  retryDeployBuildJob,
} from '../services/deployBuildService.js';

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

export const previewDeployBuildHandler = async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ success: false, message: 'Only admins can preview deploy builds' });
    return;
  }

  const username = getUsername(req);
  try {
    const { repositoryUrl, serverName, version, plan: planInput } = req.body ?? {};
    if (typeof repositoryUrl !== 'string' || !repositoryUrl.trim()) {
      res.status(400).json({ success: false, message: 'repositoryUrl is required' });
      auditLog('preview-deploy-build', username, { repositoryUrl, serverName, error: 'invalid_repo' }, false);
      return;
    }

    const plan = await previewDeployBuild({ repositoryUrl, serverName, version, plan: planInput });
    auditLog('preview-deploy-build', username, { repositoryUrl, serverName, version, engine: plan.engine }, true);
    res.json({ success: true, data: plan });
  } catch (error) {
    auditLog('preview-deploy-build', username, { error: error instanceof Error ? error.message : 'unknown' }, false);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to preview deployment' });
  }
};

export const createDeployBuildHandler = async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ success: false, message: 'Only admins can create deploy builds' });
    return;
  }

  const username = getUsername(req);
  try {
    const { repositoryUrl, serverName, version, plan: planInput } = req.body ?? {};
    if (typeof repositoryUrl !== 'string' || !repositoryUrl.trim()) {
      res.status(400).json({ success: false, message: 'repositoryUrl is required' });
      auditLog('create-deploy-build', username, { repositoryUrl, serverName, error: 'invalid_repo' }, false);
      return;
    }

    const job = await createDeployBuildJob({ repositoryUrl, serverName, version, plan: planInput });
    void executeDeployBuildJob(job.id).catch((error) => {
      console.error('Failed to execute deploy build job', {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    auditLog('create-deploy-build', username, { repositoryUrl, serverName, version, jobId: job.id }, true);
    res.status(202).json({ success: true, data: job });
  } catch (error) {
    auditLog('create-deploy-build', username, { error: error instanceof Error ? error.message : 'unknown' }, false);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to start deployment' });
  }
};

export const listDeployBuildJobsHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const jobs = await getDeployBuildJobs();
    res.json({ success: true, data: jobs });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to list deployment jobs' });
  }
};

export const getDeployBuildJobHandler = async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ success: false, message: 'Only admins can inspect deploy builds' });
    return;
  }

  try {
    const job = await getDeployBuildJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ success: false, message: 'Deployment job not found' });
      return;
    }
    res.json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to fetch deployment job' });
  }
};

export const retryDeployBuildHandler = async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ success: false, message: 'Only admins can retry deploy builds' });
    return;
  }

  const username = getUsername(req);
  const jobId = req.params.jobId;
  try {
    const retried = await retryDeployBuildJob(jobId);
    if (!retried) {
      res.status(404).json({ success: false, message: 'Deployment job not found' });
      auditLog('retry-deploy-build', username, { jobId, error: 'not_found' }, false);
      return;
    }
    void executeDeployBuildJob(retried.id).catch((error) => {
      console.error('Failed to execute retried deploy build job', {
        jobId: retried.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    auditLog('retry-deploy-build', username, { jobId, serverName: retried.serverName }, true);
    res.status(202).json({ success: true, data: retried });
  } catch (error) {
    auditLog('retry-deploy-build', username, { jobId, error: error instanceof Error ? error.message : 'unknown' }, false);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to retry deployment' });
  }
};

export const deinstallDeployBuildHandler = async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ success: false, message: 'Only admins can uninstall deploy builds' });
    return;
  }

  const username = getUsername(req);
  const jobId = req.params.jobId;
  try {
    const deinstalled = await deinstallDeployBuildJob(jobId);
    if (!deinstalled) {
      res.status(404).json({ success: false, message: 'Deployment job not found' });
      auditLog('deinstall-deploy-build', username, { jobId, error: 'not_found' }, false);
      return;
    }
    auditLog('deinstall-deploy-build', username, { jobId, serverName: deinstalled.serverName }, true);
    res.json({ success: true, data: deinstalled });
  } catch (error) {
    auditLog('deinstall-deploy-build', username, { jobId, error: error instanceof Error ? error.message : 'unknown' }, false);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to uninstall deployment' });
  }
};
