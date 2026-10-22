# Besta kiosk — deployment guide

## What is in this folder
- `index.html`, `style.css`, `games.css`, `app.js`, `consent.js`, `config.js`, `intro.*` — the kiosk
- `games/table-time.js`, `games/dasara-arcade.js`, `games/durga/index.html` — the two games
- `privacy.html`, `terms.html`, `cookies.html`, `licenses.html`, `404.html` — policies and error page
- `api/backend.js`, `vercel.json` — private proxy and security headers (Vercel)
- The Apps Script backend is delivered separately (`Code.gs`, `appsscript.json`). Do not deploy it with the site.

## 1. Backend (Google Apps Script)
1. Add Script Properties: `SHEET_ID` and `GOOGLE_CLIENT_ID` (step 2).
2. Paste `Code.gs` (and `appsscript.json`), run `setupSheets`, `installTriggers`, `checkSetup`. If you already deployed an older version, paste the new code and use Deploy > Manage deployments > Edit > New version (the new `login` and `myResults` actions are needed).
3. Deploy > Web app > Execute as Me, Who has access Anyone. Copy the `/exec` URL.
   Clear old test rows from the Players and Plays tabs first; the columns have changed.

## 2. Google sign-in (OAuth client ID) — required
There is no guest mode. Until `GOOGLE_CLIENT_ID` is filled in `config.js`, the home page shows "Sign-in is not available right now" and nothing can be played.
Google Cloud Console > APIs & Services > Credentials > Create credentials > OAuth client ID > Web application.
Authorized JavaScript origins: your live site (for example `https://besta-kiosk.vercel.app`) and, for testing,
`http://localhost:8000`. Copy the client ID into `config.js` (`GOOGLE_CLIENT_ID`) and into the Script Property.
The client ID is public by design. Never use or share the client secret; this app does not need it.

## 3. Hosting on Vercel
1. Import the folder as a project (no build step).
2. Settings > Environment Variables: `APPS_SCRIPT_URL` = the `/exec` URL, and optionally
   `ALLOWED_ORIGINS` = your site address.
3. `config.js` already points to `/api/backend`, so the Apps Script address never appears in the page.
   On GitHub Pages there is no proxy: set `BACKEND_URL` to the `/exec` URL instead (it becomes visible).

## 4. Before going live
- `config.js`: add `CONTACT.phone` (for the Call button and a clickable number).
- Have the Privacy Policy, Terms and Cookie Policy reviewed by a lawyer who knows the DPDP Act.
- Test sign-in, the offers form, "Delete my data", and both games on the real tablet.
- Lock the tablet to this page (Guided Access on iPad, screen pinning on Android).

## Game dates
In `config.js`, a game with `startDate` and `endDate` (YYYY-MM-DD, inclusive) hides itself after its end date, using the tablet's own date. Dasara Arcade ends on 2026-10-21. Table Time has no dates and always shows.
