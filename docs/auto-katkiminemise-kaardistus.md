# Auto katkiminemise täielik kaardistus

See dokument kirjeldab täpselt, **kuidas** ja **mis hetkedel** mängija auto läheb katki.

## 1) Täielik häving (hard destroy)

Auto loetakse täielikult katkiseks hetkel, kui käivitatakse `triggerCarExplosion(...)`, mis teeb:

- `isCarDestroyed = true`
- auto mudeli peitmine (`car.visible = false`)
- debris/plahvatuse spawn
- sisendite nullimine
- autode arvu vähendamine (`playerCarsRemaining - 1`)
- respawn (kui autosid alles) pärast `PLAYER_RESPAWN_DELAY_MS = 850ms`

Viide: `public/js/game-session-flow.js` (`triggerCarExplosion`).

### 1.1 Hard destroy trigger #1: takistuse kokkupõrge suurel kiirusel

Ahel:

1. Füüsikas tuvastatakse kokkupõrge takistuse või maailmapiiriga.
2. Kui pre-impact kiirus ületab lävendi `crashSpeedThreshold`, salvestatakse `pendingCrashCollision`.
3. Game loop võtab selle `consumeCrashCollision()` kaudu.
4. `triggerObstacleCrash(...)` kutsub `triggerCarExplosion(...)`.

Viited:

- `public/js/carphysics.js` (`constrainToObstacles`, `constrainToWorld`, `consumeCrashCollision`)
- `public/js/game-loop-controller.js` (consume + `triggerObstacleCrash`)
- `public/js/game-session-flow.js` (`triggerObstacleCrash`)

Vaikimisi lävendid:

- `OBSTACLE_CRASH_MIN_SPEED = 28` m/s (~100.8 km/h)
- `OBSTACLE_CRASH_MAX_SPEED = 84` m/s (~302.4 km/h, kasutatakse peamiselt crash-intensiivsuseks/debriseks)

Viide: `public/js/constants.js`.

### 1.2 Hard destroy trigger #2: miin tabab mängija autot

Ahel:

1. `mineSystem.update(...)` kontrollib miinide triggerit.
2. Kui auto on trigger-raadiuses (`MINE_TRIGGER_RADIUS = 1.5`), tehakse `detonateMine(...)`.
3. Lokaalse tabamuse korral kutsutakse `onLocalMineHit(...)`.
4. `onLocalMineHit` kutsub `triggerCarExplosion(...)` kategooriaga `landmine`.

Viited:

- `public/js/mine-system.js` (`update`, `detonateMine`)
- `public/js/game-runtime.js` (`onLocalMineHit` callback)
- `public/js/game-session-flow.js` (`triggerCarExplosion`)

Olulised detailid:

- Miin aktiveerub tavaliselt pärast `MINE_ARM_DELAY_MS = 650ms`.
- Aga **oma miin** võib omanikku triggerdada ka enne armed-olekut, kui miin on maas (`ownerLocalTriggerEnabled`).
- Miini TTL: `MINE_TTL_MS = 45000`.
- Paigaldus cooldown: `MINE_DEPLOY_COOLDOWN_MS = 900`.

Viide: `public/js/constants.js`, `public/js/mine-system.js`.

## 2) Katki, aga mitte täielik häving (soft damage)

Need olukorrad **ei** sea `isCarDestroyed = true`, kuid auto juhitavus/olek halveneb.

### 2.1 Sõiduk vs sõiduk kokkupõrked (botid/online teised mängijad)

Game loop loeb kontaktid `consumeVehicleCollisionContacts()` kaudu ja annab need `crashDebrisController.processVehicleCollisionContacts(...)`-ile.

Viited:

- `public/js/game-loop-controller.js`
- `public/js/carphysics.js` (`constrainToVehicles`, `applyNetworkVehicleCollisionImpulse`, `consumeVehicleCollisionContacts`)
- `public/js/crash-debris-system.js` (`processVehicleCollisionContacts`)

Mõju lävendid (vaikimisi):

- alates `VEHICLE_DAMAGE_COLLISION_MIN = 8`: hakkab püsikahju akumuleeruma (`left/right/front/rear/suspension`)
- alates `VEHICLE_WHEEL_DETACH_SPEED = 28`: üks ratas võib lahti tulla
- alates `VEHICLE_SECOND_WHEEL_DETACH_SPEED = 36`: teine sama külje ratas võib lahti tulla
- `VEHICLE_DAMAGE_COLLISION_HIGH = 22`: tugevama kahju/dendi piirkond

Viide: `public/js/constants.js` ja `public/js/crash-debris-system.js`.

Kahju mõju sõiduomadustele rakendub `getDamageDynamics()` kaudu:

- vähem võimsust (`powerScale`)
- vähem haarduvust (`gripScale`)
- madalam tippkiirus (`maxSpeedScale`)
- tugevam drag
- külg-/teljetasakaalutusest yaw bias

Viide: `public/js/carphysics.js` (`getDamageDynamics`).

### 2.2 Aku tühjenemine (liikumine lukustub, auto ei hävi)

Kui aku langeb `BATTERY_DEPLETED_TRIGGER_LEVEL` alla, pannakse `isBatteryDepleted = true`.
Game loopis nullitakse siis pidevalt sõidu-inputid (`clearDriveKeys()`), ehk auto jääb praktiliselt rivist välja, kuni aku taastub.

Taastumine toimub, kui aku tõuseb vähemalt `BATTERY_DEPLETED_RECOVER_LEVEL` peale.

Viited:

- `public/js/game-session-flow.js` (`updateBattery`, `setBatteryDepletedState`, `addBattery`)
- `public/js/game-loop-controller.js` (depleted korral input lock)
- `public/js/constants.js`

## 3) Täpne "mis hetkel" ajajoon

### 3.1 Obstacle crash ajajoon

1. Physics step (`updatePlayerPhysics`) -> kokkupõrge takistuse/maailmapiiriga.
2. Kui kiirus >= `crashSpeedThreshold`, luuakse/uuendatakse `pendingCrashCollision` (hoitakse tugevaimat).
3. Sama frame game loopis: `consumeCrashCollision()`.
4. Kui auto veel elus, kutsutakse `triggerObstacleCrash()` -> `triggerCarExplosion()`.
5. Kohe: auto peidetakse, debris spawnitakse, input nullitakse, autode arv väheneb.
6. 850ms pärast respawn (kui autosid alles), muidu game over seis.

### 3.2 Mine hit ajajoon

1. Iga frame lõpus `mineSystem.update(...)`.
2. Miinile kontrollitakse armed/owner-local trigger + kaugusraadius.
3. `detonateMine(...)` -> `onLocalMineHit(...)`.
4. `onLocalMineHit` -> `triggerCarExplosion(...)`.
5. Edasi sama hard-destroy voog nagu üleval.

## 4) Millal katkiminemise kontroll üldse jookseb

Peamised crash-kontrollid jooksevad aktiivses gameplay harus:

- mitte pausis
- mitte edit mode
- mitte replay playback
- auto pole juba hävinud
- round pole lõppenud

Viide: `public/js/game-loop-controller.js`.

Seega näiteks pausis/welcome/replay ajal uusi hard-crashe ei käivitata.

## 5) Runtime-is muudetavad lävendid

Crash-lävendeid saab muuta Edit Mode crash/damage tuning kaudu ning need persistitakse localStorage-sse.
See tähendab, et "mis hetkel" auto katki läheb, sõltub kasutaja seatud tuningust, mitte ainult defaultidest.

Viited:

- `public/js/crash-damage-tuning.js`
- `public/js/game-runtime.js` (persist + apply)
- `public/js/crash-debris-system.js` ja `public/js/carphysics.js` (lävendite rakendamine)

## 6) Lühikokkuvõte

Mängija auto **täielik häving** tuleb praegu kahest allikast:

1. suur takistus-/piirikokkupõrge üle crash-lävendi
2. miinitabamus

Sõidukitevahelised kokkupõrked tekitavad enamasti **püsikahju ja osade eemaldumist**, kuid mitte otsest `isCarDestroyed=true` seisundit.
