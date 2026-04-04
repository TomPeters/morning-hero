import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getListProgress, getJobList, completeJob } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.childId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { listProgressId, jobId } = body as { listProgressId: string; jobId: string };

  if (!listProgressId || !jobId) {
    return NextResponse.json({ error: 'listProgressId and jobId are required' }, { status: 400 });
  }

  const progress = await getListProgress(listProgressId);
  if (!progress) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (progress.childId !== session.childId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const today = new Date().toISOString().slice(0, 10);
  if (progress.date !== today) {
    return NextResponse.json({ error: 'Session expired' }, { status: 400 });
  }

  const list = await getJobList(progress.listId);
  if (!list || !list.jobs.some(j => j.id === jobId)) {
    return NextResponse.json({ error: 'Job not found in list' }, { status: 400 });
  }

  const updated = await completeJob(listProgressId, jobId);
  return NextResponse.json({
    allComplete: updated.allComplete,
    completedJobIds: updated.completedJobIds,
  });
}
