# First commit and GitHub connection (Windows / VS Code)

## Before you start

1. Confirm `.gitignore` is present in the project root and `.env.local` is excluded.
2. Rotate any API key or database password that has been exposed in chat, screenshots, logs, or source control.
3. Do not upload `.env.local`, API keys, connection strings with real passwords, database dumps, or private poems.

## 1. Open the project root

Open the VS Code terminal in the directory that contains `package.json`. For this project, that may be:

```powershell
cd "C:\Users\cfvvd\Desktop\ИИчатРулетка\soulvector"
```

Check that Git is installed:

```powershell
git --version
```

## 2. Copy project files

Place `README.md`, `.gitignore`, and `.env.local.example` in the project root. Keep your real `.env.local` locally; do not replace it with the example file.

## 3. Check that secrets are ignored

```powershell
git check-ignore -v .env.local
```

This should print the `.gitignore` rule that excludes `.env.local`. If it prints nothing, stop and fix `.gitignore` before staging.

If the file was already tracked by Git, remove it from the index while keeping it on disk:

```powershell
git rm --cached .env.local
```

If `git ls-files .env.local` prints no output, it is not currently tracked. If a secret was committed or pushed before, rotate it; removing the file in a new commit does not remove it from Git history.

## 4. Initialise Git if necessary

Check whether this folder is already a Git repository:

```powershell
git status
```

If Git reports `not a git repository`, initialise it:

```powershell
git init -b main
```

If `git status` works, do not initialise another repository.

## 5. Review and create the first commit

```powershell
git status --short
git add .
git diff --cached --stat
git diff --cached --name-only
```

Check that `.env.local`, `node_modules`, `.next`, and generated private data are not in the staged file list. If they are, do not commit until they are excluded.

Then create the commit:

```powershell
git commit -m "chore: initial SoulVector MVP"
```

If Git asks for author identity, configure your own name and email (use the email you want associated with commits):

```powershell
git config --global user.name "YOUR NAME"
git config --global user.email "YOUR_EMAIL"
```

Then repeat the `git commit` command.

## 6. Create an empty GitHub repository

1. Sign in at https://github.com/new.
2. Name the repository `soulvector` (or choose another name).
3. Prefer **Private** while the MVP has no authentication and contains research code/data.
4. Do **not** initialise the remote with a README, `.gitignore`, or license. Those files already exist locally.
5. Create the repository and copy its HTTPS URL, such as `https://github.com/YOUR-USERNAME/soulvector.git`.

## 7. Connect and push

Replace the URL below with the one shown by GitHub:

```powershell
git remote add origin https://github.com/YOUR-USERNAME/soulvector.git
git remote -v
git push -u origin main
```

If `origin` already exists, use `git remote set-url origin https://github.com/YOUR-USERNAME/soulvector.git` instead of `git remote add origin`.

GitHub will prompt you to authenticate using the browser, Git Credential Manager, or another configured authentication method. Do not put a password or personal access token directly into the remote URL.

## 8. Verify

Refresh the GitHub repository page. You should see the README and project files. Confirm `.env.local` is not present in the repository.
