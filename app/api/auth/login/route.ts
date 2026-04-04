import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession } from '@/lib/session';
import { getProfileWithHash } from '@/lib/db';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { childId, password } = body as { childId: string; password: string };

  if (!childId || !password) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const profile = await getProfileWithHash(childId);
  const validPassword = profile
    ? await bcrypt.compare(password, profile.passwordHash)
    : false;

  // Always reject with the same error to avoid user enumeration
  if (!profile || !validPassword) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const session = await getSession();
  session.childId = childId;
  await session.save();

  return NextResponse.json({ ok: true });
}
