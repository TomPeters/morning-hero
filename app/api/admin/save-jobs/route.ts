import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { sql } from '@/lib/db';
import type { Job } from '@/lib/types';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.adminAuthed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { listId, jobs } = body as { listId: string; jobs: Job[] };

  if (!listId || !Array.isArray(jobs)) {
    return NextResponse.json({ error: 'listId and jobs array are required' }, { status: 400 });
  }

  const valid = jobs.every(
    j => typeof j.id === 'string' && j.id.length > 0 && typeof j.label === 'string'
  );
  if (!valid) {
    return NextResponse.json({ error: 'Each job must have id and label' }, { status: 400 });
  }

  await sql`UPDATE job_lists SET jobs = ${sql.json(jobs)} WHERE id = ${listId}`;

  return NextResponse.json({ ok: true });
}
