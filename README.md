# The Cave — interactive backdrop

Live Three.js backdrop for talks. The audience scans the QR on the TV, asks a question, and it appears on the TV in the scene.
Runs on Cloudflare: a Worker serves the site and API, and one Durable Object keeps the questions, presenters and TV slides.

| Page | URL | Who |
|---|---|---|
| Backdrop | https://backdrop.theaibuilder.school/ | Projector. Press **F** for fullscreen |
| Form | https://backdrop.theaibuilder.school/form | Audience phones (the QR points here) |
| Admin | https://backdrop.theaibuilder.school/admin | You. Password-protected |
| Moderator panel | https://backdrop.theaibuilder.school/panel | Phone or tablet on stage. Same password as the admin |

## Admin page
- **Questions**: tabs for Waiting / On the TV / Answered / Hidden / All, search, filter by presenter.
  Approve, put on the TV now, mark answered, hide, restore, delete.
  Questions containing swear words (English and Malay) are always held in Waiting, even with moderation off.
- **On the TV now**: what the backdrop is showing, live, plus a remote (Prev / QR / Next / Slideshow). A banner warns when the TV is stuck on manual.
- **TV**: seconds each question stays up, the caption under the QR, partner logos on/off, chromatic aberration on/off and its strength.
- **Sound**: new-question sound (marimba, singing bowl, ding-dong or none) with volume, mute and a Test button; campfire crackle volume and mute.
- **Live controls**: approve-before-showing (moderation), zoom the backdrop into the TV, mark every TV question answered.
- **Presenters**: add names and talk titles; "Put on stage" shows them under THE CAVE logo on the backdrop and on the form, and tags new questions with them.

## Moderator panel
`/panel` is for whoever reads questions out on stage: the question on the TV right now in large type (A−/A+ to resize),
the same TV remote, the queue with Show now / Answered, and Waiting questions to approve or hide. It keeps the phone screen awake.

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

`npm run build` copies three.js and the fonts from node_modules into `public/vendor` and builds the admin into `public/admin` (deploy and dev do this automatically; `npm run dev:admin` rebuilds the admin on save).

## Code
- `src/worker.js`: routes, admin login (signed HttpOnly cookie), QR code
- `src/room.js`: the Durable Object: SQLite storage, profanity hold, rate limit, live WebSockets
- `public/index.html` + `public/js/`: the backdrop · `public/form.html` · `admin/`: the admin (React + shadcn/ui, built by Vite into `public/admin/` on `npm run build`)

**The scene** is rendered live in Three.js. Nothing is a pre-rendered video.

**Themes:** press a number key on the backdrop to switch theme (it fades through black; queued questions are kept).
The last theme used is remembered; `/?theme=1` forces one.

| Key | Theme | File |
|---|---|---|
| 1 | Firelit cave: campfire, floating logo, water channel, a lost duckling that is always paddling about; a duck family, a pirate ship and jumping fish take turns appearing. Ducks steer round the rocks and fish only jump over open water (`clearance.js` maps where the rocks are) | `public/js/themes/firelit-cave.js` (+ `cave-life.js`, `clearance.js`) |

To add a theme: copy `firelit-cave.js`, change it, and register it in the `THEMES` list at the top of `public/js/main.js`.

Shared pieces: `public/js/main.js` (renderer, keys, WebSocket to the room) · `sound.js` (question chimes and the campfire crackle, synthesised with WebAudio: no audio files, nothing to license) · `beacon.js` (the alarm light) · `flip-clock.js` (the clock on the TV) · `tv-screen.js` (what's on the TV) · `tv.js` (the TV model) · `themes/treasure.js` (the hoard) · `fire.js` (campfire) · `wall-art.js` (logo painting)

The TV runs a slideshow: the QR code, then up to three approved questions, then each partner logo in turn, and round again. Every approved question keeps coming
back until it's marked answered or hidden. A new question goes up as soon as the one on screen has had its time: the chime plays and the alarm
beacon on top of the TV turns from clear glass to red and rattles on the cabinet. The QR is drawn amber-on-dark to match the TV. Sound needs one key press or click
on the backdrop first (browsers block sound until then); pressing **F** for fullscreen is enough.
The TV's glass is shattered in one corner (shards catch the light at different angles; the cracks stop short of the QR so it always scans) and the cabinet is worn; a retro flip clock on top shows the time; a hoard of gold glints under it (coins, a crown and two swords) with an old ship's anchor lying beside it. Partner logos (`public/partners.png`) take turns with the QR on the TV: the strip is split into one logo per partner wherever there is a wide transparent gap.
From /admin you can bring any question back with **Show again**.

**Backdrop keys:** `1`–`9` theme · `F` fullscreen · `Q` camera zooms in/out of the TV (shows whatever is on it) · `C` chromatic aberration on/off on this screen (the admin setting wins on its next change; eases off while zoomed into the TV) · `P` FPS meter

**TV keys** (also on the admin and panel remote): `→` next question (new ones first) · `←` previous question · `↑` show the QR · `↓` back to the slideshow.
After any arrow key the TV is on manual and holds what you picked; new questions still sound and wait. Press `↓` (or Slideshow) to go back to automatic.

**Performance:** open the backdrop in Chrome/Edge with hardware acceleration on. Press **P** for an FPS meter.
The scene renders at 1x pixel ratio with MSAA, merges static rock/TV/campfire parts into a few draw calls, draws the sun shadow once, and fakes the water's light (glints from the opening, fire and TV off the ripples) instead of rendering a mirror reflection.
If frames still drop it steps down automatically: lower resolution, then no shadows or bloom (the meter shows the step as q0 to q3).
