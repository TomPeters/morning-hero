# Phase 1 Implementation Plan — Morning Hero MVP

## Goal

A complete, shippable app: the admin creates job lists via a PIN-protected admin area, and Hannah and Zoe can then log in, pick a list, tick off jobs, and see a reward screen when done. Both the kids' flow and the admin area are built together so the app is testable and usable end-to-end.

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
ADMIN_PIN=1234
```

These mirror the Key Vault secrets in deployed environments. `lib/env.ts` reads and validates them at startup. Child passwords are stored as bcrypt hashes in the database and managed via the admin area — they are not environment variables.

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
  admin/
    layout.tsx                            (PIN gate wrapper)
    page.tsx                              (redirect to /admin/lists)
    lists/
      page.tsx                            (ListManagerPage — server component)
      ListManagerClient.tsx               (client component)
      [listId]/
        page.tsx                          (JobEditorPage — server component)
        JobEditorClient.tsx               (client component)
    profile/
      [childId]/
        page.tsx                          (ProfileEditorPage — server component)
        ProfileEditorClient.tsx           (client component)
  api/
    auth/login/route.ts                   (POST — password check → set cookie)
    auth/logout/route.ts                  (POST — clear cookie)
    admin/
      login/route.ts                      (POST — PIN check → set admin cookie)
      logout/route.ts                     (POST — clear admin cookie)
      save-list/route.ts                  (POST — create or rename a list)
      delete-list/route.ts                (DELETE — delete a list)
      save-jobs/route.ts                  (POST — save jobs array for a list)
      save-profile/route.ts               (POST — update name, avatar, password)
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
  databaseUrl:   require('DATABASE_URL'),
  sessionSecret: require('SESSION_SECRET'),
  adminPin:      require('ADMIN_PIN'),
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
1. Insert Hannah and Zoe's profiles with `INSERT ... ON CONFLICT DO NOTHING`
2. Passwords are seeded with a bcrypt hash of a hardcoded default (`"morning"`) — the admin must change these via the admin area before the kids use the app
3. No job lists are seeded — the admin creates them via the admin area

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
4. Verify `progress.date` equals today's date (`new Date().toISOString().slice(0, 10)`) — if not → `redirect('/[childId]')`
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

## Step 9 — Admin Area

### Authentication

`app/admin/layout.tsx` is a server component that wraps all `/admin` routes:
1. `getSession()` — if `!session.adminAuthed` → render the PIN entry form instead of `{children}`
2. PIN form submits to `POST /api/admin/login`
3. On success: `session.adminAuthed = true`, save, redirect to `/admin/lists`

`POST /api/admin/login` body: `{ pin: string }`
- Compare `pin` against `env.adminPin`
- On match: set `session.adminAuthed = true`, save, return `{ ok: true }`
- On mismatch: return 401 `{ error: 'Wrong PIN' }`

`POST /api/admin/logout` — destroy session, redirect to `/admin`

### Admin API routes

All admin routes check `session.adminAuthed` and return 401 if not set.

**POST /api/admin/save-list** — body: `{ listId?: string, name: string, sortOrder: number }`
- If `listId` is absent: create a new list (generate id with `crypto.randomUUID()`)
- If `listId` is present: update name and/or sort_order
- Return `{ listId }`

**DELETE /api/admin/delete-list** — body: `{ listId: string }`
- Count rows in `job_lists`; if only 1, return 400 `{ error: 'Cannot delete the only list' }`
- Delete the row; also delete any `list_progress` rows referencing this list
- Return `{ ok: true }`

**POST /api/admin/save-jobs** — body: `{ listId: string, jobs: Job[] }`
- Validate each job has `id` and `label`; return 400 if malformed
- Update `job_lists.jobs` for the given `listId`
- Return `{ ok: true }`

**POST /api/admin/save-profile** — body: `{ childId: string, name?: string, avatarEmoji?: string, password?: string }`
- Update whichever fields are provided
- If `password` is provided: hash with `bcryptjs.hash(password, 10)` and update `password_hash`
- Return `{ ok: true }`

### app/admin/lists/page.tsx — List Manager (server component)

1. Check `session.adminAuthed` — redirect to `/admin` if not set
2. `getJobLists()` — fetch all lists
3. Render `<ListManagerClient lists={lists} />`

### app/admin/lists/ListManagerClient.tsx — client component

Displays all lists as cards showing name and job count. Controls:
- **Add list** button — inline form: name input, submit calls `POST /api/admin/save-list`, refreshes
- **Edit** link on each card → navigates to `/admin/lists/[listId]`
- **Delete** button on each card → confirm dialog, calls `DELETE /api/admin/delete-list`, refreshes; disabled if only one list
- Drag-to-reorder (or up/down buttons) — on reorder, calls `POST /api/admin/save-list` with updated `sortOrder` for affected rows

### app/admin/lists/[listId]/page.tsx — Job Editor (server component)

1. Check `session.adminAuthed`
2. Fetch the `job_lists` row for `listId`; 404 if not found
3. Render `<JobEditorClient list={list} />`

### app/admin/lists/[listId]/JobEditorClient.tsx — client component

Editable job list. Controls:
- Inline list name editor — on blur/submit calls `POST /api/admin/save-list`
- Job rows: label input, delete button, drag handle (or up/down buttons) for reordering
- **Add job** button — appends a new job with a generated id
- **Save** button — calls `POST /api/admin/save-jobs` with the full jobs array
- Back link to `/admin/lists`

Keep the job editor simple: no auto-save on every keystroke — one explicit Save button to avoid partial saves.

### app/admin/profile/[childId]/page.tsx — Profile Editor (server component)

1. Check `session.adminAuthed`
2. `getProfile(childId)`; 404 if not found
3. Render `<ProfileEditorClient profile={profile} />`

### app/admin/profile/[childId]/ProfileEditorClient.tsx — client component

Fields: name (text), avatar emoji (text/emoji picker), new password (password input with confirmation).
Submit calls `POST /api/admin/save-profile` with only the changed fields.
Show success/error feedback inline.

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

- Story mode / AI rewards (Phase 2)

---

## Implementation Status

**COMPLETE** — all code implemented and pushed to `main` (commit `6f9abe1`). Build passes clean.

Next step: manual smoke-test against the acceptance checklist below using `docker compose up -d && npm run dev`.

---

## Acceptance Checklist

**Setup**
- [ ] `docker compose up -d && npm run dev` starts without errors
- [ ] Schema tables created on first start; re-running is a no-op
- [ ] Hannah and Zoe profiles seeded on first start with default password

**Admin area**
- [ ] `/admin` shows PIN entry form; wrong PIN shows error
- [ ] Correct PIN sets admin session and redirects to `/admin/lists`
- [ ] Can create a new list; it appears in the list manager
- [ ] Can add, reorder, and remove jobs on a list and save them
- [ ] Can rename a list
- [ ] Cannot delete the last remaining list
- [ ] Can change a child's name, avatar, and password via `/admin/profile/[childId]`
- [ ] Accessing `/admin/lists` without a valid admin session redirects to `/admin`

**Kids' flow**
- [ ] Home screen shows two profile tiles
- [ ] Entering wrong password shows error; correct password redirects to session picker
- [ ] Session picker shows empty state when no lists exist
- [ ] Session picker shows available lists after admin has created one
- [ ] Tapping a list creates a `list_progress` row and navigates to the checklist
- [ ] Tapping a job tile marks it complete with visual feedback
- [ ] Progress bar updates correctly
- [ ] When all jobs are done, app redirects to the reward page
- [ ] Reward page shows confetti and personalised message

**Security**
- [ ] Navigating directly to `/hannah/some-id` while logged in as Zoe redirects to `/`
- [ ] Navigating to a checklist from a previous day redirects to the session picker
- [ ] Navigating directly to `/reward` when `all_complete = false` redirects to checklist
- [ ] `POST /api/complete` with a valid session but wrong child's `listProgressId` returns 403
