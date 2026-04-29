import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { centralParkingLot } from './layout.js';
import { getGroundHeightAt } from './terrain.js';
import { addObstacleCircle } from './obstacles.js';
import { createVideoDisplayPanel } from './billboards.js';

const MONUMENT_SCREEN_VIDEO_URLS = [
    '/assets/billboards/monument-dj-led.mp4',
    '/assets/billboards/DJ2.mp4',
];
const ZERO_RHYTHM_STATE = Object.freeze({
    active: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    energy: 0,
    beat: 0,
    pulse: 0,
});

export function createMonumentLayer(screenEntries = [], effectEntries = []) {
    const layer = new THREE.Group();
    layer.name = 'monumentLayer';

    const centerX = centralParkingLot.centerX;
    const centerZ = centralParkingLot.centerZ;
    const baseY = getGroundHeightAt(centerX, centerZ);
    const lotMinDimension = Math.min(centralParkingLot.width, centralParkingLot.depth);
    const glowTexture = createRadialGlowTexture();
    const smokeTexture = createSmokeTexture();
    const beamTexture = createBeamFadeTexture({
        edgePower: 1.55,
        baseFadeEnd: 0.12,
        topFadeStart: 0.58,
        topFadeEnd: 1,
        centerBoost: 0.94,
    });
    const beamShellTexture = createBeamFadeTexture({
        edgePower: 2.35,
        baseFadeEnd: 0.16,
        topFadeStart: 0.4,
        topFadeEnd: 1,
        centerBoost: 0.72,
    });

    const forecourtRadius = Math.max(11.2, lotMinDimension * 0.32);
    const basinOuterRadius = forecourtRadius * 0.76;
    const basinInnerRadius = basinOuterRadius - 1.5;
    const pedestalRadius = basinInnerRadius * 0.24;

    const stoneMaterial = new THREE.MeshLambertMaterial({
        color: 0x2a3f57,
    });
    const trimMaterial = new THREE.MeshLambertMaterial({
        color: 0x9bb2ca,
    });
    const waterMaterial = new THREE.MeshBasicMaterial({
        color: 0x4f86b5,
    });
    const monolithShellMaterial = new THREE.MeshStandardMaterial({
        color: 0x0d141d,
        roughness: 0.34,
        metalness: 0.78,
        emissive: 0x03070d,
        emissiveIntensity: 0.26,
    });

    const forecourt = new THREE.Mesh(
        new THREE.CylinderGeometry(forecourtRadius, forecourtRadius, 0.14, 12),
        stoneMaterial
    );
    forecourt.position.set(centerX, baseY + 0.07, centerZ);
    layer.add(forecourt);

    const basinWall = new THREE.Mesh(
        new THREE.CylinderGeometry(basinOuterRadius, basinOuterRadius, 0.82, 12),
        stoneMaterial
    );
    basinWall.position.set(centerX, baseY + 0.41, centerZ);
    layer.add(basinWall);

    const basinLip = new THREE.Mesh(
        new THREE.TorusGeometry(basinOuterRadius - 0.18, 0.22, 6, 14),
        trimMaterial
    );
    basinLip.rotation.x = Math.PI / 2;
    basinLip.position.set(centerX, baseY + 0.88, centerZ);
    layer.add(basinLip);

    const waterSurface = new THREE.Mesh(
        new THREE.CircleGeometry(basinInnerRadius - 0.5, 10),
        waterMaterial
    );
    waterSurface.rotation.x = -Math.PI / 2;
    waterSurface.position.set(centerX, baseY + 0.2, centerZ);
    layer.add(waterSurface);

    const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(pedestalRadius * 1.18, pedestalRadius * 1.3, 2.2, 8),
        stoneMaterial
    );
    pedestal.position.set(centerX, baseY + 1.56, centerZ);
    layer.add(pedestal);

    const monolithWidth = 4.2;
    const monolithHeight = 9.2;
    const monolithDepth = 4.2;
    const monolith = new THREE.Mesh(
        new THREE.BoxGeometry(monolithWidth, monolithHeight, monolithDepth),
        monolithShellMaterial
    );
    monolith.position.set(centerX, baseY + 7.12, centerZ);
    layer.add(monolith);

    const ledFaceWidth = monolithWidth - 0.52;
    const ledFaceHeight = monolithHeight - 0.56;
    const ledFaceOffset = monolithWidth * 0.5 + 0.09;
    const ledStyleConfig = {
        depth: 0.24,
        framePadding: 0.1,
        shellColor: 0x0e151e,
        shellRoughness: 0.28,
        shellMetalness: 0.82,
        shellEmissiveIntensity: 0.28,
        trimTopScale: 0.985,
        trimBottomScale: 0.97,
        trimTopThickness: 0.045,
        trimBottomThickness: 0.04,
        trimTopOffset: 0.03,
        trimBottomOffset: 0.03,
        frontGlowScale: 1.08,
        backGlowScale: 1.02,
        frontGlowOpacity: 0.24,
        backGlowOpacity: 0.08,
    };
    const monumentScreens = [
        { x: centerX, z: centerZ + ledFaceOffset, rotationY: 0 },
        { x: centerX + ledFaceOffset, z: centerZ, rotationY: Math.PI / 2 },
        { x: centerX, z: centerZ - ledFaceOffset, rotationY: Math.PI },
        { x: centerX - ledFaceOffset, z: centerZ, rotationY: -Math.PI / 2 },
    ];
    monumentScreens.forEach((screenMount) => {
        const panel = createVideoDisplayPanel({
            width: ledFaceWidth,
            height: ledFaceHeight,
            doubleSided: false,
            screenEntries,
            videoUrls: MONUMENT_SCREEN_VIDEO_URLS,
            videoCropFocusX: 0.5,
            videoCropFocusY: 0.5,
            videoTargetFps: 30,
            accentAssetKey: 'monumentDj',
            styleConfig: ledStyleConfig,
        });
        panel.group.position.set(screenMount.x, monolith.position.y, screenMount.z);
        panel.group.rotation.y = screenMount.rotationY;
        layer.add(panel.group);
    });

    const crownMaterial = createAdditiveMaterial(0x7ce2ff, 0.76);
    const crown = markDynamic(
        new THREE.Mesh(new THREE.TorusGeometry(pedestalRadius * 2.46, 0.22, 8, 24), crownMaterial)
    );
    crown.rotation.x = Math.PI / 2;
    crown.position.set(centerX, baseY + 11.9, centerZ);
    layer.add(crown);

    const beaconMaterial = createAdditiveMaterial(0xa9c4e2, 0.9);
    const beacon = markDynamic(
        new THREE.Mesh(new THREE.SphereGeometry(0.66, 8, 6), beaconMaterial)
    );
    beacon.position.set(centerX, baseY + 11.9, centerZ);
    layer.add(beacon);

    const beamRig = markDynamic(new THREE.Group());
    beamRig.position.set(centerX, baseY + 11.5, centerZ);
    layer.add(beamRig);

    const beamLength = 12.8;
    const beamShellLength = 14.8;
    const beamGeometry = new THREE.CylinderGeometry(0.58, 0.035, beamLength, 16, 1, true);
    beamGeometry.translate(0, beamLength * 0.5, 0);
    const beamShellGeometry = new THREE.CylinderGeometry(1.28, 0.08, beamShellLength, 18, 1, true);
    beamShellGeometry.translate(0, beamShellLength * 0.5, 0);
    const beamSourceGeometry = new THREE.SphereGeometry(0.18, 10, 8);
    const beamStates = [];
    const beamCount = 6;
    const beamRingRadius = pedestalRadius * 2.18;
    for (let i = 0; i < beamCount; i += 1) {
        const angle = (i / beamCount) * Math.PI * 2;
        const yaw = markDynamic(new THREE.Group());
        yaw.position.set(Math.cos(angle) * beamRingRadius, 0, Math.sin(angle) * beamRingRadius);
        beamRig.add(yaw);

        const pitch = markDynamic(new THREE.Group());
        pitch.rotation.z = THREE.MathUtils.degToRad(24 + (i % 2) * 7);
        pitch.rotation.x = i % 2 === 0 ? 0.14 : -0.14;
        yaw.add(pitch);

        const beamColor = i % 2 === 0 ? 0x74ddff : 0xff59d0;
        const beamShellMaterial = createAdditiveMaterial(beamColor, 0.08, {
            alphaMap: beamShellTexture,
            side: THREE.DoubleSide,
        });
        const beamShell = markDynamic(new THREE.Mesh(beamShellGeometry, beamShellMaterial));
        pitch.add(beamShell);

        const beamMaterial = createAdditiveMaterial(beamColor, 0.12, {
            alphaMap: beamTexture,
            side: THREE.DoubleSide,
        });
        const beam = markDynamic(new THREE.Mesh(beamGeometry, beamMaterial));
        pitch.add(beam);

        const sourceMaterial = createAdditiveMaterial(beamColor, 0.82);
        const source = markDynamic(new THREE.Mesh(beamSourceGeometry, sourceMaterial));
        source.position.y = 0.04;
        yaw.add(source);

        const tipMaterial = new THREE.SpriteMaterial({
            map: glowTexture,
            color: beamColor,
            transparent: true,
            opacity: 0.18,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        const tip = markDynamic(new THREE.Sprite(tipMaterial));
        tip.position.y = beamLength * 0.92;
        tip.scale.setScalar(1.9);
        pitch.add(tip);

        beamStates.push({
            yaw,
            pitch,
            beam,
            beamShell,
            material: beamMaterial,
            shellMaterial: beamShellMaterial,
            source,
            sourceMaterial,
            tip,
            tipMaterial,
            phase: angle,
            baseTilt: pitch.rotation.z,
            baseRoll: pitch.rotation.x,
            speed: 0.82 + Math.random() * 0.36,
            swayPhase: Math.random() * Math.PI * 2,
            beamLength,
            currentYaw: 0,
            currentTilt: pitch.rotation.z,
            currentRoll: pitch.rotation.x,
        });
    }

    const hazeGroup = markDynamic(new THREE.Group());
    hazeGroup.position.set(centerX, baseY + 11.58, centerZ);
    layer.add(hazeGroup);

    const hazePlaneGeometry = new THREE.PlaneGeometry(5.8, 9.4);
    const hazePlaneStates = [];
    for (let i = 0; i < 3; i += 1) {
        const material = new THREE.MeshBasicMaterial({
            map: smokeTexture,
            color: i % 2 === 0 ? 0xddeeff : 0xffd8f4,
            transparent: true,
            opacity: 0.06,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
        });
        const plane = markDynamic(new THREE.Mesh(hazePlaneGeometry, material));
        plane.position.y = 4.3;
        plane.rotation.y = (i / 3) * Math.PI;
        hazeGroup.add(plane);
        hazePlaneStates.push({
            plane,
            material,
            baseRotationY: plane.rotation.y,
        });
    }

    const smokeGroup = markDynamic(new THREE.Group());
    smokeGroup.position.set(centerX, baseY + 11.46, centerZ);
    layer.add(smokeGroup);

    const smokeStates = [];
    const smokeCount = 11;
    for (let i = 0; i < smokeCount; i += 1) {
        const material = new THREE.SpriteMaterial({
            map: smokeTexture,
            color: i % 3 === 0 ? 0xffdaf4 : 0xe8f5ff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
        });
        const sprite = markDynamic(new THREE.Sprite(material));
        smokeGroup.add(sprite);
        smokeStates.push({
            sprite,
            material,
            phase: i / smokeCount,
            radius: 0.2 + (i % 4) * 0.13 + Math.random() * 0.08,
            lift: 3.6 + Math.random() * 2.8,
            scale: 1.5 + Math.random() * 1.2,
            speed: 0.055 + Math.random() * 0.04,
            alpha: 0.6 + Math.random() * 0.35,
            drift: Math.random() * Math.PI * 2,
        });
    }

    const basinGlowDiscMaterial = new THREE.MeshBasicMaterial({
        map: glowTexture,
        color: 0x47d3ff,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });
    const basinGlowDisc = markDynamic(
        new THREE.Mesh(new THREE.CircleGeometry(basinInnerRadius - 0.84, 48), basinGlowDiscMaterial)
    );
    basinGlowDisc.rotation.x = -Math.PI / 2;
    basinGlowDisc.position.set(centerX, baseY + 0.23, centerZ);
    layer.add(basinGlowDisc);

    const coreDiscMaterial = new THREE.MeshBasicMaterial({
        map: glowTexture,
        color: 0xff59d0,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });
    const coreDisc = markDynamic(
        new THREE.Mesh(new THREE.CircleGeometry(pedestalRadius * 2.05, 36), coreDiscMaterial)
    );
    coreDisc.rotation.x = -Math.PI / 2;
    coreDisc.position.set(centerX, baseY + 0.24, centerZ);
    layer.add(coreDisc);

    const innerHaloMaterial = createAdditiveMaterial(0xff59d0, 0.74);
    const innerHalo = markDynamic(
        new THREE.Mesh(
            new THREE.TorusGeometry(basinInnerRadius * 0.5, 0.1, 8, 48),
            innerHaloMaterial
        )
    );
    innerHalo.rotation.x = Math.PI / 2;
    innerHalo.position.set(centerX, baseY + 0.24, centerZ);
    layer.add(innerHalo);

    const outerHaloMaterial = createAdditiveMaterial(0x74ddff, 0.54);
    const outerHalo = markDynamic(
        new THREE.Mesh(
            new THREE.TorusGeometry(basinInnerRadius * 0.72, 0.06, 8, 56),
            outerHaloMaterial
        )
    );
    outerHalo.rotation.x = Math.PI / 2;
    outerHalo.position.set(centerX, baseY + 0.25, centerZ);
    layer.add(outerHalo);

    const rodRing = markDynamic(new THREE.Group());
    rodRing.position.set(centerX, baseY + 0.22, centerZ);
    layer.add(rodRing);

    const rodGeometry = new THREE.CylinderGeometry(0.07, 0.11, 1.28, 6);
    rodGeometry.translate(0, 0.64, 0);
    const rodStates = [];
    const rodCount = 16;
    const rodRadius = basinInnerRadius * 0.64;
    for (let i = 0; i < rodCount; i += 1) {
        const angle = (i / rodCount) * Math.PI * 2;
        const pivot = markDynamic(new THREE.Group());
        pivot.position.set(Math.cos(angle) * rodRadius, 0, Math.sin(angle) * rodRadius);
        rodRing.add(pivot);

        const rodColor = i % 2 === 0 ? 0x6fe2ff : 0xff59d0;
        const rodMaterial = createAdditiveMaterial(rodColor, 0.38);
        const rod = markDynamic(new THREE.Mesh(rodGeometry, rodMaterial));
        pivot.add(rod);

        rodStates.push({
            pivot,
            rod,
            material: rodMaterial,
            phase: angle,
        });
    }

    if (Array.isArray(effectEntries)) {
        effectEntries.push(
            createMonumentEffectEntry({
                crown,
                crownMaterial,
                beacon,
                beaconMaterial,
                beamRig,
                beamStates,
                hazeGroup,
                hazePlaneStates,
                smokeGroup,
                smokeStates,
                basinGlowDisc,
                basinGlowDiscMaterial,
                coreDisc,
                coreDiscMaterial,
                innerHalo,
                innerHaloMaterial,
                outerHalo,
                outerHaloMaterial,
                rodRing,
                rodStates,
            })
        );
    }

    const fountainCollisionRadius = basinOuterRadius + 0.24;
    addObstacleCircle(centerX, centerZ, fountainCollisionRadius, 'building');

    freezeStaticHierarchy(layer);

    return layer;
}

export function updateMonumentRuntime(cityScenery, rhythmState = null) {
    const effectEntries = cityScenery?.userData?.monumentEffects || [];
    if (effectEntries.length === 0) {
        return;
    }

    const now = performance.now();
    const resolvedRhythmState =
        rhythmState && typeof rhythmState === 'object' ? rhythmState : ZERO_RHYTHM_STATE;
    effectEntries.forEach((effectEntry) => {
        effectEntry?.customUpdate?.(now, resolvedRhythmState);
    });
}

function createMonumentEffectEntry({
    crown,
    crownMaterial,
    beacon,
    beaconMaterial,
    beamRig,
    beamStates,
    hazeGroup,
    hazePlaneStates,
    smokeGroup,
    smokeStates,
    basinGlowDisc,
    basinGlowDiscMaterial,
    coreDisc,
    coreDiscMaterial,
    innerHalo,
    innerHaloMaterial,
    outerHalo,
    outerHaloMaterial,
    rodRing,
    rodStates,
}) {
    const coolColor = new THREE.Color(0x74ddff);
    const hotColor = new THREE.Color(0xff59d0);
    const limeColor = new THREE.Color(0xa8ff78);
    const hazeWhite = new THREE.Color(0xe8f6ff);
    const hazePink = new THREE.Color(0xffd4f0);
    const showState = {
        lastNow: null,
        smoothedBass: 0,
        smoothedMid: 0,
        smoothedTreble: 0,
        smoothedEnergy: 0,
        smoothedPulse: 0,
        smoothedSmoke: 0,
        rigRotation: 0,
    };

    return {
        customUpdate(now, rhythmState = ZERO_RHYTHM_STATE) {
            const bass = clampUnit(rhythmState.bass);
            const mid = clampUnit(rhythmState.mid);
            const treble = clampUnit(rhythmState.treble);
            const energy = clampUnit(rhythmState.energy);
            const beat = clampUnit(rhythmState.beat);
            const pulse = clampUnit(Math.max(beat, Number(rhythmState.pulse) || 0));
            const dt =
                showState.lastNow == null
                    ? 1 / 60
                    : THREE.MathUtils.clamp((now - showState.lastNow) / 1000, 1 / 240, 0.08);
            showState.lastNow = now;

            showState.smoothedBass = dampValue(showState.smoothedBass, bass, 3.6, dt);
            showState.smoothedMid = dampValue(showState.smoothedMid, mid, 3.2, dt);
            showState.smoothedTreble = dampValue(showState.smoothedTreble, treble, 3, dt);
            showState.smoothedEnergy = dampValue(showState.smoothedEnergy, energy, 2.8, dt);
            showState.smoothedPulse = dampValue(showState.smoothedPulse, pulse, 4.2, dt);
            const smokeTarget = clampUnit(
                0.18 +
                    showState.smoothedEnergy * 0.34 +
                    showState.smoothedPulse * 0.52 +
                    showState.smoothedBass * 0.14
            );
            showState.smoothedSmoke = dampValue(
                showState.smoothedSmoke,
                smokeTarget,
                smokeTarget > showState.smoothedSmoke ? 1.75 : 0.7,
                dt
            );

            const smoothBass = showState.smoothedBass;
            const smoothMid = showState.smoothedMid;
            const smoothTreble = showState.smoothedTreble;
            const smoothEnergy = showState.smoothedEnergy;
            const smoothPulse = showState.smoothedPulse;
            const smoothSmoke = showState.smoothedSmoke;
            const t = now * 0.001;

            const crownMix = 0.5 + 0.5 * Math.sin(t * 0.52 + smoothBass * 2.6);
            crownMaterial.color.copy(coolColor).lerp(hotColor, crownMix);
            crownMaterial.opacity = 0.46 + smoothEnergy * 0.12 + smoothPulse * 0.14;
            const crownScale = 0.985 + smoothPulse * 0.055 + smoothBass * 0.025;
            crown.scale.set(crownScale, crownScale, crownScale);
            crown.rotation.z = t * (0.09 + smoothEnergy * 0.04);

            beaconMaterial.color.copy(hotColor).lerp(limeColor, 0.12 + smoothTreble * 0.36);
            beaconMaterial.opacity = 0.38 + smoothEnergy * 0.12 + smoothPulse * 0.16;
            beacon.scale.setScalar(0.86 + smoothPulse * 0.24 + smoothBass * 0.08);

            const rigRotationTarget =
                t * (0.08 + smoothEnergy * 0.06) +
                Math.sin(t * (0.22 + smoothMid * 0.16)) * (0.16 + smoothTreble * 0.08) +
                Math.sin(t * 1.34) * smoothPulse * 0.05;
            showState.rigRotation = dampValue(showState.rigRotation, rigRotationTarget, 1.6, dt);
            beamRig.rotation.y = showState.rigRotation;
            beamStates.forEach((beamState, index) => {
                const phase = beamState.phase;
                const pairDirection = index % 2 === 0 ? -1 : 1;
                const cluster = Math.floor(index / 2) - 1;
                const fanSpread = 0.16 + smoothEnergy * 0.12 + smoothPulse * 0.04;
                const sweepA = Math.sin(
                    t * (0.34 + smoothEnergy * 0.22) * beamState.speed +
                        cluster * 0.72 +
                        beamState.swayPhase
                );
                const sweepB = Math.sin(
                    t * (0.92 + smoothTreble * 0.54) * beamState.speed +
                        phase * 1.28 -
                        smoothBass * 2.4
                );
                const snap = Math.sin(
                    t * (1.86 + smoothMid * 0.82) + phase * 2.14 + beamState.swayPhase
                );
                const targetYaw =
                    cluster * fanSpread +
                    pairDirection * (0.08 + smoothMid * 0.06) +
                    sweepA * (0.16 + smoothEnergy * 0.12 + smoothBass * 0.06) +
                    sweepB * (0.08 + smoothTreble * 0.08) +
                    snap * (0.03 + smoothPulse * 0.14);
                const targetTilt =
                    beamState.baseTilt +
                    cluster * 0.04 +
                    Math.sin(
                        t * (0.46 + smoothMid * 0.24) * beamState.speed +
                            phase * 0.72 +
                            beamState.swayPhase
                    ) *
                        (0.14 + smoothEnergy * 0.08 + smoothPulse * 0.06) +
                    smoothPulse * 0.08 +
                    smoothBass * 0.03;
                const targetRoll =
                    beamState.baseRoll * 0.35 +
                    Math.cos(
                        t * (0.84 + smoothTreble * 0.48) * beamState.speed +
                            phase * 1.08 +
                            beamState.swayPhase * 0.4
                    ) *
                        (0.09 + smoothTreble * 0.05) +
                    Math.sin(t * 1.42 + phase * 1.7) * smoothPulse * 0.05;

                beamState.currentYaw = dampValue(beamState.currentYaw, targetYaw, 4.2, dt);
                beamState.currentTilt = dampValue(beamState.currentTilt, targetTilt, 4.4, dt);
                beamState.currentRoll = dampValue(beamState.currentRoll, targetRoll, 3.8, dt);

                beamState.yaw.rotation.y = phase + beamState.currentYaw;
                beamState.pitch.rotation.z = beamState.currentTilt;
                beamState.pitch.rotation.x = beamState.currentRoll;

                const beamMix = 0.5 + 0.5 * Math.sin(t * 0.22 + phase * 0.6 + smoothTreble * 1.3);
                beamState.material.color.copy(coolColor).lerp(hotColor, beamMix);
                beamState.shellMaterial.color.copy(hazeWhite).lerp(hazePink, beamMix * 0.7);
                beamState.sourceMaterial.color.copy(beamState.material.color);
                beamState.tipMaterial.color.copy(hazeWhite).lerp(beamState.material.color, 0.62);
                beamState.material.opacity =
                    0.05 + smoothEnergy * 0.05 + smoothPulse * 0.09 + smoothSmoke * 0.08;
                beamState.shellMaterial.opacity =
                    0.03 + smoothSmoke * 0.12 + smoothEnergy * 0.04 + smoothPulse * 0.05;
                beamState.sourceMaterial.opacity = 0.34 + smoothEnergy * 0.1 + smoothPulse * 0.12;
                beamState.tipMaterial.opacity =
                    0.05 + smoothSmoke * 0.08 + smoothEnergy * 0.06 + smoothPulse * 0.12;
                const beamWidth =
                    0.84 + smoothSmoke * 0.16 + smoothBass * 0.07 + smoothPulse * 0.06;
                const beamHeight =
                    0.98 + smoothEnergy * 0.22 + smoothSmoke * 0.22 + smoothPulse * 0.1;
                beamState.beam.scale.set(beamWidth, beamHeight, beamWidth);
                beamState.beamShell.scale.set(
                    beamWidth * 1.28,
                    beamHeight * (1.12 + smoothSmoke * 0.18 + smoothPulse * 0.08),
                    beamWidth * 1.28
                );
                beamState.source.scale.setScalar(0.72 + smoothPulse * 0.22 + smoothMid * 0.08);
                beamState.tip.position.y = beamState.beamLength * beamHeight * 0.92;
                beamState.tip.scale.setScalar(
                    1.35 + smoothSmoke * 0.74 + smoothPulse * 0.54 + smoothTreble * 0.16
                );
            });

            hazeGroup.rotation.y = t * 0.03;
            hazePlaneStates.forEach((hazeState, index) => {
                const phase = index * 1.4;
                hazeState.plane.rotation.y =
                    hazeState.baseRotationY + Math.sin(t * 0.08 + phase) * 0.18;
                hazeState.plane.position.y = 4.2 + Math.sin(t * 0.18 + phase) * 0.16;
                const hazeScale = 0.94 + smoothSmoke * 0.32 + smoothEnergy * 0.08;
                hazeState.plane.scale.set(hazeScale, 0.96 + smoothSmoke * 0.22, hazeScale);
                hazeState.material.opacity =
                    0.03 + smoothSmoke * 0.08 + smoothEnergy * 0.02 + smoothPulse * 0.03;
                hazeState.material.color.copy(hazeWhite).lerp(hazePink, 0.14 + smoothTreble * 0.18);
            });

            smokeGroup.rotation.y = t * 0.06;
            smokeStates.forEach((smokeState, index) => {
                const cycle = wrap01(t * smokeState.speed + smokeState.phase);
                const lift = easeInOutSine(cycle);
                const swirl = t * 0.24 + smokeState.drift + cycle * 1.5;
                const radius = smokeState.radius * (0.9 + cycle * 0.5);
                smokeState.sprite.position.set(
                    Math.cos(swirl) * radius,
                    0.14 + lift * smokeState.lift,
                    Math.sin(swirl * 0.92) * radius
                );
                const smokeScale =
                    smokeState.scale *
                    (0.85 + lift * 1.55 + smoothSmoke * 0.65 + smoothPulse * 0.08);
                smokeState.sprite.scale.set(smokeScale, smokeScale * 1.18, 1);
                smokeState.material.opacity =
                    (0.018 + smoothSmoke * 0.07 + smoothEnergy * 0.02) *
                    (1 - cycle * 0.72) *
                    smokeState.alpha;
                smokeState.material.color
                    .copy(hazeWhite)
                    .lerp(hazePink, 0.08 + 0.12 * Math.sin(t * 0.12 + index));
            });

            innerHalo.rotation.z = t * 0.22;
            outerHalo.rotation.z = -t * 0.15;
            innerHaloMaterial.color.copy(hotColor).lerp(limeColor, 0.08 + smoothPulse * 0.2);
            outerHaloMaterial.color.copy(coolColor).lerp(hotColor, 0.16 + smoothMid * 0.3);
            innerHaloMaterial.opacity = 0.24 + smoothEnergy * 0.12 + smoothPulse * 0.18;
            outerHaloMaterial.opacity = 0.16 + smoothEnergy * 0.08 + smoothPulse * 0.12;

            basinGlowDiscMaterial.color.copy(coolColor).lerp(hotColor, 0.12 + smoothBass * 0.32);
            basinGlowDiscMaterial.opacity = 0.05 + smoothEnergy * 0.11 + smoothPulse * 0.16;
            const basinScale = 0.96 + smoothPulse * 0.12 + smoothBass * 0.05;
            basinGlowDisc.scale.set(basinScale, basinScale, basinScale);

            coreDiscMaterial.color.copy(hotColor).lerp(limeColor, 0.06 + smoothTreble * 0.18);
            coreDiscMaterial.opacity = 0.1 + smoothEnergy * 0.1 + smoothPulse * 0.22;
            const coreScale = 0.92 + smoothPulse * 0.16 + smoothEnergy * 0.06;
            coreDisc.scale.set(coreScale, coreScale, coreScale);

            rodRing.rotation.y = t * (0.12 + smoothEnergy * 0.08);
            rodStates.forEach((rodState, index) => {
                const wave =
                    0.5 + 0.5 * Math.sin(t * 1.7 + rodState.phase * 2.2 - smoothBass * 2.8);
                const response = clampUnit(wave * (0.26 + smoothMid * 0.18) + smoothPulse * 0.48);
                rodState.rod.scale.y = 0.22 + response * (1.7 + smoothBass * 0.8);
                rodState.material.opacity = 0.14 + response * 0.42;
                rodState.material.color.copy(coolColor).lerp(hotColor, 0.18 + wave * 0.42);
                rodState.pivot.rotation.y =
                    Math.sin(t * 0.42 + rodState.phase + index * 0.08) * 0.08;
            });
        },
    };
}

function freezeStaticHierarchy(root) {
    root.traverse((node) => {
        if (!node || !node.isObject3D || node.userData?.dynamic) {
            return;
        }
        node.matrixAutoUpdate = false;
        node.updateMatrix();
    });
}

function createAdditiveMaterial(color, opacity = 1, options = {}) {
    return new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        ...options,
    });
}

function createRadialGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.28, 'rgba(255,255,255,0.92)');
    gradient.addColorStop(0.62, 'rgba(255,255,255,0.28)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

function createSmokeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const puffs = [
        { x: 0.5, y: 0.42, r: 0.3, a: 0.58 },
        { x: 0.34, y: 0.5, r: 0.24, a: 0.42 },
        { x: 0.66, y: 0.52, r: 0.26, a: 0.38 },
        { x: 0.48, y: 0.66, r: 0.22, a: 0.28 },
        { x: 0.56, y: 0.28, r: 0.18, a: 0.22 },
        { x: 0.26, y: 0.34, r: 0.16, a: 0.18 },
    ];
    puffs.forEach((puff) => {
        const gradient = ctx.createRadialGradient(
            canvas.width * puff.x,
            canvas.height * puff.y,
            0,
            canvas.width * puff.x,
            canvas.height * puff.y,
            canvas.width * puff.r
        );
        gradient.addColorStop(0, `rgba(255,255,255,${puff.a})`);
        gradient.addColorStop(0.4, `rgba(255,255,255,${puff.a * 0.72})`);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

function createBeamFadeTexture({
    width = 96,
    height = 512,
    edgePower = 1.8,
    baseFadeEnd = 0.14,
    topFadeStart = 0.56,
    topFadeEnd = 1,
    centerBoost = 0.9,
} = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);

    for (let y = 0; y < height; y += 1) {
        const v = height <= 1 ? 0 : y / (height - 1);
        const baseFade = smoothstep(0, baseFadeEnd, v);
        const tipFade = 1 - smoothstep(topFadeStart, topFadeEnd, v);
        const axial = clampUnit(baseFade * tipFade);

        for (let x = 0; x < width; x += 1) {
            const u = width <= 1 ? 0.5 : x / (width - 1);
            const edgeDistance = Math.abs(u - 0.5) / 0.5;
            const lateral = Math.pow(Math.max(0, 1 - edgeDistance), edgePower);
            const center = 1 - edgeDistance * (1 - centerBoost);
            const value = Math.round(clampUnit(axial * lateral * center) * 255);
            const index = (y * width + x) * 4;
            imageData.data[index] = value;
            imageData.data[index + 1] = value;
            imageData.data[index + 2] = value;
            imageData.data[index + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

function markDynamic(node) {
    if (node?.userData) {
        node.userData.dynamic = true;
    }
    return node;
}

function clampUnit(value) {
    return THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
}

function dampValue(current, target, lambda, deltaTime) {
    const alpha = 1 - Math.exp(-Math.max(0.0001, lambda) * Math.max(0, deltaTime));
    return THREE.MathUtils.lerp(current, target, alpha);
}

function smoothstep(edge0, edge1, value) {
    if (edge0 === edge1) {
        return value < edge0 ? 0 : 1;
    }
    const t = clampUnit((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

function wrap01(value) {
    const wrapped = value - Math.floor(value);
    return wrapped < 0 ? wrapped + 1 : wrapped;
}

function easeInOutSine(value) {
    const t = clampUnit(value);
    return -(Math.cos(Math.PI * t) - 1) * 0.5;
}
