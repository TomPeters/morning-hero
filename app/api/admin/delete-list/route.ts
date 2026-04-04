import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { sql } from '@/lib/db';

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session.adminAuthed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { listId } = body as { listId: string };

  if (!listId) {
    return NextResponse.json({ error: 'listId is required' }, { status: 400 });
  }

  const countResult = await sql`SELECT COUNT(*) AS count FROM job_lists`;
  const count = Number(countResult[0].count);
  if (count <= 1) {
    return NextResponse.json({ error: 'Cannot delete the only list' }, { status: 400 });
  }

  // Delete list_progress rows first (no CASCADE in schema)
  await sql`DELETE FROM list_progress WHERE list_id = ${listId}`;
  await sql`DELETE FROM job_lists WHERE id = ${listId}`;

  return NextResponse.json({ ok: true });
}
