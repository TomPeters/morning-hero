# Morning Hero — Project Plan

## Overview

A web app for Hannah and Zoe to complete their morning routine before school. Kids tick off jobs one by one; when all are done they receive a small reward.

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
/                         → Profile selector (Hannah / Zoe)
/[childId]                → Morning jobs checklist
/[childId]/reward         → Reward revealed (gated — only accessible after all jobs done)
/admin                    → Parent settings (4-digit PIN protected)
/admin/jobs/[childId]     → Edit job list
/admin/profile/[childId]  → Edit name, avatar, rewards
```

## API Routes

```
POST /api/complete                → Mark a job complete; returns updated state
GET  /api/state/[childId]         → Today's daily state for a child
POST /api/admin/save-jobs         → Save job list (requires admin token)
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
  jobs           JSONB NOT NULL DEFAULT '[]'  -- ordered array of {id, label}
);

-- One row per child per day
CREATE TABLE daily_state (
  child_id           TEXT NOT NULL,
  date               DATE NOT NULL,
  completed_job_ids  TEXT[] NOT NULL DEFAULT '{}',
  all_complete       BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (child_id, date)
);

-- Streak tracking
CREATE TABLE streaks (
  child_id           TEXT PRIMARY KEY,
  current            INT NOT NULL DEFAULT 0,
  longest            INT NOT NULL DEFAULT 0,
  last_complete_date DATE
);
```

**Daily reset**: State is keyed by `(child_id, date)`. A new row is inserted (or fetched) on first page load of each day. Old rows can be purged on a schedule or left indefinitely — the table stays small.

---

## Default Configuration

### Jobs (both kids — order configurable in admin)

1. Eat breakfast
2. Go to the toilet
3. Get dressed
4. Do hair
5. Brush teeth
6. Shoes and socks
7. Put on sunscreen
8. Pack school bag

---

## Reward Flow

1. Child ticks off all 9 jobs → "All done!" congratulations screen with confetti

More sophisticated rewards (e.g. AI-generated drawings) may be added later.

---

## Authentication

### Kids — per-child password
Each child has their own password. Clicking a profile tile on the home screen shows a password entry form. On success, a short-lived signed `HttpOnly` cookie is set for that child (`child_session:<childId>`). All `/[childId]` routes (checklist, reward) check for a valid session server-side and redirect to the password form if absent — preventing one child from accessing the other's checklist or reward.

Passwords are stored in Key Vault (`morning-hero-hannah-password`, `morning-hero-zoe-password`) and injected as env vars via ExternalSecret. They're set/changed by a parent via the admin area.

### Admin — 4-digit PIN
The `/admin` layout renders a PIN entry form. On submit it calls a server action that compares the PIN against the Key Vault value (`morning-hero-admin-pin`). On success, a short-lived signed `HttpOnly` cookie is set (`admin_session`). The layout checks for it on every request and redirects to the PIN form if absent.

### Session cookies
Both session types are signed with a shared secret (`morning-hero-session-secret` in Key Vault) using `iron-session` or equivalent. Cookies are `HttpOnly; Secure; SameSite=Strict`. No OAuth, JWTs, or user table needed.

### Key Vault secrets (additions)
| Key Vault key | Used for |
|---|---|
| `morning-hero-hannah-password` | Hannah's login password |
| `morning-hero-zoe-password` | Zoe's login password |
| `morning-hero-admin-pin` | 4-digit parent admin PIN |
| `morning-hero-session-secret` | Cookie signing secret (shared across child + admin sessions) |

---

## Build Phases

### Phase 1 — Working checklist, static reward (MVP)
- Profile selector home screen (Hannah / Zoe tiles)
- Checklist with the 9 default jobs; tap to complete with visual feedback
- Progress indicator ("X of 9 done")
- "All done!" screen with emoji confetti (static, no AI yet)
- Daily reset via date-keyed `localStorage` (no DB needed for MVP)

### Phase 2 — Persistent state
- Migrate state from `localStorage` to PostgreSQL

### Phase 3 — Streaks + parent admin
- Streak tracking (flame icon + count)
- Parent admin area (4-digit PIN gate; PIN stored in Key Vault)
- Job list editor per child (add / remove / reorder)
- Profile editor (name, avatar emoji)

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
      secrets.yaml        # ExternalSecret for DB password, Replicate key
    test/
      kustomization.yaml
      ingress.yaml        # morning-hero-test.tjpeters.net, letsencrypt-test issuer
      secrets.yaml        # ExternalSecret for DB password, Replicate key
```

### Secrets in Key Vault (`tjp-home-vault`)
| Key Vault key | Used for |
|---|---|
| `morning-hero-prod-database-url` | Full postgres connection string for prod |
| `morning-hero-test-database-url` | Full postgres connection string for test |
| `morning-hero-hannah-password` | Hannah's login password |
| `morning-hero-zoe-password` | Zoe's login password |
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
│   ├── page.tsx                        # ProfileSelector
│   ├── globals.css
│   ├── [childId]/
│   │   ├── page.tsx                    # ChecklistPage (server component)
│   │   ├── ChecklistClient.tsx         # Interactive job list (client component)
│   │   ├── JobTile.tsx
│   │   ├── ProgressBar.tsx
│   │   └── reward/
│   │       ├── page.tsx                # RewardPage
│   │       └── RewardReveal.tsx
│   ├── admin/
│   │   ├── layout.tsx                  # PIN gate wrapper
│   │   ├── page.tsx
│   │   ├── jobs/[childId]/page.tsx
│   │   └── profile/[childId]/page.tsx
│   └── api/
│       ├── complete/route.ts
│       ├── state/[childId]/route.ts
│       └── admin/save-jobs/route.ts
├── lib/
│   ├── db.ts                           # PostgreSQL client + typed query helpers
│   ├── date.ts                         # Date helpers (today's key, streak logic)
│   ├── profiles.ts                     # Default config for Hannah and Zoe
│   └── types.ts                        # Shared TypeScript types
├── k8s/
│   ├── base/
│   │   ├── kustomization.yaml
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   └── overlays/
│       ├── prod/
│       │   ├── kustomization.yaml
│       │   ├── ingress.yaml
│       │   └── secrets.yaml            # ExternalSecret CRDs
│       └── test/
│           ├── kustomization.yaml
│           ├── ingress.yaml
│           └── secrets.yaml
├── .github/
│   └── workflows/
│       ├── main.yml                    # Build, push, update test overlay
│       └── promote.yml                 # Promote version to prod overlay
├── Dockerfile
└── public/
    └── avatars/                        # Optional child photos
```
