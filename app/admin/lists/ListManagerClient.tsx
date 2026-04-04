'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { JobList, Profile } from '@/lib/types';

type Props = {
  lists: JobList[];
  profiles: (Profile | null)[];
};

export default function ListManagerClient({ lists: initialLists, profiles }: Props) {
  const router = useRouter();
  const [lists, setLists] = useState<JobList[]>(initialLists);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function addList(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setError('');

    const res = await fetch('/api/admin/save-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), sortOrder: lists.length }),
    });

    setAdding(false);
    if (res.ok) {
      setNewName('');
      router.refresh();
    } else {
      setError('Failed to create list');
    }
  }

  async function deleteList(listId: string) {
    if (!confirm('Delete this list and all its progress? This cannot be undone.')) return;
    setDeletingId(listId);
    setError('');

    const res = await fetch('/api/admin/delete-list', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId }),
    });

    setDeletingId(null);
    if (res.ok) {
      setLists(prev => prev.filter(l => l.id !== listId));
    } else {
      const data = await res.json();
      setError(data.error ?? 'Failed to delete list');
    }
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-10 gap-8 max-w-lg mx-auto w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-amber-800">Lists</h1>
        <button
          onClick={logout}
          className="text-sm text-gray-400 underline cursor-pointer"
        >
          Log out
        </button>
      </div>

      {/* Child profile links */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Profiles</h2>
        <div className="flex gap-3">
          {profiles.filter(Boolean).map(p => p && (
            <a
              key={p.childId}
              href={`/admin/profile/${p.childId}`}
              className="flex items-center gap-2 bg-white rounded-2xl shadow px-4 py-3 hover:shadow-md transition-shadow"
            >
              <span className="text-2xl">{p.avatarEmoji}</span>
              <span className="font-medium text-gray-700">{p.name}</span>
            </a>
          ))}
        </div>
      </section>

      {/* Job lists */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Job Lists</h2>
        {lists.length === 0 && (
          <p className="text-gray-400 text-center py-6">No lists yet. Create one below.</p>
        )}
        {lists.map(list => (
          <div
            key={list.id}
            className="flex items-center justify-between bg-white rounded-2xl shadow px-5 py-4 min-h-[72px]"
          >
            <div>
              <p className="font-semibold text-gray-800">{list.name}</p>
              <p className="text-sm text-gray-400">{list.jobs.length} jobs</p>
            </div>
            <div className="flex gap-3 items-center">
              <a
                href={`/admin/lists/${list.id}`}
                className="text-amber-600 font-medium text-sm hover:underline"
              >
                Edit
              </a>
              <button
                onClick={() => deleteList(list.id)}
                disabled={deletingId === list.id || lists.length <= 1}
                className="text-red-400 text-sm disabled:text-gray-300 cursor-pointer disabled:cursor-not-allowed"
              >
                {deletingId === list.id ? '...' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </section>

      {error && <p className="text-red-500 text-sm text-center">{error}</p>}

      {/* Add list form */}
      <form onSubmit={addList} className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New list name…"
          className="flex-1 border-2 border-amber-200 rounded-xl px-4 py-2 focus:outline-none focus:border-amber-400 bg-white"
        />
        <button
          type="submit"
          disabled={adding || !newName.trim()}
          className="bg-amber-400 hover:bg-amber-500 disabled:bg-amber-200 text-white font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer"
        >
          {adding ? '...' : 'Add'}
        </button>
      </form>
    </main>
  );
}
