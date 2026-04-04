'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import confetti from 'canvas-confetti';

type Props = {
  childId: string;
  childName: string;
};

export default function RewardReveal({ childId, childName }: Props) {
  const router = useRouter();

  useEffect(() => {
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <span className="text-[10rem] leading-none">🏆</span>
      <h1 className="text-4xl font-bold text-amber-800">Amazing work, {childName}!</h1>
      <p className="text-xl text-gray-600">You finished everything!</p>
      <button
        onClick={() => router.push(`/${childId}`)}
        className="mt-4 min-h-[56px] px-8 bg-amber-400 hover:bg-amber-500 rounded-2xl text-lg font-semibold text-white transition-colors cursor-pointer"
      >
        Back to lists
      </button>
    </main>
  );
}
