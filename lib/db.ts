import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { env } from './env';
import type { Job, JobList, ListProgress, ListProgressSummary, Profile } from './types';

const globalForDb = globalThis as unknown as { sql: ReturnType<typeof postgres> };
export const sql = globalForDb.sql ?? postgres(env.databaseUrl);
if (process.env.NODE_ENV !== 'production') globalForDb.sql = sql;

function toDateStr(d: unknown): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

async function seedProfiles() {
  const hash = await bcrypt.hash('morning', 10);
  await sql`
    INSERT INTO profiles (child_id, name, avatar_emoji, password_hash)
    VALUES ('hannah', 'Hannah', '🦄', ${hash})
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO profiles (child_id, name, avatar_emoji, password_hash)
    VALUES ('zoe', 'Zoe', '🐱', ${hash})
    ON CONFLICT DO NOTHING
  `;
}

async function initDb() {
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema.sql'), 'utf8');
  await sql.unsafe(schema);
  await seedProfiles();
}

// Only run at server runtime, not during next build
if (process.env.NEXT_PHASE !== 'phase-production-build') {
  initDb().catch(console.error);
}

export async function getJobLists(): Promise<JobList[]> {
  const rows = await sql`SELECT id, name, sort_order, jobs FROM job_lists ORDER BY sort_order`;
  return rows.map(r => ({
    id: r.id as string,
    name: r.name as string,
    sortOrder: r.sort_order as number,
    jobs: r.jobs as Job[],
  }));
}

export async function getJobList(id: string): Promise<JobList | null> {
  const rows = await sql`SELECT id, name, sort_order, jobs FROM job_lists WHERE id = ${id}`;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id as string,
    name: r.name as string,
    sortOrder: r.sort_order as number,
    jobs: r.jobs as Job[],
  };
}

export async function getListProgress(id: string): Promise<ListProgress | null> {
  const rows = await sql`
    SELECT id, child_id, list_id, date, completed_job_ids, all_complete
    FROM list_progress WHERE id = ${id}
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id as string,
    childId: r.child_id as string,
    listId: r.list_id as string,
    date: toDateStr(r.date),
    completedJobIds: r.completed_job_ids as string[],
    allComplete: r.all_complete as boolean,
  };
}

export async function getTodayInProgress(childId: string): Promise<ListProgressSummary[]> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await sql`
    SELECT
      lp.id, lp.list_id, lp.completed_job_ids,
      jl.name AS list_name, jl.jobs
    FROM list_progress lp
    JOIN job_lists jl ON jl.id = lp.list_id
    WHERE lp.child_id = ${childId}
      AND lp.date = ${today}
      AND lp.all_complete = FALSE
    ORDER BY lp.id
  `;
  return rows.map(r => ({
    id: r.id as string,
    listId: r.list_id as string,
    listName: r.list_name as string,
    completedCount: (r.completed_job_ids as string[]).length,
    totalCount: (r.jobs as Job[]).length,
  }));
}

export async function startListProgress(childId: string, listId: string): Promise<string> {
  const id = crypto.randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  await sql`
    INSERT INTO list_progress (id, child_id, list_id, date)
    VALUES (${id}, ${childId}, ${listId}, ${today})
  `;
  return id;
}

export async function completeJob(listProgressId: string, jobId: string): Promise<ListProgress> {
  const rows = await sql`
    SELECT lp.id, lp.child_id, lp.list_id, lp.date, lp.completed_job_ids, lp.all_complete,
           jl.jobs
    FROM list_progress lp
    JOIN job_lists jl ON jl.id = lp.list_id
    WHERE lp.id = ${listProgressId}
  `;
  if (rows.length === 0) throw new Error('Progress not found');

  const r = rows[0];
  const allJobs = r.jobs as Job[];
  const existing = r.completed_job_ids as string[];
  const updated = existing.includes(jobId) ? existing : [...existing, jobId];
  const allComplete = allJobs.length > 0 && allJobs.every(j => updated.includes(j.id));

  const result = await sql`
    UPDATE list_progress
    SET completed_job_ids = ${updated as unknown as string[]},
        all_complete = ${allComplete}
    WHERE id = ${listProgressId}
    RETURNING id, child_id, list_id, date, completed_job_ids, all_complete
  `;

  const u = result[0];
  return {
    id: u.id as string,
    childId: u.child_id as string,
    listId: u.list_id as string,
    date: toDateStr(u.date),
    completedJobIds: u.completed_job_ids as string[],
    allComplete: u.all_complete as boolean,
  };
}

export async function getProfile(childId: string): Promise<Profile | null> {
  const rows = await sql`
    SELECT child_id, name, avatar_emoji FROM profiles WHERE child_id = ${childId}
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    childId: r.child_id as string,
    name: r.name as string,
    avatarEmoji: r.avatar_emoji as string,
  };
}

export async function getProfileWithHash(childId: string): Promise<(Profile & { passwordHash: string }) | null> {
  const rows = await sql`
    SELECT child_id, name, avatar_emoji, password_hash FROM profiles WHERE child_id = ${childId}
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    childId: r.child_id as string,
    name: r.name as string,
    avatarEmoji: r.avatar_emoji as string,
    passwordHash: r.password_hash as string,
  };
}
