import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getTodayInProgress, getJobLists, getProfile } from '@/lib/db';
import SessionPickerClient from './SessionPickerClient';

export default async function SessionPickerPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const session = await getSession();

  if (!session.childId || session.childId !== childId) {
    redirect('/');
  }

  const [inProgress, lists, profile] = await Promise.all([
    getTodayInProgress(childId),
    getJobLists(),
    getProfile(childId),
  ]);

  if (!profile) redirect('/');

  return (
    <SessionPickerClient
      childId={childId}
      profile={profile}
      inProgress={inProgress}
      lists={lists}
    />
  );
}
