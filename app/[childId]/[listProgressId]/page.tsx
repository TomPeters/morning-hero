import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getListProgress, getJobList } from '@/lib/db';
import ChecklistClient from './ChecklistClient';

export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ childId: string; listProgressId: string }>;
}) {
  const { childId, listProgressId } = await params;
  const session = await getSession();

  if (!session.childId || session.childId !== childId) {
    redirect('/');
  }

  const progress = await getListProgress(listProgressId);
  if (!progress) redirect(`/${childId}`);
  if (progress.childId !== childId) redirect('/');

  const today = new Date().toISOString().slice(0, 10);
  if (progress.date !== today) redirect(`/${childId}`);
  if (progress.allComplete) redirect(`/${childId}/${listProgressId}/reward`);

  const list = await getJobList(progress.listId);
  if (!list) redirect(`/${childId}`);

  return (
    <ChecklistClient
      childId={childId}
      progress={progress}
      list={list}
    />
  );
}
