'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Profile, JobList, ListProgressSummary } from '@/lib/types';

type Props = {
  childId: string;
  profile: Profile;
  inProgress: ListProgressSummary[];
  lists: JobList[];
};

export default function SessionPickerClient({ childId, profile, inProgress, lists }: Props) {
  const router = useRouter();
  const [startingListId, setStartingListId] = useState<string | null>(null);

  async function startList(listId: string) {
    setStartingListId(listId);
    const res = await fetch('/api/progress/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId }),
    });
    if (res.ok) {
      const { listProgressId } = await res.json();
      router.push(`/${childId}/${listProgressId}`);
    } else {
      setStartingListId(null);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-10 gap-8 max-w-lg mx-auto w-full">
      <div className="flex items-center gap-3">
        <span className="text-5xl">{profile.avatarEmoji}</span>
        <h1 className="text-3xl font-bold text-amber-800">Hi {profile.name}!</h1>
      </div>

      {inProgress.length > 0 && (
        <section className="w-full">
          <h2 className="text-lg font-semibold text-gray-600 mb-3">Pick up where you left off</h2>
          <div className="flex flex-col gap-3">
            {inProgress.map(session => (
              <button
                key={session.id}
                onClick={() => router.push(`/${childId}/${session.id}`)}
                className="flex items-center justify-between w-full bg-white rounded-2xl shadow px-5 py-4 text-left hover:shadow-md transition-shadow cursor-pointer min-h-[72px]"
              >
                <span className="font-semibold text-gray-800">{session.listName}</span>
                <span className="text-sm text-amber-600 font-medium">
                  {session.completedCount} of {session.totalCount} done
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="w-full">
        <h2 className="text-lg font-semibold text-gray-600 mb-3">Start a list</h2>
        {lists.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No lists yet — ask a parent to create one!</p>
        ) : (
          <div className="flex flex-col gap-3">
            {lists.map(list => (
              <button
                key={list.id}
                onClick={() => startList(list.id)}
                disabled={startingListId === list.id}
                className="flex items-center justify-between w-full bg-white rounded-2xl shadow px-5 py-4 text-left hover:shadow-md transition-shadow cursor-pointer min-h-[72px] disabled:opacity-60"
              >
                <span className="font-semibold text-gray-800">{list.name}</span>
                <span className="text-sm text-gray-400">
                  {startingListId === list.id ? '...' : `${list.jobs.length} jobs`}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
