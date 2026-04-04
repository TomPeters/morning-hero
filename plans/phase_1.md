# Phase 1 Implementation Plan — Morning Hero MVP

## Goal

A fully working kids' checklist app: Hannah and Zoe can log in with their passwords, pick a job list, tick off jobs, and see a reward screen when all jobs are done. No job lists are seeded — an admin creates them via the admin area (Phase 2). The session picker shows an empty state if no lists exist yet.

---

## Packages to Install

```bash
npm install bcryptjs canvas-confetti
npm install --save-dev @types/bcryptjs @types/canvas-confetti
```

- `bcryptjs` — pure-JS bcrypt for password verification (no native bindings needed in Docker)
- `canvas-confetti` — confetti animation on the reward screen

---

## Environment Variables

`.env.local` (already git-ignored) must contain:

```
DATABASE_URL=postgres://morning-hero:localdev@localhost:5432/morning-hero-dev
SESSION_SECRET=any-32-char-local-dev-secret-here
HANNAH_PASSWORD=hannah123
ZOE_PASSWORD=zoe123
ADMIN_PIN=1234
```

These mirror the Key Vault secrets in deployed environments. `lib/env.ts` reads and validates them at startup.

---

## Files to Create

```
schema.sql
lib/
  env.ts
  db.ts
  session.ts
  types.ts
  profiles.ts
app/
  layout.tsx                              (replace scaffold)
  page.tsx                                (replace scaffold — ProfileSelector)
  globals.css                             (keep, minor tweaks)
  [childId]/
    page.tsx                              (SessionPickerPage — server component)
    SessionPickerClient.tsx               (client component)
  [childId]/[listProgressId]/
    page.tsx                              (ChecklistPage — server component)
    ChecklistClient.tsx                   (client component)
    JobTile.tsx
    ProgressBar.tsx
    reward/
      page.tsx                            (RewardPage — server component)
      RewardReveal.tsx                    (client component with confetti)
  api/
    auth/login/route.ts                   (POST — password check → set cookie)
    auth/logout/route.ts                  (POST — clear cookie)
    progress/start/route.ts               (POST — create list_progress row)
    progress/[listProgressId]/route.ts    (GET — current session state)
    complete/route.ts                     (POST — mark job complete)
```

---

## Step 1 — schema.sql

Create `schema.sql` in the repo root. All statements use `CREATE TABLE IF NOT EXISTS`.

```sql
CREATE TABLE IF NOT EXISTS profiles (
  child_id       TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  avatar_emoji   TEXT NOT NULL,
  password_hash  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_lists (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INT  NOT NULL DEFAULT 0,
  jobs        JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS list_progress (
  id                 TEXT PRIMARY KEY,
  child_id           TEXT NOT NULL REFERENCES profiles(child_id),
  list_id            TEXT NOT NULL REFERENCES job_lists(id),
  date               DATE NOT NULL,
  completed_job_ids  TEXT[] NOT NULL DEFAULT '{}',
  all_complete       BOOLEAN NOT NULL DEFAULT FALSE
);
```

---

## Step 2 — lib/env.ts

Reads and validates environment variables. Throws at startup if any are missing so the app fails fast rather than failing silently at runtime.

```ts
function require(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

export const env = {
  databaseUrl: require('DATABASE_URL'),
  sessionSecret: require('SESSION_SECRET'),
  hannahPassword: require('HANNAH_PASSWORD'),
  zoePassword:    require('ZOE_PASSWORD'),
  adminPin:       require('ADMIN_PIN'),
};
```

---

## Step 3 — lib/db.ts

Sets up a single `postgres` client (singleton pattern for Next.js HMR), runs `schema.sql` on startup, and seeds the child profiles.

**Singleton pattern**: export a `sql` tag from a module-level variable. In dev, use `global` to avoid creating a new pool on every HMR reload.

**`initDb()`** — called once at module load:
1. Read and execute `schema.sql` (path: `path.join(process.cwd(), 'schema.sql')`)
2. Call `seedProfiles()`

**`seedProfiles()`**:
1. Hash passwords for Hannah and Zoe using `bcryptjs.hash(password, 10)` and insert both profiles with `INSERT ... ON CONFLICT DO NOTHING`
2. No job lists are seeded — the admin creates them via the admin area

**Query helper functions** (typed, called from API routes and server components):

```ts
// Returns all job lists ordered by sort_order
getJobLists(): Promise<JobList[]>

// Returns a single list_progress row, or null
getListProgress(id: string): Promise<ListProgress | null>

// Returns today's in-progress sessions for a child (date = today, all_complete = false)
getTodayInProgress(childId: string): Promise<ListProgressSummary[]>

// Creates a new list_progress row, returns its id
startListProgress(childId: string, listId: string): Promise<string>

// Appends jobId to completed_job_ids; sets all_complete if all jobs done
// Returns the updated row
completeJob(listProgressId: string, jobId: string): Promise<ListProgress>

// Returns a profile by childId
getProfile(childId: string): Promise<Profile | null>
```

`getTodayInProgress` returns a joined query: `list_progress JOIN job_lists` so the result includes the list name. Define a `ListProgressSummary` type for this.

All queries use parameterised values — never string interpolation.

---

## Step 4 — lib/types.ts

```ts
export type Job = {
  id: string;
  label: string;
};

export type JobList = {
  id: string;
  name: string;
  sortOrder: number;
  jobs: Job[];
};

export type Profile = {
  childId: string;
  name: string;
  avatarEmoji: string;
};

export type ListProgress = {
  id: string;
  childId: string;
  listId: string;
  date: string;         // ISO date string YYYY-MM-DD
  completedJobIds: string[];
  allComplete: boolean;
};

export type ListProgressSummary = {
  id: string;           // list_progress.id
  listId: string;
  listName: string;
  completedCount: number;
  totalCount: number;
};
```

---

## Step 5 — lib/session.ts

Configures `iron-session` for use in App Router API routes and server components.

```ts
import { getIronSession, SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

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
    maxAge: 60 * 60 * 8,  // 8 hours
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
```

> Note: In App Router, `iron-session` is used with `cookies()` from `next/headers`. API route handlers call `getSession()` to read/write session data.

---

## Step 6 — lib/profiles.ts

Static display config for the two children (used on the home screen before auth).

```ts
export const PROFILES = [
  { childId: 'hannah', name: 'Hannah', avatarEmoji: '🦄' },
  { childId: 'zoe',    name: 'Zoe',    avatarEmoji: '🐱' },
];
```

---

## Step 7 — API Routes

### POST /api/auth/login

Body: `{ childId: string, password: string }`

1. Look up `childId` in `profiles` table
2. `bcryptjs.compare(password, profile.passwordHash)`
3. If match: set `session.childId = childId`, save session, return `{ ok: true }`
4. If no match: return 401 `{ error: 'Invalid password' }`
5. Reject unknown `childId` with 401 (same error message — no user enumeration)

### POST /api/auth/logout

1. Destroy session (call `session.destroy()`)
2. Return `{ ok: true }`

### POST /api/progress/start

Body: `{ listId: string }`

Auth: read `childId` from session cookie. Return 401 if no session.

1. Verify `listId` exists in `job_lists`; return 404 if not
2. Call `startListProgress(childId, listId)` → returns `listProgressId`
3. Return `{ listProgressId }`

### GET /api/progress/[listProgressId]

Auth: read `childId` from session cookie. Return 401 if no session.

1. Call `getListProgress(listProgressId)`; return 404 if not found
2. Verify `row.childId === session.childId`; return 403 if not (ownership check)
3. Fetch the `job_lists` row for `row.listId` to get the jobs array
4. Return `{ progress: ListProgress, list: JobList }`

### POST /api/complete

Body: `{ listProgressId: string, jobId: string }`

Auth: read `childId` from session cookie. Return 401 if no session.

1. Fetch `list_progress` row; return 404 if not found
2. Verify `row.childId === session.childId`; return 403 if not
3. Verify `row.date` is today's date; return 400 `{ error: 'Session expired' }` if not
4. Verify `jobId` exists in the list's jobs array; return 400 if not
5. Call `completeJob(listProgressId, jobId)`
6. Return `{ allComplete: boolean, completedJobIds: string[] }`

---

## Step 8 — App Pages

### app/layout.tsx

Replace the scaffold. Keep Geist font, update metadata title to "Morning Hero". Keep `<body className="min-h-full flex flex-col bg-yellow-50">` (warm background throughout app).

### app/page.tsx — Profile Selector

Server component. Renders two large profile tiles side by side.

Each tile:
- Big emoji (text-8xl)
- Child's name below
- Full card is a `<button>` — clicking navigates to a password form

Password form state is client-side (inline within the page as a `'use client'` sub-component, or a separate `ProfileSelector.tsx`). When a tile is clicked, show an inline PIN/password entry below the tiles (not a separate page).

Password entry:
- `<input type="password">` with large text, centered
- Submit calls `POST /api/auth/login`
- On success: `router.push('/[childId]')`
- On failure: show "Wrong password, try again" below input
- Show a "Back" link to deselect and go back to the tile selection

This entire interaction is a single-page experience — no separate route for the password form.

### app/[childId]/page.tsx — Session Picker (server component)

On render:
1. `getSession()` — if no `session.childId` or `session.childId !== params.childId` → `redirect('/')`
2. `getTodayInProgress(childId)` — today's incomplete sessions
3. `getJobLists()` — all available lists
4. `getProfile(childId)` — for greeting
5. Render `<SessionPickerClient>` passing the data as props

### app/[childId]/SessionPickerClient.tsx — client component

Two sections:

**Resume section** (hidden if `inProgress` is empty):
- Heading: "Pick up where you left off"
- Cards showing list name + "X of N done" progress
- Tapping a card navigates to `/[childId]/[progressId]`

**Start new list section**:
- Heading: "Start a list"
- Cards for each `JobList` — show list name + job count
- Tapping calls `POST /api/progress/start` with `{ listId }`, then `router.push('/[childId]/[listProgressId]')` with the returned id

Show a loading state on the card while the API call is in flight (disable the button, show a spinner or dim the card).

### app/[childId]/[listProgressId]/page.tsx — Checklist Page (server component)

On render:
1. `getSession()` — if no session or `session.childId !== params.childId` → `redirect('/')`
2. `getListProgress(listProgressId)` — if not found → `redirect('/[childId]')`
3. Verify `progress.childId === session.childId` — if not → `redirect('/')`
4. Verify `progress.date === today()` — if not → `redirect('/[childId]')`
5. If `progress.allComplete` → `redirect('/[childId]/[listProgressId]/reward')`
6. Fetch `job_lists` row for `progress.listId`
7. Render `<ChecklistClient>` with `{ progress, list }`

### app/[childId]/[listProgressId]/ChecklistClient.tsx — client component

Props: `{ progress: ListProgress, list: JobList, childId: string }`

State:
- `completedJobIds: string[]` — initialised from props, updated optimistically on tap

Renders:
- List name as heading
- `<ProgressBar>` component
- Grid/list of `<JobTile>` components
- When `completedJobIds.length === list.jobs.length` → automatically `router.push('.../reward')` (after a short delay, ~800 ms, so the child sees the last tile complete)

On job tile tap:
1. Optimistically add `jobId` to `completedJobIds` (immediate visual feedback)
2. Call `POST /api/complete` with `{ listProgressId, jobId }`
3. On error: remove `jobId` from local state, show a brief error toast

### app/[childId]/[listProgressId]/JobTile.tsx

Props: `{ job: Job, completed: boolean, onTap: () => void }`

Large tappable button. When `completed`:
- Green background, checkmark emoji prefix, strikethrough label text, slightly scaled down

When not completed:
- White card with shadow, large label text

Minimum touch target: `min-h-[72px]`. Use `active:scale-95` for press feedback.

### app/[childId]/[listProgressId]/ProgressBar.tsx

Props: `{ completed: number, total: number }`

Shows:
- Text: "X of N done"
- A filled bar (`completed/total * 100%` width) using Tailwind transition for smooth fill

### app/[childId]/[listProgressId]/reward/page.tsx — Reward Page (server component)

On render:
1. `getSession()` — if no session or mismatch → `redirect('/')`
2. `getListProgress(listProgressId)` — if not found → `redirect('/[childId]')`
3. Verify ownership and date (same as checklist page)
4. If `!progress.allComplete` → `redirect('/[childId]/[listProgressId]')`
5. `getProfile(childId)` — for personalised message
6. Render `<RewardReveal childName={profile.name} />`

### app/[childId]/[listProgressId]/reward/RewardReveal.tsx — client component

On mount: fire `canvas-confetti` burst.

Confetti config:
```ts
confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
```

Display:
- Giant star/trophy emoji (text-9xl, centred)
- "Amazing work, [Name]!" heading
- "You finished everything!" subtext
- "Back to lists" button → `router.push('/[childId]')`

---

## Step 9 — Utility: today()

Create `lib/date.ts`:

```ts
// Returns today's date as YYYY-MM-DD in local time
export function today(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
```

> Note: `toISOString()` returns UTC. If the app is used across midnight, this could show yesterday's date. For a kids' morning routine app this is fine — production runs in the UK, and the app resets at midnight UTC which is 1am BST / midnight GMT.

---

## Step 10 — Update app/globals.css

Remove all the scaffold-specific CSS (Next.js template styles). Keep the Tailwind base directives. Add:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## DB Initialisation Trigger

`lib/db.ts` exports `initDb()` and calls it immediately at module load (outside any function). Because Next.js server components import from `lib/db.ts`, this runs when the server starts and on the first request in dev.

To ensure it runs before the first request is served in production, add this to `app/layout.tsx`:

```ts
import '@/lib/db';  // triggers initDb() side effect
```

This import ensures the module is evaluated (and schema/seed applied) before any route handler runs.

---

## Styling Notes

- Background: `bg-amber-50` for the overall app feel (warm, cheerful)
- Profile tiles: large cards `min-h-48 rounded-3xl shadow-lg` with coloured backgrounds per child
- Job tiles: `rounded-2xl` with generous padding
- All interactive elements: `min-h-[72px]` touch targets, `cursor-pointer`
- Fonts: keep Geist Sans (already configured in layout)
- No dark mode needed — remove dark: variants from the layout

---

## What Phase 1 Does NOT Include

- Admin area (Phase 2) — job lists must be created there before kids can use the app
- Changing passwords or PIN (admin area)
- Story mode / AI rewards (Phase 3)

---

## Acceptance Checklist

- [ ] `docker compose up -d && npm run dev` starts without errors
- [ ] Schema tables created on first start; re-running is a no-op
- [ ] Hannah and Zoe profiles seeded on first start
- [ ] Home screen shows two profile tiles
- [ ] Entering wrong password shows error; correct password redirects to session picker
- [ ] Session picker shows empty state when no lists exist
- [ ] Session picker shows "Start a list" section once lists have been created via admin
- [ ] Tapping a list creates a `list_progress` row and navigates to the checklist
- [ ] Tapping a job tile marks it complete with visual feedback
- [ ] Progress bar updates correctly
- [ ] When all jobs are done, app redirects to the reward page
- [ ] Reward page shows confetti and personalised message
- [ ] Navigating directly to `/hannah/some-id` while logged in as Zoe redirects to `/`
- [ ] Navigating to a checklist from a previous day redirects to the session picker
- [ ] Navigating directly to `/reward` when `all_complete = false` redirects to checklist
