'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ListProgress, JobList } from '@/lib/types';
import JobTile from './JobTile';
import ProgressBar from './ProgressBar';

type Props = {
  childId: string;
  progress: ListProgress;
  list: JobList;
};

export default function ChecklistClient({ childId, progress, list }: Props) {
  const router = useRouter();
  const [completedJobIds, setCompletedJobIds] = useState<string[]>(progress.completedJobIds);
  const [error, setError] = useState('');

  const allDone = list.jobs.length > 0 && completedJobIds.length === list.jobs.length;

  useEffect(() => {
    if (allDone) {
      const timer = setTimeout(() => {
        router.push(`/${childId}/${progress.id}/reward`);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [allDone, childId, progress.id, router]);

  async function handleTap(jobId: string) {
    if (completedJobIds.includes(jobId)) return;

    // Optimistic update
    setCompletedJobIds(prev => [...prev, jobId]);
    setError('');

    const res = await fetch('/api/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listProgressId: progress.id, jobId }),
    });

    if (!res.ok) {
      // Rollback on error
      setCompletedJobIds(prev => prev.filter(id => id !== jobId));
      setError('Something went wrong, please try again');
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-10 gap-6 max-w-lg mx-auto w-full">
      <h1 className="text-2xl font-bold text-amber-800 text-center">{list.name}</h1>

      <ProgressBar completed={completedJobIds.length} total={list.jobs.length} />

      {error && (
        <p className="text-red-500 text-sm text-center">{error}</p>
      )}

      <div className="flex flex-col gap-3 w-full">
        {list.jobs.map(job => (
          <JobTile
            key={job.id}
            job={job}
            completed={completedJobIds.includes(job.id)}
            onTap={() => handleTap(job.id)}
          />
        ))}
      </div>

      {allDone && (
        <p className="text-2xl font-bold text-green-600 animate-bounce">
          Amazing work! 🎉
        </p>
      )}
    </main>
  );
}
