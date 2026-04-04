'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PROFILES } from '@/lib/profiles';

export default function ProfileSelector() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function selectProfile(childId: string) {
    setSelected(childId);
    setPassword('');
    setError('');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ childId: selected, password }),
    });

    setLoading(false);
    if (res.ok) {
      router.push(`/${selected}`);
    } else {
      setError('Wrong password, try again');
      setPassword('');
    }
  }

  const selectedProfile = PROFILES.find(p => p.childId === selected);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 gap-10">
      <h1 className="text-4xl font-bold text-amber-800">Who are you?</h1>

      <div className="flex gap-6">
        {PROFILES.map(profile => (
          <button
            key={profile.childId}
            onClick={() => selectProfile(profile.childId)}
            className={`flex flex-col items-center justify-center gap-3 min-h-48 w-44 rounded-3xl shadow-lg transition-all cursor-pointer
              ${selected === profile.childId
                ? 'ring-4 ring-amber-500 scale-105'
                : 'hover:scale-102 hover:shadow-xl'
              }
              ${profile.childId === 'hannah' ? 'bg-pink-100' : 'bg-purple-100'}
            `}
          >
            <span className="text-8xl">{profile.avatarEmoji}</span>
            <span className="text-xl font-semibold text-gray-800">{profile.name}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="flex flex-col items-center gap-4 w-full max-w-xs">
          <p className="text-lg text-gray-600">
            Hi {selectedProfile?.name}! Enter your password:
          </p>
          <form onSubmit={handleLogin} className="flex flex-col items-center gap-3 w-full">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full text-xl text-center border-2 border-amber-300 rounded-2xl px-4 py-3 bg-white focus:outline-none focus:border-amber-500"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full min-h-[56px] bg-amber-400 hover:bg-amber-500 disabled:bg-amber-200 rounded-2xl text-lg font-semibold text-white transition-colors cursor-pointer"
            >
              {loading ? 'Checking...' : 'Go!'}
            </button>
          </form>
          <button
            onClick={() => setSelected(null)}
            className="text-gray-500 underline text-sm cursor-pointer"
          >
            Back
          </button>
        </div>
      )}
    </main>
  );
}
