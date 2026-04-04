'use client';

import { useState } from 'react';
import type { Profile } from '@/lib/types';

type Props = { profile: Profile };

export default function ProfileEditorClient({ profile }: Props) {
  const [name, setName] = useState(profile.name);
  const [avatarEmoji, setAvatarEmoji] = useState(profile.avatarEmoji);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');

    const body: Record<string, string> = { childId: profile.childId };
    if (name.trim() !== profile.name) body.name = name.trim();
    if (avatarEmoji.trim() !== profile.avatarEmoji) body.avatarEmoji = avatarEmoji.trim();
    if (password) body.password = password;

    const res = await fetch('/api/admin/save-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (res.ok) {
      setMessage('Saved!');
      setPassword('');
      setConfirmPassword('');
    } else {
      setError('Failed to save');
    }
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-10 gap-6 max-w-lg mx-auto w-full">
      <a href="/admin/lists" className="text-amber-600 text-sm hover:underline">
        ← Back to lists
      </a>

      <div className="flex items-center gap-3">
        <span className="text-5xl">{avatarEmoji}</span>
        <h1 className="text-2xl font-bold text-amber-800">Edit {profile.name}</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-600">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-400 bg-white"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-600">Avatar emoji</label>
          <input
            type="text"
            value={avatarEmoji}
            onChange={e => setAvatarEmoji(e.target.value)}
            maxLength={2}
            className="border-2 border-gray-200 rounded-xl px-4 py-3 text-3xl w-24 text-center focus:outline-none focus:border-amber-400 bg-white"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-600">New password (leave blank to keep current)</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="New password"
            className="border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-400 bg-white"
          />
          {password && (
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="mt-2 border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-400 bg-white"
            />
          )}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        {message && <p className="text-green-600 text-sm">{message}</p>}

        <button
          type="submit"
          disabled={saving}
          className="min-h-[52px] bg-amber-400 hover:bg-amber-500 disabled:bg-amber-200 text-white font-semibold rounded-xl transition-colors cursor-pointer"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </main>
  );
}
