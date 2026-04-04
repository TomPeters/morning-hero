import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getJobLists, getProfile } from '@/lib/db';
import { PROFILES } from '@/lib/profiles';
import ListManagerClient from './ListManagerClient';

export default async function ListManagerPage() {
  const session = await getSession();
  if (!session.adminAuthed) redirect('/admin');

  const [lists, profiles] = await Promise.all([
    getJobLists(),
    Promise.all(PROFILES.map(p => getProfile(p.childId))),
  ]);

  return (
    <ListManagerClient
      lists={lists}
      profiles={profiles.filter(Boolean) as Awaited<ReturnType<typeof getProfile>>[]}
    />
  );
}
