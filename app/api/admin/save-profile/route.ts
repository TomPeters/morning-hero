import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession } from '@/lib/session';
import { sql } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.adminAuthed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { childId, name, avatarEmoji, password } = body as {
    childId: string;
    name?: string;
    avatarEmoji?: string;
    password?: string;
  };

  if (!childId) {
    return NextResponse.json({ error: 'childId is required' }, { status: 400 });
  }

  if (name !== undefined) {
    await sql`UPDATE profiles SET name = ${name} WHERE child_id = ${childId}`;
  }
  if (avatarEmoji !== undefined) {
    await sql`UPDATE profiles SET avatar_emoji = ${avatarEmoji} WHERE child_id = ${childId}`;
  }
  if (password !== undefined && password.length > 0) {
    const hash = await bcrypt.hash(password, 10);
    await sql`UPDATE profiles SET password_hash = ${hash} WHERE child_id = ${childId}`;
  }

  return NextResponse.json({ ok: true });
}
