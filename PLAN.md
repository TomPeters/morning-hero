# Morning Hero — Project Plan

## Overview

A web app for Hannah and Zoe to complete their morning routine before school. Kids tick off jobs one by one; when all are done they receive an AI-generated drawing as a daily reward.

---

## Tech Stack

| Concern | Choice | Reason |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | API routes + SSR in one project; no separate backend |
| Styling | Tailwind CSS | Fast to iterate; great for large touch targets |
| Data | Vercel KV (Redis) | No DB to manage; date-keyed keys handle daily reset naturally |
| AI reward | Replicate API (image generation) | Simple REST API, pay-per-image, keys stay server-side |
| Hosting | Vercel free tier | One-command deploy from git push; env var management built in |

---

## Pages

```
/                         → Profile selector (Hannah / Zoe)
/[childId]                → Morning jobs checklist
/[childId]/reward         → AI drawing reveal (gated — only accessible after all jobs done)
/admin                    → Parent settings (4-digit PIN protected)
/admin/jobs/[childId]     → Edit job list
/admin/profile/[childId]  → Edit name, avatar, favourite things
```

## API Routes

```
POST /api/complete                → Mark a job complete; returns updated state
POST /api/reward/generate         → Trigger AI image generation; saves URL to KV
GET  /api/state/[childId]         → Today's daily state for a child
POST /api/admin/save-jobs         → Save job list (requires admin token)
```

---

## Data Model (Vercel KV)

```
profile:{childId}             → { name, avatarEmoji, favouriteThings[], jobs[] }
daily:{childId}:{YYYY-MM-DD}  → { completedJobIds[], allComplete, rewardImageUrl }
streak:{childId}              → { current, longest, lastCompleteDate }
```

**Daily reset**: State is keyed by date. No cron needed — a new key is initialised automatically on first page load of each day. Old keys expire via KV TTL (30 days).

---

## Default Configuration

### Jobs (both kids — order configurable in admin)

1. Eat breakfast
2. Go to the toilet
3. Get dressed
4. Make bed
5. Do hair
6. Brush teeth
7. Shoes and socks
8. Put on sunscreen
9. Pack school bag

### Favourite Things (both kids — shared list to start, diverge in admin)

Unicorns, cats, sloths, Minecraft, K-pop demon hunters

These are used to build the daily image generation prompt, e.g.:
> "A cheerful children's book illustration of a sloth in a Minecraft world, soft colours, friendly, detailed"

A random favourite is picked each day so the drawing is always a surprise.

---

## Reward Flow

1. Child ticks off all 9 jobs → "All done!" screen with confetti
2. Button to reveal today's drawing
3. Server picks a random favourite thing, calls Replicate, stores URL in KV
4. Animated "magic is happening..." loading screen while generating (~10s)
5. Drawing fades in with celebratory display

The reward is framed as a "morning gift" rather than a score or payment — the habit is the goal, the drawing is a bonus.

---

## Build Phases

### Phase 1 — Working checklist, static reward (MVP)
- Scaffold Next.js project (`npx create-next-app@latest`)
- Profile selector home screen (Hannah / Zoe tiles)
- Checklist with the 9 default jobs; tap to complete with visual feedback
- Progress indicator ("X of 9 done")
- "All done!" screen with emoji confetti (static, no AI yet)
- Daily reset via date-keyed `localStorage` (no KV needed for MVP)
- Deploy to Vercel

### Phase 2 — AI drawing reward
- Set up Vercel KV; migrate state from `localStorage`
- `/api/reward/generate` route with Replicate API
- Animated reward reveal screen (loading state + image fade-in)
- Cache generated image URL so re-visiting the reward page doesn't re-generate

### Phase 3 — Streaks + parent admin
- Streak tracking (flame icon + count)
- Parent admin area (4-digit PIN gate)
- Job list editor per child (add / remove / reorder)
- Profile editor (name, avatar emoji, favourite things list)

### Phase 4 — Story mode (future)
- AI-generated story continuation via Claude API
- One new episode (~150 words) per completed day
- Builds a running adventure story personalised to each child

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
│       ├── reward/generate/route.ts
│       ├── state/[childId]/route.ts
│       └── admin/save-jobs/route.ts
├── lib/
│   ├── kv.ts                           # Typed Vercel KV wrappers
│   ├── date.ts                         # Date helpers (today's key, streak logic)
│   ├── ai.ts                           # Replicate image generation
│   ├── profiles.ts                     # Default config for Hannah and Zoe
│   └── types.ts                        # Shared TypeScript types
└── public/
    └── avatars/                        # Optional child photos
```
