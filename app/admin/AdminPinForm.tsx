'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPinForm() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });

    setLoading(false);
    if (res.ok) {
      router.refresh();
      router.push('/admin/lists');
    } else {
      setError('Wrong PIN, try again');
      setPin('');
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <h1 className="text-3xl font-bold text-amber-800">Parent Area</h1>
      <p className="text-gray-500">Enter your 4-digit PIN</p>
      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4 w-full max-w-xs">
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="••••"
          autoFocus
          className="w-full text-3xl text-center tracking-widest border-2 border-amber-300 rounded-2xl px-4 py-3 bg-white focus:outline-none focus:border-amber-500"
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading || pin.length < 4}
          className="w-full min-h-[56px] bg-amber-400 hover:bg-amber-500 disabled:bg-amber-200 rounded-2xl text-lg font-semibold text-white transition-colors cursor-pointer"
        >
          {loading ? 'Checking...' : 'Enter'}
        </button>
      </form>
      <a href="/" className="text-gray-400 text-sm hover:underline">
        ← Back to home
      </a>
    </main>
  );
}
