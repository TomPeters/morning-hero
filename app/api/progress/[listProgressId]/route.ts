import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getListProgress, getJobList } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ listProgressId: string }> }
) {
  const session = await getSession();
  if (!session.childId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { listProgressId } = await params;
  const progress = await getListProgress(listProgressId);
  if (!progress) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (progress.childId !== session.childId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const list = await getJobList(progress.listId);
  return NextResponse.json({ progress, list });
}
