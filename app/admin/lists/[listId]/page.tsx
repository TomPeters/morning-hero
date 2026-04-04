import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getJobList } from '@/lib/db';
import JobEditorClient from './JobEditorClient';

export default async function JobEditorPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const session = await getSession();
  if (!session.adminAuthed) redirect('/admin');

  const list = await getJobList(listId);
  if (!list) notFound();

  return <JobEditorClient list={list} />;
}
