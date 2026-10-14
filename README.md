# The Cave — interactive backdrop

```
npm install
npm start
```

| Page | URL | Who |
|---|---|---|
| Backdrop | http://localhost:3000/ | Projector. Press **F** for fullscreen |
| Join | http://&lt;your-lan-ip&gt;:3000/join | Audience phones (the QR code points here) |
| Admin | http://localhost:3000/admin | You. Moderation, put a question on TV, big QR. Only works on this laptop |

**The scene** is rendered live in Three.js. Nothing is a pre-rendered video.

**Themes:** press a number key on the backdrop to switch theme (it fades through black; queued questions are kept).
The last theme used is remembered; `http://localhost:3000/?theme=1` forces one.

| Key | Theme | File |
|---|---|---|
| 1 | Firelit cave: campfire, floating logo, water channel, a lost duckling that is always paddling about; a duck family, a pirate ship and jumping fish take turns appearing | `public/js/themes/firelit-cave.js` (+ `cave-life.js`) |

To add a theme: copy `firelit-cave.js`, change it, and register it in the `THEMES` list at the top of `public/js/main.js`.

Shared pieces: `public/js/main.js` (renderer, keys, live connection) · `tv-screen.js` (what's on the TV) · `tv.js` (the TV model) · `fire.js` (campfire) · `wall-art.js` (logo painting)

The QR code only ever appears on the TV. The TV rotates "Big ideas", the QR, "AI. Tech. Malaysia.", the QR again.
When a question arrives it switches to static, types the question out, and shows a small QR in the TV's own corner.
From /admin you can bring any question back with **Put on TV**.

**Backdrop keys:** `1`–`9` theme · `F` fullscreen · `Q` camera moves into the TV so the QR fills the screen (press again to pull back) · `→`/`Space` next slide

**Performance:** open the backdrop in Chrome/Edge with hardware acceleration on. If frames drop, it lowers resolution, then shadows, automatically.
The old video version is still at http://localhost:3000/video.

**Moderation:** turn it on in /admin, or start the server with it on: `MODERATE=1 npm start`

## Venue network checklist
- The laptop and the audience's phones must be on the **same Wi-Fi**.
- On first run, Windows asks whether Node can use the network. Allow **Private** networks
  (if the venue Wi-Fi is set to "Public", allow that too, or switch the network profile to Private).
- Some venue/guest Wi-Fi blocks phones from talking to each other ("client isolation").
  Test before the talk. If phones can't load the page:
  - **Option A:** use your own router or phone hotspot for the laptop and audience, or
  - **Option B:** use a tunnel so phones can join over mobile data:
    `cloudflared tunnel --url http://localhost:3000`, then restart with
    `PUBLIC_URL=https://xxxx.trycloudflare.com npm start` so the QR code uses that address.

Messages are kept in memory only, so restarting the server clears all questions.
