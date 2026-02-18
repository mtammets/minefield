import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { CITY_LAYOUT_STORAGE_KEY } from './constants.js';

const BUILDER_LAYER_NAME = 'cityBuilderLayer';
const MAX_LAYOUT_ITEMS = 512;
const ROAD_HEIGHT = 0.032;
const OBSTACLE_SOURCE_CUSTOM = 'city_builder_custom';

const MAP_RENDER_SIZE = 720;
const MAP_MIN_DEVICE_PIXELS = 420;
const MAP_MAX_DEVICE_PIXELS = 1800;
const SPRITE_SIZE = 144;

const CITY_PIECES = Object.freeze([
    { id: 'road_straight', shortcut: '1' },
    { id: 'road_curve', shortcut: '2' },
    { id: 'road_intersection', shortcut: '3' },
    { id: 'tree', shortcut: '4' },
    { id: 'house_small', shortcut: '5' },
    { id: 'house_tall', shortcut: '6' },
    { id: 'house_wide', shortcut: '7' },
]);

const PIECE_IDS = new Set(CITY_PIECES.map((piece) => piece.id));

export function createCityBuilderController(options = {}) {
    const { cityScenery, staticObstacles, cityMapLayout, onModeChanged, onStatus } = options;

    if (!cityScenery || !Array.isArray(staticObstacles) || !cityMapLayout) {
        return createNoopController();
    }

    const gridSpacing = Number(cityMapLayout.gridSpacing) || 42;
    const gridRange = Math.max(1, Math.floor(Number(cityMapLayout.gridRange) || 6));
    const roadWidth = THREE.MathUtils.clamp(Number(cityMapLayout.roadWidth) || 20, 8, gridSpacing);
    const gridSize = gridRange * 2 + 1;

    const pieceAssets = createPieceAssets({ gridSpacing, roadWidth });
    const pieceSprites = createPieceSpriteAtlas({
        pieces: CITY_PIECES,
        pieceAssets,
        gridSpacing,
        roadWidth,
        spriteSize: SPRITE_SIZE,
    });

    const builderLayer = ensureBuilderLayer(cityScenery);
    const baseObstacleSnapshot = cloneObstacles(staticObstacles);

    const ui = createCityBuilderUi({
        pieces: CITY_PIECES,
        getSprite: (pieceId, rotation) => pieceSprites.get(pieceId, rotation),
        onClose: () => setActive(false),
        onClear: () => {
            if (layoutByCell.size === 0) {
                return;
            }
            layoutByCell.clear();
            applyLayout('Map cleared. Default city restored.');
            requestMapRedraw();
        },
        onSelectPiece(pieceId) {
            if (!PIECE_IDS.has(pieceId)) {
                return;
            }
            selectedPieceId = pieceId;
            ui.setSelectedPiece(selectedPieceId);
            ui.setActivePreview(pieceSprites.get(selectedPieceId, selectedRotation));
            requestMapRedraw();
        },
        onPalettePointerDown(event, pieceId) {
            handlePalettePointerDown(event, pieceId);
        },
        onRotateLeft: () => setRotation((selectedRotation + 3) % 4),
        onRotateRight: () => setRotation((selectedRotation + 1) % 4),
        onToggleErase() {
            eraseMode = !eraseMode;
            ui.setEraseActive(eraseMode);
            onStatus?.(eraseMode ? 'Erase mode on.' : 'Erase mode off.');
            requestMapRedraw();
        },
    });

    const layoutByCell = new Map();
    const mapCanvas = ui.mapCanvas;
    const mapCtx = mapCanvas.getContext('2d', { alpha: false });
    const groundPattern = createMapGroundPattern();

    let active = false;
    let selectedPieceId = CITY_PIECES[0].id;
    let selectedRotation = 0;
    let hoverCell = null;
    let activePointerId = null;
    let drawMode = null;
    let eraseMode = false;
    let mapNeedsRedraw = true;
    let paletteDrag = null;

    ui.setSelectedPiece(selectedPieceId);
    ui.setRotation(selectedRotation);
    ui.setEraseActive(eraseMode);
    ui.setActivePreview(pieceSprites.get(selectedPieceId, selectedRotation));

    mapCanvas.addEventListener('pointerdown', onMapPointerDown);
    mapCanvas.addEventListener('pointermove', onMapPointerMove);
    mapCanvas.addEventListener('pointerup', onMapPointerUpOrCancel);
    mapCanvas.addEventListener('pointercancel', onMapPointerUpOrCancel);
    mapCanvas.addEventListener('pointerleave', onMapPointerLeave);
    mapCanvas.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });

    window.addEventListener('pointermove', onWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', onWindowPointerUpOrCancel, { passive: false });
    window.addEventListener('pointercancel', onWindowPointerUpOrCancel, { passive: false });
    window.addEventListener('resize', onWindowResize);

    restoreLayoutFromStorage();

    return {
        isActive() {
            return active;
        },
        setActive,
        toggle() {
            setActive(!active);
        },
        update() {
            if (!active || !mapNeedsRedraw) {
                return;
            }
            drawMap();
            mapNeedsRedraw = false;
        },
        handleKey(event, isKeyDown) {
            const key = normalizeKey(event?.key || '');

            if (!isKeyDown) {
                if (active && isBuilderRelevantKey(key)) {
                    event.preventDefault();
                    return true;
                }
                return false;
            }

            if (!active && key === 'b') {
                event.preventDefault();
                setActive(true);
                return true;
            }

            if (!active) {
                return false;
            }

            if (key === 'b' || key === 'escape') {
                event.preventDefault();
                setActive(false);
                return true;
            }

            if (key === 'r') {
                event.preventDefault();
                setRotation((selectedRotation + 1) % 4);
                return true;
            }

            if (key === '[') {
                event.preventDefault();
                cyclePiece(-1);
                return true;
            }

            if (key === ']') {
                event.preventDefault();
                cyclePiece(1);
                return true;
            }

            if (key === 'x') {
                event.preventDefault();
                eraseMode = !eraseMode;
                ui.setEraseActive(eraseMode);
                onStatus?.(eraseMode ? 'Erase mode on.' : 'Erase mode off.');
                requestMapRedraw();
                return true;
            }

            if (key === 'delete' || key === 'backspace') {
                event.preventDefault();
                if (hoverCell) {
                    removePieceAtCell(hoverCell.gridX, hoverCell.gridZ, {
                        statusText: `Removed piece at ${hoverCell.gridX}, ${hoverCell.gridZ}.`,
                    });
                }
                return true;
            }

            if (key === 'c') {
                event.preventDefault();
                if (layoutByCell.size > 0) {
                    layoutByCell.clear();
                    applyLayout('Map cleared. Default city restored.');
                }
                return true;
            }

            if (/^[1-7]$/.test(key)) {
                event.preventDefault();
                const piece = CITY_PIECES[Number(key) - 1];
                if (piece) {
                    selectedPieceId = piece.id;
                    ui.setSelectedPiece(selectedPieceId);
                    ui.setActivePreview(pieceSprites.get(selectedPieceId, selectedRotation));
                    requestMapRedraw();
                }
                return true;
            }

            if (isBuilderRelevantKey(key)) {
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
        ui.setVisible(active);
        document.body.classList.toggle('city-builder-active', active);

        if (active) {
            hoverCell = null;
            eraseMode = false;
            ui.setEraseActive(eraseMode);
            refreshCanvasSize();
            requestMapRedraw();
            onStatus?.('2D map editor active. Drag pieces to map.');
        } else {
            endPaletteDrag();
            activePointerId = null;
            drawMode = null;
            hoverCell = null;
            ui.setCellLabel('--');
            requestMapRedraw();
            onStatus?.('Map editor off.');
        }

        onModeChanged?.(active);
    }

    function setRotation(nextRotation) {
        selectedRotation = normalizeRotation(nextRotation);
        ui.setRotation(selectedRotation);
        ui.setActivePreview(pieceSprites.get(selectedPieceId, selectedRotation));
        onStatus?.(`Rotation ${selectedRotation * 90} deg.`);
        requestMapRedraw();
    }

    function cyclePiece(direction = 1) {
        const currentIndex = CITY_PIECES.findIndex((piece) => piece.id === selectedPieceId);
        const nextIndex =
            (currentIndex + Math.sign(direction || 1) + CITY_PIECES.length) % CITY_PIECES.length;
        selectedPieceId = CITY_PIECES[nextIndex].id;
        ui.setSelectedPiece(selectedPieceId);
        ui.setActivePreview(pieceSprites.get(selectedPieceId, selectedRotation));
        requestMapRedraw();
    }

    function handlePalettePointerDown(event, pieceId) {
        if (!active || !PIECE_IDS.has(pieceId) || event.button !== 0) {
            return;
        }

        selectedPieceId = pieceId;
        ui.setSelectedPiece(selectedPieceId);
        ui.setActivePreview(pieceSprites.get(selectedPieceId, selectedRotation));

        const sprite = pieceSprites.get(pieceId, selectedRotation);
        if (!sprite) {
            return;
        }

        paletteDrag = {
            pointerId: event.pointerId,
            pieceId,
        };

        event.currentTarget?.setPointerCapture?.(event.pointerId);
        ui.showDragGhost(sprite, event.clientX, event.clientY);

        hoverCell = resolveCellFromClientPoint(event.clientX, event.clientY);
        updateCellLabel();
        requestMapRedraw();
        event.preventDefault();
    }

    function endPaletteDrag() {
        paletteDrag = null;
        ui.hideDragGhost();
    }

    function onWindowPointerMove(event) {
        if (!active || !paletteDrag || paletteDrag.pointerId !== event.pointerId) {
            return;
        }

        ui.moveDragGhost(event.clientX, event.clientY);
        hoverCell = resolveCellFromClientPoint(event.clientX, event.clientY);
        updateCellLabel();
        requestMapRedraw();
        event.preventDefault();
    }

    function onWindowPointerUpOrCancel(event) {
        if (!active || !paletteDrag || paletteDrag.pointerId !== event.pointerId) {
            return;
        }

        const cell = resolveCellFromClientPoint(event.clientX, event.clientY);
        if (cell) {
            placePieceAtCell(cell.gridX, cell.gridZ, {
                pieceId: paletteDrag.pieceId,
                rotation: selectedRotation,
            });
        }

        hoverCell = cell;
        updateCellLabel();
        requestMapRedraw();
        endPaletteDrag();
        event.preventDefault();
    }

    function onMapPointerDown(event) {
        if (!active || paletteDrag) {
            return;
        }
        if (event.button !== 0 && event.button !== 2) {
            return;
        }

        const cell = resolveCellFromMapPointer(event);
        hoverCell = cell;
        updateCellLabel();
        requestMapRedraw();

        if (!cell) {
            return;
        }

        activePointerId = event.pointerId;
        mapCanvas.setPointerCapture?.(event.pointerId);
        drawMode = eraseMode || event.button === 2 ? 'erase' : 'paint';
        applyDrawAction(cell, drawMode);
        event.preventDefault();
    }

    function onMapPointerMove(event) {
        if (!active || paletteDrag) {
            return;
        }

        const cell = resolveCellFromMapPointer(event);
        hoverCell = cell;
        updateCellLabel();
        requestMapRedraw();

        if (activePointerId !== event.pointerId || !drawMode || !cell) {
            return;
        }

        applyDrawAction(cell, drawMode);
        event.preventDefault();
    }

    function onMapPointerUpOrCancel(event) {
        if (activePointerId !== event.pointerId) {
            return;
        }

        drawMode = null;
        activePointerId = null;
        mapCanvas.releasePointerCapture?.(event.pointerId);
    }

    function onMapPointerLeave() {
        if (!active || activePointerId != null || paletteDrag) {
            return;
        }
        hoverCell = null;
        updateCellLabel();
        requestMapRedraw();
    }

    function applyDrawAction(cell, mode) {
        if (!cell || !mode) {
            return;
        }

        if (mode === 'erase') {
            removePieceAtCell(cell.gridX, cell.gridZ);
            return;
        }

        placePieceAtCell(cell.gridX, cell.gridZ);
    }

    function resolveCellFromMapPointer(event) {
        return resolveCellFromClientPoint(event.clientX, event.clientY);
    }

    function resolveCellFromClientPoint(clientX, clientY) {
        const rect = mapCanvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return null;
        }

        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        if (localX < 0 || localY < 0 || localX >= rect.width || localY >= rect.height) {
            return null;
        }

        const cellSizeX = rect.width / gridSize;
        const cellSizeY = rect.height / gridSize;
        const cellX = THREE.MathUtils.clamp(Math.floor(localX / cellSizeX), 0, gridSize - 1);
        const cellY = THREE.MathUtils.clamp(Math.floor(localY / cellSizeY), 0, gridSize - 1);

        return {
            gridX: cellX - gridRange,
            gridZ: cellY - gridRange,
            cellX,
            cellY,
        };
    }

    function onWindowResize() {
        if (!active) {
            return;
        }
        refreshCanvasSize();
        requestMapRedraw();
    }

    function refreshCanvasSize() {
        const rect = mapCanvas.getBoundingClientRect();
        const cssSize = Math.max(260, Math.min(rect.width || MAP_RENDER_SIZE, MAP_RENDER_SIZE));
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const devicePixels = THREE.MathUtils.clamp(
            Math.round(cssSize * dpr),
            MAP_MIN_DEVICE_PIXELS,
            MAP_MAX_DEVICE_PIXELS
        );

        if (mapCanvas.width !== devicePixels || mapCanvas.height !== devicePixels) {
            mapCanvas.width = devicePixels;
            mapCanvas.height = devicePixels;
        }
    }

    function requestMapRedraw() {
        mapNeedsRedraw = true;
    }

    function updateCellLabel() {
        if (!hoverCell) {
            ui.setCellLabel('--');
            return;
        }
        ui.setCellLabel(`${hoverCell.gridX}, ${hoverCell.gridZ}`);
    }

    function drawMap() {
        if (!mapCtx || mapCanvas.width <= 0 || mapCanvas.height <= 0) {
            return;
        }

        const width = mapCanvas.width;
        const height = mapCanvas.height;
        const cellW = width / gridSize;
        const cellH = height / gridSize;

        mapCtx.clearRect(0, 0, width, height);

        const bgGradient = mapCtx.createLinearGradient(0, 0, 0, height);
        bgGradient.addColorStop(0, '#10243c');
        bgGradient.addColorStop(1, '#071326');
        mapCtx.fillStyle = bgGradient;
        mapCtx.fillRect(0, 0, width, height);

        const pattern = mapCtx.createPattern(groundPattern, 'repeat');
        if (pattern) {
            mapCtx.globalAlpha = 0.28;
            mapCtx.fillStyle = pattern;
            mapCtx.fillRect(0, 0, width, height);
            mapCtx.globalAlpha = 1;
        }

        mapCtx.strokeStyle = 'rgba(122, 187, 236, 0.3)';
        mapCtx.lineWidth = 1;
        for (let i = 0; i <= gridSize; i += 1) {
            const x = Math.round(i * cellW) + 0.5;
            const y = Math.round(i * cellH) + 0.5;

            mapCtx.beginPath();
            mapCtx.moveTo(x, 0);
            mapCtx.lineTo(x, height);
            mapCtx.stroke();

            mapCtx.beginPath();
            mapCtx.moveTo(0, y);
            mapCtx.lineTo(width, y);
            mapCtx.stroke();
        }

        mapCtx.strokeStyle = 'rgba(188, 228, 255, 0.62)';
        mapCtx.lineWidth = 2;
        const axisX = Math.round(gridRange * cellW + cellW * 0.5) + 0.5;
        const axisY = Math.round(gridRange * cellH + cellH * 0.5) + 0.5;

        mapCtx.beginPath();
        mapCtx.moveTo(axisX, 0);
        mapCtx.lineTo(axisX, height);
        mapCtx.stroke();

        mapCtx.beginPath();
        mapCtx.moveTo(0, axisY);
        mapCtx.lineTo(width, axisY);
        mapCtx.stroke();

        const layout = Array.from(layoutByCell.values());
        for (let i = 0; i < layout.length; i += 1) {
            drawPieceOnMap(layout[i], mapCtx, cellW, cellH);
        }

        if (hoverCell) {
            const previewPieceId = paletteDrag?.pieceId || selectedPieceId;
            if (previewPieceId && !(drawMode === 'erase' || eraseMode)) {
                mapCtx.globalAlpha = 0.74;
                drawPieceOnMap(
                    {
                        gridX: hoverCell.gridX,
                        gridZ: hoverCell.gridZ,
                        pieceId: previewPieceId,
                        rotation: selectedRotation,
                    },
                    mapCtx,
                    cellW,
                    cellH
                );
                mapCtx.globalAlpha = 1;
            }

            const x = hoverCell.cellX * cellW;
            const y = hoverCell.cellY * cellH;
            mapCtx.strokeStyle = eraseMode
                ? 'rgba(255, 158, 158, 0.95)'
                : 'rgba(172, 238, 255, 0.95)';
            mapCtx.lineWidth = 2;
            mapCtx.strokeRect(x + 1.5, y + 1.5, cellW - 3, cellH - 3);
        }
    }

    function drawPieceOnMap(entry, ctx, cellW, cellH) {
        const sprite = pieceSprites.get(entry.pieceId, entry.rotation);
        if (!sprite) {
            return;
        }

        const x = (entry.gridX + gridRange) * cellW;
        const y = (entry.gridZ + gridRange) * cellH;
        const isRoadPiece = entry.pieceId.startsWith('road_');
        const inset = isRoadPiece ? 0 : Math.max(1, Math.min(cellW, cellH) * 0.04);
        ctx.drawImage(sprite, x + inset, y + inset, cellW - inset * 2, cellH - inset * 2);
    }

    function placePieceAtCell(gridX, gridZ, options = {}) {
        const pieceId = PIECE_IDS.has(options.pieceId) ? options.pieceId : selectedPieceId;
        const rotation = normalizeRotation(
            Number.isFinite(options.rotation) ? options.rotation : selectedRotation
        );

        const clampedX = THREE.MathUtils.clamp(Math.round(gridX), -gridRange, gridRange);
        const clampedZ = THREE.MathUtils.clamp(Math.round(gridZ), -gridRange, gridRange);
        const key = toCellKey(clampedX, clampedZ);

        const existing = layoutByCell.get(key);
        if (
            existing &&
            existing.pieceId === pieceId &&
            normalizeRotation(existing.rotation) === rotation
        ) {
            return;
        }

        layoutByCell.set(key, {
            gridX: clampedX,
            gridZ: clampedZ,
            pieceId,
            rotation,
        });
        trimLayoutToLimit();
        applyLayout();
    }

    function removePieceAtCell(gridX, gridZ, options = {}) {
        const key = toCellKey(
            THREE.MathUtils.clamp(Math.round(gridX), -gridRange, gridRange),
            THREE.MathUtils.clamp(Math.round(gridZ), -gridRange, gridRange)
        );
        if (!layoutByCell.delete(key)) {
            return;
        }
        applyLayout(options.statusText || null);
    }

    function trimLayoutToLimit() {
        if (layoutByCell.size <= MAX_LAYOUT_ITEMS) {
            return;
        }
        const keysToDelete = layoutByCell.size - MAX_LAYOUT_ITEMS;
        const iterator = layoutByCell.keys();
        for (let i = 0; i < keysToDelete; i += 1) {
            const next = iterator.next();
            if (next.done) {
                break;
            }
            layoutByCell.delete(next.value);
        }
    }

    function applyLayout(statusText = null) {
        const layout = Array.from(layoutByCell.values()).sort((a, b) => {
            if (a.gridZ !== b.gridZ) {
                return a.gridZ - b.gridZ;
            }
            return a.gridX - b.gridX;
        });

        renderLayout(layout);
        persistLayout(layout);
        ui.setPieceCount(layout.length);
        requestMapRedraw();

        if (statusText) {
            onStatus?.(statusText);
            return;
        }

        onStatus?.(
            layout.length > 0
                ? `Map saved: ${layout.length} piece${layout.length === 1 ? '' : 's'}.`
                : 'Map saved: default city restored.'
        );
    }

    function renderLayout(layout = []) {
        builderLayer.clear();

        if (!layout.length) {
            setBaseCityVisible(true);
            restoreBaseObstacles();
            return;
        }

        setBaseCityVisible(false);
        staticObstacles.length = 0;

        for (let i = 0; i < layout.length; i += 1) {
            const entry = layout[i];
            const pieceGroup = createPieceGroup(entry, pieceAssets, gridSpacing, roadWidth);
            if (!pieceGroup) {
                continue;
            }
            pieceGroup.position.set(entry.gridX * gridSpacing, 0, entry.gridZ * gridSpacing);
            builderLayer.add(pieceGroup);
            addPieceObstacle(entry, staticObstacles, gridSpacing, roadWidth, pieceAssets);
        }
    }

    function restoreBaseObstacles() {
        staticObstacles.length = 0;
        staticObstacles.push(...cloneObstacles(baseObstacleSnapshot));
    }

    function setBaseCityVisible(visible) {
        const shouldShow = Boolean(visible);
        for (let i = 0; i < cityScenery.children.length; i += 1) {
            const child = cityScenery.children[i];
            if (child === builderLayer) {
                continue;
            }
            child.visible = shouldShow;
        }
    }

    function persistLayout(layout) {
        try {
            const payload = layout.map((entry) => ({
                gridX: entry.gridX,
                gridZ: entry.gridZ,
                pieceId: entry.pieceId,
                rotation: normalizeRotation(entry.rotation),
            }));
            window.localStorage.setItem(CITY_LAYOUT_STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // Ignore localStorage failures in restricted environments.
        }
    }

    function restoreLayoutFromStorage() {
        let parsed = null;
        try {
            const raw = window.localStorage.getItem(CITY_LAYOUT_STORAGE_KEY);
            if (raw) {
                parsed = JSON.parse(raw);
            }
        } catch {
            parsed = null;
        }

        if (!Array.isArray(parsed) || parsed.length === 0) {
            renderLayout([]);
            ui.setPieceCount(0);
            requestMapRedraw();
            return;
        }

        for (let i = 0; i < parsed.length; i += 1) {
            const entry = parsed[i];
            if (!entry || !PIECE_IDS.has(entry.pieceId)) {
                continue;
            }
            const gridX = THREE.MathUtils.clamp(
                Math.round(Number(entry.gridX) || 0),
                -gridRange,
                gridRange
            );
            const gridZ = THREE.MathUtils.clamp(
                Math.round(Number(entry.gridZ) || 0),
                -gridRange,
                gridRange
            );
            layoutByCell.set(toCellKey(gridX, gridZ), {
                gridX,
                gridZ,
                pieceId: entry.pieceId,
                rotation: normalizeRotation(entry.rotation),
            });
            if (layoutByCell.size >= MAX_LAYOUT_ITEMS) {
                break;
            }
        }

        const restoredLayout = Array.from(layoutByCell.values());
        renderLayout(restoredLayout);
        ui.setPieceCount(restoredLayout.length);
        requestMapRedraw();
    }
}

function createPieceSpriteAtlas({ pieces, pieceAssets, gridSpacing, roadWidth, spriteSize = 128 }) {
    return createFallbackPieceSpriteAtlas({ pieces, gridSpacing, roadWidth, spriteSize });
}

function createFallbackPieceSpriteAtlas({ pieces, gridSpacing, roadWidth, spriteSize }) {
    const atlas = new Map();

    for (let i = 0; i < pieces.length; i += 1) {
        const piece = pieces[i];
        for (let rotation = 0; rotation < 4; rotation += 1) {
            const spriteCanvas = document.createElement('canvas');
            spriteCanvas.width = spriteSize;
            spriteCanvas.height = spriteSize;
            const ctx = spriteCanvas.getContext('2d');
            drawFallbackPieceSprite(ctx, {
                pieceId: piece.id,
                rotation,
                size: spriteSize,
                gridSpacing,
                roadWidth,
            });
            atlas.set(toSpriteKey(piece.id, rotation), spriteCanvas);
        }
    }

    return {
        get(pieceId, rotation = 0) {
            return (
                atlas.get(toSpriteKey(pieceId, rotation)) ||
                atlas.get(toSpriteKey(pieceId, 0)) ||
                null
            );
        },
    };
}

function drawFallbackPieceSprite(ctx, { pieceId, rotation, size, gridSpacing, roadWidth }) {
    const center = size * 0.5;
    const roadRatio = THREE.MathUtils.clamp(roadWidth / gridSpacing, 0.25, 0.78);
    const roadW = size * roadRatio;
    const roadL = size * 1.08;

    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(normalizeRotation(rotation) * (Math.PI / 2));

    if (pieceId === 'road_straight') {
        drawRoadRect(ctx, -roadW * 0.5, -roadL * 0.5, roadW, roadL);
        drawLaneLine(ctx, 0, -roadL * 0.44, 0, roadL * 0.44);
    } else if (pieceId === 'road_intersection') {
        drawRoadRect(ctx, -roadW * 0.5, -roadL * 0.5, roadW, roadL);
        drawRoadRect(ctx, -roadL * 0.5, -roadW * 0.5, roadL, roadW);
        drawLaneLine(ctx, 0, -roadL * 0.44, 0, roadL * 0.44);
        drawLaneLine(ctx, -roadL * 0.44, 0, roadL * 0.44, 0);
    } else if (pieceId === 'road_curve') {
        drawRoadArc(ctx, size * 0.5 - roadW * 0.5, -Math.PI * 0.5, 0, roadW);
        drawLaneArc(ctx, size * 0.5 - roadW * 0.5, -Math.PI * 0.5, 0);
    } else if (pieceId === 'tree') {
        drawTree(ctx, size);
    } else if (pieceId === 'house_small') {
        drawHouse(ctx, size * 0.28, size * 0.28, '#5f7b9a', '#2c3f56');
    } else if (pieceId === 'house_tall') {
        drawHouse(ctx, size * 0.24, size * 0.33, '#5a7391', '#24364b');
    } else if (pieceId === 'house_wide') {
        drawHouse(ctx, size * 0.42, size * 0.25, '#6a86a6', '#2c4058');
    }

    ctx.restore();
}

function drawRoadRect(ctx, x, y, w, h) {
    const rounded = Math.max(3, Math.min(w, h) * 0.12);
    roundedRectPath(ctx, x, y, w, h, rounded);
    const asphalt = ctx.createLinearGradient(x, y, x, y + h);
    asphalt.addColorStop(0, '#3f5369');
    asphalt.addColorStop(1, '#2f4357');
    ctx.fillStyle = asphalt;
    ctx.fill();

    ctx.strokeStyle = 'rgba(177, 210, 236, 0.2)';
    ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.08);
    ctx.stroke();
}

function drawRoadArc(ctx, radius, startAngle, endAngle, roadWidthPx) {
    ctx.strokeStyle = '#364c62';
    ctx.lineCap = 'butt';
    ctx.lineWidth = roadWidthPx;
    ctx.beginPath();
    ctx.arc(0, 0, radius, startAngle, endAngle);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(177, 210, 236, 0.22)';
    ctx.lineWidth = Math.max(1, roadWidthPx * 0.08);
    ctx.beginPath();
    ctx.arc(0, 0, radius - roadWidthPx * 0.5 + 0.5, startAngle, endAngle);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius + roadWidthPx * 0.5 - 0.5, startAngle, endAngle);
    ctx.stroke();
}

function drawLaneLine(ctx, x1, y1, x2, y2) {
    ctx.strokeStyle = 'rgba(223, 237, 250, 0.82)';
    ctx.lineCap = 'round';
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawLaneArc(ctx, radius, startAngle, endAngle) {
    ctx.strokeStyle = 'rgba(223, 237, 250, 0.82)';
    ctx.lineCap = 'round';
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, startAngle, endAngle);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawTree(ctx, size) {
    const trunkW = size * 0.05;
    const trunkH = size * 0.11;
    ctx.fillStyle = '#6a4f39';
    roundedRectPath(ctx, -trunkW * 0.5, size * 0.04, trunkW, trunkH, trunkW * 0.3);
    ctx.fill();

    const canopy = ctx.createRadialGradient(
        0,
        -size * 0.08,
        size * 0.02,
        0,
        -size * 0.08,
        size * 0.18
    );
    canopy.addColorStop(0, '#52b377');
    canopy.addColorStop(1, '#1f6f47');
    ctx.fillStyle = canopy;
    ctx.beginPath();
    ctx.arc(0, -size * 0.08, size * 0.17, 0, Math.PI * 2);
    ctx.fill();
}

function drawHouse(ctx, width, depth, topColor, sideColor) {
    const x = -width * 0.5;
    const y = -depth * 0.5;

    const bodyGradient = ctx.createLinearGradient(x, y, x + width, y + depth);
    bodyGradient.addColorStop(0, topColor);
    bodyGradient.addColorStop(1, sideColor);

    roundedRectPath(ctx, x, y, width, depth, Math.max(3, Math.min(width, depth) * 0.15));
    ctx.fillStyle = bodyGradient;
    ctx.fill();

    ctx.strokeStyle = 'rgba(209, 231, 251, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const cols = Math.max(2, Math.round(width / 12));
    const rows = Math.max(2, Math.round(depth / 10));
    const gapX = width / (cols + 1);
    const gapY = depth / (rows + 1);
    ctx.fillStyle = 'rgba(244, 214, 164, 0.82)';
    for (let row = 1; row <= rows; row += 1) {
        for (let col = 1; col <= cols; col += 1) {
            const wx = x + col * gapX;
            const wy = y + row * gapY;
            ctx.fillRect(wx - 1.2, wy - 1.2, 2.4, 2.4);
        }
    }
}

function roundedRectPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width * 0.5, height * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function createMapGroundPattern() {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 120, 120);
    grad.addColorStop(0, '#243b55');
    grad.addColorStop(1, '#1b2d43');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 120, 120);

    for (let i = 0; i < 220; i += 1) {
        const x = Math.random() * 120;
        const y = Math.random() * 120;
        const value = 90 + Math.random() * 55;
        ctx.fillStyle = `rgba(${value}, ${value + 12}, ${value + 20}, 0.08)`;
        ctx.fillRect(x, y, 2.2, 2.2);
    }

    return canvas;
}

function createPieceAssets({ gridSpacing, roadWidth }) {
    const buildingWindowTexture = createBuildingWindowTexture();
    const cellRoadLength = gridSpacing * 0.94;
    const curveLegLength = gridSpacing * 0.5 + roadWidth * 0.5;
    const curveLegOffset = (gridSpacing * 0.5 - roadWidth * 0.5) * 0.5;
    const smallHouseSize = gridSpacing * 0.92;
    const smallHouseHeight = gridSpacing * 0.8;
    const tallHouseSize = gridSpacing * 0.86;
    const tallHouseHeight = gridSpacing * 1.6;
    const wideHouseWidth = gridSpacing * 1.2;
    const wideHouseDepth = gridSpacing * 0.9;
    const wideHouseHeight = gridSpacing * 0.86;
    const smallHouseCollision = gridSpacing * 1.04;
    const tallHouseCollision = gridSpacing * 1;
    const wideHouseCollisionLong = gridSpacing * 1.28;
    const wideHouseCollisionShort = gridSpacing * 1.04;

    return {
        roadMaterial: new THREE.MeshStandardMaterial({
            color: 0x30455d,
            emissive: 0x162536,
            emissiveIntensity: 0.26,
            roughness: 0.9,
            metalness: 0.06,
        }),
        laneMaterial: new THREE.MeshStandardMaterial({
            color: 0x8ca0b4,
            emissive: 0x30465e,
            emissiveIntensity: 0.18,
            roughness: 0.74,
            metalness: 0.08,
        }),
        treeTrunkMaterial: new THREE.MeshStandardMaterial({
            color: 0x5a4330,
            roughness: 0.94,
            metalness: 0.02,
        }),
        treeLeafMaterial: new THREE.MeshStandardMaterial({
            color: 0x2e8554,
            emissive: 0x173f2a,
            emissiveIntensity: 0.22,
            roughness: 0.88,
            metalness: 0.02,
        }),
        buildingMaterial: new THREE.MeshStandardMaterial({
            color: 0x31435b,
            map: buildingWindowTexture,
            emissive: 0x9fb4cd,
            emissiveMap: buildingWindowTexture,
            emissiveIntensity: 0.38,
            roughness: 0.86,
            metalness: 0.07,
        }),
        straightRoadGeometry: new THREE.PlaneGeometry(roadWidth, cellRoadLength),
        laneMarkGeometry: new THREE.PlaneGeometry(0.58, cellRoadLength * 0.86),
        intersectionGeometry: new THREE.PlaneGeometry(roadWidth, roadWidth),
        curveLegGeometry: new THREE.PlaneGeometry(roadWidth, curveLegLength),
        curveLegOffset,
        treeTrunkGeometry: new THREE.CylinderGeometry(0.38, 0.44, 2.7, 8),
        treeLeafGeometry: new THREE.ConeGeometry(1.52, 3.8, 9),
        smallHouseGeometry: new THREE.BoxGeometry(smallHouseSize, smallHouseHeight, smallHouseSize),
        tallHouseGeometry: new THREE.BoxGeometry(tallHouseSize, tallHouseHeight, tallHouseSize),
        wideHouseGeometry: new THREE.BoxGeometry(wideHouseWidth, wideHouseHeight, wideHouseDepth),
        smallHouseHeight,
        tallHouseHeight,
        wideHouseHeight,
        smallHouseCollision,
        tallHouseCollision,
        wideHouseCollisionLong,
        wideHouseCollisionShort,
    };
}

function createPieceGroup(entry, assets, _gridSpacing, _roadWidth) {
    const { pieceId, rotation } = entry;
    const quarterTurn = normalizeRotation(rotation) * (Math.PI / 2);

    if (pieceId === 'road_straight') {
        const group = new THREE.Group();
        const road = new THREE.Mesh(assets.straightRoadGeometry, assets.roadMaterial);
        road.rotation.x = -Math.PI / 2;
        road.position.y = ROAD_HEIGHT;

        const lane = new THREE.Mesh(assets.laneMarkGeometry, assets.laneMaterial);
        lane.rotation.x = -Math.PI / 2;
        lane.position.y = ROAD_HEIGHT + 0.004;

        group.add(road, lane);
        group.rotation.y = quarterTurn;
        return group;
    }

    if (pieceId === 'road_intersection') {
        const group = new THREE.Group();
        const patch = new THREE.Mesh(assets.intersectionGeometry, assets.roadMaterial);
        patch.rotation.x = -Math.PI / 2;
        patch.position.y = ROAD_HEIGHT;

        const laneV = new THREE.Mesh(assets.laneMarkGeometry, assets.laneMaterial);
        laneV.rotation.x = -Math.PI / 2;
        laneV.position.y = ROAD_HEIGHT + 0.004;
        laneV.scale.set(1, 0.58, 1);

        const laneH = laneV.clone();
        laneH.rotation.y = Math.PI / 2;

        group.add(patch, laneV, laneH);
        return group;
    }

    if (pieceId === 'road_curve') {
        const group = new THREE.Group();
        const legA = new THREE.Mesh(assets.curveLegGeometry, assets.roadMaterial);
        legA.rotation.x = -Math.PI / 2;
        legA.position.set(assets.curveLegOffset, ROAD_HEIGHT, 0);

        const legB = new THREE.Mesh(assets.curveLegGeometry, assets.roadMaterial);
        legB.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
        legB.position.set(0, ROAD_HEIGHT, assets.curveLegOffset);

        const laneA = new THREE.Mesh(assets.laneMarkGeometry, assets.laneMaterial);
        laneA.rotation.x = -Math.PI / 2;
        laneA.position.set(assets.curveLegOffset, ROAD_HEIGHT + 0.004, -2.5);
        laneA.scale.set(1, 0.52, 1);

        const laneB = laneA.clone();
        laneB.rotation.y = Math.PI / 2;
        laneB.position.set(-2.5, ROAD_HEIGHT + 0.004, assets.curveLegOffset);

        group.add(legA, legB, laneA, laneB);
        group.rotation.y = quarterTurn;
        return group;
    }

    if (pieceId === 'tree') {
        const group = new THREE.Group();
        const trunk = new THREE.Mesh(assets.treeTrunkGeometry, assets.treeTrunkMaterial);
        trunk.position.y = 1.35;

        const canopy = new THREE.Mesh(assets.treeLeafGeometry, assets.treeLeafMaterial);
        canopy.position.y = 3.55;

        group.add(trunk, canopy);
        group.rotation.y = hashToUnit(hashGrid(entry.gridX, entry.gridZ, 201)) * Math.PI * 2;
        return group;
    }

    if (pieceId === 'house_small') {
        const mesh = new THREE.Mesh(assets.smallHouseGeometry, assets.buildingMaterial);
        mesh.position.y = assets.smallHouseHeight * 0.5;
        return mesh;
    }

    if (pieceId === 'house_tall') {
        const mesh = new THREE.Mesh(assets.tallHouseGeometry, assets.buildingMaterial);
        mesh.position.y = assets.tallHouseHeight * 0.5;
        mesh.rotation.y = quarterTurn;
        return mesh;
    }

    if (pieceId === 'house_wide') {
        const mesh = new THREE.Mesh(assets.wideHouseGeometry, assets.buildingMaterial);
        mesh.position.y = assets.wideHouseHeight * 0.5;
        mesh.rotation.y = quarterTurn;
        return mesh;
    }

    return null;
}

function addPieceObstacle(entry, staticObstacles, gridSpacing, roadWidth, pieceAssets = null) {
    const centerX = entry.gridX * gridSpacing;
    const centerZ = entry.gridZ * gridSpacing;

    if (entry.pieceId === 'tree') {
        staticObstacles.push({
            type: 'circle',
            x: centerX,
            z: centerZ,
            radius: Math.max(1.3, roadWidth * 0.16),
            category: 'tree',
            source: OBSTACLE_SOURCE_CUSTOM,
        });
        return;
    }

    if (entry.pieceId === 'house_small') {
        const footprint = pieceAssets?.smallHouseCollision || Math.max(10.8, gridSpacing * 1.04);
        pushAabbObstacle(staticObstacles, centerX, centerZ, footprint, footprint, 'building');
        return;
    }

    if (entry.pieceId === 'house_tall') {
        const footprint = pieceAssets?.tallHouseCollision || Math.max(9.8, gridSpacing);
        pushAabbObstacle(staticObstacles, centerX, centerZ, footprint, footprint, 'building');
        return;
    }

    if (entry.pieceId === 'house_wide') {
        const swap = normalizeRotation(entry.rotation) % 2 === 1;
        const longSide = pieceAssets?.wideHouseCollisionLong || Math.max(17.8, gridSpacing * 1.28);
        const shortSide =
            pieceAssets?.wideHouseCollisionShort || Math.max(10.8, gridSpacing * 1.04);
        const width = swap ? shortSide : longSide;
        const depth = swap ? longSide : shortSide;
        pushAabbObstacle(staticObstacles, centerX, centerZ, width, depth, 'building');
    }
}

function pushAabbObstacle(staticObstacles, centerX, centerZ, width, depth, category) {
    const halfWidth = Math.max(0.4, width * 0.5 + 0.26);
    const halfDepth = Math.max(0.4, depth * 0.5 + 0.26);
    staticObstacles.push({
        type: 'aabb',
        minX: centerX - halfWidth,
        maxX: centerX + halfWidth,
        minZ: centerZ - halfDepth,
        maxZ: centerZ + halfDepth,
        category,
        source: OBSTACLE_SOURCE_CUSTOM,
    });
}

function ensureBuilderLayer(cityScenery) {
    let layer = cityScenery.getObjectByName(BUILDER_LAYER_NAME);
    if (layer) {
        return layer;
    }
    layer = new THREE.Group();
    layer.name = BUILDER_LAYER_NAME;
    cityScenery.add(layer);
    return layer;
}

function createCityBuilderUi({
    pieces = [],
    getSprite,
    onClose,
    onClear,
    onSelectPiece,
    onPalettePointerDown,
    onRotateLeft,
    onRotateRight,
    onToggleErase,
} = {}) {
    const root = document.createElement('section');
    root.id = 'cityBuilderPanel';
    root.hidden = true;
    root.innerHTML = `
        <div class="cityBuilderHeader">
            <div>
                <div class="cityBuilderTitle">MAP BUILDER</div>
                <div class="cityBuilderHint">Drag piece icons to map. R rotates. X erase mode. B or Esc closes.</div>
            </div>
            <button type="button" class="cityBuilderCloseBtn" data-action="close">CLOSE</button>
        </div>
        <div class="cityBuilderWorkspace">
            <div class="cityBuilderPalette" data-role="piece-grid"></div>
            <div class="cityBuilderMapWrap">
                <canvas class="cityBuilderMapCanvas" data-role="map-canvas" width="720" height="720"></canvas>
                <canvas class="cityBuilderActivePreview" data-role="active-preview" width="88" height="88"></canvas>
            </div>
        </div>
        <div class="cityBuilderFooter">
            <div class="cityBuilderTools">
                <button type="button" class="cityBuilderToolBtn" data-action="rotate-left" aria-label="Rotate left">ROT -90</button>
                <button type="button" class="cityBuilderToolBtn" data-action="rotate-right" aria-label="Rotate right">ROT +90</button>
                <button type="button" class="cityBuilderToolBtn" data-action="toggle-erase" aria-label="Toggle erase">ERASE</button>
                <button type="button" class="cityBuilderToolBtn" data-action="clear" aria-label="Clear map">CLEAR</button>
            </div>
            <div class="cityBuilderMeta">
                <span data-role="rotation">0 deg</span>
                <span data-role="cell">--</span>
                <span data-role="count">0</span>
            </div>
        </div>
        <canvas class="cityBuilderDragGhost" data-role="drag-ghost" width="96" height="96" hidden></canvas>
    `;

    document.body.appendChild(root);

    const closeBtn = root.querySelector('[data-action="close"]');
    const clearBtn = root.querySelector('[data-action="clear"]');
    const toggleEraseBtn = root.querySelector('[data-action="toggle-erase"]');
    const rotateLeftBtn = root.querySelector('[data-action="rotate-left"]');
    const rotateRightBtn = root.querySelector('[data-action="rotate-right"]');
    const pieceGrid = root.querySelector('[data-role="piece-grid"]');
    const rotationLabel = root.querySelector('[data-role="rotation"]');
    const cellLabel = root.querySelector('[data-role="cell"]');
    const countLabel = root.querySelector('[data-role="count"]');
    const mapCanvas = root.querySelector('[data-role="map-canvas"]');
    const activePreviewCanvas = root.querySelector('[data-role="active-preview"]');
    const activePreviewCtx = activePreviewCanvas.getContext('2d');
    const dragGhostCanvas = root.querySelector('[data-role="drag-ghost"]');
    const dragGhostCtx = dragGhostCanvas.getContext('2d');

    const pieceButtons = new Map();

    pieces.forEach((piece, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cityBuilderPieceBtn';
        button.setAttribute('aria-label', `Piece ${index + 1}`);

        const iconCanvas = document.createElement('canvas');
        iconCanvas.className = 'cityBuilderPieceIcon';
        iconCanvas.width = 88;
        iconCanvas.height = 88;

        const indexBadge = document.createElement('span');
        indexBadge.className = 'cityBuilderPieceIndex';
        indexBadge.textContent = String(index + 1);

        const iconCtx = iconCanvas.getContext('2d');
        const sprite = getSprite?.(piece.id, 0);
        if (sprite) {
            iconCtx.clearRect(0, 0, iconCanvas.width, iconCanvas.height);
            iconCtx.drawImage(sprite, 0, 0, iconCanvas.width, iconCanvas.height);
        }

        button.appendChild(iconCanvas);
        button.appendChild(indexBadge);
        button.addEventListener('click', () => onSelectPiece?.(piece.id));
        button.addEventListener('pointerdown', (event) => onPalettePointerDown?.(event, piece.id));
        button.addEventListener('dragstart', (event) => event.preventDefault());

        pieceGrid?.appendChild(button);
        pieceButtons.set(piece.id, button);
    });

    closeBtn?.addEventListener('click', () => onClose?.());
    clearBtn?.addEventListener('click', () => onClear?.());
    toggleEraseBtn?.addEventListener('click', () => onToggleErase?.());
    rotateLeftBtn?.addEventListener('click', () => onRotateLeft?.());
    rotateRightBtn?.addEventListener('click', () => onRotateRight?.());

    return {
        mapCanvas,
        setVisible(isVisible) {
            root.hidden = !isVisible;
        },
        setSelectedPiece(pieceId) {
            pieceButtons.forEach((button, id) => {
                button.classList.toggle('active', id === pieceId);
            });
        },
        setRotation(quarterTurns) {
            if (rotationLabel) {
                rotationLabel.textContent = `${normalizeRotation(quarterTurns) * 90} deg`;
            }
        },
        setCellLabel(cellText) {
            if (cellLabel) {
                cellLabel.textContent = cellText;
            }
        },
        setPieceCount(count) {
            if (countLabel) {
                countLabel.textContent = `${Number.isFinite(count) ? count : 0}`;
            }
        },
        setEraseActive(active) {
            toggleEraseBtn?.classList.toggle('active', Boolean(active));
        },
        setActivePreview(sprite) {
            if (!activePreviewCtx) {
                return;
            }
            activePreviewCtx.clearRect(0, 0, activePreviewCanvas.width, activePreviewCanvas.height);
            if (!sprite) {
                return;
            }
            activePreviewCtx.drawImage(
                sprite,
                0,
                0,
                activePreviewCanvas.width,
                activePreviewCanvas.height
            );
        },
        showDragGhost(sprite, clientX, clientY) {
            if (!sprite || !dragGhostCtx) {
                return;
            }
            dragGhostCanvas.hidden = false;
            dragGhostCtx.clearRect(0, 0, dragGhostCanvas.width, dragGhostCanvas.height);
            dragGhostCtx.drawImage(sprite, 0, 0, dragGhostCanvas.width, dragGhostCanvas.height);
            this.moveDragGhost(clientX, clientY);
        },
        moveDragGhost(clientX, clientY) {
            const offset = dragGhostCanvas.width * 0.5;
            dragGhostCanvas.style.left = `${Math.round(clientX - offset)}px`;
            dragGhostCanvas.style.top = `${Math.round(clientY - offset)}px`;
        },
        hideDragGhost() {
            dragGhostCanvas.hidden = true;
        },
    };
}

function cloneObstacles(obstacles = []) {
    return obstacles.map((obstacle) => ({ ...obstacle }));
}

function toCellKey(gridX, gridZ) {
    return `${gridX},${gridZ}`;
}

function toSpriteKey(pieceId, rotation) {
    return `${pieceId}:${normalizeRotation(rotation)}`;
}

function normalizeRotation(value) {
    const normalized = Math.round(Number(value) || 0);
    return ((normalized % 4) + 4) % 4;
}

function normalizeKey(rawKey) {
    const lowered = String(rawKey || '').toLowerCase();
    if (lowered === ' ' || lowered === 'spacebar') {
        return 'space';
    }
    return lowered;
}

function isBuilderRelevantKey(key) {
    return (
        key === 'arrowup' ||
        key === 'arrowdown' ||
        key === 'arrowleft' ||
        key === 'arrowright' ||
        key === 'w' ||
        key === 'a' ||
        key === 's' ||
        key === 'd' ||
        key === 'space' ||
        key === 'q' ||
        key === 'm' ||
        key === 'tab' ||
        key === '1' ||
        key === '2' ||
        key === '3' ||
        key === '4' ||
        key === '5' ||
        key === '6' ||
        key === '7' ||
        key === 'c' ||
        key === 'v' ||
        key === 'k' ||
        key === 'enter' ||
        key === 'e' ||
        key === 'r' ||
        key === '[' ||
        key === ']' ||
        key === 'delete' ||
        key === 'backspace' ||
        key === 'x'
    );
}

function hashGrid(gridX, gridZ, salt) {
    let hash = (gridX * 374761393 + gridZ * 668265263 + salt * 1442695041) | 0;
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    hash ^= hash >>> 16;
    return hash >>> 0;
}

function hashToUnit(value) {
    return value / 4294967295;
}

function createBuildingWindowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');

    const facadeGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    facadeGradient.addColorStop(0, '#24334b');
    facadeGradient.addColorStop(1, '#182438');
    ctx.fillStyle = facadeGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cols = 6;
    const rows = 12;
    const marginX = 14;
    const marginY = 12;
    const gapX = 8;
    const gapY = 10;
    const cellW = (canvas.width - marginX * 2 - gapX * (cols - 1)) / cols;
    const cellH = (canvas.height - marginY * 2 - gapY * (rows - 1)) / rows;

    for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
            const px = marginX + x * (cellW + gapX);
            const py = marginY + y * (cellH + gapY);
            const lit = Math.random() < 0.58;
            ctx.fillStyle = lit ? 'rgba(255, 223, 160, 0.9)' : 'rgba(82, 112, 162, 0.22)';
            ctx.fillRect(px, py, cellW, cellH);
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    return texture;
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
