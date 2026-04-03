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

# Create .env.local (see .env.local.example or CLAUDE.md for required vars)

# Start dev server
npm run dev
```

The app runs at `http://localhost:3000`.

## Deployment

The full CI/CD pipeline is in place:

- **Test** (`https://morning-hero-test.tjpeters.net`): deploys automatically on every push to `main` via GitHub Actions + ArgoCD
- **Prod** (`https://morning-hero.tjpeters.net`): promoted manually by triggering the `Promote to production` workflow in GitHub Actions with a version tag

## Tech Stack

- Next.js 15 (App Router, TypeScript, Tailwind CSS)
- PostgreSQL on Azure (`tjphomepg.postgres.database.azure.com`)
- Deployed on AKS (shire cluster) via ArgoCD GitOps
- Secrets via Azure Key Vault + ExternalSecret operator
