# The Cave — interactive backdrop

Live Three.js backdrop for talks. The audience scans the QR on the TV, asks a question, and it appears on the TV in the scene.
Runs on Cloudflare: a Worker serves the site and API, and one Durable Object keeps the questions, presenters and TV slides.

| Page | URL | Who |
|---|---|---|
| Backdrop | https://backdrop.theaibuilder.school/ | Projector. Press **F** for fullscreen |
| Form | https://backdrop.theaibuilder.school/form | Audience phones (the QR points here) |
| Admin | https://backdrop.theaibuilder.school/admin | You. Password-protected |

## Admin page
- **Questions**: tabs for Waiting / On the TV / Answered / Hidden / All, search, filter by presenter.
  Approve, put on the TV now, mark answered, hide, restore, delete.
  Questions containing swear words (English and Malay) are always held in Waiting, even with moderation off.
- **Live controls**: approve-before-showing (moderation), zoom the backdrop into the TV QR, clear the TV queue.
- **Presenters**: add names and talk titles; "Put on stage" shows them on the TV and the form, and tags new questions with them.
- **TV slides**: edit, reorder, add or remove the rotating slides (text, QR, presenter), their timing, and the footer.

## Run locally
```
npm install
npm run dev
```
Opens on http://localhost:8787 (also reachable from phones on the same Wi-Fi via your laptop's IP, which works as an offline fallback at a venue).
The local admin password is in `.dev.vars` (not committed).

## Deploy to Cloudflare
1. `npx wrangler login`
2. `npx wrangler secret put ADMIN_PASSWORD` (choose a strong password)
3. The Worker deploys into the account that owns theaibuilder.school (`account_id` in `wrangler.jsonc`), on the custom domain backdrop.theaibuilder.school
4. `npm run deploy`

`npm run build` copies three.js and the fonts from node_modules into `public/vendor` (deploy and dev do this automatically).

## Code
- `src/worker.js`: routes, admin login (signed HttpOnly cookie), QR code
- `src/room.js`: the Durable Object: SQLite storage, profanity hold, rate limit, live WebSockets
- `public/index.html` + `public/js/`: the backdrop · `public/form.html` · `public/admin.html`

**The scene** is rendered live in Three.js. Nothing is a pre-rendered video.

**Themes:** press a number key on the backdrop to switch theme (it fades through black; queued questions are kept).
The last theme used is remembered; `/?theme=1` forces one.

| Key | Theme | File |
|---|---|---|
| 1 | Firelit cave: campfire, floating logo, water channel, a lost duckling that is always paddling about; a duck family, a pirate ship and jumping fish take turns appearing | `public/js/themes/firelit-cave.js` (+ `cave-life.js`) |

To add a theme: copy `firelit-cave.js`, change it, and register it in the `THEMES` list at the top of `public/js/main.js`.

Shared pieces: `public/js/main.js` (renderer, keys, WebSocket to the room) · `tv-screen.js` (what's on the TV) · `tv.js` (the TV model) · `fire.js` (campfire) · `wall-art.js` (logo painting)

The QR code only ever appears on the TV, between the slides you set in /admin.
When a question arrives it switches to static, types the question out, and shows a small QR in the TV's own corner.
From /admin you can bring any question back with **Show again**.

**Backdrop keys:** `1`–`9` theme · `F` fullscreen · `Q` camera moves into the TV so the QR fills the screen (press again to pull back) · `→`/`Space` next slide

**Performance:** open the backdrop in Chrome/Edge with hardware acceleration on. If frames drop, it lowers resolution, then shadows, automatically.
