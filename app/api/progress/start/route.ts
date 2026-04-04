import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getJobList, startListProgress } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.childId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { listId } = body as { listId: string };

  if (!listId) {
    return NextResponse.json({ error: 'listId is required' }, { status: 400 });
  }

  const list = await getJobList(listId);
  if (!list) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 });
  }

  const listProgressId = await startListProgress(session.childId, listId);
  return NextResponse.json({ listProgressId });
}
