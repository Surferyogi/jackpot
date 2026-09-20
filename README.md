# Jackpot (PWA)

A free-play, 5-reel × 3-row fruit slot with festive win celebrations, built for CK's dad.
Virtual credits only — there is no real money anywhere in this project. All artwork is
drawn on canvas in code and every sound is synthesised live with WebAudio; no commercial
assets, images or audio files are used.

- **Live URL (after deploy):** https://surferyogi.github.io/jackpot/
- **Repo:** https://github.com/Surferyogi/jackpot
- **Backend:** none. Everything is stored on the device in `localStorage` (`jp_profile_v1`).
- **Version:** see `js/config.js` → `APP_VERSION` (format `vYYYY:MM:DD-HH:MM`, UTC)

Same architecture and deploy loop as Seven Wonders, minus Supabase.

---

## 1. Architecture

| Layer | What | Where |
|---|---|---|
| App shell | `index.html`, `styles.css` | GitHub Pages (static) |
| Maths | `js/engine.js` — symbols, reel strips, 20 paylines, paytable, `evaluate()`. Pure logic, no DOM; also `require()`-able in Node for the tests. | Client |
| Art | `js/art.js` — every symbol drawn as vector shapes on canvas | Client |
| Audio | `js/audio.js` — WebAudio SFX (reel ticks/stops, coins, gong, drums, firecrackers, fireworks, fanfares) + an original pentatonic music loop | Client |
| Effects | `js/fx.js` — full-screen celebration canvas: coin fountains, gold rain, fireworks, firecracker strings, rising lanterns, red packets, confetti, golden dragon fly-over, 福 glyph | Client |
| Calendar | `js/lunar.js` — Chinese lunisolar calendar computed astronomically (Meeus new moons + solar longitude, Beijing time); no lookup tables, so it has no end date | Client |
| Themes | `js/themes.js` — which festival is active today (windows, priority), greetings, banner motifs | Client |
| Controller | `js/game.js` — state, persistence, reel animation, win presentation, free spins, autoplay, turbo, refill, paytable, records, festival theme application, birthday gift | Client |
| Offline | `sw.js` service worker + `manifest.webmanifest` | Client |
| Persistence | `localStorage` key `jp_profile_v1`: credits, jackpot meter, bet, settings, records, in-progress free spins, pending spin | Device |

Fully playable offline after the first load. No network calls at all (Google Fonts for the
title font is the only external request, and the page works without it).

## 2. Game rules (as implemented in `js/engine.js`)

- 5 reels × 3 rows, **20 fixed paylines**, wins pay left to right on adjacent reels.
- Bet presets (total per spin): **20 · 40 · 100 · 200 · 400 · 1,000** credits. Line bet = total ÷ 20.
- Symbols: Lucky 7, Bar, Bell, Melon, Plum, Orange, Lemon, Cherry, **Gold** (the wild — an ingot labelled GOLD; internal id `WILD`), **Red Packet (Scatter)**.
- **Gold** (reels 2–4 only) substitutes for everything except the Red Packet; any line win using a Gold is **×2**.
- **Red Packet** counts anywhere: 3 / 4 / 5 → **10 / 15 / 20 free spins** plus 2× / 5× / 20× total bet. Red packets during free spins add more spins.
- **Progressive jackpot:** 1.5 % of every bet feeds the meter (seeded at 5,000). **Five Lucky 7s on a payline** (Golds may substitute) win the whole meter on top of the line pay; the meter restarts at 5,000.

### Bonus rounds (all in `js/engine.js` → `GOLD_RUSH`, `PICK`, `WHEEL`, `DOUBLE`, `FS_LADDER`)

| Round | How it starts | What happens |
|---|---|---|
| **Free Spins with a rising ladder** | 3+ Red Packets | Wins start at ×2; every winning spin in a row climbs ×3 → ×4 → ×5; a blank spin resets to ×2. Retriggers add spins. |
| **Gold Rush** | Random, base game, 1 in 75 spins (25 % of those hit two reels) | Before the reels settle, one or two of reels 2–4 sweep to solid Gold (a golden wipe animation), then the spin is paid with those reels fully wild. |
| **Fortune Pick 红包大抽奖** | A Gold showing on each of reels 2, 3 and 4 at once (≈ 1 in 135 spins) | Open 3 of 12 red packets; each holds 1× to 8× the bet (prizes `1,1,1,1,2,2,2,3,3,5,5,8`), then the rest are revealed. Prizes are credited as they are opened, so a reload cannot lose them. |
| **Lucky Wheel 转运轮** | Mystery trigger after a base-game spin that won nothing (1 in 90 of those, ≈ 1 in 200 spins) | Twelve equal slices chosen uniformly: 2×, 2×, 2×, 3×, 3×, 5×, 5×, 8×, 15× the bet, 5 free spins, 10 free spins, or the whole JACKPOT meter. The result is drawn and saved when the wheel appears; the wheel then animates to it. |
| **Double Up** | Offered after a base-game win of 1×–25× the bet (not on autoplay; can be switched off in Settings) | Guess Red or Black: a fair 50/50 — right doubles the win, wrong forfeits it — up to 3 rounds. COLLECT keeps the current amount; auto-collects after 7 s. RTP-neutral. |

Fortune Pick and the Lucky Wheel survive an app close: their layout/result is stored in the profile and re-shown on the next open.
- Credits: start at 5,000. Whenever the balance cannot cover the current bet, a **REFILL +5,000** button replaces SPIN (no waiting, no limit — the refill count is shown in Records for honesty).

Paytable (× line bet): 7 = 25/90/450 · Bar = 15/60/230 · Bell = 12/30/115 · Melon = 8/23/60 ·
Plum = 6/15/45 · Orange = 4/12/30 · Lemon = 3/8/23 · Cherry = 2 (for two)/3/8/23.
(Line pays were reduced ≈ 23 % when the bonus rounds were added, so the overall return stays close to 100 %.)

Reel animation: symbols are pre-rendered to sprites once per size, then drawn with transforms, which keeps
the reels alive cheaply — idle symbols breathe and bob, Lucky 7s carry a soft halo, the Gold Ingot glints,
Red Packets wiggle, a light sweep crosses the window every few seconds, reels squash-and-stretch on landing
and blur while spinning. On a win the payline draws in from the left, a light pulse travels along it, winning
symbols pop in left-to-right then pulse and wobble, sparkles rise out of the winning cells and the frame glows.
Idle drawing is throttled to ~30 fps; busy phases run at full rate.

Celebration tiers by win ÷ bet: `win` < 4× (line flash + chime, coins if ≥ 1×) · **BIG WIN** ≥ 4× (banner,
coin fountains, lanterns, fanfare) · **MEGA WIN** ≥ 10× (gong, firecracker strings both sides, gold rain, 福) ·
**EPIC WIN** ≥ 25× (dragon fly-over, fireworks, drums) · **JACKPOT** (all of it, full-screen overlay, 8-second count-up).

## 2b. Festival themes (automatic, every year, no end date)

On festival days the whole game re-dresses itself: background palette, a festive banner with
code-drawn motifs and a bilingual greeting, gentle ambient effects, festival-coloured confetti and
extra flourishes on big wins. Reel symbols and the paytable never change, so nothing about the
game maths is affected.

| Festival | Window | How the date is found |
|---|---|---|
| Spring Festival 春节 | CNY eve (D-1) through D+15; day 15 (元宵) gets the Lantern Festival variant | Lunar 1/1 from `js/lunar.js` |
| Dragon Boat 端午 | D-1, D | Lunar 5/5 |
| Qixi 七夕 | D-1, D | Lunar 7/7 |
| Mid-Autumn 中秋 | D-1, D | Lunar 8/15 |
| Winter Solstice 冬至 | D-1, D | Solar longitude 270° (Beijing day) |
| Christmas | 24–25 Dec | fixed |
| New Year's Day | 31 Dec, 1 Jan | fixed |
| Father's Day | D-1, D | 3rd Sunday of June |
| Dad's birthday | 17–18 Sep; on the 18th a one-time-per-year gift of **+8,888 credits** | fixed (`BIRTHDAY` in `js/themes.js`) |

If two windows overlap, the first in the list inside `js/themes.js → windows()` wins (Dad's birthday
first, then Spring Festival). Dates are the device's local calendar date; Singapore and Beijing share
UTC+8, which is the time base of the Chinese calendar.

**Calendar accuracy.** `js/lunar.js` applies the official Chinese calendar rules (month containing the
winter solstice is month 11; in a 13-month span the first month without a principal solar term is the
leap month) with Jean Meeus' algorithms. `tests/lunar.test.js` checks all 213 lunar-month starts and
winter-solstice dates from 2025 to 2040 against the Hong Kong Observatory's Gregorian-Lunar Calendar
Conversion Tables (https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2033e.txt and the other
years) — all match, including the leap months of 2025 (6), 2028 (5), 2031 (3), 2033 (11), 2036 (6) and
2039 (5). Beyond 2040 the same algorithm keeps running; the calendar stays consistent through at least
2300 in a sanity scan, though only the HKO-covered years are formally verified.

**Testing a theme without waiting for the date:** there is no theme picker in the app (Dad only ever
sees the automatic theme). Open the site with `?theme=<id>` instead, e.g.
`https://surferyogi.github.io/jackpot/?theme=zhongqiu` — ids: `cny lantern duanwu qixi zhongqiu dongzhi xmas
newyear fathersday birthday`. It is never saved, and preview mode never triggers the birthday gift.

## 3. Measured maths (Monte Carlo, `tests/simulate.js`, seeded)

Simulated from the actual engine code with every bonus round exactly as the game runs it (free-spin
ladder, Gold Rush, Fortune Pick, Lucky Wheel incl. its free spins and jackpots, 7s jackpot). 1,000,000
spins per bet. Double Up is a fair 50/50 and is not simulated (it neither adds nor removes expected value).

| Bet | RTP total | Lines | Scatter | Free spins | Gold Rush | Fortune Pick | Lucky Wheel | Jackpot (7s) | Hit rate |
|---|---|---|---|---|---|---|---|---|---|
| 20 | 121.3 % | 57.5 % | 2.5 % | 23.3 % | 8.1 % | 6.3 % | 13.9 % | 9.7 % | 54.4 % |
| 100 | 106.1 % | 57.5 % | 2.5 % | 23.3 % | 8.1 % | 6.3 % | 5.9 % | 2.5 % | 54.4 % |
| 1,000 | 102.7 % | 57.5 % | 2.5 % | 23.3 % | 8.1 % | 6.3 % | 4.1 % | 0.9 % | 54.4 % |

Frequencies (any bet): free spins ≈ every 87 spins · Gold Rush ≈ 75 · Fortune Pick ≈ 135 · Lucky Wheel ≈ 198 ·
7s jackpot ≈ 2,800 · **some bonus event ≈ every 27 spins**. Largest single spin seen in 1M spins ≈ 250× bet.

Why RTP depends on the bet: the jackpot meter is a flat credit amount (seed 5,000) awarded in full
regardless of bet — by five 7s or by the wheel's JACKPOT slice — so at the 20-credit bet it is worth
250 bets and pushes RTP well over 100 %. This is deliberate for a free-credit entertainment game and is
documented here so nobody mistakes it for an accident. Hit rate is high because a Cherry pair pays
(10 % of bet); such sub-bet wins get only a light flash, not a banner.

Re-run any time: `node tests/simulate.js 1000000 100`.

## 4. GitHub — first-time setup (one-time, ~5 minutes)

Create the repo first at github.com/new → name **jackpot**, public, empty (no README).

```bash
cd ~/Downloads
unzip jackpot.zip && cd jackpot
git init
git add .
git commit -m "Jackpot v2026:09:20-07:16 — initial PWA release"
git remote add origin https://github.com/Surferyogi/jackpot.git
git branch -M main
git push -u origin main
```

**Or the GitHub web-upload route (no Terminal):** create the empty repo, click *uploading an existing
file*, open the unzipped `jackpot` folder in Finder, select **everything inside it** (`index.html`,
`styles.css`, `sw.js`, `manifest.webmanifest`, `README.md`, `package.json` and the `js/`, `icons/`,
`tests/` folders — drag the folders themselves so the structure is kept), drop them on the page and
commit. As learned on Seven Wonders: always upload the **complete** set in one go; a partial upload
leaves the live site mixing old and new files. `.nojekyll` and `.gitignore` are hidden in Finder
(⌘⇧. shows them); they are nice-to-have, not required — the site works without them.

Then enable Pages: **repo → Settings → Pages → Source: Deploy from a branch →
Branch: `main` / `(root)` → Save.** The site appears at `https://surferyogi.github.io/jackpot/`
within a few minutes. All paths are relative (`./`), so the `/jackpot/` subpath works.

Run the commands one line at a time (zsh paste hazard, as with Seven Wonders).

- Pure static files: HTML, CSS, JS, PNG, webmanifest. No build step, no Node at runtime, no server code.
- Every reference is **relative** (`js/…`, `icons/…`, `./` in `sw.js`, `"start_url": "./index.html"`, `"scope": "./"`), so the `/jackpot/` subpath works. Confirmed by serving the folder under `/jackpot/` in headless Chromium: zero 404s, service worker scope `/jackpot/`, all 15 shell files cached, page reloads offline.
- No paths starting with `_` (Jekyll would hide them) and a `.nojekyll` file so Pages copies files as-is.
- File names are lower-case and match their references exactly (Pages is case-sensitive).
- HTTPS comes from GitHub Pages (required for the service worker and Add to Home Screen).
- The only external request is Google Fonts for the title font; the game works without it.

## 5. Install on Dad's iPhone / iPad

Open the URL in **Safari** → Share → **Add to Home Screen**. It then opens full-screen like an app,
works offline, and keeps its credits and records on that device. Progress is per device: the iPad
and iPhone each have their own balance (same as Seven Wonders).

Sound on iOS starts after the first tap anywhere (Apple requires a user gesture; the app listens
for touchend/click, since a touch *start* does not count as activation on iOS). The app also starts a
silent looping `<audio>` clip inside that gesture, which moves the iOS audio session to "playback" so
Web Audio is heard even with the **ring/silent switch** on — the standard workaround; without it iOS
mutes all Web Audio while the switch is on. If there is still no sound: raise the volume buttons, and
open ⚙ Settings, where an *Audio engine* status line shows whether the context is `running` and the
session is `playback`. Music and sound effects can be switched off there too.

## 6. Releasing updates (standard loop)

```bash
cd ~/Downloads/jackpot && git pull
# ...edit / unzip -o the new build over the top...
# 1) bump APP_VERSION in js/config.js  (vYYYY:MM:DD-HH:MM, UTC)
# 2) bump CACHE_VERSION in sw.js       (must change or clients keep the old cache)
git add . && git commit -m "vYYYY:MM:DD-HH:MM — <what changed>" && git push
```

Always upload/commit the **complete** file set. Verify the header version stamp on the live site
after every deploy. iPhone: reload twice (1st installs the new service worker, 2nd runs it).
If a device seems stuck on an old version, the same cache-clear console command as Seven Wonders is
safe and does not touch saves:
```js
(async()=>{const r=await navigator.serviceWorker.getRegistrations();for(const s of r)await s.unregister();const k=await caches.keys();for(const c of k)await caches.delete(c);location.reload(true)})()
```

## 7. Tests

```bash
node tests/engine.test.js      # deterministic engine tests (paylines, wilds, scatters, jackpot, strips)
node tests/lunar.test.js       # Chinese calendar vs Hong Kong Observatory tables 2025–2040 + Meeus worked examples
node tests/themes.browser.js   # headless Chromium with a shifted clock: every festival theme, birthday gift, ?theme= override (needs playwright)
node tests/bonus.browser.js    # forces Gold Rush, Fortune Pick, Lucky Wheel (15×, free spins, jackpot) and Double Up win/loss; checks credits
node tests/simulate.js 2000000 100   # RTP / hit-rate simulation
node tests/browser.js          # headless Chromium: iPhone + iPad screenshots, forced big/mega/free-spin/jackpot outcomes, persistence, refill (needs `npm i playwright`)
```

## 8. Safety notes carried over from Seven Wonders

- Crash guard: any uncaught error flips the header version to `· ERROR`; all button bindings are null-safe, so a missing element can never halt the script.
- A spin interrupted by closing the app is resolved on the next open (the bet was already taken, so the outcome is credited — never lost).
- An unfinished free-spin round resumes on the next open.
- Settings → Safari → Website Data → deleting the site wipes credits and records (localStorage); the console cache-clear above does not.
