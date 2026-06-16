# GitHub Setup

## What Is Ready

- `.gitignore` protects `.env`, `.env.*`, `node_modules`, logs, and local Facebook OAuth storage.
- The project can be committed safely as long as you do not add a real `.env`.

## Create Repository

Use GitHub in the browser:

1. Open https://github.com/new
2. Repository name: `ai-story-traffic-platform`
3. Visibility: private is recommended at first.
4. Do not add README, `.gitignore`, or license on GitHub if the local repo already has files.

## Push From PowerShell

From the project folder:

```powershell
git init
git add .
git commit -m "Prepare AI Story Traffic Platform for production"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ai-story-traffic-platform.git
git push -u origin main
```

If GitHub asks you to sign in, use GitHub's official browser/device login or a GitHub personal access token. Do not paste it into chat.

## If Remote Already Exists

```powershell
git remote -v
git remote set-url origin https://github.com/YOUR_USERNAME/ai-story-traffic-platform.git
git push -u origin main
```

