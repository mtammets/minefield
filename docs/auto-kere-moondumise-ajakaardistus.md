# Auto kere moondumise täpne ajakaardistus

See dokument kaardistab täpselt, millal auto kere **reaalselt moondub** (dent, rattakadumine, kereasendi vajumine) ja millal toimub hoopis kohene häving.

## 1) Mis loetakse kere moondumiseks siin koodis

1. **Dendid / kerepaneeli deformeerimine**
   - Rakendub ainult `body_panel` osadele läbi skaleerimise/rotatsiooni/nihke.
   - Viited: `public/js/crash-debris-system.js:118`, `public/js/crash-debris-system.js:358`.
2. **Rataste irdumine + kere vajumine/kalde muutus**
   - Kokkupõrkel peidetakse ratas (`source.visible=false`), spawnitakse debris.
   - Kere asendi “viltu/vajunud” efekt tuleb sellest, et `updateBodySuspension(...)` loeb puuduvaid rattaid.
   - Viited: `public/js/crash-debris-system.js:414`, `public/js/car.js:224`, `public/js/car.js:253`, `public/js/car.js:692`.
3. **Kohene täielik häving (mitte progressiivne moondumine)**
   - Obstacle/mine crash puhul auto peidetakse kohe (`car.visible=false`) ja osad lastakse debriseks.
   - Viited: `public/js/game-session-flow.js:340`, `public/js/game-session-flow.js:370`, `public/js/crash-debris-system.js:448`.

## 2) Täpne ajastus kaadri sees (frame order)

1. `physicsStep = 1/120s` (8.33 ms) sammud jooksevad `while`-tsüklis.
   - Viited: `public/js/game-runtime.js:121`, `public/js/game-loop-controller.js:229`.
2. Füüsika salvestab sõidukikontaktid `pendingVehicleCollisionContacts` massiivi.
   - Viited: `public/js/carphysics.js:895`, `public/js/carphysics.js:1059`.
3. Sama render-frame’i sees võetakse kontaktid `consumeVehicleCollisionContacts()` kaudu.
   - Viited: `public/js/game-loop-controller.js:254`, `public/js/carphysics.js:304`.
4. Kohe samas frame’is rakendatakse moondumine: `processVehicleCollisionContacts(...)`.
   - Viited: `public/js/game-loop-controller.js:256`, `public/js/crash-debris-system.js:221`.
5. Seejärel samas frame’is renderdatakse auto uuendatud kujul (`updateCarVisuals(...)`).
   - Viited: `public/js/game-loop-controller.js:273`.

Järeldus: kui tingimus täitub, kere moondub visuaalselt **samal kaadril**, mitte alles järgmises kaadris.

## 3) Täpsed triggerid, millal kere moondub

### 3.1 Kontakt üldse tekib (sõiduk vs sõiduk)

1. `impactSpeed = max(0, -relativeAlongNormal)` ehk ainult sulgumiskiirus piki kokkupõrke normaalvektorit loeb.
2. Kui `impactSpeed < 0.05`, kontakt ignoreeritakse.
3. Ühes frame’is sama sõiduki kohta võetakse ainult tugevaim kontakt.

Viited:
- `public/js/carphysics.js:1011`
- `public/js/carphysics.js:1014`
- `public/js/carphysics.js:1015`
- `public/js/crash-debris-system.js:226`

### 3.2 Dendi/halvenemise käivituslävendid (default tuning)

Default väärtused:
- `vehicleDamageCollisionMin = 8`
- `vehicleDamageCollisionHigh = 22`
- `vehicleWheelDetachSpeed = 28`
- `vehicleSecondWheelDetachSpeed = 36`

Viide: `public/js/constants.js:47`

Reaalne käitumine koodis:
1. Kui `impactSpeed < vehicleDamageCollisionMin`, ei juhtu midagi.
   - `public/js/crash-debris-system.js:293`
2. Käituvuskahju (handling damage) lisatakse siis, kui
   - `damageNorm = (impact-min)/(wheelDetach-min) > 0.02`
   - defaultiga esimene mõju alates **> 8.4 m/s**
   - `public/js/crash-debris-system.js:327`, `public/js/crash-debris-system.js:334`
3. Visuaalne dent lisatakse siis, kui
   - `dentNorm = (impact-min)/(high-min) > 0.03`
   - defaultiga esimene visuaalne dent alates **> 8.42 m/s**
   - `public/js/crash-debris-system.js:359`, `public/js/crash-debris-system.js:366`
4. 1. ratas võib eralduda, kui `impactSpeed >= 28`.
   - `public/js/crash-debris-system.js:310`
5. 2. sama külje ratas võib eralduda, kui `impactSpeed >= 36`.
   - `public/js/crash-debris-system.js:317`

## 4) Kuidas “kere deformatsioon” matemaatiliselt tehakse

1. Kogutakse neli akumulaatorit: `left/right/front/rear` (clamp kuni `vehicleDentMax`).
   - `public/js/crash-debris-system.js:371`
2. Nendest arvutatakse:
   - `sideMagnitude`, `zoneMagnitude`, `sideBias`, `zoneBias`
3. Iga `body_panel` transformitakse baseline’i suhtes:
   - skaala muutus
   - rotatsioon (X/Z)
   - positsiooni nihe
4. Max deformatsioon on piiratud clampidega (nt `sideMagnitude <= 0.34`, `zoneMagnitude <= 0.31`).

Viited:
- `public/js/crash-debris-system.js:118`
- `public/js/crash-debris-system.js:150`
- `public/js/crash-debris-system.js:155`
- `public/js/crash-debris-system.js:160`

## 5) Millal kere EI moondu (või ei saa uuendada)

Seda voogu ei töödelda aktiivse gameplay haru väliselt:
1. pausis
2. edit mode’is
3. replay playback ajal
4. kui auto on juba hävinud
5. kui round on lõpetatud

Viited:
- `public/js/game-loop-controller.js:138`
- `public/js/game-loop-controller.js:186`
- `public/js/game-loop-controller.js:211`

## 6) Obstacle/mine mõju: moondumine vs kohene häving

1. Obstacle/world piir kokkupõrge üle crash-lävendi -> `pendingCrashCollision`.
   - `public/js/carphysics.js:876`, `public/js/carphysics.js:1303`
2. Game loop kutsub `triggerObstacleCrash(...)` -> `triggerCarExplosion(...)`.
   - `public/js/game-loop-controller.js:263`, `public/js/game-session-flow.js:397`
3. `triggerCarExplosion` peidab auto enne debris’t (`car.visible = false`), siis `spawnCarDebris`.
   - `public/js/game-session-flow.js:370`, `public/js/game-session-flow.js:378`

Järeldus: obstacle/mine puhul on pigem **kohene hävinguefekt**, mitte järk-järguline kere mõlkimine.

## 7) Millal moondumine resetitakse

Kere ja osad taastatakse baseline’i:
1. respawnil (`PLAYER_RESPAWN_DELAY_MS = 850ms` pärast hävingut)
2. uue mängu käivitamisel
3. replay resetil
4. runtime initil

Viited:
- `public/js/game-session-flow.js:220`
- `public/js/game-session-flow.js:385`
- `public/js/game-session-flow.js:490`
- `public/js/game-session-flow.js:435`
- `public/js/game-runtime.js:819`

## 8) Oluline online-märkus

`crashReplication` sisaldab eraldunud osi/debris’t, aga ei sisalda `bodyDamageVisual` dendiakumulaatoreid.  
Seega peen dent-transform võib olla lokaalne ja mitte 1:1 teistele mängijatele nähtav.

Viited:
- `public/js/crash-debris-system.js:474`
- `public/js/crash-debris-system.js:500`
- `public/js/crash-debris-system.js:515`
