import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const DEFAULT_CAMERA_FOV = 42;
const MIN_DISTANCE = 0.55;
const MAX_DISTANCE = 16;
const MIN_PITCH = THREE.MathUtils.degToRad(-87);
const MAX_PITCH = THREE.MathUtils.degToRad(87);
const CAMERA_SMOOTHING = 14;
const TARGET_SMOOTHING = 16;
const ROTATE_SPEED = 0.0046;
const PAN_SPEED = 0.0015;
const ZOOM_SPEED = 0.0012;

const VIEW_PRESETS = [
    { id: 'iso', label: 'ISO', direction: new THREE.Vector3(1, 0.52, 1), distance: 3.8 },
    { id: 'front', label: 'FRONT', direction: new THREE.Vector3(0, 0.1, -1), distance: 3.3 },
    { id: 'back', label: 'BACK', direction: new THREE.Vector3(0, 0.1, 1), distance: 3.3 },
    { id: 'left', label: 'LEFT', direction: new THREE.Vector3(-1, 0.08, 0), distance: 3.2 },
    { id: 'right', label: 'RIGHT', direction: new THREE.Vector3(1, 0.08, 0), distance: 3.2 },
    { id: 'top', label: 'TOP', direction: new THREE.Vector3(0, 1, 0), distance: 2.9 },
    { id: 'bottom', label: 'BOTTOM', direction: new THREE.Vector3(0, -1, 0), distance: 2.9 },
];

export function createCarEditModeController({
    camera,
    car,
    canvas,
    getEditableParts,
    setEditablePartVisibility,
    setAllEditablePartsVisibility,
    captureEditablePartVisibility,
    restoreEditablePartVisibility,
    onEditModeChanged,
    onStatus,
} = {}) {
    if (!camera || !car || !canvas) {
        return createNoopController();
    }

    const target = new THREE.Vector3();
    const smoothedTarget = new THREE.Vector3();
    const desiredCameraPosition = new THREE.Vector3();
    const rightAxis = new THREE.Vector3();
    const upAxis = new THREE.Vector3();
    const cameraToTarget = new THREE.Vector3();
    const inspectionCenter = new THREE.Vector3();
    const panOffset = new THREE.Vector3();
    const localDirection = new THREE.Vector3();
    const localUpDirection = new THREE.Vector3();
    const pointerState = {
        active: false,
        id: null,
        mode: 'rotate',
        x: 0,
        y: 0,
    };

    const ui = createEditModeUi({
        onClose: () => setActive(false),
        onShowAll: () => {
            setAllEditablePartVisibility?.(true);
            renderPartList();
        },
        onHideAll: () => {
            setAllEditablePartVisibility?.(false);
            renderPartList();
        },
        onSelectPreset: (presetId) => applyViewPreset(presetId, true),
        onSearch: () => renderPartList(),
        onTogglePart: (partId, isVisible) => {
            setEditablePartVisibility?.(partId, isVisible);
            renderPartList();
        },
    });

    let active = false;
    let yaw = 0;
    let pitch = 0;
    let distance = 4.2;
    let savedPartVisibility = null;
    let targetFov = DEFAULT_CAMERA_FOV;

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUpOrCancel);
    canvas.addEventListener('pointercancel', onPointerUpOrCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('contextmenu', onContextMenu);

    return {
        isActive() {
            return active;
        },
        setActive,
        toggle() {
            setActive(!active);
        },
        update(deltaTime = 1 / 60) {
            if (!active) {
                return;
            }
            updateCamera(deltaTime);
        },
        handleKey(event, isKeyDown) {
            const key = normalizeKey(event?.key || '');
            if (!isKeyDown) {
                if (active && isEditRelevantKey(key)) {
                    event.preventDefault();
                    return true;
                }
                return false;
            }

            if (!active && key === 'e') {
                event.preventDefault();
                setActive(true);
                return true;
            }

            if (!active) {
                return false;
            }

            if (key === 'e' || key === 'escape') {
                event.preventDefault();
                setActive(false);
                return true;
            }
            if (key === 'r') {
                event.preventDefault();
                focusOnCar(true);
                onStatus?.('Edit mode: vaade resetiti.');
                return true;
            }

            if (isEditRelevantKey(key)) {
                event.preventDefault();
                return true;
            }
            return false;
        },
    };

    function setActive(nextActive) {
        const shouldActivate = Boolean(nextActive);
        if (active === shouldActivate) {
            return;
        }

        active = shouldActivate;
        document.body.classList.toggle('edit-mode-active', active);
        ui.setVisible(active);

        if (active) {
            savedPartVisibility = captureEditablePartVisibility?.() || null;
            setAllEditablePartVisibility?.(true);
            synchronizeOrbitFromCamera();
            applyViewPreset('iso', false);
            targetFov = DEFAULT_CAMERA_FOV;
            renderPartList();
            onStatus?.('Edit mode aktiivne. Hiir: vasak pööra, parem liiguta, ratas zoom.');
        } else {
            restoreEditablePartVisibility?.(savedPartVisibility);
            savedPartVisibility = null;
            pointerState.active = false;
            pointerState.id = null;
            ui.setSearchValue('');
            onStatus?.('Edit mode väljas.');
        }

        onEditModeChanged?.(active);
    }

    function renderPartList() {
        const allParts = Array.isArray(getEditableParts?.()) ? getEditableParts() : [];
        const searchTerm = ui.getSearchValue().trim().toLowerCase();
        const filteredParts = searchTerm
            ? allParts.filter((part) => String(part.label || '').toLowerCase().includes(searchTerm))
            : allParts;
        ui.renderParts(filteredParts);
    }

    function focusOnCar(resetPan = false) {
        const center = getCarInspectionCenter();
        if (resetPan) {
            target.copy(center);
            smoothedTarget.copy(center);
            return;
        }
        panOffset.copy(target).sub(smoothedTarget);
        target.copy(center).add(panOffset);
        smoothedTarget.copy(target);
    }

    function synchronizeOrbitFromCamera() {
        const center = getCarInspectionCenter();
        target.copy(center);
        smoothedTarget.copy(center);
        cameraToTarget.copy(camera.position).sub(center);
        distance = THREE.MathUtils.clamp(cameraToTarget.length(), MIN_DISTANCE, MAX_DISTANCE);
        if (distance <= 0.0001) {
            distance = 4;
            yaw = car.rotation.y;
            pitch = THREE.MathUtils.degToRad(16);
            return;
        }
        yaw = Math.atan2(cameraToTarget.x, cameraToTarget.z);
        pitch = THREE.MathUtils.clamp(Math.asin(cameraToTarget.y / distance), MIN_PITCH, MAX_PITCH);
    }

    function applyViewPreset(presetId, keepDistance = true) {
        const preset = VIEW_PRESETS.find((item) => item.id === presetId) || VIEW_PRESETS[0];
        ui.setPreset(preset.id);
        focusOnCar(false);

        localDirection.copy(preset.direction).normalize();
        localDirection.applyQuaternion(car.quaternion);

        yaw = Math.atan2(localDirection.x, localDirection.z);
        const nextPitch = Math.asin(THREE.MathUtils.clamp(localDirection.y, -1, 1));
        pitch = THREE.MathUtils.clamp(nextPitch, MIN_PITCH, MAX_PITCH);
        distance = keepDistance
            ? distance
            : THREE.MathUtils.clamp(preset.distance || distance, MIN_DISTANCE, MAX_DISTANCE);
    }

    function updateCamera(deltaTime) {
        const dt = Math.min(Math.max(deltaTime, 0), 0.05);
        const targetBlend = 1 - Math.exp(-TARGET_SMOOTHING * dt);
        smoothedTarget.lerp(target, targetBlend);

        const cosPitch = Math.cos(pitch);
        desiredCameraPosition.set(
            smoothedTarget.x + Math.sin(yaw) * cosPitch * distance,
            smoothedTarget.y + Math.sin(pitch) * distance,
            smoothedTarget.z + Math.cos(yaw) * cosPitch * distance
        );

        const cameraBlend = 1 - Math.exp(-CAMERA_SMOOTHING * dt);
        camera.position.lerp(desiredCameraPosition, cameraBlend);
        camera.lookAt(smoothedTarget);
        updateCameraFov(dt);
    }

    function updateCameraFov(deltaTime) {
        const blend = 1 - Math.exp(-8 * deltaTime);
        const nextFov = THREE.MathUtils.lerp(camera.fov, targetFov, blend);
        if (Math.abs(nextFov - camera.fov) < 0.01) {
            return;
        }
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
    }

    function onPointerDown(event) {
        if (!active) {
            return;
        }
        if (event.button !== 0 && event.button !== 1 && event.button !== 2) {
            return;
        }
        pointerState.active = true;
        pointerState.id = event.pointerId;
        pointerState.mode = event.button === 0 ? 'rotate' : 'pan';
        pointerState.x = event.clientX;
        pointerState.y = event.clientY;
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    function onPointerMove(event) {
        if (!active || !pointerState.active || pointerState.id !== event.pointerId) {
            return;
        }
        const dx = event.clientX - pointerState.x;
        const dy = event.clientY - pointerState.y;
        pointerState.x = event.clientX;
        pointerState.y = event.clientY;

        if (pointerState.mode === 'rotate') {
            yaw -= dx * ROTATE_SPEED;
            pitch = THREE.MathUtils.clamp(pitch - dy * ROTATE_SPEED, MIN_PITCH, MAX_PITCH);
        } else {
            const panScale = Math.max(distance, 1) * PAN_SPEED;
            rightAxis.setFromMatrixColumn(camera.matrixWorld, 0);
            upAxis.setFromMatrixColumn(camera.matrixWorld, 1);
            target.addScaledVector(rightAxis, -dx * panScale);
            target.addScaledVector(upAxis, dy * panScale);
        }
        event.preventDefault();
    }

    function onPointerUpOrCancel(event) {
        if (pointerState.id !== event.pointerId) {
            return;
        }
        pointerState.active = false;
        pointerState.id = null;
        if (canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
        }
    }

    function onWheel(event) {
        if (!active) {
            return;
        }
        distance *= Math.exp(event.deltaY * ZOOM_SPEED);
        distance = THREE.MathUtils.clamp(distance, MIN_DISTANCE, MAX_DISTANCE);
        event.preventDefault();
    }

    function onDoubleClick(event) {
        if (!active) {
            return;
        }
        focusOnCar(true);
        event.preventDefault();
    }

    function onContextMenu(event) {
        if (!active) {
            return;
        }
        event.preventDefault();
    }

    function getCarInspectionCenter() {
        localUpDirection.set(0, 0.66, 0).applyQuaternion(car.quaternion);
        return inspectionCenter.copy(car.position).add(localUpDirection);
    }
}

function createEditModeUi({
    onClose,
    onShowAll,
    onHideAll,
    onSelectPreset,
    onSearch,
    onTogglePart,
} = {}) {
    const root = document.createElement('section');
    root.id = 'editModePanel';
    root.hidden = true;
    root.innerHTML = `
        <div class="editModeHeader">
            <div>
                <div class="editModeTitle">EDIT MODE</div>
                <div class="editModeHint">E / Esc sulgeb, R resetib vaate</div>
            </div>
            <button type="button" class="editModeCloseBtn" data-action="close">SULGE</button>
        </div>
        <div class="editModeBlock">
            <div class="editModeBlockTitle">VAADE</div>
            <div class="editModeViewGrid" data-role="view-grid"></div>
        </div>
        <div class="editModeBlock">
            <div class="editModeBlockTitle">OSAD</div>
            <div class="editModeTools">
                <button type="button" data-action="show-all">SHOW ALL</button>
                <button type="button" data-action="hide-all">HIDE ALL</button>
            </div>
            <input
                type="search"
                class="editModeSearch"
                data-role="search"
                placeholder="Otsi detaili..."
                aria-label="Otsi detaili"
            />
            <div class="editModePartList" data-role="part-list"></div>
        </div>
    `;
    document.body.appendChild(root);

    const closeBtn = root.querySelector('[data-action="close"]');
    const showAllBtn = root.querySelector('[data-action="show-all"]');
    const hideAllBtn = root.querySelector('[data-action="hide-all"]');
    const searchInput = root.querySelector('[data-role="search"]');
    const partList = root.querySelector('[data-role="part-list"]');
    const viewGrid = root.querySelector('[data-role="view-grid"]');
    const presetButtons = new Map();

    closeBtn?.addEventListener('click', () => onClose?.());
    showAllBtn?.addEventListener('click', () => onShowAll?.());
    hideAllBtn?.addEventListener('click', () => onHideAll?.());
    searchInput?.addEventListener('input', () => onSearch?.());

    for (let i = 0; i < VIEW_PRESETS.length; i += 1) {
        const preset = VIEW_PRESETS[i];
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = preset.label;
        button.setAttribute('data-preset', preset.id);
        button.addEventListener('click', () => onSelectPreset?.(preset.id));
        viewGrid?.appendChild(button);
        presetButtons.set(preset.id, button);
    }

    return {
        setVisible(isVisible) {
            root.hidden = !isVisible;
        },
        setPreset(presetId) {
            presetButtons.forEach((button, id) => {
                button.classList.toggle('active', id === presetId);
            });
        },
        getSearchValue() {
            return searchInput?.value || '';
        },
        setSearchValue(nextValue) {
            if (searchInput) {
                searchInput.value = String(nextValue ?? '');
            }
        },
        renderParts(parts = []) {
            if (!partList) {
                return;
            }
            partList.innerHTML = '';
            if (!parts.length) {
                const empty = document.createElement('div');
                empty.className = 'editModeEmpty';
                empty.textContent = 'Detaili ei leitud.';
                partList.appendChild(empty);
                return;
            }

            const categoryOrder = ['Moodulid', 'Kere', 'Rattad', 'Vedrustus', 'Detailid'];
            const categoryGroups = new Map();
            for (let i = 0; i < parts.length; i += 1) {
                const part = parts[i];
                const category = part.category || 'Detailid';
                if (!categoryGroups.has(category)) {
                    categoryGroups.set(category, []);
                }
                categoryGroups.get(category).push(part);
            }

            const categories = Array.from(categoryGroups.keys())
                .sort((a, b) => {
                    const ia = categoryOrder.indexOf(a);
                    const ib = categoryOrder.indexOf(b);
                    if (ia === -1 && ib === -1) {
                        return a.localeCompare(b);
                    }
                    if (ia === -1) {
                        return 1;
                    }
                    if (ib === -1) {
                        return -1;
                    }
                    return ia - ib;
                });

            for (let i = 0; i < categories.length; i += 1) {
                const category = categories[i];
                const section = document.createElement('section');
                section.className = 'editModePartSection';

                const title = document.createElement('div');
                title.className = 'editModeCategoryTitle';
                title.textContent = category;
                section.appendChild(title);

                const rows = categoryGroups.get(category).slice()
                    .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));

                for (let j = 0; j < rows.length; j += 1) {
                    const part = rows[j];
                    const label = document.createElement('label');
                    label.className = 'editModePartRow';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = Boolean(part.visible);
                    checkbox.addEventListener('change', () => {
                        onTogglePart?.(part.id, checkbox.checked);
                    });

                    const text = document.createElement('span');
                    text.textContent = part.label || part.id;

                    label.append(checkbox, text);
                    section.appendChild(label);
                }

                partList.appendChild(section);
            }
        },
    };
}

function normalizeKey(rawKey) {
    const lowered = String(rawKey || '').toLowerCase();
    if (lowered === ' ' || lowered === 'spacebar') {
        return 'space';
    }
    return lowered;
}

function isEditRelevantKey(key) {
    return key === 'arrowup'
        || key === 'arrowdown'
        || key === 'arrowleft'
        || key === 'arrowright'
        || key === 'w'
        || key === 'a'
        || key === 's'
        || key === 'd'
        || key === 'space'
        || key === 'q'
        || key === 'm'
        || key === 'tab'
        || key === '1'
        || key === '2'
        || key === '3'
        || key === '4'
        || key === '5'
        || key === '6'
        || key === '7'
        || key === 'c'
        || key === 'v'
        || key === 'k'
        || key === 'enter';
}

function createNoopController() {
    return {
        isActive() {
            return false;
        },
        setActive() {},
        toggle() {},
        update() {},
        handleKey() {
            return false;
        },
    };
}
