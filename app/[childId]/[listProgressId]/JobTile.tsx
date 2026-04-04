import type { Job } from '@/lib/types';

type Props = {
  job: Job;
  completed: boolean;
  onTap: () => void;
};

export default function JobTile({ job, completed, onTap }: Props) {
  return (
    <button
      onClick={onTap}
      disabled={completed}
      className={`w-full min-h-[72px] rounded-2xl px-5 py-4 text-left text-lg font-medium transition-all active:scale-95 cursor-pointer
        ${completed
          ? 'bg-green-100 text-green-700 scale-[0.98]'
          : 'bg-white shadow hover:shadow-md text-gray-800'
        }
      `}
    >
      {completed ? (
        <span>
          <span className="mr-2">✅</span>
          <span className="line-through">{job.label}</span>
        </span>
      ) : (
        job.label
      )}
    </button>
  );
}
