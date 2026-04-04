# Morning Hero — Claude Guide

## Project Overview

Morning Hero is a kids' app to help Hannah and Zoe complete their morning jobs when getting ready for school.

## Key Goals

- Make morning routines fun and manageable for kids
- Simple, clear UI appropriate for young children

## Stack

- **Next.js 15** (App Router, TypeScript, Tailwind CSS) with `output: 'standalone'`
- **PostgreSQL** on `tjphomepg.postgres.database.azure.com` — databases `morning-hero-prod` and `morning-hero-test`
- **Hosted** on AKS shire cluster — `prod` and `test` namespaces
- **Secrets** via Azure Key Vault (`tjp-home-vault`) + ExternalSecret operator

## Local Development

```bash
docker compose up -d   # start postgres on :5432
npm run dev            # Next.js on :3000
```

`.env.local` (git-ignored) provides `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PIN`. Child passwords are stored in the database, not in env vars.

## CI/CD

- **Push to `main`** → `main.yml` builds Docker image, pushes to `tjpcontainerregistry.azurecr.io/morning-hero:<version>`, updates `k8s/overlays/test/kustomization.yaml`, ArgoCD auto-syncs test
- **Promote to prod** → trigger `promote.yml` workflow manually with a version string → updates `k8s/overlays/prod/kustomization.yaml`, ArgoCD detects and syncs prod (manual sync policy)

## ArgoCD Apps

| App | Path | Namespace | Sync |
|---|---|---|---|
| `morning-hero-test` | `k8s/overlays/test` | `test` | Automatic |
| `morning-hero` | `k8s/overlays/prod` | `prod` | Manual |

## URLs

- Prod: `https://morning-hero.tjpeters.net`
- Test: `https://morning-hero-test.tjpeters.net`

## Key Vault Secrets (`tjp-home-vault`)

| Secret | Purpose |
|---|---|
| `morning-hero-prod-database-url` | Full postgres connection string for prod |
| `morning-hero-test-database-url` | Full postgres connection string for test |
| `morning-hero-admin-pin` | 4-digit parent admin PIN |
| `morning-hero-session-secret` | Cookie signing secret |

## Conventions

- Follow the uv-api repo (`/home/tom/code/uv-api`) as a reference for k8s manifests, CI workflows, and the shire deployment pattern
- Ingress cert annotation: `cert-manager.io/issuer` — use `letsencrypt-test` for test, `letsencrypt-prod` for prod (these are namespace-scoped Issuers, not ClusterIssuers)
