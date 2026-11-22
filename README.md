# Bobcat Weight Room

Rack tablets, a wall TV, and a coach page for the Greenbrier High School weight room.
Kids log their reps at the rack, the TV ranks who beat their last, and PRs get a full-screen moment.
It runs on one small computer on the weight room's own Wi-Fi. No internet, no school IT, no subscriptions.

Phase 1 is typed-in reps. The data is already shaped for a camera to add bar speed later (see "Camera later").

## What's in it

| Screen | Address | Runs on |
|---|---|---|
| Rack tablet | `http://<computer>:8080/rack/1`, `/rack/2`, ... | Galaxy Tab A9+, portrait, pinned |
| Wall board | `http://<computer>:8080/tv` | The TV, via the Pi's HDMI |
| Coach page | `http://<computer>:8080/coach` | Coach's phone or laptop |

**Rack flow:** idle (tap to start) → who's lifting (tap your name, or find it) → log each set with − / + / LOG SET → silent PR takeover if you beat your best → lift done, next lift.

**TV:** flips between TODAY (Beat Your Last on the day's board lift, today's lifts, PRs today) and SEASON (Best Overall, Strongest OL/DL vs Skill, Most Improved). Updates the second a set is logged.

**Coach page:** load the day's workout, roster (with spreadsheet import), max day, strike bad sets, settings, backups.

## Try it on a Mac (proof of concept)

1. Install Node.js 22 or newer from https://nodejs.org (the LTS button).
2. Get this folder onto the Mac (GitHub's green Code button → Download ZIP, or `git clone`).
3. In Terminal:
   ```
   cd bobcat-weightroom
   ./scripts/start-mac.sh
   ```
4. It prints addresses. Open `/coach`, `/tv` and `/rack/1` in browser tabs. A phone or tablet on the same Wi-Fi can open the same addresses.

The first run loads 70 made-up kids and three weeks of fake lifting so every screen has something on it. To start clean for real kids: stop it (Ctrl+C), delete the `data` folder, start again, then import the roster on the coach page.

## How the numbers work

- **Weights for a set** = the kid's max on file × the %, rounded **down** to 5 lb (Settings can change the step).
- **Estimated max of a set** = weight × (1 + reps ÷ 30) (the Epley formula, reps capped at 12). A single is just the weight.
- **Beat Your Last** = today's best estimated max on a lift vs the best from the kid's most recent earlier day on that lift. The TV only lists gains, so nobody gets shamed on the wall. The kid still sees his own number on the tablet.
- **PR** = a set whose estimated max beats both his max on file and everything he's logged before. PRs **never change a max**. Only max day (or a spreadsheet import) changes maxes.
- **Best Overall** = squat + bench + clean maxes, scored for bodyweight: 10 × total ÷ bodyweight^(2/3). One list for everybody.
- **Strongest** = raw 3-lift total, split OL/DL vs Skill (group comes from position; override per kid on the roster).
- **Most Improved** = total now vs total at the first max day on or after "Season started" in Settings.

## The coach's workout shorthand

Type it however the coach writes it, one line per lift:

| Type | Means |
|---|---|
| `5x3@75` | 5 sets of 3 at 75% of max |
| `3@65, 3@75, 3+@85` | a wave; the `+` means as many reps as possible |
| `1xAMRAP@70` | one set, max reps |
| `3x8` | no % given: the kid picks the weight |
| `2x5@225lb` | fixed weight |

Mark one lift ON THE BOARD. That's the one Beat Your Last ranks that day. Need a lift that isn't squat/bench/clean? NEW LIFT TYPE.

## Roster spreadsheet

Save as CSV. Columns it understands (header names are matched loosely): `First`, `Last` (or one `Name`), `Grad` or `Class`, `Position`, `Bodyweight`, `Rack`, `Squat`, `Bench`, `Clean`. Import shows a preview first. Re-importing updates kids instead of duplicating them.

`Rack` puts a kid's name on that rack's tablet as a big button. Everybody else taps FIND MY NAME.

## Setting up a rack tablet (Galaxy Tab A9+)

1. Connect it to the weight room Wi-Fi.
2. In Chrome, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add `http://<pi address>:8080`, set it to Enabled, relaunch. This lets the page keep the screen on mid-workout and install full-screen.
3. Open `http://<pi address>:8080/rack/1`, then Chrome menu → Add to home screen → Install.
4. Open it from the home screen icon (it runs full screen).
5. Settings → Display → Screen timeout: 2 minutes. The app keeps the screen on while a kid is lifting and lets it turn off when nobody's there.
6. Settings → Security and privacy → More security settings → Pin windows: on. Then open the app, tap Recents, tap the app icon → Pin this app. Kids can't leave it.
7. Settings → Battery → Protect battery (name varies by update; stops charging around 80-85%). Charges in the office overnight.

## The Pi (the real setup)

Set it up at home on internet once, then move it to the weight room.

```
git clone <this repo> ~/bobcat-weightroom
cd ~/bobcat-weightroom
sudo ./scripts/pi-setup.sh
sudo reboot
```

That installs Node, starts the app at boot, sets up nightly USB backups, and boots the TV straight into the wall board. Plug the Pi into the router by cable and give it a fixed address on the router (DHCP reservation) so the tablets' bookmarks never break.

**Clock:** the Pi 5 forgets the time when unplugged unless the official RTC battery (~$5) is installed, and there's no internet in the weight room to fix it. Wrong clock = wrong day on the boards. Buy the battery. The coach page warns you if the clock drifts.

**USB backup:** format a stick as FAT/exFAT named `BOBCATBAK` and leave it plugged into the Pi. Every night at 10 PM (Settings) the database is copied there, last 30 kept. The coach page shows whether last night's worked and lets you download any backup.

**Restore:** stop the app (`sudo systemctl stop bobcat`), copy a backup over `/var/lib/bobcat/bobcat.db`, start it (`sudo systemctl start bobcat`).

**Update:** `git pull` then `sudo ./scripts/pi-setup.sh` again. Data is kept.

**Coach PIN (optional):** uncomment `COACH_PIN` in `/etc/systemd/system/bobcat.service`, then `sudo systemctl daemon-reload && sudo systemctl restart bobcat`. Racks and the TV stay open; only the coach page asks.

## Camera later

Every logged set is a row in `sets` with `source = 'typed'`. A camera will write the same rows with `source = 'camera'`, plus one row per rep in `reps` (mean and peak bar speed, range of motion, bar path). Nothing else changes, and Fastest Bar becomes one more board.

## For whoever maintains this

Boring on purpose: plain Node (22.13+), the built-in `node:sqlite`, zero npm packages, no build step. `src/` is the server (`store.js` has every query), `public/` is the screens (plain HTML, CSS and JS modules). `npm test` runs the tests. `npm run seed -- --force` wipes and reloads fake data (never on the real database).

## Shareable demo (no setup)

`dist-demo/` is the same app running entirely in one browser tab: same screens, same `store.js`, with SQLite running in the browser through sql.js. 70 made-up kids, nothing saved, reloading starts over. Build it with:

```
npm pack sql.js@1.10.2 && tar -xzf sql.js-1.10.2.tgz
node scripts/build-demo.js package/dist/sql-asm.js
```

Then serve `dist-demo/` with any static web server. The demo-only pieces live in `demo-src/`.
