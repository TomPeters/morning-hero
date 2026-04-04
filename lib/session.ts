import { getIronSession, SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { env } from './env';

export type SessionData = {
  childId?: string;
  adminAuthed?: boolean;
};

const sessionOptions: SessionOptions = {
  password: env.sessionSecret,
  cookieName: 'morning-hero-session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 8, // 8 hours
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
