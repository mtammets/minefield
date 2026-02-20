# Auto

Browser-based 3D driving game built with Three.js and served with a minimal Express server.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Online Multiplayer

- Multiplayer runs over Socket.IO on the same Node server.
- Open the game in two or more browser windows/devices.
- In the `ONLINE MULTIPLAYER` panel:

1. Set your player name.
2. Click `CREATE ROOM` (host) or enter a code and click `JOIN`.
3. Share the 6-character room code with other players.

- Remote players appear in the world in real time.
- In an online room, press `G` to drop a landmine behind your car.
- In an online room, press `T` to throw a landmine forward.
- Any other player driving over an armed mine explodes into debris.

## Map & Navigation

- Minimap is shown in the lower-left during gameplay.
- Press `M` to open/close the full tactical map.
- Full map controls:
    - Left click: set waypoint
    - Left drag: pan
    - Mouse wheel: zoom
    - Right click: clear waypoint
    - `ESC`: close map
- The map supports layer filters (roads, buildings, pickups, vehicles, mines, charging zones).

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
- `public/js/game-runtime.js`: runtime composition/wiring
- `public/js/game-loop-controller.js`: render/update loop
- `public/js/game-session-flow.js`: game lifecycle/session flow
- `public/js/crash-debris-system.js`: crash, explosion, and debris behavior
- `public/js/replay-effects-system.js`: replay-specific visual effects
- `public/js/game-runtime-state.js`: central runtime state container
- `public/js/game-runtime-ui.js`: UI controller composition
- `public/js/game-bootstrap.js`: scene/renderer bootstrap
- `server/server.js`: static file hosting and health endpoint

## Notes

- Code style is enforced with Prettier (`.prettierrc.json`).
- Editor defaults are defined in `.editorconfig`.
- Browser gameplay code is organized as ES modules under `public/js`.
