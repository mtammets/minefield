# Auto

Browser-based 3D driving game built with Three.js and served with a minimal Express server.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Donations (Stripe Checkout + Apple Pay)

Set these environment variables before `npm start`:

```bash
STRIPE_SECRET_KEY=sk_test_...
# Strongly recommended for production:
STRIPE_WEBHOOK_SECRET=whsec_...
# Optional. Recommended in production behind a proxy/CDN.
STRIPE_DONATE_BASE_URL=https://your-domain.example
# Optional overrides:
STRIPE_DONATE_CURRENCY=eur
STRIPE_DONATE_PRODUCT_NAME="Support Minefield Drift"
```

The server loads `.env` automatically on startup.

Notes:

- The Donate button creates a Stripe Checkout session via `POST /api/donate/checkout-session`.
- Stripe returns to `/?donate=success&session_id={CHECKOUT_SESSION_ID}` after checkout.
- The game verifies donation success server-side via `GET /api/donate/session-status`.
- Stripe webhook endpoint: `POST /api/donate/stripe-webhook`.
- Apple Pay availability is controlled by Stripe and end-user device/browser support.
- In production, configure your site domain in Stripe Dashboard under Apple Pay wallet settings.

Local webhook testing with Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/donate/stripe-webhook
```

## Google Analytics 4 (Optional, Consent-Gated)

Set this environment variable to enable GA4:

```bash
GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

How it works:

- Frontend fetches `GET /api/public-config` to read the GA measurement ID.
- A cookie consent banner is shown before loading Google Analytics.
- GA script is loaded only after user accepts analytics cookies.
- Consent choice is stored in `localStorage` (`minefield-cookie-consent-v1`).
- If `GA_MEASUREMENT_ID` is not set, analytics and consent UI stay disabled.

## Online Multiplayer

- Multiplayer runs over Socket.IO on the same Node server.
- Open the game in two or more browser windows/devices.
- In the `ONLINE MULTIPLAYER` panel:

1. Set your player name.
2. Click `CREATE ROOM` (host) or enter a code and click `JOIN`.
3. Share the 6-character room code with other players.

- Remote players appear in the world in real time.
- In an active race (bots or online), press `G` to drop a landmine behind your car.
- In an active race (bots or online), press `T` to throw a landmine forward.
- Any other player driving over an armed mine explodes into debris.

## Controls

- Drive: `W/A/S/D` or arrow keys.
- Handbrake / drift: `Space`.
- Pause / resume: `Esc`.
- Restart round: `Q` (or `Enter` on final scoreboard).
- Fullscreen toggle: `F`.
- Tactical map toggle: `M`.
- Roof interface:
    - `Tab`: next roof tab
    - `Shift+Tab`: previous roof tab
    - `1-4`: direct roof tabs
- Camera:
    - `Alt+1` ... `Alt+7`: camera views
    - `Alt+C`: cinematic camera toggle
- Graphics quality cycle: `Y`.

## Map & Navigation

- Minimap is shown in the lower-left during gameplay.
- Press `M` to open/close the full tactical map.
- While full map is open, driving inputs are locked.
- In Bots mode, opening the full map pauses simulation time until the map is closed.
- In Online mode (while in-room), opening the full map keeps world simulation running and engages
  autobrake.
- Full map controls:
    - Left click: set waypoint
    - Left drag: locked in overview mode
    - Mouse wheel: locked in overview mode
    - Right click: clear waypoint
    - `ESC`: close map
- The map supports layer filters (roads, buildings, pickups, vehicles, mines, charging zones).

## Edit Mode

- Press `E` to open Edit Mode (`Esc` closes it, `R` resets camera view).
- In Edit Mode you can:
    - toggle visible car parts/modules
    - change crash/damage tuning values (explosion intensity, collision thresholds, wheel detach speeds)
- Crash/damage tuning values are persisted to `localStorage` and re-applied on next launch.

## Audio System

- The game now includes a modular Web Audio mixer (`public/js/audio-system.js`) with:
    - separate buses (`master`, `vehicles`, `effects`, `ambience`, `ui`)
    - dynamic runtime mixing (engine layers, skid, wind, charging, ambience)
    - event-driven one-shots (pickup, collisions, mines, explosions, round end, UI)
    - persistent user preferences in `localStorage` (`silentdrift-audio-prefs-v1`)
- A compact Audio Mixer panel appears in the lower-right during gameplay.
- Browsers require user interaction before audio starts; click/tap any key/button to unlock audio.
- Audio assets are organized under `public/audio/` and are loaded by stable file names.

### Audio Asset Catalog

- `public/audio/ui/*.mp3`: UI clicks/toggles/confirm
- `public/audio/vehicles/player/*.mp3`: engine layers, skid, wind, suspension
- `public/audio/gameplay/*.mp3`: countdown, pickup, charging, battery, round end, respawn
- `public/audio/weapons/mines/*.mp3`: mine deploy/arm/detonation
- `public/audio/impacts/*.mp3`: collision and obstacle impacts
- `public/audio/explosions/*.mp3`: major explosion tails
- `public/audio/ambience/*.mp3`: city/crowd bed loops

All files are included as placeholder MP3s with production-ready naming; replace file contents while
keeping names/paths to activate final audio.

## Quality Workflow

```bash
npm run format
npm run format:check
npm run check:syntax
npm run check
```

`npm run check` runs syntax validation for all JavaScript files and verifies Prettier formatting.

## Project Structure

- `public/index.html`: application shell and HUD containers
- `public/css/styles.css`: all UI and overlay styles
- `public/js/main.js`: entrypoint
- `public/js/analytics-consent.js`: GA4 consent flow and runtime tracking API
- `public/js/game-runtime.js`: runtime composition/wiring
- `public/js/game-loop-controller.js`: render/update loop
- `public/js/game-session-flow.js`: game lifecycle/session flow
- `public/js/crash-debris-system.js`: crash, explosion, and debris behavior
- `public/js/game-runtime-state.js`: central runtime state container
- `public/js/game-runtime-ui.js`: UI controller composition
- `public/js/game-bootstrap.js`: scene/renderer bootstrap
- `server/server.js`: static file hosting and health endpoint

## Notes

- Code style is enforced with Prettier (`.prettierrc.json`).
- Editor defaults are defined in `.editorconfig`.
- Browser gameplay code is organized as ES modules under `public/js`.
