import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { sql } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.adminAuthed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { listId, name, sortOrder } = body as {
    listId?: string;
    name: string;
    sortOrder: number;
  };

  if (!name || typeof sortOrder !== 'number') {
    return NextResponse.json({ error: 'name and sortOrder are required' }, { status: 400 });
  }

  if (!listId) {
    // Create new list
    const newId = crypto.randomUUID();
    await sql`
      INSERT INTO job_lists (id, name, sort_order)
      VALUES (${newId}, ${name}, ${sortOrder})
    `;
    return NextResponse.json({ listId: newId });
  }

  // Update existing list
  await sql`
    UPDATE job_lists SET name = ${name}, sort_order = ${sortOrder} WHERE id = ${listId}
  `;
  return NextResponse.json({ listId });
}
