import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getProfile } from '@/lib/db';
import ProfileEditorClient from './ProfileEditorClient';

export default async function ProfileEditorPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const session = await getSession();
  if (!session.adminAuthed) redirect('/admin');

  const profile = await getProfile(childId);
  if (!profile) notFound();

  return <ProfileEditorClient profile={profile} />;
}
