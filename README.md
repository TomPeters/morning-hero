# Morning Hero

A fun app to help kids get through their morning routine and get ready for school.

## About

Morning Hero guides children through their morning jobs — brushing teeth, getting dressed, eating breakfast, and more — turning the daily routine into an achievable adventure.

## Local Development

**Prerequisites:** Node 22+, Docker

```bash
# Start local PostgreSQL
docker compose up -d

# Install dependencies
npm install

# Create .env.local with DATABASE_URL, SESSION_SECRET, ADMIN_PIN (see CLAUDE.md)

# Start dev server
npm run dev
```

The app runs at `http://localhost:3000`.

**First-time setup** (fresh database):
1. Visit `/admin` and enter the PIN from `ADMIN_PIN`
2. Create at least one job list under Lists
3. Set passwords for Hannah and Zoe via their profile pages (default is `morning`)

## Deployment

The full CI/CD pipeline is in place:

- **Test** (`https://morning-hero-test.tjpeters.net`): deploys automatically on every push to `main` via GitHub Actions + ArgoCD
- **Prod** (`https://morning-hero.tjpeters.net`): promoted manually by triggering the `Promote to production` workflow in GitHub Actions with a version tag

## Tech Stack

- Next.js 16 (App Router, TypeScript, Tailwind CSS)
- PostgreSQL on Azure (`tjphomepg.postgres.database.azure.com`)
- Deployed on AKS (shire cluster) via ArgoCD GitOps
- Secrets via Azure Key Vault + ExternalSecret operator
