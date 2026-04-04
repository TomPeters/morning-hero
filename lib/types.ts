export type Job = {
  id: string;
  label: string;
};

export type JobList = {
  id: string;
  name: string;
  sortOrder: number;
  jobs: Job[];
};

export type Profile = {
  childId: string;
  name: string;
  avatarEmoji: string;
};

export type ListProgress = {
  id: string;
  childId: string;
  listId: string;
  date: string;         // ISO date string YYYY-MM-DD
  completedJobIds: string[];
  allComplete: boolean;
};

export type ListProgressSummary = {
  id: string;           // list_progress.id
  listId: string;
  listName: string;
  completedCount: number;
  totalCount: number;
};
