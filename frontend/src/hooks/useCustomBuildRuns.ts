import { useCallback, useEffect, useState } from 'react';
import { BuildRun, isFinalBuildStatus } from '@/types';
import { apiDelete, apiGet, apiPost } from '@/utils/fetchInterceptor';

export const useCustomBuildRuns = () => {
  const [jobs, setJobs] = useState<BuildRun[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<BuildRun | null>(null);

  const reloadJob = useCallback(async (jobId: string) => {
    try {
      const result = await apiGet(`/market/build-runs/${jobId}`);
      if (result.success) {
        setSelectedJob(result.data ?? null);
      }
    } catch (error) {
      console.error('Failed to refresh deploy build job', error);
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
      console.error('Failed to fetch deploy build job', error);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const result = await apiGet('/market/build-runs');
      if (result.success && Array.isArray(result.data)) {
        setJobs(result.data);

        if (selectedJobId) {
          const nextSelected = result.data.find((job: BuildRun) => job.id === selectedJobId);
          if (nextSelected) {
            setSelectedJob(nextSelected);
            void reloadJob(selectedJobId);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load deploy build jobs', error);
    }
  }, [reloadJob, selectedJobId]);

  useEffect(() => {
    void loadJobs();

    const intervalId = window.setInterval(async () => {
      await loadJobs();
      setSelectedJob((current) => {
        if (current && isFinalBuildStatus(current.status)) {
          window.clearInterval(intervalId);
        }
        return current;
      });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [loadJobs]);

  const retryJob = useCallback(async (jobId: string) => {
    try {
      const result = await apiPost(`/market/build-runs/${jobId}/retry`);
      if (!result.success) {
        throw new Error(result.message || 'Failed to retry installation');
      }
      await openJob(result.data?.id ?? jobId);
    } catch (error) {
      console.error('Failed to retry installation', error);
      throw error;
    }
  }, [openJob]);

  const deinstallJob = useCallback(async (jobId: string) => {
    try {
      const result = await apiDelete(`/market/build-runs/${jobId}`);
      if (!result.success) {
        throw new Error(result.message || 'Failed to deinstall installation');
      }
      await openJob(result.data?.id ?? jobId);
    } catch (error) {
      console.error('Failed to deinstall installation', error);
      throw error;
    }
  }, [openJob]);

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
