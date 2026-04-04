type Props = {
  completed: number;
  total: number;
};

export default function ProgressBar({ completed, total }: Props) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm font-medium text-gray-600 mb-2">
        <span>{completed} of {total} done</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
        <div
          className="bg-amber-400 h-4 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
