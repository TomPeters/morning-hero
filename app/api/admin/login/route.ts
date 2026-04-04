import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { env } from '@/lib/env';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { pin } = body as { pin: string };

  if (pin !== env.adminPin) {
    return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 });
  }

  const session = await getSession();
  session.adminAuthed = true;
  await session.save();

  return NextResponse.json({ ok: true });
}
