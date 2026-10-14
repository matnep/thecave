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
- **Presenters**: add names and talk titles; "Put on stage" shows them under THE CAVE logo on the backdrop and on the form, and tags new questions with them.
- **TV**: the caption under the QR. The TV shows nothing else besides the QR and audience questions.

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

Shared pieces: `public/js/main.js` (renderer, keys, WebSocket to the room, ping sound) · `tv-screen.js` (what's on the TV) · `tv.js` (the TV model) · `themes/treasure.js` (the hoard) · `fire.js` (campfire) · `wall-art.js` (logo painting)

The TV shows the QR code (with its caption) and nothing else until a question arrives. Then it pings, the TV jolts,
it switches to static and types the question out, with a small QR in the corner. The ping needs one key press or click
on the backdrop first (browsers block sound until then); pressing **F** for fullscreen is enough.
The TV's glass is cracked in one corner and the cabinet is worn; a gold hoard glints under it, with a live clock on the chest. Partner logos (`public/partners.png`) sit bottom centre and fade out while zoomed into the TV.
From /admin you can bring any question back with **Show again**.

**Backdrop keys:** `1`–`9` theme · `F` fullscreen · `Q` camera zooms in/out of the TV (shows whatever is on it)

**TV keys:** `→` next question (waiting ones first, then forward through those already shown) · `←` previous question · `↑` show the QR · `↓` back to automatic.
After any arrow key the TV holds what you picked; new questions still ping and wait until you press `→` (or `↓` to let them play automatically).

**Performance:** open the backdrop in Chrome/Edge with hardware acceleration on. Press **P** for an FPS meter.
The scene renders at 1x pixel ratio with MSAA, merges static rock/TV/campfire parts into a few draw calls, draws the sun shadow once, and renders the water reflection at half resolution (blurred, so it stays soft).
If frames still drop it steps down automatically: lower resolution, then no shadows, bloom or live reflection (the meter shows the step as q0 to q3).
