import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const CAPTURE_RATE = 1 / 30;
const MAX_RECORDING_SECONDS = 120;
const MAX_FRAMES = Math.ceil(MAX_RECORDING_SECONDS / CAPTURE_RATE);
const FRAME_TRIM_BATCH = Math.max(60, Math.floor(MAX_FRAMES * 0.05));
const MIN_REPLAY_DURATION = 1.2;

const SHOT_TYPES = {
    CHASE: 'chase',
    SIDE: 'side',
    LEAD: 'lead',
    HELI: 'heli',
    ORBIT: 'orbit',
};

const shotPosition = new THREE.Vector3();
const shotLook = new THREE.Vector3();
const cameraTargetPosition = new THREE.Vector3();
const cameraTargetLook = new THREE.Vector3();
const replayForward = new THREE.Vector3();
const replayRight = new THREE.Vector3();
const replayUp = new THREE.Vector3(0, 1, 0);

export function createReplayController(car, camera) {
    const frames = [];
    const events = [];
    let recording = false;
    let playback = false;
    let captureAccumulator = 0;
    let recordTime = 0;
    let playbackTime = 0;
    let playbackIndex = 0;
    let playbackEventIndex = 0;

    const directorState = {
        shotType: SHOT_TYPES.CHASE,
        shotSide: 1,
        shotCutTimer: 0,
        orbitPhase: Math.random() * Math.PI * 2,
        hasCameraState: false,
    };

    const replayVehicleState = {
        speed: 0,
        acceleration: 0,
        steerInput: 0,
        steerAngle: 0,
        throttle: 0,
        brake: 0,
        launchSlip: 0,
        burnout: 0,
        velocity: new THREE.Vector2(0, 0),
    };

    function startRecording(vehicleState = null) {
        recording = true;
        playback = false;
        captureAccumulator = 0;
        recordTime = 0;
        playbackTime = 0;
        playbackIndex = 0;
        playbackEventIndex = 0;
        frames.length = 0;
        events.length = 0;
        recordFrame(car, vehicleState || replayVehicleState, 0);
    }

    function stopRecording() {
        recording = false;
    }

    function hasReplay() {
        if (frames.length < 2) {
            return false;
        }
        return getDuration() >= MIN_REPLAY_DURATION;
    }

    function startPlayback() {
        if (!hasReplay()) {
            return false;
        }

        playback = true;
        recording = false;
        playbackTime = 0;
        playbackIndex = 0;
        playbackEventIndex = 0;
        directorState.shotType = SHOT_TYPES.CHASE;
        directorState.shotSide = Math.random() < 0.5 ? -1 : 1;
        directorState.shotCutTimer = 0;
        directorState.orbitPhase = Math.random() * Math.PI * 2;
        directorState.hasCameraState = false;
        return true;
    }

    function stopPlayback() {
        playback = false;
        directorState.hasCameraState = false;
    }

    function clear() {
        recording = false;
        playback = false;
        frames.length = 0;
        events.length = 0;
        captureAccumulator = 0;
        recordTime = 0;
        playbackTime = 0;
        playbackIndex = 0;
        playbackEventIndex = 0;
        directorState.hasCameraState = false;
    }

    function updateRecording(dt, vehicleState) {
        if (!recording || playback) {
            return;
        }

        recordTime += dt;
        captureAccumulator += dt;

        while (captureAccumulator >= CAPTURE_RATE) {
            captureAccumulator -= CAPTURE_RATE;
            recordFrame(car, vehicleState, recordTime);
        }
    }

    function updatePlayback(dt) {
        if (!playback || frames.length < 2) {
            return null;
        }

        playbackTime = Math.min(playbackTime + dt, getDuration());
        const timeOffset = frames[0].time;
        const localTime = playbackTime + timeOffset;
        const emittedEvents = [];

        while (playbackIndex < frames.length - 2 && frames[playbackIndex + 1].time < localTime) {
            playbackIndex += 1;
        }

        while (playbackEventIndex < events.length && events[playbackEventIndex].time <= localTime) {
            emittedEvents.push(events[playbackEventIndex]);
            playbackEventIndex += 1;
        }

        const current = frames[playbackIndex];
        const next = frames[Math.min(playbackIndex + 1, frames.length - 1)];
        const span = Math.max(next.time - current.time, 0.0001);
        const blend = THREE.MathUtils.clamp((localTime - current.time) / span, 0, 1);

        const x = THREE.MathUtils.lerp(current.x, next.x, blend);
        const y = THREE.MathUtils.lerp(current.y, next.y, blend);
        const z = THREE.MathUtils.lerp(current.z, next.z, blend);
        const rotY = lerpAngle(current.rotY, next.rotY, blend);
        const speed = THREE.MathUtils.lerp(current.speed, next.speed, blend);
        const acceleration = THREE.MathUtils.lerp(current.acceleration, next.acceleration, blend);
        const steerInput = THREE.MathUtils.lerp(current.steerInput, next.steerInput, blend);
        const steerAngle = THREE.MathUtils.lerp(current.steerAngle, next.steerAngle, blend);
        const throttle = THREE.MathUtils.lerp(current.throttle, next.throttle, blend);
        const brake = THREE.MathUtils.lerp(current.brake, next.brake, blend);
        const launchSlip = THREE.MathUtils.lerp(current.launchSlip, next.launchSlip, blend);
        const burnout = THREE.MathUtils.lerp(current.burnout, next.burnout, blend);

        car.position.set(x, y, z);
        car.rotation.y = rotY;
        updateVehicleStateSnapshot({
            speed,
            acceleration,
            steerInput,
            steerAngle,
            throttle,
            brake,
            launchSlip,
            burnout,
        });

        updateDirectedCamera(dt, replayVehicleState);

        if (playbackTime >= getDuration()) {
            stopPlayback();
        }

        return {
            vehicleState: replayVehicleState,
            events: emittedEvents,
        };
    }

    function updateDirectedCamera(dt, vehicleState) {
        directorState.shotCutTimer -= dt;
        if (directorState.shotCutTimer <= 0) {
            chooseNextShot(vehicleState);
        }

        replayForward.set(-Math.sin(car.rotation.y), 0, -Math.cos(car.rotation.y));
        replayRight.set(Math.cos(car.rotation.y), 0, -Math.sin(car.rotation.y));

        const speedRatio = THREE.MathUtils.clamp(Math.abs(vehicleState.speed) / 52, 0, 1);
        const steerRatio = THREE.MathUtils.clamp(Math.abs(vehicleState.steerInput), 0, 1);

        switch (directorState.shotType) {
            case SHOT_TYPES.SIDE: {
                const side = directorState.shotSide;
                shotPosition
                    .copy(car.position)
                    .addScaledVector(replayRight, side * THREE.MathUtils.lerp(6.4, 8.4, speedRatio))
                    .addScaledVector(replayForward, THREE.MathUtils.lerp(-1.2, 1.8, speedRatio));
                shotPosition.y += THREE.MathUtils.lerp(2.2, 3.1, speedRatio);
                shotLook.copy(car.position).addScaledVector(replayForward, 2.2);
                shotLook.y += 0.9;
                break;
            }
            case SHOT_TYPES.LEAD: {
                shotPosition
                    .copy(car.position)
                    .addScaledVector(replayForward, THREE.MathUtils.lerp(7.5, 13, speedRatio))
                    .addScaledVector(replayRight, directorState.shotSide * 1.25);
                shotPosition.y += THREE.MathUtils.lerp(1.6, 2.8, speedRatio);
                shotLook.copy(car.position).addScaledVector(replayUp, 0.95);
                break;
            }
            case SHOT_TYPES.HELI: {
                shotPosition
                    .copy(car.position)
                    .addScaledVector(replayForward, -THREE.MathUtils.lerp(2.8, 5.6, speedRatio))
                    .addScaledVector(
                        replayRight,
                        directorState.shotSide * THREE.MathUtils.lerp(1.8, 4.2, steerRatio)
                    );
                shotPosition.y += THREE.MathUtils.lerp(7.4, 10.8, speedRatio);
                shotLook
                    .copy(car.position)
                    .addScaledVector(replayForward, THREE.MathUtils.lerp(2.5, 8.5, speedRatio));
                shotLook.y += 0.6;
                break;
            }
            case SHOT_TYPES.ORBIT: {
                directorState.orbitPhase += dt * THREE.MathUtils.lerp(0.55, 1.1, speedRatio);
                const radius = THREE.MathUtils.lerp(7.6, 10.4, speedRatio);
                shotPosition.set(
                    car.position.x + Math.cos(directorState.orbitPhase) * radius,
                    car.position.y + THREE.MathUtils.lerp(2.7, 4.1, speedRatio),
                    car.position.z + Math.sin(directorState.orbitPhase) * radius
                );
                shotLook.copy(car.position).addScaledVector(replayUp, 0.85);
                break;
            }
            case SHOT_TYPES.CHASE:
            default: {
                shotPosition
                    .copy(car.position)
                    .addScaledVector(replayForward, -THREE.MathUtils.lerp(6.8, 10.2, speedRatio))
                    .addScaledVector(
                        replayRight,
                        directorState.shotSide * THREE.MathUtils.lerp(0.4, 1.8, steerRatio)
                    );
                shotPosition.y += THREE.MathUtils.lerp(2.0, 3.4, speedRatio);
                shotLook
                    .copy(car.position)
                    .addScaledVector(replayForward, THREE.MathUtils.lerp(4.6, 11.5, speedRatio));
                shotLook.y += THREE.MathUtils.lerp(0.85, 1.35, speedRatio);
                break;
            }
        }

        if (!directorState.hasCameraState) {
            camera.position.copy(shotPosition);
            cameraTargetLook.copy(shotLook);
            directorState.hasCameraState = true;
        }

        const followBlend = 1 - Math.exp(-THREE.MathUtils.lerp(4.4, 8.4, speedRatio) * dt);
        const lookBlend = 1 - Math.exp(-THREE.MathUtils.lerp(5.2, 9.8, speedRatio) * dt);
        cameraTargetPosition.copy(shotPosition);
        camera.position.lerp(cameraTargetPosition, followBlend);
        cameraTargetLook.lerp(shotLook, lookBlend);
        camera.lookAt(cameraTargetLook);

        const targetFov = THREE.MathUtils.lerp(73, 86, speedRatio);
        updateCameraFov(camera, targetFov, dt);
    }

    function chooseNextShot(vehicleState) {
        const speedAbs = Math.abs(vehicleState.speed);
        const steerAbs = Math.abs(vehicleState.steerInput);
        const burnout = vehicleState.burnout || vehicleState.launchSlip || 0;
        const drama = THREE.MathUtils.clamp(steerAbs * 0.8 + burnout * 0.8 + speedAbs / 60, 0, 1.9);
        const pool = [];

        addWeighted(pool, SHOT_TYPES.CHASE, speedAbs > 36 ? 5 : 3);
        addWeighted(pool, SHOT_TYPES.SIDE, speedAbs > 18 ? 3 + drama * 2 : 2 + steerAbs * 3);
        addWeighted(pool, SHOT_TYPES.HELI, speedAbs > 22 ? 2 + drama * 1.7 : 1.2);
        addWeighted(pool, SHOT_TYPES.LEAD, speedAbs > 30 ? 2.2 : 1.1);
        addWeighted(pool, SHOT_TYPES.ORBIT, speedAbs < 20 ? 2.4 : 1.1);

        const nextShot = pool[Math.floor(Math.random() * pool.length)] || SHOT_TYPES.CHASE;
        directorState.shotType = nextShot;
        directorState.shotSide = Math.random() < 0.5 ? -1 : 1;
        directorState.shotCutTimer =
            THREE.MathUtils.lerp(1.7, 3.8, Math.random()) * THREE.MathUtils.lerp(0.9, 0.72, drama);
    }

    function recordFrame(sourceCar, vehicleState, time) {
        if (frames.length >= MAX_FRAMES) {
            const trimCount = Math.min(
                FRAME_TRIM_BATCH,
                Math.max(1, frames.length - MAX_FRAMES + 1)
            );
            frames.splice(0, trimCount);
            if (events.length > 0) {
                const oldestFrameTime = frames.length > 0 ? frames[0].time : time;
                let staleEventCount = 0;
                while (
                    staleEventCount < events.length &&
                    events[staleEventCount].time < oldestFrameTime
                ) {
                    staleEventCount += 1;
                }
                if (staleEventCount > 0) {
                    events.splice(0, staleEventCount);
                }
            }
        }

        frames.push({
            time,
            x: sourceCar.position.x,
            y: sourceCar.position.y,
            z: sourceCar.position.z,
            rotY: sourceCar.rotation.y,
            speed: vehicleState?.speed || 0,
            acceleration: vehicleState?.acceleration || 0,
            steerInput: vehicleState?.steerInput || 0,
            steerAngle: vehicleState?.steerAngle || 0,
            throttle: vehicleState?.throttle || 0,
            brake: vehicleState?.brake || 0,
            launchSlip: vehicleState?.launchSlip || 0,
            burnout: vehicleState?.burnout || 0,
        });
    }

    function recordEvent(type, payload = {}) {
        if (!recording || playback) {
            return;
        }

        events.push({
            time: recordTime,
            type,
            payload,
        });
    }

    function updateVehicleStateSnapshot(snapshot) {
        replayVehicleState.speed = snapshot.speed;
        replayVehicleState.acceleration = snapshot.acceleration;
        replayVehicleState.steerInput = snapshot.steerInput;
        replayVehicleState.steerAngle = snapshot.steerAngle;
        replayVehicleState.throttle = snapshot.throttle;
        replayVehicleState.brake = snapshot.brake;
        replayVehicleState.launchSlip = snapshot.launchSlip;
        replayVehicleState.burnout = snapshot.burnout;

        replayVehicleState.velocity.set(
            -Math.sin(car.rotation.y) * snapshot.speed,
            -Math.cos(car.rotation.y) * snapshot.speed
        );
    }

    function getDuration() {
        if (!frames.length) {
            return 0;
        }
        return frames[frames.length - 1].time - frames[0].time;
    }

    return {
        startRecording,
        stopRecording,
        updateRecording,
        recordEvent,
        startPlayback,
        stopPlayback,
        updatePlayback,
        clear,
        hasReplay,
        isRecording() {
            return recording;
        },
        isPlaybackActive() {
            return playback;
        },
        getDuration,
    };
}

function addWeighted(pool, value, weight) {
    const count = Math.max(1, Math.round(weight));
    for (let i = 0; i < count; i += 1) {
        pool.push(value);
    }
}

function lerpAngle(a, b, t) {
    const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + delta * t;
}

function updateCameraFov(camera, targetFov, dt) {
    const blend = 1 - Math.exp(-4.8 * dt);
    const next = THREE.MathUtils.lerp(camera.fov, targetFov, blend);
    if (Math.abs(next - camera.fov) < 0.01) {
        return;
    }

    camera.fov = next;
    camera.updateProjectionMatrix();
}
