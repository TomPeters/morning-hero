import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getListProgress, getProfile } from '@/lib/db';
import RewardReveal from './RewardReveal';

export default async function RewardPage({
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
  if (!progress.allComplete) redirect(`/${childId}/${listProgressId}`);

  const profile = await getProfile(childId);
  if (!profile) redirect('/');

  return <RewardReveal childId={childId} childName={profile.name} />;
}
