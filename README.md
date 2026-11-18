# Meridian House — Building Rent Management System

Full-stack building rent, lease, document vault, security, interactive floorplan maintenance, and real-time WebSocket chat application powered by **React**, **Vite**, **Express**, **WebSockets (`ws`)**, and **Node.js built-in SQLite (`node:sqlite`)**.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production Build & Start

```bash
npm run lint
npm run build
NODE_ENV=production npm start
```

Environment variables:
- `PORT` (optional, default `3000`)
- `DATA_DIR` (optional, default `./data` — directory where `meridian.db` is stored)
- `NODE_ENV` (`production` to serve built `dist/` assets)

---

## Auto-Deploy from GitHub (Online Hosting)

Because this app uses an Express API, WebSockets (`/ws`), and `node:sqlite` (Node 22+ built-in SQLite with zero native C++ build dependencies), host it on a full-stack Node/Docker platform connected to your GitHub repository.

### 1. Push this repository to GitHub

```bash
git init
git add .
git commit -m "Initial commit with GitHub auto-deploy config"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git
git push -u origin main
```

### 2. Choose an Auto-Deploy Option

#### Option A: GitHub Pages (`https://<YOUR_USERNAME>.github.io/<YOUR_REPO>/`) — Zero External Hosting Needed
1. Push your code to the `main` branch on GitHub.
2. Open your repository on GitHub → **Settings** → **Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. The workflow `.github/workflows/pages.yml` runs automatically on every push to `main` and publishes your live app to `https://<YOUR_USERNAME>.github.io/<YOUR_REPO>/` (with browser `localStorage` persistence + cross-tab `BroadcastChannel` live updates).

#### Option B: Render (Full-Stack Node + Persistent SQLite via `render.yaml`)
1. Go to [Render Dashboard](https://dashboard.render.com/) -> **New +** -> **Blueprint**.
2. Connect your GitHub repository. Render reads `render.yaml` automatically (`autoDeploy: true`, `/api/health` check, and persistent `/var/data` disk for SQLite).
3. *(Optional)* Add your Render **Deploy Hook URL** as a GitHub repository secret named `RENDER_DEPLOY_HOOK_URL` so GitHub Actions triggers deployment only after `lint`, `build`, and smoke tests pass.

#### Option C: Railway (Full-Stack via `railway.json` + `Dockerfile`)
1. Create a new project in [Railway](https://railway.app/) -> **Deploy from GitHub repo** (uses `railway.json` and `Dockerfile`).
2. Attach a persistent volume mounted at `/app/data` and set `NODE_ENV=production` and `DATA_DIR=/app/data`.
3. *(Optional)* Add `RAILWAY_TOKEN` (and optionally `RAILWAY_SERVICE`) in GitHub **Settings -> Secrets and variables -> Actions** for CI-gated deploys via `.github/workflows/ci-deploy.yml`.

#### Option D: Docker / GitHub Container Registry (`ghcr.io`)
On every push to `main`, `.github/workflows/ci-deploy.yml` automatically:
1. Runs `npm run lint` and `npm run build`.
2. Smoke-tests `node server.ts` in production mode against `/api/health`.
3. Builds and pushes a ready-to-run Docker image (`Dockerfile`) to `ghcr.io/<YOUR_USERNAME>/<YOUR_REPO>:latest` that you can deploy to Cloud Run, Fly.io, DigitalOcean App Platform, or any VPS.
