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

export const previewSourceInstallHandler = async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ success: false, message: 'Only admins can preview source installs' });
    return;
  }

  try {
    const { repositoryUrl, serverName, version, plan: planInput } = req.body ?? {};
    if (typeof repositoryUrl !== 'string' || !repositoryUrl.trim()) {
      res.status(400).json({ success: false, message: 'repositoryUrl is required' });
      return;
    }

    const plan = await previewSourceInstall({ repositoryUrl, serverName, version, plan: planInput });
    res.json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to preview installation' });
  }
};

export const createSourceInstallHandler = async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ success: false, message: 'Only admins can create source installs' });
    return;
  }

  try {
    const { repositoryUrl, serverName, version, plan: planInput } = req.body ?? {};
    if (typeof repositoryUrl !== 'string' || !repositoryUrl.trim()) {
      res.status(400).json({ success: false, message: 'repositoryUrl is required' });
      return;
    }

    const job = await createSourceInstallJob({ repositoryUrl, serverName, version, plan: planInput });
    res.status(202).json({ success: true, data: job });
  } catch (error) {
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

  try {
    const retried = await retrySourceInstallJob(req.params.jobId);
    if (!retried) {
      res.status(404).json({ success: false, message: 'Installation job not found' });
      return;
    }
    res.status(202).json({ success: true, data: retried });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to retry installation' });
  }
};

export const deinstallSourceInstallHandler = async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ success: false, message: 'Only admins can uninstall source installs' });
    return;
  }

  try {
    const deinstalled = await deinstallSourceInstallJob(req.params.jobId);
    if (!deinstalled) {
      res.status(404).json({ success: false, message: 'Installation job not found' });
      return;
    }
    res.json({ success: true, data: deinstalled });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to uninstall installation' });
  }
};
