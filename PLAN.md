# Morning Hero — Project Plan

## Overview

A web app for Hannah and Zoe to complete jobs and routines. Parents can create multiple named job lists (e.g. "Morning School Routine", "Weekend Chores") that are shared across all children. Kids pick which list to complete when they log in; when all jobs on a list are done they receive a small reward.

---

## Tech Stack

| Concern | Choice | Reason |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | API routes + SSR in one project; no separate backend |
| Styling | Tailwind CSS | Fast to iterate; great for large touch targets |
| Data | PostgreSQL on `tjphomepg.postgres.database.azure.com` | Shared server already in shire; separate DBs for prod/test |
| Hosting | AKS shire cluster (`prod` namespace) | Consistent with all other personal projects |
| Container Registry | `tjpcontainerregistry.azurecr.io/morning-hero` | Shared ACR already in shire |
| Secrets | Azure Key Vault (`tjp-home-vault`) via ExternalSecret | Standard shire secret management pattern |
| CI/CD | GitHub Actions → ArgoCD GitOps | Same `main.yml` / `promote.yml` pattern as uv-api and obi-wan |

---

## Pages

```
/                              → Profile selector (Hannah / Zoe)
/[childId]                         → Session picker: resume today's in-progress sessions or start a new list
/[childId]/[listProgressId]        → Jobs checklist for a progress session
/[childId]/[listProgressId]/reward → Reward revealed (gated — only accessible after all jobs done)
/admin                         → Parent settings (4-digit PIN protected)
/admin/lists                   → List manager: create / rename / reorder / delete lists
/admin/lists/[listId]          → Edit individual list's jobs (add / remove / reorder)
/admin/profile/[childId]       → Edit name, avatar
```

## API Routes

```
POST   /api/progress/start                      → Create a new list_progress session (body: { listId }); childId taken from session cookie; returns listProgressId
POST   /api/complete                            → Mark a job complete (body: { listProgressId, jobId }); server verifies list_progress.child_id matches session cookie
GET    /api/progress/[listProgressId]           → Current state of a progress session; server verifies list_progress.child_id matches session cookie
POST   /api/admin/save-jobs                    → Save jobs array for a list (body: { listId, jobs })
POST   /api/admin/save-list                    → Create or rename a list (body: { listId, name, sortOrder })
DELETE /api/admin/delete-list                  → Delete a list (body: { listId });
```

---

## Data Model (PostgreSQL)

Database names: `morning-hero-prod` (prod), `morning-hero-test` (test) on `tjphomepg.postgres.database.azure.com`.

```sql
-- Static per-child config
CREATE TABLE profiles (
  child_id       TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  avatar_emoji   TEXT NOT NULL,
  password_hash  TEXT NOT NULL   -- bcrypt hash; updated via admin area
);

-- Named job lists — shared across all children
CREATE TABLE job_lists (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INT  NOT NULL DEFAULT 0,
  jobs        JSONB NOT NULL DEFAULT '[]'  -- ordered array of {id, label}
);

-- Tracks in-progress and completed job list sessions
-- Each row represents one attempt at a list; multiple rows per child per list per day are allowed
CREATE TABLE list_progress (
  id                 TEXT PRIMARY KEY,             -- unique session id; used in URLs
  child_id           TEXT NOT NULL REFERENCES profiles(child_id),
  list_id            TEXT NOT NULL REFERENCES job_lists(id),
  date               DATE NOT NULL,                -- date the session was started
  completed_job_ids  TEXT[] NOT NULL DEFAULT '{}',
  all_complete       BOOLEAN NOT NULL DEFAULT FALSE
);

```

**Progress tracking**: A row in `list_progress` is created when a child starts a list session. Multiple rows for the same child, list, and date are allowed. In-progress sessions from previous days are not shown to kids — only today's incomplete sessions appear as resumable. Old rows are left indefinitely.

---

## Example Configuration

### Example list: "Morning Routine"

1. Eat breakfast
2. Go to the toilet
3. Get dressed
4. Do hair
5. Brush teeth
6. Shoes and socks
7. Put on sunscreen
8. Pack school bag

---

## Kid UX Flow

1. Home page shows two profile tiles (Hannah / Zoe)
2. Click a profile → password entry form
3. Server validates password against `profiles.password_hash` (bcrypt)
4. On success → signs HttpOnly cookie `child_session:<childId>`
5. `/[childId]` renders the session picker with two sections:
   - **Resume** — today's in-progress `list_progress` rows (`all_complete = FALSE`, `date = today`); hidden if none
   - **Start a new list** — all available `job_lists`; tapping one calls `POST /api/progress/start`, then redirects to `/[childId]/[listProgressId]`
6. On the checklist, child taps jobs to mark complete (stored in `list_progress`)
7. Progress indicator shows "X of N done"
8. When all jobs done → "All done!" congratulations screen with confetti
9. `/[childId]/[listProgressId]` and `/[childId]/[listProgressId]/reward` are both server-side gated:
   - If `list_progress.date ≠ today` → redirect to `/[childId]`
   - If accessing `/reward` and `all_complete = FALSE` → redirect to `/[childId]/[listProgressId]`

---

## Reward Flow

Child ticks off all jobs → "All done!" congratulations screen with confetti.

More sophisticated rewards (e.g. AI-generated drawings) may be added later.

---

## Authentication

### Kids — per-child password
Each child has their own password. Clicking a profile tile on the home screen shows a password entry form. On success, a short-lived signed `HttpOnly` cookie is set for that child (`child_session:<childId>`).

All `/[childId]` routes check server-side that a valid session exists **and** that the session's `childId` matches the URL parameter — preventing one child from accessing another's pages even if they have a valid session.

All child API routes derive `childId` exclusively from the session cookie — never from the request body or URL. Routes that operate on a `listProgressId` verify that `list_progress.child_id` matches the session before proceeding. This means a child with a valid session cannot create or modify progress records belonging to another child.

Passwords are stored as bcrypt hashes in the `profiles` table. A parent can change a child's password via the admin area.

### Admin — 4-digit PIN
The `/admin` layout renders a PIN entry form. On submit it calls a server action that compares the PIN against the Key Vault value (`morning-hero-admin-pin`). On success, a short-lived signed `HttpOnly` cookie is set (`admin_session`). The layout checks for it on every request and redirects to the PIN form if absent.

### Session cookies
Both session types are signed with a shared secret (`morning-hero-session-secret` in Key Vault) using `iron-session`. Cookies are `HttpOnly; Secure; SameSite=Strict`.

### Key Vault secrets (additions)
| Key Vault key | Used for |
|---|---|
| `morning-hero-admin-pin` | 4-digit parent admin PIN |
| `morning-hero-session-secret` | Cookie signing secret (shared across child + admin sessions) |

---

## Build Phases

### Phase 1 — Working checklist, static reward (MVP)
- Profile selector home screen (Hannah / Zoe tiles)
- Session picker with one default list ("Morning Routine"); tap to start a session
- Progress indicator ("X of 8 done")
- "All done!" screen with emoji confetti (static, no AI yet)
- Daily reset via date-keyed `localStorage` (no DB needed for MVP)

### Phase 2 — Persistent state
- Migrate state from `localStorage` to PostgreSQL

### Phase 3 — Parent admin
- Parent admin area (4-digit PIN gate; PIN stored in Key Vault)
- Global list manager (create / rename / reorder / delete lists shared across all children)
- Job editor per list (add / remove / reorder jobs)
- Profile editor (name, avatar emoji)
- List selector for kids when multiple lists exist

### Phase 4 — Story mode (future)
- AI-generated story continuation via Claude API
- One new episode (~150 words) per completed day
- Builds a running adventure story personalised to each child

---

## Deployment (Shire Pattern)

### URLs
- Prod: `https://morning-hero.tjpeters.net`
- Test: `https://morning-hero-test.tjpeters.net`

### Dockerfile
Standard multi-stage Next.js build (Node base image). The app runs as a standalone Next.js server on port 3000.

### k8s manifest layout (Kustomize)
```
k8s/
  base/
    kustomization.yaml
    deployment.yaml      # image: tjpcontainerregistry.azurecr.io/morning-hero
    service.yaml
  overlays/
    prod/
      kustomization.yaml  # pins image tag, sets DB name env var
      ingress.yaml        # morning-hero.tjpeters.net, letsencrypt-prod issuer
      secrets.yaml        # ExternalSecret for DB password
    test/
      kustomization.yaml
      ingress.yaml        # morning-hero-test.tjpeters.net, letsencrypt-test issuer
      secrets.yaml        # ExternalSecret for DB password
```

### Secrets in Key Vault (`tjp-home-vault`)
| Key Vault key | Used for |
|---|---|
| `morning-hero-prod-database-url` | Full postgres connection string for prod |
| `morning-hero-test-database-url` | Full postgres connection string for test |
| `morning-hero-admin-pin` | 4-digit parent admin PIN |
| `morning-hero-session-secret` | Cookie signing secret |

### CI/CD (GitHub Actions)
- **`main.yml`**: build image → push to ACR with version tag → update test overlay image tag → ArgoCD auto-syncs test
- **`promote.yml`**: manually triggered with a version string → updates prod overlay image tag → ArgoCD syncs prod

### ArgoCD Apps
Both registered at `https://argocd.tjpeters.net`:
- `morning-hero-test` — source: `k8s/overlays/test`, namespace: `test`, automatic sync
- `morning-hero` — source: `k8s/overlays/prod`, namespace: `prod`, manual sync

---

## File Structure

```
morning-hero/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                              # ProfileSelector
│   ├── globals.css
│   ├── [childId]/
│   │   ├── page.tsx                          # SessionPickerPage (server component)
│   │   ├── SessionPickerClient.tsx           # Resume + start new list UI (client component)
│   │   └── [listProgressId]/
│   │       ├── page.tsx                      # ChecklistPage (server component)
│   │       ├── ChecklistClient.tsx           # Interactive job list (client component)
│   │       ├── JobTile.tsx
│   │       ├── ProgressBar.tsx
│   │       └── reward/
│   │           ├── page.tsx                  # RewardPage
│   │           └── RewardReveal.tsx
│   ├── admin/
│   │   ├── layout.tsx                        # PIN gate wrapper
│   │   ├── page.tsx
│   │   ├── lists/
│   │   │   ├── page.tsx                      # ListManagerPage (global)
│   │   │   └── [listId]/
│   │   │       └── page.tsx                  # JobEditorPage
│   │   └── profile/[childId]/page.tsx
│   └── api/
│       ├── progress/
│       │   ├── start/route.ts                # body: { childId, listId } → creates session
│       │   └── [listProgressId]/route.ts     # GET: current session state
│       ├── complete/route.ts                 # body: { listProgressId, jobId }
│       └── admin/
│           ├── save-jobs/route.ts            # body: { listId, jobs }
│           ├── save-list/route.ts            # body: { listId, name, sortOrder }
│           └── delete-list/route.ts          # body: { listId }
├── lib/
│   ├── db.ts                                 # PostgreSQL client + typed query helpers
│   ├── date.ts                               # Date helpers (today's key, streak logic)
│   ├── profiles.ts                           # Default config for Hannah and Zoe
│   └── types.ts                              # Shared TypeScript types
├── k8s/
│   ├── base/
│   │   ├── kustomization.yaml
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   └── overlays/
│       ├── prod/
│       │   ├── kustomization.yaml
│       │   ├── ingress.yaml
│       │   └── secrets.yaml
│       └── test/
│           ├── kustomization.yaml
│           ├── ingress.yaml
│           └── secrets.yaml
├── .github/
│   └── workflows/
│       ├── main.yml
│       └── promote.yml
├── Dockerfile
└── public/
    └── avatars/                              # Optional child photos
```
