# Push this project to GitHub and deploy on Render

## 1. Create GitHub repo and push (run in your terminal)

From the **parent** of `pdf-worker` (e.g. `c:\gosiwon-go`):

```bash
cd pdf-worker
git init
git add .
git commit -m "Initial commit: Node + Playwright PDF worker for Render"
```

Then either:

**Option A – GitHub CLI (if installed):**
```bash
gh repo create gosiwon-pdf-worker --public --source=. --remote=origin --push
```

**Option B – Manual:**
1. On GitHub: New repository → name: **gosiwon-pdf-worker** → Create (no README, no .gitignore).
2. In `pdf-worker`:
```bash
git remote add origin https://github.com/YOUR_USERNAME/gosiwon-pdf-worker.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

## 2. Render

- **Repository to select:** **gosiwon-pdf-worker**
- **URL:** `https://github.com/YOUR_USERNAME/gosiwon-pdf-worker`
- Build: `npm install && npm run build`
- Start: `npm start`
- Env: `PDF_WORKER_SECRET`
