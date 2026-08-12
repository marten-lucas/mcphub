import { useCallback, useEffect, useMemo, useState } from 'react';
import { BuildRun } from '@/types';
import { apiDelete, apiGet, apiPost } from '@/utils/fetchInterceptor';

export interface BuildRunFilters {
  serverName?: string;
  repositoryUrl?: string;
  subdir?: string;
}

const buildRunsQuery = (filters?: BuildRunFilters): string => {
  const params = new URLSearchParams();
  if (filters?.serverName?.trim()) {
    params.set('serverName', filters.serverName.trim());
  }
  if (filters?.repositoryUrl?.trim()) {
    params.set('repositoryUrl', filters.repositoryUrl.trim());
  }
  if (filters?.subdir?.trim()) {
    params.set('subdir', filters.subdir.trim());
  }
  const query = params.toString();
  return query ? `?${query}` : '';
};

export const useCustomBuildRuns = (filters?: BuildRunFilters) => {
  const [jobs, setJobs] = useState<BuildRun[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<BuildRun | null>(null);

  const queryString = useMemo(() => buildRunsQuery(filters), [
    filters?.serverName,
    filters?.repositoryUrl,
    filters?.subdir,
  ]);

  const reloadJob = useCallback(async (jobId: string) => {
    try {
      const result = await apiGet(`/market/build-runs/${jobId}`);
      if (result.success) {
        setSelectedJob(result.data ?? null);
      }
    } catch (error) {
      console.error('Failed to refresh build run', error);
    }
  }, []);

  const openJob = useCallback(async (jobId: string) => {
    try {
      const result = await apiGet(`/market/build-runs/${jobId}`);
      if (result.success) {
        setSelectedJobId(jobId);
        setSelectedJob(result.data ?? null);
      }
    } catch (error) {
      console.error('Failed to fetch build run', error);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const result = await apiGet(`/market/build-runs${queryString}`);
      if (!result.success || !Array.isArray(result.data)) {
        return;
      }

      const nextJobs = result.data as BuildRun[];
      setJobs(nextJobs);

      if (!selectedJobId) {
        return;
      }

      const nextSelected = nextJobs.find((job) => job.id === selectedJobId) ?? null;
      setSelectedJob(nextSelected);
      if (nextSelected) {
        void reloadJob(selectedJobId);
      }
    } catch (error) {
      console.error('Failed to load build runs', error);
    }
  }, [queryString, reloadJob, selectedJobId]);

  useEffect(() => {
    void loadJobs();

    const intervalId = window.setInterval(() => {
      void loadJobs();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [loadJobs]);

  const retryJob = useCallback(async (jobId: string) => {
    try {
      const result = await apiPost(`/market/build-runs/${jobId}/retry`);
      if (!result.success) {
        throw new Error(result.message || 'Failed to retry build run');
      }
      await openJob(result.data?.id ?? jobId);
      await loadJobs();
    } catch (error) {
      console.error('Failed to retry build run', error);
      throw error;
    }
  }, [loadJobs, openJob]);

  const deinstallJob = useCallback(async (jobId: string) => {
    try {
      const result = await apiDelete(`/market/build-runs/${jobId}`);
      if (!result.success) {
        throw new Error(result.message || 'Failed to remove build');
      }
      await openJob(result.data?.id ?? jobId);
      await loadJobs();
    } catch (error) {
      console.error('Failed to remove build', error);
      throw error;
    }
  }, [loadJobs, openJob]);

  return {
    jobs,
    selectedJobId,
    selectedJob,
    setSelectedJob,
    setSelectedJobId,
    loadJobs,
    reloadJob,
    openJob,
    retryJob,
    deinstallJob,
  };
};
