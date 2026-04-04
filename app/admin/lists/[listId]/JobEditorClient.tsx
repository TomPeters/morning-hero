'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { JobList, Job } from '@/lib/types';

type Props = { list: JobList };

export default function JobEditorClient({ list: initialList }: Props) {
  const router = useRouter();
  const [listName, setListName] = useState(initialList.name);
  const [jobs, setJobs] = useState<Job[]>(initialList.jobs);
  const [saving, setSaving] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function saveListName() {
    if (listName.trim() === initialList.name) return;
    setSavingName(true);
    await fetch('/api/admin/save-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId: initialList.id, name: listName.trim(), sortOrder: initialList.sortOrder }),
    });
    setSavingName(false);
    router.refresh();
  }

  function addJob() {
    setJobs(prev => [...prev, { id: crypto.randomUUID(), label: '' }]);
  }

  function updateJob(id: string, label: string) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, label } : j));
  }

  function removeJob(id: string) {
    setJobs(prev => prev.filter(j => j.id !== id));
  }

  function moveJob(index: number, direction: -1 | 1) {
    const next = [...jobs];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setJobs(next);
  }

  async function saveJobs(e: React.FormEvent) {
    e.preventDefault();
    const filtered = jobs.filter(j => j.label.trim());
    setSaving(true);
    setError('');
    setSaved(false);

    const res = await fetch('/api/admin/save-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId: initialList.id, jobs: filtered.map(j => ({ id: j.id, label: j.label.trim() })) }),
    });

    setSaving(false);
    if (res.ok) {
      setJobs(filtered.map(j => ({ ...j, label: j.label.trim() })));
      setSaved(true);
    } else {
      setError('Failed to save jobs');
    }
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-10 gap-6 max-w-lg mx-auto w-full">
      <a href="/admin/lists" className="text-amber-600 text-sm hover:underline">
        ← Back to lists
      </a>

      {/* List name editor */}
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={listName}
          onChange={e => setListName(e.target.value)}
          onBlur={saveListName}
          className="flex-1 text-2xl font-bold text-amber-800 bg-transparent border-b-2 border-amber-200 focus:border-amber-400 focus:outline-none py-1"
        />
        {savingName && <span className="text-sm text-gray-400">Saving…</span>}
      </div>

      {/* Jobs form */}
      <form onSubmit={saveJobs} className="flex flex-col gap-3">
        {jobs.length === 0 && (
          <p className="text-gray-400 text-center py-4">No jobs yet. Add one below.</p>
        )}
        {jobs.map((job, index) => (
          <div key={job.id} className="flex gap-2 items-center">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => moveJob(index, -1)}
                disabled={index === 0}
                className="text-gray-300 disabled:opacity-0 text-xs cursor-pointer leading-none"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => moveJob(index, 1)}
                disabled={index === jobs.length - 1}
                className="text-gray-300 disabled:opacity-0 text-xs cursor-pointer leading-none"
              >
                ▼
              </button>
            </div>
            <input
              type="text"
              value={job.label}
              onChange={e => updateJob(job.id, e.target.value)}
              placeholder="Job name…"
              className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-400 bg-white"
            />
            <button
              type="button"
              onClick={() => removeJob(job.id)}
              className="text-red-400 hover:text-red-600 cursor-pointer px-2"
            >
              ✕
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addJob}
          className="w-full border-2 border-dashed border-amber-300 rounded-xl py-3 text-amber-500 hover:border-amber-400 hover:text-amber-600 transition-colors cursor-pointer"
        >
          + Add job
        </button>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        {saved && <p className="text-green-600 text-sm text-center">Saved!</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full min-h-[52px] bg-amber-400 hover:bg-amber-500 disabled:bg-amber-200 text-white font-semibold rounded-xl transition-colors cursor-pointer"
        >
          {saving ? 'Saving…' : 'Save jobs'}
        </button>
      </form>
    </main>
  );
}
