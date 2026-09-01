# Sugar Tracker

A mobile-friendly food photo tracker: snap a photo, get an AI estimate of sugar,
calories, and carbs, and log it against a daily sugar goal with a 14-day trend
chart and streak counter.

Built with React + Vite + Tailwind. No backend — data lives in your browser's
`localStorage`, and photo analysis calls the Anthropic API directly from the
browser using your own API key.

## Run it locally

```bash
npm install
npm run dev
```

Open the printed `localhost` URL. Go to **Settings** and paste in an Anthropic
API key (get one at https://console.anthropic.com/settings/keys) to enable
photo analysis.

## Deploy to GitHub Pages

**Option A — GitHub Actions (recommended, already set up):**

1. Create a new GitHub repo and push this project to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. In the repo, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) will build and
   deploy automatically on every push to `main`. Check the **Actions** tab
   for progress; your site will be live at
   `https://<your-username>.github.io/<your-repo>/`.

**Option B — the `gh-pages` package:**

```bash
npm install
npm run build
npm run deploy
```

This pushes the built `dist/` folder to a `gh-pages` branch. Then in
**Settings → Pages**, set **Source** to the `gh-pages` branch.

## About the API key

This is a static site with no server, so there's nowhere private to hide an
API key. Each visitor enters their own key in **Settings**; it's saved only
in their browser's local storage and sent straight to Anthropic when they
analyze a photo — it never passes through any server of yours.

Because of that:
- **Don't** hardcode your key into the source and push it to a public repo.
- If you want to share the deployed site with others, each person needs
  their own Anthropic API key.
- This is fine for personal/single-user use, which is what this app is
  designed for.

## Data & storage

- All entries and settings are stored in `localStorage`, scoped to whatever
  domain the site is hosted on. Clearing browser data or switching browsers
  starts you fresh — there's no sync between devices.
- Photos are compressed to a small JPEG before storage and before being sent
  for analysis, to keep things fast and within `localStorage`'s size limits.
- Nutrition estimates are approximate. Always feel free to correct the
  AI's numbers — every entry is editable after saving.

## Project structure

```
src/
  App.jsx        the whole app (views, logic, UI)
  storage.js     localStorage wrapper
  main.jsx       React entry point
  index.css      Tailwind + font imports
```
