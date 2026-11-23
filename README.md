# Bobcat Weight Room

Rack tablets, a wall TV, and a coach page for the Greenbrier High School weight room.
Kids log their reps at the rack, the TV ranks who beat their last, and PRs get a full-screen moment.
It runs on one small computer on the weight room's own Wi-Fi. No internet, no school IT, no subscriptions.

Phase 1 is typed-in reps. The data is already shaped for a camera to add bar speed later (see "Camera later").

## What's in it

| Screen | Address | Runs on |
|---|---|---|
| Rack tablet | `http://<computer>:8080/rack/1`, `/rack/2`, ... | iPad (10.2"), portrait, Guided Access |
| Wall board | `http://<computer>:8080/tv` | The TV, via the Pi's HDMI |
| Coach page | `http://<computer>:8080/coach` | Coach's phone or laptop |

**Rack flow:** idle (tap to start) → who's lifting (tap your name, or find it) → log each set with − / + / LOG SET → silent PR takeover if you beat your best → lift done, next lift.

**TV:** flips between TODAY (Beat Your Last on the day's board lift, today's lifts, PRs today), SEASON (Best Overall, Strongest OL/DL vs Skill, Most Improved) and SPEED (fastest off the GPS pods, the 40, vertical and broad; only once there are results). Updates the second a set is logged. `/tv?screen=speed` pins one screen.

**Coach page:** load the day's workout, roster (with spreadsheet import), max day, practice load (GPS file), speed & jumps (with strength vs speed), strike bad sets, settings, backups.

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

## Practice load: lighter after a heavy practice

After practice, bring the GPS pods' export into **Practice load** on the coach page (any CSV with a player name and any of load, collisions, max speed; m/s is turned into mph). You can also set any kid by hand.

- Each kid is compared with **his own group (OL/DL or skill) at that practice**. Load at least 1.25 × the group's middle, or collisions at least 1.5 × the middle and 4 more, is **heavy**. Load at most 0.6 × the middle is **light**.
- His next lift within 3 days moves every **%** set: heavy −10 points (75% → 65%), light +5. Never below 30% or above 95%. Fixed-pound and kid-picks sets never change. Settings can change the points or turn it off.
- The rack shows a **LIGHTER TODAY** or **PUSH IT TODAY** chip so the kid knows why the bar is lighter.
- A coach flag wins over the numbers, even when the file is brought in again. "Back to the numbers" undoes it.
- Top speeds from the file land on the Speed board by themselves.

No medical info goes in here: just practice numbers and a flag. Logic lives in `src/readiness.js` (shared with the coach page and the demo).

## Speed & jumps

Type results on test day (40, 10 split, pro agility, vertical, broad) or paste them from a spreadsheet. Each kid keeps his **best** on file, and obvious typos (a 46-second 40) are refused. **Strength vs speed** plots the Best Overall number against top speed, OL/DL and skill separately, split at each group's middle: *needs speed*, *needs the bar*, *needs both*, *strong + fast*.

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

## Setting up a rack tablet (iPad 8th gen, 10.2")

The rack screen fits itself to the tablet: tall Android tablets and 4:3 iPads both fill edge to edge.

1. Settings → Wi-Fi: join the weight room Wi-Fi.
2. Settings → General → Software Update → Automatic Updates: off (no surprise update screens mid-lift).
3. Settings → Display & Brightness → Auto-Lock: **Never**. Set brightness around 60%: the screen stays on all practice, and that's what makes one charge last the day.
4. In Safari, open `http://<pi address>:8080/rack/1` (rack 2 tablet gets `/rack/2`, and so on).
5. Share button → **Add to Home Screen** → Add. Open it from the new Bobcat icon; it runs full screen with no address bar.
6. Settings → Accessibility → **Guided Access**: on. Passcode Settings → set a Guided Access passcode only coaches know. Display Auto-Lock (inside Guided Access): Never.
7. Open the Bobcat icon, hold the iPad upright, **triple-click the Home button** → Options: turn off Sleep/Wake Button, Volume Buttons and Motion (locks it portrait) → Start. Kids are now stuck in the rack screen.
8. To get out (end of day, charging): triple-click Home, type the passcode, End.

Nightly: take it off the rack, charge it in the office, and put it back on in the morning. It reopens right where it was.

Android tablet instead (Galaxy Tab A9+/A11+): in Chrome open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add `http://<pi address>:8080`, Enable, relaunch (lets the page keep the screen awake). Open the rack address → menu → Add to home screen → Install. Settings → Display → Screen timeout 2 minutes. Settings → Security → Pin windows on, then pin the app. Settings → Battery → Protect battery.

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
