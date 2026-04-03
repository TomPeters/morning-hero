# E2E Infrastructure Setup Plan

This plan gets the full Morning Hero stack running end-to-end: local dev, CI/CD, and automatic deployments to shire test and prod. By the end, a `git push` to `main` will build a Docker image, push it to ACR, and deploy it to the test environment automatically.

Follow the steps in order — each section depends on the previous one.

---

## 1. Scaffold the Next.js App

```bash
cd /home/tom/code/morning-hero
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=no \
  --import-alias="@/*"
```

Then add the PostgreSQL client and session library:

```bash
npm install postgres iron-session
npm install --save-dev @types/node
```

Enable Next.js standalone output — this is required for the Dockerfile to produce a minimal, self-contained build artifact. Add to `next.config.ts`:

```ts
const nextConfig = {
  output: 'standalone',
}
```

Commit the scaffold:

```bash
git add -A && git commit -m "Scaffold Next.js app"
```

---

## 2. Local Development Environment

### docker-compose for local PostgreSQL

Create `docker-compose.yml` in the project root:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: morning-hero
      POSTGRES_PASSWORD: localdev
      POSTGRES_DB: morning-hero-dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### .env.local

Create `.env.local` (git-ignored):

```
DATABASE_URL=postgres://morning-hero:localdev@localhost:5432/morning-hero-dev
SESSION_SECRET=any-32-char-or-longer-local-dev-secret
REPLICATE_API_KEY=<your replicate key for local testing>
HANNAH_PASSWORD=hannah
ZOE_PASSWORD=zoe
ADMIN_PIN=1234
```

### Local dev workflow

```bash
docker compose up -d    # start postgres
npm run dev             # start Next.js on :3000
```

Add `.env.local` and `pgdata/` to `.gitignore` (create-next-app already ignores `.env*.local`).

---

## 3. Dockerfile

Create `Dockerfile` in the project root. This is a standard three-stage Next.js build:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

Verify it builds locally:

```bash
docker build -t morning-hero:local .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgres://morning-hero:localdev@host.docker.internal:5432/morning-hero-dev \
  -e SESSION_SECRET=local-dev-secret-at-least-32-chars \
  morning-hero:local
```

Commit:

```bash
git add Dockerfile docker-compose.yml && git commit -m "Add Dockerfile and docker-compose for local dev"
```

---

## 4. Database Setup on tjphomepg

Connect to the shared PostgreSQL server and create the two databases. The server password is in Key Vault under `db-server-password`.

```bash
psql "host=tjphomepg.postgres.database.azure.com port=5432 user=sixtyfold dbname=postgres sslmode=require"
```

```sql
CREATE DATABASE "morning-hero-prod";
CREATE DATABASE "morning-hero-test";
```

The app will run its own schema migrations on startup (see §6 below for the schema). No separate migration step is needed for setup — on first boot the app creates tables if they don't exist.

---

## 5. Secrets in Azure Key Vault

Add the following secrets to `tjp-home-vault`. Use the Azure portal or CLI:

```bash
az keyvault secret set --vault-name tjp-home-vault --name morning-hero-db-password     --value "<sixtyfold postgres password>"
az keyvault secret set --vault-name tjp-home-vault --name morning-hero-replicate-api-key --value "<replicate api key>"
az keyvault secret set --vault-name tjp-home-vault --name morning-hero-hannah-password  --value "<choose a password>"
az keyvault secret set --vault-name tjp-home-vault --name morning-hero-zoe-password     --value "<choose a password>"
az keyvault secret set --vault-name tjp-home-vault --name morning-hero-admin-pin        --value "<4-digit pin>"
az keyvault secret set --vault-name tjp-home-vault --name morning-hero-session-secret   --value "<random 32+ char string>"
```

> The DB password for `morning-hero-db-password` is the same password used by `sixtyfold` on `tjphomepg` — find it in Key Vault under `db-server-password`.

---

## 6. Kubernetes Manifests

Create the following files. Commit them all at the end of this section.

### `k8s/base/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
```

### `k8s/base/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: morning-hero
spec:
  replicas: 1
  selector:
    matchLabels:
      app: morning-hero
  template:
    metadata:
      labels:
        app: morning-hero
    spec:
      containers:
        - name: morning-hero
          image: tjpcontainerregistry.azurecr.io/morning-hero
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: production
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: morning-hero-secrets
                  key: DATABASE_URL
            - name: SESSION_SECRET
              valueFrom:
                secretKeyRef:
                  name: morning-hero-secrets
                  key: SESSION_SECRET
            - name: REPLICATE_API_KEY
              valueFrom:
                secretKeyRef:
                  name: morning-hero-secrets
                  key: REPLICATE_API_KEY
            - name: HANNAH_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: morning-hero-secrets
                  key: HANNAH_PASSWORD
            - name: ZOE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: morning-hero-secrets
                  key: ZOE_PASSWORD
            - name: ADMIN_PIN
              valueFrom:
                secretKeyRef:
                  name: morning-hero-secrets
                  key: ADMIN_PIN
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
```

### `k8s/base/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: morning-hero
spec:
  selector:
    app: morning-hero
  ports:
    - port: 80
      targetPort: 3000
```

### `k8s/overlays/prod/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: prod
resources:
  - ../../base
  - ingress.yaml
  - secrets.yaml
images:
  - name: tjpcontainerregistry.azurecr.io/morning-hero
    newTag: latest  # pinned by CI via kustomize edit set image
```

### `k8s/overlays/prod/ingress.yaml`

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: morning-hero
  annotations:
    cert-manager.io/issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - morning-hero.tjpeters.net
      secretName: morning-hero-tls
  rules:
    - host: morning-hero.tjpeters.net
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: morning-hero
                port:
                  number: 80
```

### `k8s/overlays/prod/secrets.yaml`

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: morning-hero-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: azure-key-vault
    kind: ClusterSecretStore
  target:
    name: morning-hero-secrets
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: morning-hero-db-password
        # Assembled in the app from DB_PASSWORD + hardcoded host/user/dbname,
        # OR construct the full URL here using a template — simplest is to store
        # the full URL as a single secret: morning-hero-prod-database-url
    - secretKey: SESSION_SECRET
      remoteRef:
        key: morning-hero-session-secret
    - secretKey: REPLICATE_API_KEY
      remoteRef:
        key: morning-hero-replicate-api-key
    - secretKey: HANNAH_PASSWORD
      remoteRef:
        key: morning-hero-hannah-password
    - secretKey: ZOE_PASSWORD
      remoteRef:
        key: morning-hero-zoe-password
    - secretKey: ADMIN_PIN
      remoteRef:
        key: morning-hero-admin-pin
```

> **Note on DATABASE_URL**: The cleanest approach is to store the full connection string as a single Key Vault secret per environment (`morning-hero-prod-database-url`, `morning-hero-test-database-url`) so ExternalSecret can map it directly. Add these two secrets to Key Vault:
>
> ```
> morning-hero-prod-database-url = postgres://sixtyfold:<password>@tjphomepg.postgres.database.azure.com:5432/morning-hero-prod?sslmode=require
> morning-hero-test-database-url = postgres://sixtyfold:<password>@tjphomepg.postgres.database.azure.com:5432/morning-hero-test?sslmode=require
> ```
>
> Then update `secrets.yaml` in each overlay to reference the appropriate key. Remove `morning-hero-db-password` from Key Vault if nothing else needs it.

### `k8s/overlays/test/kustomization.yaml`

Mirror of prod, referencing `letsencrypt-test` and host `morning-hero-test.tjpeters.net`. Image tag is updated here by `main.yml` CI.

### `k8s/overlays/test/ingress.yaml`

Same structure as prod but:
- `cert-manager.io/issuer: letsencrypt-test`
- host: `morning-hero-test.tjpeters.net`
- `secretName: morning-hero-test-tls`

### `k8s/overlays/test/secrets.yaml`

Same structure as prod but `DATABASE_URL` references `morning-hero-test-database-url`.

Commit everything:

```bash
git add k8s/ && git commit -m "Add k8s manifests (base + prod/test overlays)"
```

---

## 7. GitHub Actions Workflows

### `.github/workflows/main.yml`

```yaml
name: Build and deploy to test

on:
  push:
    branches: [main]

env:
  IMAGE: ${{ secrets.REGISTRY_LOGIN_SERVER }}/morning-hero

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Generate version
        id: version
        run: echo "version=$(date +'%Y.%m.%d').${{ github.run_number }}" >> $GITHUB_OUTPUT

      - name: Log in to ACR
        uses: docker/login-action@v3
        with:
          registry: ${{ secrets.REGISTRY_LOGIN_SERVER }}
          username: ${{ secrets.AZURE_CLIENT_ID }}
          password: ${{ secrets.AZURE_CLIENT_SECRET }}

      - name: Build and push image
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            ${{ env.IMAGE }}:${{ steps.version.outputs.version }}
            ${{ env.IMAGE }}:latest

      - name: Tag git commit
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git tag ${{ steps.version.outputs.version }}
          git push origin ${{ steps.version.outputs.version }}

      - name: Update test overlay image tag
        run: |
          cd k8s/overlays/test
          curl -sL https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv5.4.1/kustomize_v5.4.1_linux_amd64.tar.gz | tar xz
          ./kustomize edit set image ${{ env.IMAGE }}:${{ steps.version.outputs.version }}
          git add kustomization.yaml
          git commit -m "chore: deploy ${{ steps.version.outputs.version }} to test"
          git push
```

### `.github/workflows/promote.yml`

```yaml
name: Promote to production

on:
  workflow_dispatch:
    inputs:
      version:
        description: Version tag to promote (e.g. 2025.06.01.42)
        required: true

env:
  IMAGE: ${{ secrets.REGISTRY_LOGIN_SERVER }}/morning-hero

jobs:
  promote:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Update prod overlay image tag
        run: |
          cd k8s/overlays/prod
          curl -sL https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv5.4.1/kustomize_v5.4.1_linux_amd64.tar.gz | tar xz
          ./kustomize edit set image ${{ env.IMAGE }}:${{ inputs.version }}
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add kustomization.yaml
          git commit -m "chore: promote ${{ inputs.version }} to prod"
          git push
```

### Add GitHub Actions secrets

In the `morning-hero` repo settings → Secrets and variables → Actions, add:

| Secret name | Value |
|---|---|
| `AZURE_CLIENT_ID` | Same service principal used by uv-api and obi-wan |
| `AZURE_CLIENT_SECRET` | Same as above |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
| `AZURE_TENANT_ID` | `8e27b5b9-1180-4756-b1d9-1c2744a1bef1` |
| `REGISTRY_LOGIN_SERVER` | `tjpcontainerregistry.azurecr.io` |

Commit the workflows:

```bash
git add .github/ && git commit -m "Add GitHub Actions CI/CD workflows"
```

---

## 8. Push and Verify CI

```bash
git push origin main
```

Watch the `Build and deploy to test` workflow in the GitHub Actions UI. It should:
1. Build the Docker image and push to ACR
2. Tag the commit with a version string
3. Update `k8s/overlays/test/kustomization.yaml` with the new image tag and push

If the image build fails, fix it locally first (`docker build .`).

---

## 9. Register ArgoCD Apps

Open `https://argocd.tjpeters.net` and create two applications manually:

### `morning-hero-test`
| Field | Value |
|---|---|
| Application name | `morning-hero-test` |
| Project | `default` |
| Sync policy | Automatic (ArgoCD watches for git changes) |
| Repository URL | `https://github.com/TomPeters/morning-hero` |
| Revision | `HEAD` |
| Path | `k8s/overlays/test` |
| Cluster | `https://kubernetes.default.svc` |
| Namespace | `test` |

### `morning-hero` (prod)
| Field | Value |
|---|---|
| Application name | `morning-hero` |
| Project | `default` |
| Sync policy | Manual (promote workflow triggers changes; ArgoCD syncs when it detects them) |
| Repository URL | `https://github.com/TomPeters/morning-hero` |
| Revision | `HEAD` |
| Path | `k8s/overlays/prod` |
| Cluster | `https://kubernetes.default.svc` |
| Namespace | `prod` |

Once the test app is registered, ArgoCD should detect the updated image tag from step 8 and sync automatically. Watch the sync in the ArgoCD UI.

---

## 10. Verify End-to-End

### Check the test deployment
1. In ArgoCD, confirm `morning-hero-test` is `Synced` and `Healthy`
2. Check the pod is running: the readiness probe hitting `/` should pass once the app is up
3. Visit `https://morning-hero-test.tjpeters.net` — you should see the Next.js default page (or a 502 if the cert is still provisioning; give cert-manager ~60s)

### Check TLS
cert-manager will automatically request a Let's Encrypt certificate for `morning-hero-test.tjpeters.net` when it sees the Ingress. Watch it provision:
- In ArgoCD or `kubectl`, check the `Certificate` resource in the `test` namespace
- If it stays in `Pending` for more than 2 minutes, check cert-manager events (common cause: DNS not yet pointing at the cluster IP)

### DNS
Add a DNS record for `morning-hero-test.tjpeters.net` and `morning-hero.tjpeters.net` pointing to the shire cluster's external load balancer IP (same IP used by all other `*.tjpeters.net` apps — find it from any existing ingress or the nginx controller service).

### Smoke test the full CI loop
1. Make a trivial change (e.g. update the page title)
2. `git push origin main`
3. Confirm the Actions workflow runs, image is pushed, test kustomization is updated
4. Confirm ArgoCD auto-syncs the test app and the new pod comes up
5. Confirm the change is visible at `https://morning-hero-test.tjpeters.net`

### Promote to prod (when ready)
1. Note the version tag from the CI run (visible in git tags or the Actions log)
2. Trigger the `Promote to production` workflow manually from GitHub Actions UI, entering the version string
3. Confirm ArgoCD detects the prod kustomization change and syncs `morning-hero`
4. Visit `https://morning-hero.tjpeters.net`

---

## Checklist

- [ ] Next.js app scaffolded with `output: 'standalone'`
- [ ] `docker-compose.yml` + `.env.local` for local dev
- [ ] `Dockerfile` builds and runs locally
- [ ] `morning-hero-prod` and `morning-hero-test` databases created on `tjphomepg`
- [ ] All 6 secrets added to `tjp-home-vault` (including the two full connection string URLs)
- [ ] k8s manifests committed (`k8s/base` + `k8s/overlays/prod` + `k8s/overlays/test`)
- [ ] GitHub Actions secrets configured in repo settings
- [ ] `main.yml` and `promote.yml` workflows committed and pushed
- [ ] CI run succeeds: image built, pushed to ACR, test overlay updated
- [ ] ArgoCD apps `morning-hero-test` and `morning-hero` registered
- [ ] DNS records for both hostnames pointing at cluster load balancer
- [ ] TLS certificate provisioned for test hostname
- [ ] Smoke test of full CI loop passes
