const MINIMAP_RANGE_NEAR_M = 24;
const MINIMAP_RANGE_FAR_M = 44;
const MINIMAP_SPEED_FOR_MAX_RANGE_KPH = 74;
const MINIMAP_MAX_DPR = 2;
const WORLD_MAP_MAX_DPR = 2;
const WORLD_MAP_ZOOM_MIN_FACTOR = 0.35;
const WORLD_MAP_ZOOM_MAX_FACTOR = 8;
const WORLD_MAP_ZOOM_STEP = 1.12;
const WORLD_MAP_LOCK_OVERVIEW = true;
const WORLD_MAP_OVERVIEW_UNIT_PADDING = 12;
const WORLD_MAP_OVERVIEW_VIEWPORT_FILL = 0.84;

export function createMapUiController(options = {}) {
    const dom = resolveDom();
    if (!dom.ready) {
        return createNoopController();
    }

    const worldBounds = resolveWorldBounds(options.worldBounds);
    const cityMapLayout = resolveCityMapLayout(options.cityMapLayout);
    const staticFeatures = buildStaticFeatures(
        Array.isArray(options.staticObstacles) ? options.staticObstacles : []
    );
    const chargingZones = normalizeChargingZones(options.chargingZones);
    const overviewBounds = resolveOverviewBounds({
        worldBounds,
        cityMapLayout,
        staticFeatures,
        chargingZones,
    });
    const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};

    const state = {
        expanded: false,
        followPlayer: false,
        centerX: 0,
        centerZ: 0,
        zoom: 1,
        fitZoom: 1,
        minZoom: 0.2,
        maxZoom: 6,
        pointer: {
            active: false,
            id: null,
            button: 0,
            startX: 0,
            startY: 0,
            startCenterX: 0,
            startCenterZ: 0,
            moved: false,
        },
        waypoint: null,
        routePoints: [],
        player: {
            x: 0,
            z: 0,
            heading: 0,
            speedKph: 0,
        },
        overlays: {
            welcomeVisible: false,
            raceIntroActive: false,
            editModeActive: false,
        },
        mode: 'bots',
        pickups: [],
        vehicles: [],
        mines: [],
        routeDistanceMeters: null,
        filters: {
            roads: true,
            buildings: true,
            pickups: true,
            vehicles: true,
            mines: true,
            charging: true,
            trees: false,
            lamps: false,
        },
    };

    initializeFilterInputs(state.filters, dom);
    bindDomEvents();
    refreshCanvasSizes(true);
    renderLegend();
    updateMetaLabels();
    setExpanded(false, { announce: false, force: true });

    return {
        update,
        toggleExpanded,
        isExpanded() {
            return state.expanded;
        },
        closeExpanded(options = {}) {
            setExpanded(false, {
                announce: options.announce !== false,
            });
        },
        clearWaypoint(options = {}) {
            if (!state.waypoint) {
                return false;
            }
            state.waypoint = null;
            state.routePoints = [];
            state.routeDistanceMeters = null;
            if (options.announce !== false) {
                onStatus('Waypoint cleared.', 1400);
            }
            updateMetaLabels();
            renderLegend();
            return true;
        },
        getWaypoint() {
            return state.waypoint ? { ...state.waypoint } : null;
        },
        dispose,
    };

    function update(deltaTime = 1 / 60, frameState = {}) {
        syncFrameState(frameState);

        if (state.overlays.welcomeVisible) {
            dom.miniMapHud.hidden = true;
            if (state.expanded) {
                setExpanded(false, { announce: false });
            }
            return;
        }

        const minimapVisible = !state.overlays.raceIntroActive && !state.overlays.editModeActive;
        dom.miniMapHud.hidden = !minimapVisible;

        if (
            state.followPlayer ||
            !Number.isFinite(state.centerX) ||
            !Number.isFinite(state.centerZ)
        ) {
            state.centerX = state.player.x;
            state.centerZ = state.player.z;
        }

        refreshCanvasSizes();
        rebuildRoute();

        if (minimapVisible) {
            drawMinimap(deltaTime);
        }
        if (state.expanded) {
            drawWorldMap(deltaTime);
        }

        updateMetaLabels();
        renderLegend();
    }

    function toggleExpanded(forceState = null) {
        const nextExpanded = forceState == null ? !state.expanded : Boolean(forceState);
        if (nextExpanded === state.expanded) {
            return {
                open: state.expanded,
                message: state.expanded ? 'Map already open.' : 'Map already closed.',
            };
        }

        setExpanded(nextExpanded, { announce: true });
        return {
            open: state.expanded,
            message: state.expanded ? 'World map opened.' : 'World map closed.',
        };
    }

    function setExpanded(nextExpanded, { announce = true, force = false } = {}) {
        const expanded = Boolean(nextExpanded);
        if (!force && state.expanded === expanded) {
            return;
        }

        state.expanded = expanded;
        dom.worldMapOverlay.hidden = !expanded;
        document.body.classList.toggle('world-map-open', expanded);

        if (expanded) {
            refreshCanvasSizes(true);
            if (WORLD_MAP_LOCK_OVERVIEW) {
                fitWorldOverview();
            } else {
                state.followPlayer = true;
                state.centerX = state.player.x;
                state.centerZ = state.player.z;
            }
            drawWorldMap(1 / 60);
            if (announce) {
                onStatus('World map opened. Full city overview enabled.', 1800);
            }
            return;
        }

        if (announce) {
            onStatus('World map closed.', 1200);
        }
    }

    function syncFrameState(frameState = {}) {
        const playerPoint = normalizeWorldPoint(frameState.playerPosition, state.player);
        state.player.x = playerPoint.x;
        state.player.z = playerPoint.z;
        state.player.heading = normalizeAngle(Number(frameState.playerHeading) || 0);
        state.player.speedKph = Math.max(0, Number(frameState.playerSpeedKph) || 0);

        state.mode = frameState.gameMode === 'online' ? 'online' : 'bots';
        state.overlays.welcomeVisible = Boolean(frameState.welcomeVisible);
        state.overlays.raceIntroActive = Boolean(frameState.raceIntroActive);
        state.overlays.editModeActive = Boolean(frameState.editModeActive);

        state.pickups = normalizePickups(frameState.pickups);
        state.vehicles = normalizeVehicles(frameState.botDescriptors, frameState.remotePlayers);
        state.mines = normalizeMines(frameState.mines);
    }

    function rebuildRoute() {
        if (!state.waypoint) {
            state.routePoints = [];
            state.routeDistanceMeters = null;
            return;
        }

        const routePoints = buildRoadRoute(
            { x: state.player.x, z: state.player.z },
            state.waypoint,
            cityMapLayout,
            worldBounds
        );
        state.routePoints = routePoints;
        state.routeDistanceMeters = computePathDistance(routePoints);
    }

    function drawMinimap(_deltaTime) {
        const canvas = dom.miniMapCanvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        const width = canvas.width;
        const height = canvas.height;
        const panelPadding = Math.max(7, Math.round(width * 0.03));
        const mapRect = {
            x: panelPadding,
            y: panelPadding,
            w: width - panelPadding * 2,
            h: height - panelPadding * 2,
        };

        ctx.clearRect(0, 0, width, height);
        drawRoundedPanel(ctx, mapRect.x, mapRect.y, mapRect.w, mapRect.h, Math.round(width * 0.06));

        const rangeMeters = resolveMinimapRange(state.player.speedKph);
        const zoom = Math.min(mapRect.w, mapRect.h) / (rangeMeters * 2);
        const centerX = mapRect.x + mapRect.w * 0.5;
        const centerY = mapRect.y + mapRect.h * 0.5;

        ctx.save();
        clipRoundedRect(ctx, mapRect.x, mapRect.y, mapRect.w, mapRect.h, Math.round(width * 0.06));
        ctx.translate(centerX, centerY);
        ctx.rotate(state.player.heading);

        if (state.filters.roads) {
            drawRoadBands(ctx, {
                mode: 'minimap',
                zoom,
                centerX: state.player.x,
                centerZ: state.player.z,
                range: rangeMeters,
                worldBounds,
                cityMapLayout,
            });
        }

        if (state.filters.buildings) {
            drawBuildingFootprints(ctx, {
                mode: 'minimap',
                zoom,
                centerX: state.player.x,
                centerZ: state.player.z,
                range: rangeMeters,
                buildings: staticFeatures.buildings,
            });
        }

        if (state.filters.trees) {
            drawCircleObstacles(ctx, {
                mode: 'minimap',
                zoom,
                centerX: state.player.x,
                centerZ: state.player.z,
                range: rangeMeters,
                circles: staticFeatures.trees,
                color: 'rgba(92, 150, 112, 0.74)',
            });
        }

        if (state.filters.lamps) {
            drawCircleObstacles(ctx, {
                mode: 'minimap',
                zoom,
                centerX: state.player.x,
                centerZ: state.player.z,
                range: rangeMeters,
                circles: staticFeatures.lamps,
                color: 'rgba(223, 194, 128, 0.78)',
            });
        }

        if (state.filters.charging) {
            drawChargingZones(ctx, {
                mode: 'minimap',
                zoom,
                centerX: state.player.x,
                centerZ: state.player.z,
                range: rangeMeters,
                chargingZones,
            });
        }

        if (state.routePoints.length >= 2) {
            drawRouteLine(ctx, {
                mode: 'minimap',
                zoom,
                centerX: state.player.x,
                centerZ: state.player.z,
                range: rangeMeters,
                routePoints: state.routePoints,
            });
        }

        if (state.filters.pickups) {
            drawPickupMarkers(ctx, {
                mode: 'minimap',
                zoom,
                centerX: state.player.x,
                centerZ: state.player.z,
                range: rangeMeters,
                pickups: state.pickups,
            });
        }

        if (state.filters.vehicles) {
            drawVehicleMarkers(ctx, {
                mode: 'minimap',
                zoom,
                centerX: state.player.x,
                centerZ: state.player.z,
                range: rangeMeters,
                vehicles: state.vehicles,
            });
        }

        if (state.filters.mines) {
            drawMineMarkers(ctx, {
                mode: 'minimap',
                zoom,
                centerX: state.player.x,
                centerZ: state.player.z,
                range: rangeMeters,
                mines: state.mines,
            });
        }

        if (state.waypoint) {
            drawWaypointMarker(ctx, {
                mode: 'minimap',
                zoom,
                centerX: state.player.x,
                centerZ: state.player.z,
                range: rangeMeters,
                waypoint: state.waypoint,
            });
        }

        drawMinimapGrid(ctx, rangeMeters, zoom);
        ctx.restore();

        drawPlayerArrow(ctx, centerX, centerY, 0, Math.max(8, Math.round(width * 0.034)), {
            fillColor: '#ecf8ff',
            strokeColor: 'rgba(122, 211, 255, 0.95)',
        });

        drawCompassTicks(ctx, mapRect);
    }

    function drawWorldMap(_deltaTime) {
        if (WORLD_MAP_LOCK_OVERVIEW) {
            fitWorldOverview();
        }

        const canvas = dom.worldMapCanvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        const width = canvas.width;
        const height = canvas.height;
        const centerScreenX = width * 0.5;
        const centerScreenY = height * 0.5;

        ctx.clearRect(0, 0, width, height);

        const gridAlpha = Math.max(0.05, Math.min(0.22, state.zoom * 0.04));
        drawWorldBackgroundGrid(ctx, {
            width,
            height,
            centerX: state.centerX,
            centerZ: state.centerZ,
            zoom: state.zoom,
            alpha: gridAlpha,
        });
        ctx.save();
        ctx.translate(centerScreenX, centerScreenY);

        if (state.filters.roads) {
            drawRoadBands(ctx, {
                mode: 'full',
                zoom: state.zoom,
                centerX: state.centerX,
                centerZ: state.centerZ,
                range: null,
                worldBounds,
                cityMapLayout,
            });
        }

        if (state.filters.buildings) {
            drawBuildingFootprints(ctx, {
                mode: 'full',
                zoom: state.zoom,
                centerX: state.centerX,
                centerZ: state.centerZ,
                range: null,
                buildings: staticFeatures.buildings,
            });
        }

        if (state.filters.trees) {
            drawCircleObstacles(ctx, {
                mode: 'full',
                zoom: state.zoom,
                centerX: state.centerX,
                centerZ: state.centerZ,
                range: null,
                circles: staticFeatures.trees,
                color: 'rgba(92, 150, 112, 0.72)',
            });
        }

        if (state.filters.lamps) {
            drawCircleObstacles(ctx, {
                mode: 'full',
                zoom: state.zoom,
                centerX: state.centerX,
                centerZ: state.centerZ,
                range: null,
                circles: staticFeatures.lamps,
                color: 'rgba(223, 194, 128, 0.76)',
            });
        }

        if (state.filters.charging) {
            drawChargingZones(ctx, {
                mode: 'full',
                zoom: state.zoom,
                centerX: state.centerX,
                centerZ: state.centerZ,
                range: null,
                chargingZones,
            });
        }

        if (state.routePoints.length >= 2) {
            drawRouteLine(ctx, {
                mode: 'full',
                zoom: state.zoom,
                centerX: state.centerX,
                centerZ: state.centerZ,
                range: null,
                routePoints: state.routePoints,
            });
        }

        if (state.filters.pickups) {
            drawPickupMarkers(ctx, {
                mode: 'full',
                zoom: state.zoom,
                centerX: state.centerX,
                centerZ: state.centerZ,
                range: null,
                pickups: state.pickups,
            });
        }

        if (state.filters.vehicles) {
            drawVehicleMarkers(ctx, {
                mode: 'full',
                zoom: state.zoom,
                centerX: state.centerX,
                centerZ: state.centerZ,
                range: null,
                vehicles: state.vehicles,
            });
        }

        if (state.filters.mines) {
            drawMineMarkers(ctx, {
                mode: 'full',
                zoom: state.zoom,
                centerX: state.centerX,
                centerZ: state.centerZ,
                range: null,
                mines: state.mines,
            });
        }

        if (state.waypoint) {
            drawWaypointMarker(ctx, {
                mode: 'full',
                zoom: state.zoom,
                centerX: state.centerX,
                centerZ: state.centerZ,
                range: null,
                waypoint: state.waypoint,
            });
        }

        drawPlayerArrow(
            ctx,
            (state.player.x - state.centerX) * state.zoom,
            (state.player.z - state.centerZ) * state.zoom,
            -state.player.heading,
            Math.max(9, Math.round(state.zoom * 0.56)),
            {
                fillColor: '#ffffff',
                strokeColor: 'rgba(130, 216, 255, 0.95)',
            }
        );
        ctx.restore();

        drawWorldFrame(ctx, {
            width,
            height,
            worldBounds,
            centerX: state.centerX,
            centerZ: state.centerZ,
            zoom: state.zoom,
        });
    }

    function drawRoadBands(
        ctx,
        { mode, zoom, centerX, centerZ, range, worldBounds, cityMapLayout }
    ) {
        const xLines = cityMapLayout.roadAxisLinesX;
        const zLines = cityMapLayout.roadAxisLinesZ;
        const zMin = worldBounds.minZ;
        const zMax = worldBounds.maxZ;
        const xMin = worldBounds.minX;
        const xMax = worldBounds.maxX;

        ctx.fillStyle = mode === 'full' ? 'rgba(86, 114, 144, 0.7)' : 'rgba(108, 138, 169, 0.84)';

        for (let i = 0; i < xLines.length; i += 1) {
            const line = xLines[i];
            if (!Number.isFinite(line?.coord) || !Number.isFinite(line?.roadWidth)) {
                continue;
            }
            if (
                Number.isFinite(range) &&
                Math.abs(line.coord - centerX) > range + Math.max(2, line.roadWidth)
            ) {
                continue;
            }
            fillWorldQuad(ctx, centerX, centerZ, zoom, [
                { x: line.coord - line.roadWidth * 0.5, z: zMin },
                { x: line.coord + line.roadWidth * 0.5, z: zMin },
                { x: line.coord + line.roadWidth * 0.5, z: zMax },
                { x: line.coord - line.roadWidth * 0.5, z: zMax },
            ]);
        }

        for (let i = 0; i < zLines.length; i += 1) {
            const line = zLines[i];
            if (!Number.isFinite(line?.coord) || !Number.isFinite(line?.roadWidth)) {
                continue;
            }
            if (
                Number.isFinite(range) &&
                Math.abs(line.coord - centerZ) > range + Math.max(2, line.roadWidth)
            ) {
                continue;
            }
            fillWorldQuad(ctx, centerX, centerZ, zoom, [
                { x: xMin, z: line.coord - line.roadWidth * 0.5 },
                { x: xMax, z: line.coord - line.roadWidth * 0.5 },
                { x: xMax, z: line.coord + line.roadWidth * 0.5 },
                { x: xMin, z: line.coord + line.roadWidth * 0.5 },
            ]);
        }
    }

    function drawBuildingFootprints(ctx, { mode, zoom, centerX, centerZ, range, buildings }) {
        ctx.fillStyle = mode === 'full' ? 'rgba(36, 50, 68, 0.9)' : 'rgba(32, 44, 60, 0.92)';
        ctx.strokeStyle =
            mode === 'full' ? 'rgba(144, 182, 217, 0.32)' : 'rgba(138, 174, 205, 0.42)';
        ctx.lineWidth = 1;

        for (let i = 0; i < buildings.length; i += 1) {
            const building = buildings[i];
            if (Number.isFinite(range)) {
                if (building.maxX < centerX - range || building.minX > centerX + range) {
                    continue;
                }
                if (building.maxZ < centerZ - range || building.minZ > centerZ + range) {
                    continue;
                }
            }
            strokeAndFillWorldQuad(ctx, centerX, centerZ, zoom, [
                { x: building.minX, z: building.minZ },
                { x: building.maxX, z: building.minZ },
                { x: building.maxX, z: building.maxZ },
                { x: building.minX, z: building.maxZ },
            ]);
        }
    }

    function drawCircleObstacles(ctx, { mode, zoom, centerX, centerZ, range, circles, color }) {
        ctx.fillStyle = color;
        const minRadiusPx = mode === 'full' ? 0.8 : 0.7;
        for (let i = 0; i < circles.length; i += 1) {
            const circle = circles[i];
            if (Number.isFinite(range)) {
                if (Math.abs(circle.x - centerX) > range + circle.radius) {
                    continue;
                }
                if (Math.abs(circle.z - centerZ) > range + circle.radius) {
                    continue;
                }
            }
            const px = (circle.x - centerX) * zoom;
            const py = (circle.z - centerZ) * zoom;
            const radius = Math.max(minRadiusPx, circle.radius * zoom);
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawChargingZones(ctx, { mode, zoom, centerX, centerZ, range, chargingZones }) {
        ctx.strokeStyle =
            mode === 'full' ? 'rgba(126, 230, 202, 0.82)' : 'rgba(130, 242, 212, 0.86)';
        ctx.lineWidth = mode === 'full' ? 1.3 : 1.1;
        for (let i = 0; i < chargingZones.length; i += 1) {
            const zone = chargingZones[i];
            if (Number.isFinite(range)) {
                if (Math.abs(zone.x - centerX) > range + zone.radius) {
                    continue;
                }
                if (Math.abs(zone.z - centerZ) > range + zone.radius) {
                    continue;
                }
            }
            const px = (zone.x - centerX) * zoom;
            const py = (zone.z - centerZ) * zoom;
            const radius = Math.max(2.5, zone.radius * zoom);
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    function drawRouteLine(ctx, { mode, zoom, centerX, centerZ, range, routePoints }) {
        if (!Array.isArray(routePoints) || routePoints.length < 2) {
            return;
        }

        ctx.save();
        ctx.strokeStyle =
            mode === 'full' ? 'rgba(152, 228, 255, 0.96)' : 'rgba(178, 238, 255, 0.95)';
        ctx.lineWidth = mode === 'full' ? 3 : 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash(mode === 'full' ? [8, 6] : [6, 4]);

        let started = false;
        for (let i = 0; i < routePoints.length; i += 1) {
            const point = routePoints[i];
            if (!isWorldPointVisible(point, centerX, centerZ, range)) {
                continue;
            }
            const px = (point.x - centerX) * zoom;
            const py = (point.z - centerZ) * zoom;
            if (!started) {
                ctx.beginPath();
                ctx.moveTo(px, py);
                started = true;
            } else {
                ctx.lineTo(px, py);
            }
        }

        if (started) {
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawPickupMarkers(ctx, { mode, zoom, centerX, centerZ, range, pickups }) {
        for (let i = 0; i < pickups.length; i += 1) {
            const pickup = pickups[i];
            if (!isWorldPointVisible(pickup, centerX, centerZ, range)) {
                continue;
            }
            const px = (pickup.x - centerX) * zoom;
            const py = (pickup.z - centerZ) * zoom;
            const radius = mode === 'full' ? 4.8 : 3.7;
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fillStyle = pickup.color;
            ctx.fill();
            ctx.lineWidth = pickup.isTarget ? 1.6 : 1;
            ctx.strokeStyle = pickup.isTarget
                ? 'rgba(237, 251, 255, 0.98)'
                : 'rgba(215, 236, 255, 0.52)';
            ctx.stroke();
        }
    }

    function drawVehicleMarkers(ctx, { mode, zoom, centerX, centerZ, range, vehicles }) {
        for (let i = 0; i < vehicles.length; i += 1) {
            const vehicle = vehicles[i];
            if (!isWorldPointVisible(vehicle, centerX, centerZ, range)) {
                continue;
            }
            const px = (vehicle.x - centerX) * zoom;
            const py = (vehicle.z - centerZ) * zoom;
            if (vehicle.type === 'player') {
                drawDiamond(
                    ctx,
                    px,
                    py,
                    mode === 'full' ? 6.1 : 4.8,
                    '#ffd092',
                    'rgba(255, 232, 196, 0.95)'
                );
            } else {
                drawDiamond(
                    ctx,
                    px,
                    py,
                    mode === 'full' ? 5.4 : 4.4,
                    '#99daff',
                    'rgba(214, 241, 255, 0.92)'
                );
            }
        }
    }

    function drawMineMarkers(ctx, { mode, zoom, centerX, centerZ, range, mines }) {
        for (let i = 0; i < mines.length; i += 1) {
            const mine = mines[i];
            if (!isWorldPointVisible(mine, centerX, centerZ, range)) {
                continue;
            }
            const px = (mine.x - centerX) * zoom;
            const py = (mine.z - centerZ) * zoom;
            const size = mode === 'full' ? 5.2 : 4.2;
            drawCrossMarker(
                ctx,
                px,
                py,
                size,
                mine.armed ? 'rgba(255, 120, 120, 0.96)' : 'rgba(255, 199, 133, 0.9)',
                mine.armed ? 1.8 : 1.4
            );
        }
    }

    function drawWaypointMarker(ctx, { mode, zoom, centerX, centerZ, range, waypoint }) {
        if (!waypoint || !isWorldPointVisible(waypoint, centerX, centerZ, range)) {
            return;
        }
        const px = (waypoint.x - centerX) * zoom;
        const py = (waypoint.z - centerZ) * zoom;
        const outerRadius = mode === 'full' ? 8 : 6;
        const innerRadius = mode === 'full' ? 3.6 : 2.8;

        ctx.beginPath();
        ctx.arc(px, py, outerRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 236, 162, 0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, innerRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 216, 112, 0.95)';
        ctx.fill();
    }

    function drawMinimapGrid(ctx, range, zoom) {
        const gridStep = 8;
        const minCoord = -Math.ceil(range / gridStep) * gridStep;
        const maxCoord = Math.ceil(range / gridStep) * gridStep;
        ctx.strokeStyle = 'rgba(164, 202, 233, 0.13)';
        ctx.lineWidth = 1;
        for (let x = minCoord; x <= maxCoord; x += gridStep) {
            ctx.beginPath();
            ctx.moveTo(x * zoom, -range * zoom);
            ctx.lineTo(x * zoom, range * zoom);
            ctx.stroke();
        }
        for (let z = minCoord; z <= maxCoord; z += gridStep) {
            const y = z * zoom;
            ctx.beginPath();
            ctx.moveTo(-range * zoom, y);
            ctx.lineTo(range * zoom, y);
            ctx.stroke();
        }
    }

    function drawWorldBackgroundGrid(ctx, { width, height, centerX, centerZ, zoom, alpha }) {
        ctx.fillStyle = 'rgba(6, 13, 24, 0.96)';
        ctx.fillRect(0, 0, width, height);

        const gridStep = 8;
        const worldSpanX = width / zoom;
        const worldSpanZ = height / zoom;
        const minX = centerX - worldSpanX * 0.5;
        const maxX = centerX + worldSpanX * 0.5;
        const minZ = centerZ - worldSpanZ * 0.5;
        const maxZ = centerZ + worldSpanZ * 0.5;
        const startX = Math.floor(minX / gridStep) * gridStep;
        const endX = Math.ceil(maxX / gridStep) * gridStep;
        const startZ = Math.floor(minZ / gridStep) * gridStep;
        const endZ = Math.ceil(maxZ / gridStep) * gridStep;

        ctx.strokeStyle = `rgba(144, 187, 221, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 1;
        for (let x = startX; x <= endX; x += gridStep) {
            const sx = width * 0.5 + (x - centerX) * zoom;
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, height);
            ctx.stroke();
        }
        for (let z = startZ; z <= endZ; z += gridStep) {
            const sy = height * 0.5 + (z - centerZ) * zoom;
            ctx.beginPath();
            ctx.moveTo(0, sy);
            ctx.lineTo(width, sy);
            ctx.stroke();
        }
    }

    function drawWorldFrame(ctx, { width, height, worldBounds, centerX, centerZ, zoom }) {
        const minX = width * 0.5 + (worldBounds.minX - centerX) * zoom;
        const maxX = width * 0.5 + (worldBounds.maxX - centerX) * zoom;
        const minY = height * 0.5 + (worldBounds.minZ - centerZ) * zoom;
        const maxY = height * 0.5 + (worldBounds.maxZ - centerZ) * zoom;
        ctx.strokeStyle = 'rgba(183, 216, 241, 0.36)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
    }

    function drawCompassTicks(ctx, mapRect) {
        const cx = mapRect.x + mapRect.w * 0.5;
        const cy = mapRect.y + mapRect.h * 0.5;
        const radius = Math.min(mapRect.w, mapRect.h) * 0.5 - 7;
        ctx.save();
        ctx.strokeStyle = 'rgba(174, 220, 248, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = "700 10px 'Orbitron', 'Sora', sans-serif";
        ctx.fillStyle = 'rgba(212, 236, 252, 0.86)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('N', cx, cy - radius + 10);
        ctx.restore();
    }

    function fillWorldQuad(ctx, centerX, centerZ, zoom, points) {
        if (!Array.isArray(points) || points.length !== 4) {
            return;
        }
        ctx.beginPath();
        for (let i = 0; i < points.length; i += 1) {
            const point = points[i];
            const x = (point.x - centerX) * zoom;
            const y = (point.z - centerZ) * zoom;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fill();
    }

    function strokeAndFillWorldQuad(ctx, centerX, centerZ, zoom, points) {
        if (!Array.isArray(points) || points.length !== 4) {
            return;
        }
        ctx.beginPath();
        for (let i = 0; i < points.length; i += 1) {
            const point = points[i];
            const x = (point.x - centerX) * zoom;
            const y = (point.z - centerZ) * zoom;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    function bindDomEvents() {
        if (WORLD_MAP_LOCK_OVERVIEW) {
            dom.centerBtn.textContent = 'FIT MAP';
        }

        const filterEntries = [
            ['roads', dom.filterRoads],
            ['buildings', dom.filterBuildings],
            ['pickups', dom.filterPickups],
            ['vehicles', dom.filterVehicles],
            ['mines', dom.filterMines],
            ['charging', dom.filterCharging],
            ['trees', dom.filterTrees],
            ['lamps', dom.filterLamps],
        ];

        for (let i = 0; i < filterEntries.length; i += 1) {
            const [key, input] = filterEntries[i];
            input.addEventListener('change', () => {
                state.filters[key] = Boolean(input.checked);
                if (state.expanded) {
                    drawWorldMap(1 / 60);
                }
                drawMinimap(1 / 60);
                renderLegend();
            });
        }

        dom.closeBtn.addEventListener('click', () => {
            setExpanded(false, { announce: true });
        });

        dom.centerBtn.addEventListener('click', () => {
            if (WORLD_MAP_LOCK_OVERVIEW) {
                fitWorldOverview();
                drawWorldMap(1 / 60);
                onStatus('Map fitted to full city view.', 1200);
                return;
            }

            state.followPlayer = true;
            state.centerX = state.player.x;
            state.centerZ = state.player.z;
            drawWorldMap(1 / 60);
            onStatus('Map centered on your car.', 1200);
        });

        dom.clearWaypointBtn.addEventListener('click', () => {
            if (state.waypoint) {
                state.waypoint = null;
                state.routePoints = [];
                state.routeDistanceMeters = null;
                onStatus('Waypoint cleared.', 1400);
                drawWorldMap(1 / 60);
                drawMinimap(1 / 60);
                updateMetaLabels();
                renderLegend();
            }
        });

        dom.worldMapCanvas.addEventListener('pointerdown', handleWorldMapPointerDown);
        dom.worldMapCanvas.addEventListener('pointermove', handleWorldMapPointerMove);
        dom.worldMapCanvas.addEventListener('pointerup', handleWorldMapPointerUp);
        dom.worldMapCanvas.addEventListener('pointercancel', handleWorldMapPointerUp);
        dom.worldMapCanvas.addEventListener('wheel', handleWorldMapWheel, { passive: false });
        dom.worldMapCanvas.addEventListener('contextmenu', handleWorldMapContextMenu);
        window.addEventListener('resize', () => refreshCanvasSizes(true));
    }

    function handleWorldMapPointerDown(event) {
        if (!state.expanded || event.button > 1) {
            return;
        }
        const canvas = dom.worldMapCanvas;
        state.pointer.active = true;
        state.pointer.id = event.pointerId;
        state.pointer.button = event.button;
        state.pointer.startX = event.clientX;
        state.pointer.startY = event.clientY;
        state.pointer.startCenterX = state.centerX;
        state.pointer.startCenterZ = state.centerZ;
        state.pointer.moved = false;
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    function handleWorldMapPointerMove(event) {
        if (!state.expanded) {
            return;
        }

        const canvas = dom.worldMapCanvas;
        const worldPoint = pointerEventToWorld(
            event,
            canvas,
            state.centerX,
            state.centerZ,
            state.zoom
        );
        if (worldPoint) {
            updateCoordinateReadout(worldPoint.x, worldPoint.z);
        }

        if (
            !state.pointer.active ||
            state.pointer.id !== event.pointerId ||
            state.pointer.button !== 0
        ) {
            return;
        }

        const dx = event.clientX - state.pointer.startX;
        const dy = event.clientY - state.pointer.startY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            state.pointer.moved = true;
        }
        if (WORLD_MAP_LOCK_OVERVIEW) {
            event.preventDefault();
            return;
        }
        state.followPlayer = false;
        state.centerX = state.pointer.startCenterX - dx / state.zoom;
        state.centerZ = state.pointer.startCenterZ - dy / state.zoom;
        clampCenterToWorld();
        drawWorldMap(1 / 60);
        event.preventDefault();
    }

    function handleWorldMapPointerUp(event) {
        if (!state.pointer.active || state.pointer.id !== event.pointerId) {
            return;
        }

        const canvas = dom.worldMapCanvas;
        const wasClick = state.pointer.button === 0 && !state.pointer.moved;
        if (wasClick && state.expanded) {
            const worldPoint = pointerEventToWorld(
                event,
                canvas,
                state.centerX,
                state.centerZ,
                state.zoom
            );
            if (worldPoint) {
                state.waypoint = clampPointToBounds(worldPoint, worldBounds);
                rebuildRoute();
                updateMetaLabels();
                renderLegend();
                drawWorldMap(1 / 60);
                drawMinimap(1 / 60);
                onStatus(
                    `Waypoint set: X ${Math.round(state.waypoint.x)} | Z ${Math.round(state.waypoint.z)}.`,
                    2000
                );
            }
        }

        canvas.releasePointerCapture(event.pointerId);
        state.pointer.active = false;
        state.pointer.id = null;
    }

    function handleWorldMapWheel(event) {
        if (!state.expanded) {
            return;
        }
        event.preventDefault();

        if (WORLD_MAP_LOCK_OVERVIEW) {
            return;
        }

        const canvas = dom.worldMapCanvas;
        const before = pointerEventToWorld(event, canvas, state.centerX, state.centerZ, state.zoom);
        const zoomDirection = event.deltaY < 0 ? 1 : -1;
        const zoomFactor = zoomDirection > 0 ? WORLD_MAP_ZOOM_STEP : 1 / WORLD_MAP_ZOOM_STEP;
        state.zoom = clamp(state.zoom * zoomFactor, state.minZoom, state.maxZoom);

        const after = pointerEventToWorld(event, canvas, state.centerX, state.centerZ, state.zoom);
        if (before && after) {
            state.centerX += before.x - after.x;
            state.centerZ += before.z - after.z;
        }
        state.followPlayer = false;
        clampCenterToWorld();
        drawWorldMap(1 / 60);
        renderLegend();
    }

    function handleWorldMapContextMenu(event) {
        if (!state.expanded) {
            return;
        }
        event.preventDefault();
        if (!state.waypoint) {
            return;
        }
        state.waypoint = null;
        state.routePoints = [];
        state.routeDistanceMeters = null;
        drawWorldMap(1 / 60);
        drawMinimap(1 / 60);
        updateMetaLabels();
        renderLegend();
        onStatus('Waypoint cleared.', 1400);
    }

    function refreshCanvasSizes(force = false) {
        const miniChanged = resizeCanvasToDisplaySize(dom.miniMapCanvas, MINIMAP_MAX_DPR);
        const worldChanged = resizeCanvasToDisplaySize(dom.worldMapCanvas, WORLD_MAP_MAX_DPR);

        if (worldChanged || force) {
            const fitTargetBounds = WORLD_MAP_LOCK_OVERVIEW ? overviewBounds : worldBounds;
            const fitZoom = resolveFitZoom(
                dom.worldMapCanvas.width,
                dom.worldMapCanvas.height,
                fitTargetBounds
            );
            state.fitZoom = fitZoom;
            state.minZoom = fitZoom * WORLD_MAP_ZOOM_MIN_FACTOR;
            state.maxZoom = fitZoom * WORLD_MAP_ZOOM_MAX_FACTOR;
            if (!Number.isFinite(state.zoom) || state.zoom <= 0 || force) {
                state.zoom = fitZoom;
            } else {
                state.zoom = clamp(state.zoom, state.minZoom, state.maxZoom);
            }
            if (WORLD_MAP_LOCK_OVERVIEW) {
                fitWorldOverview();
            } else {
                clampCenterToWorld();
            }
        }

        if (miniChanged || worldChanged || force) {
            if (!dom.miniMapHud.hidden) {
                drawMinimap(1 / 60);
            }
            if (state.expanded) {
                drawWorldMap(1 / 60);
            }
        }
    }

    function clampCenterToWorld() {
        const canvas = dom.worldMapCanvas;
        const halfSpanX = (canvas.width / Math.max(1e-6, state.zoom)) * 0.5;
        const halfSpanZ = (canvas.height / Math.max(1e-6, state.zoom)) * 0.5;
        const minCenterX = worldBounds.minX + halfSpanX;
        const maxCenterX = worldBounds.maxX - halfSpanX;
        const minCenterZ = worldBounds.minZ + halfSpanZ;
        const maxCenterZ = worldBounds.maxZ - halfSpanZ;

        if (minCenterX > maxCenterX) {
            state.centerX = (worldBounds.minX + worldBounds.maxX) * 0.5;
        } else {
            state.centerX = clamp(state.centerX, minCenterX, maxCenterX);
        }

        if (minCenterZ > maxCenterZ) {
            state.centerZ = (worldBounds.minZ + worldBounds.maxZ) * 0.5;
        } else {
            state.centerZ = clamp(state.centerZ, minCenterZ, maxCenterZ);
        }
    }

    function renderLegend() {
        const lines = [];
        lines.push(`Mode: ${state.mode === 'online' ? 'Online' : 'Bots'}`);
        lines.push(`Pickups: ${state.pickups.length}`);
        lines.push(`Vehicles: ${state.vehicles.length + 1}`);
        lines.push(`Mines: ${state.mines.length}`);
        if (state.routeDistanceMeters != null) {
            lines.push(`Route: ${Math.round(state.routeDistanceMeters)} m`);
        } else {
            lines.push('Route: none');
        }
        const zoomPercent = Math.round((state.zoom / Math.max(state.fitZoom, 0.001)) * 100);
        lines.push(`Zoom: ${zoomPercent}%`);
        dom.legend.textContent = lines.join('\n');
    }

    function updateMetaLabels() {
        dom.modeLabel.textContent = state.mode === 'online' ? 'ONLINE' : 'BOTS';
        const minimapRange = resolveMinimapRange(state.player.speedKph);
        const routeLabel =
            state.routeDistanceMeters != null
                ? `WP ${Math.round(state.routeDistanceMeters)}m`
                : `RANGE ${Math.round(minimapRange)}m`;
        dom.rangeLabel.textContent = routeLabel;
    }

    function updateCoordinateReadout(x, z) {
        dom.coordReadout.textContent = `X ${Math.round(x)} | Z ${Math.round(z)}`;
    }

    function dispose() {
        document.body.classList.remove('world-map-open');
        setExpanded(false, { announce: false, force: true });
    }

    function fitWorldOverview() {
        state.followPlayer = false;
        state.centerX = (overviewBounds.minX + overviewBounds.maxX) * 0.5;
        state.centerZ = (overviewBounds.minZ + overviewBounds.maxZ) * 0.5;
        state.zoom = state.fitZoom;
    }
}

function resolveDom() {
    const miniMapHud = document.getElementById('miniMapHud');
    const miniMapCanvas = document.getElementById('miniMapCanvas');
    const modeLabel = document.getElementById('miniMapModeLabel');
    const rangeLabel = document.getElementById('miniMapRangeLabel');

    const worldMapOverlay = document.getElementById('worldMapOverlay');
    const worldMapCanvas = document.getElementById('worldMapCanvas');
    const closeBtn = document.getElementById('worldMapCloseBtn');
    const centerBtn = document.getElementById('worldMapCenterBtn');
    const clearWaypointBtn = document.getElementById('worldMapClearWaypointBtn');
    const legend = document.getElementById('worldMapLegend');
    const coordReadout = document.getElementById('worldMapCoordReadout');

    const filterRoads = document.getElementById('worldMapFilterRoads');
    const filterBuildings = document.getElementById('worldMapFilterBuildings');
    const filterPickups = document.getElementById('worldMapFilterPickups');
    const filterVehicles = document.getElementById('worldMapFilterVehicles');
    const filterMines = document.getElementById('worldMapFilterMines');
    const filterCharging = document.getElementById('worldMapFilterCharging');
    const filterTrees = document.getElementById('worldMapFilterTrees');
    const filterLamps = document.getElementById('worldMapFilterLamps');

    const ready = Boolean(
        miniMapHud &&
        miniMapCanvas &&
        modeLabel &&
        rangeLabel &&
        worldMapOverlay &&
        worldMapCanvas &&
        closeBtn &&
        centerBtn &&
        clearWaypointBtn &&
        legend &&
        coordReadout &&
        filterRoads &&
        filterBuildings &&
        filterPickups &&
        filterVehicles &&
        filterMines &&
        filterCharging &&
        filterTrees &&
        filterLamps
    );

    return {
        ready,
        miniMapHud,
        miniMapCanvas,
        modeLabel,
        rangeLabel,
        worldMapOverlay,
        worldMapCanvas,
        closeBtn,
        centerBtn,
        clearWaypointBtn,
        legend,
        coordReadout,
        filterRoads,
        filterBuildings,
        filterPickups,
        filterVehicles,
        filterMines,
        filterCharging,
        filterTrees,
        filterLamps,
    };
}

function initializeFilterInputs(filters, dom) {
    dom.filterRoads.checked = filters.roads;
    dom.filterBuildings.checked = filters.buildings;
    dom.filterPickups.checked = filters.pickups;
    dom.filterVehicles.checked = filters.vehicles;
    dom.filterMines.checked = filters.mines;
    dom.filterCharging.checked = filters.charging;
    dom.filterTrees.checked = filters.trees;
    dom.filterLamps.checked = filters.lamps;
}

function buildStaticFeatures(obstacles = []) {
    const buildings = [];
    const trees = [];
    const lamps = [];

    for (let i = 0; i < obstacles.length; i += 1) {
        const obstacle = obstacles[i];
        if (!obstacle || typeof obstacle !== 'object') {
            continue;
        }

        if (
            obstacle.type === 'aabb' &&
            obstacle.category === 'building' &&
            Number.isFinite(obstacle.minX) &&
            Number.isFinite(obstacle.maxX) &&
            Number.isFinite(obstacle.minZ) &&
            Number.isFinite(obstacle.maxZ)
        ) {
            buildings.push({
                minX: obstacle.minX,
                maxX: obstacle.maxX,
                minZ: obstacle.minZ,
                maxZ: obstacle.maxZ,
            });
            continue;
        }

        if (
            obstacle.type === 'circle' &&
            Number.isFinite(obstacle.x) &&
            Number.isFinite(obstacle.z) &&
            Number.isFinite(obstacle.radius)
        ) {
            if (obstacle.category === 'tree') {
                trees.push({
                    x: obstacle.x,
                    z: obstacle.z,
                    radius: obstacle.radius,
                });
                continue;
            }
            if (obstacle.category === 'lamp_post') {
                lamps.push({
                    x: obstacle.x,
                    z: obstacle.z,
                    radius: obstacle.radius,
                });
            }
        }
    }

    return { buildings, trees, lamps };
}

function resolveWorldBounds(worldBounds = null) {
    const fallback = {
        minX: -120,
        maxX: 120,
        minZ: -120,
        maxZ: 120,
    };

    if (!worldBounds || typeof worldBounds !== 'object') {
        return fallback;
    }

    const minX = Number(worldBounds.minX);
    const maxX = Number(worldBounds.maxX);
    const minZ = Number(worldBounds.minZ);
    const maxZ = Number(worldBounds.maxZ);
    if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) {
        return fallback;
    }

    if (maxX <= minX || maxZ <= minZ) {
        return fallback;
    }

    return { minX, maxX, minZ, maxZ };
}

function resolveCityMapLayout(layout = null) {
    const fallback = {
        roadAxisLinesX: [],
        roadAxisLinesZ: [],
    };

    if (!layout || typeof layout !== 'object') {
        return fallback;
    }

    return {
        roadAxisLinesX: normalizeRoadLines(layout.roadAxisLinesX),
        roadAxisLinesZ: normalizeRoadLines(layout.roadAxisLinesZ),
    };
}

function normalizeRoadLines(lines) {
    if (!Array.isArray(lines)) {
        return [];
    }

    const result = [];
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line || typeof line !== 'object') {
            continue;
        }
        const coord = Number(line.coord);
        const roadWidth = Number(line.roadWidth);
        if (!Number.isFinite(coord) || !Number.isFinite(roadWidth) || roadWidth <= 0) {
            continue;
        }
        result.push({ coord, roadWidth });
    }

    result.sort((a, b) => a.coord - b.coord);
    return result;
}

function normalizeChargingZones(zones) {
    if (!Array.isArray(zones)) {
        return [];
    }

    const result = [];
    for (let i = 0; i < zones.length; i += 1) {
        const zone = zones[i];
        if (!zone || typeof zone !== 'object') {
            continue;
        }
        const x = Number(zone.x);
        const z = Number(zone.z);
        const radius = Math.max(0.2, Number(zone.radius) || 0);
        if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius)) {
            continue;
        }
        result.push({ x, z, radius });
    }

    return result;
}

function normalizePickups(pickups) {
    if (!Array.isArray(pickups)) {
        return [];
    }

    const result = [];
    for (let i = 0; i < pickups.length; i += 1) {
        const pickup = pickups[i];
        if (!pickup || typeof pickup !== 'object') {
            continue;
        }
        const x = Number(pickup.x);
        const z = Number(pickup.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) {
            continue;
        }
        result.push({
            x,
            z,
            color: toCssHexColor(pickup.colorHex, '#8fd9ff'),
            isTarget: Boolean(pickup.isTarget),
        });
    }
    return result;
}

function normalizeVehicles(botDescriptors, remotePlayers) {
    const result = [];

    if (Array.isArray(botDescriptors)) {
        for (let i = 0; i < botDescriptors.length; i += 1) {
            const entry = botDescriptors[i];
            if (!entry || !entry.position) {
                continue;
            }
            const x = Number(entry.position.x);
            const z = Number(entry.position.z);
            if (!Number.isFinite(x) || !Number.isFinite(z)) {
                continue;
            }
            result.push({
                id: String(entry.id || `bot-${i}`),
                x,
                z,
                type: 'bot',
            });
        }
    }

    if (Array.isArray(remotePlayers)) {
        for (let i = 0; i < remotePlayers.length; i += 1) {
            const entry = remotePlayers[i];
            if (!entry || typeof entry !== 'object') {
                continue;
            }
            const x = Number(entry.x);
            const z = Number(entry.z);
            if (!Number.isFinite(x) || !Number.isFinite(z)) {
                continue;
            }
            result.push({
                id: String(entry.playerId || entry.id || `player-${i}`),
                x,
                z,
                type: 'player',
            });
        }
    }

    return result;
}

function normalizeMines(mines) {
    if (!Array.isArray(mines)) {
        return [];
    }

    const result = [];
    for (let i = 0; i < mines.length; i += 1) {
        const mine = mines[i];
        if (!mine || typeof mine !== 'object') {
            continue;
        }
        const x = Number(mine.x);
        const z = Number(mine.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) {
            continue;
        }
        result.push({
            id: String(mine.id || mine.mineId || `mine-${i}`),
            x,
            z,
            armed: Boolean(mine.armed),
        });
    }

    return result;
}

function normalizeWorldPoint(value, fallback = { x: 0, z: 0 }) {
    const x = Number(value?.x);
    const z = Number(value?.z);
    return {
        x: Number.isFinite(x) ? x : Number(fallback?.x) || 0,
        z: Number.isFinite(z) ? z : Number(fallback?.z) || 0,
    };
}

function buildRoadRoute(playerPoint, waypoint, cityMapLayout, worldBounds) {
    const xLines = cityMapLayout.roadAxisLinesX || [];
    const zLines = cityMapLayout.roadAxisLinesZ || [];
    if (xLines.length === 0 || zLines.length === 0) {
        return [
            clampPointToBounds(playerPoint, worldBounds),
            clampPointToBounds(waypoint, worldBounds),
        ];
    }

    const route = [];
    const start = clampPointToBounds(playerPoint, worldBounds);
    const target = clampPointToBounds(waypoint, worldBounds);
    const snappedStart = snapPointToRoad(start, xLines, zLines, worldBounds);
    const snappedEnd = snapPointToRoad(target, xLines, zLines, worldBounds);

    pushRoutePoint(route, start);
    pushRoutePoint(route, snappedStart.point);

    if (snappedStart.axis === 'x' && snappedEnd.axis === 'x') {
        const viaZ = nearestRoadCoordinate(
            (snappedStart.point.z + snappedEnd.point.z) * 0.5,
            zLines
        );
        pushRoutePoint(
            route,
            clampPointToBounds({ x: snappedStart.point.x, z: viaZ }, worldBounds)
        );
        pushRoutePoint(route, clampPointToBounds({ x: snappedEnd.point.x, z: viaZ }, worldBounds));
    } else if (snappedStart.axis === 'z' && snappedEnd.axis === 'z') {
        const viaX = nearestRoadCoordinate(
            (snappedStart.point.x + snappedEnd.point.x) * 0.5,
            xLines
        );
        pushRoutePoint(
            route,
            clampPointToBounds({ x: viaX, z: snappedStart.point.z }, worldBounds)
        );
        pushRoutePoint(route, clampPointToBounds({ x: viaX, z: snappedEnd.point.z }, worldBounds));
    } else if (snappedStart.axis === 'x' && snappedEnd.axis === 'z') {
        pushRoutePoint(
            route,
            clampPointToBounds(
                {
                    x: snappedStart.point.x,
                    z: snappedEnd.point.z,
                },
                worldBounds
            )
        );
    } else {
        pushRoutePoint(
            route,
            clampPointToBounds(
                {
                    x: snappedEnd.point.x,
                    z: snappedStart.point.z,
                },
                worldBounds
            )
        );
    }

    pushRoutePoint(route, snappedEnd.point);
    pushRoutePoint(route, target);
    return route;
}

function snapPointToRoad(point, xLines, zLines, worldBounds) {
    const nearestX = nearestRoadCoordinate(point.x, xLines);
    const nearestZ = nearestRoadCoordinate(point.z, zLines);
    const distanceToX = Math.abs(point.x - nearestX);
    const distanceToZ = Math.abs(point.z - nearestZ);

    if (distanceToX <= distanceToZ) {
        return {
            axis: 'x',
            point: clampPointToBounds({ x: nearestX, z: point.z }, worldBounds),
        };
    }

    return {
        axis: 'z',
        point: clampPointToBounds({ x: point.x, z: nearestZ }, worldBounds),
    };
}

function nearestRoadCoordinate(value, lines) {
    if (!Array.isArray(lines) || lines.length === 0) {
        return Number(value) || 0;
    }

    let bestCoord = Number(lines[0]?.coord) || 0;
    let bestDistance = Math.abs((Number(value) || 0) - bestCoord);
    for (let i = 1; i < lines.length; i += 1) {
        const coord = Number(lines[i]?.coord);
        if (!Number.isFinite(coord)) {
            continue;
        }
        const distance = Math.abs((Number(value) || 0) - coord);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestCoord = coord;
        }
    }

    return bestCoord;
}

function pushRoutePoint(points, point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) {
        return;
    }
    const previous = points[points.length - 1];
    if (previous && Math.hypot(previous.x - point.x, previous.z - point.z) < 0.05) {
        return;
    }
    points.push({ x: point.x, z: point.z });
}

function computePathDistance(points = []) {
    if (!Array.isArray(points) || points.length < 2) {
        return null;
    }

    let distance = 0;
    for (let i = 1; i < points.length; i += 1) {
        const from = points[i - 1];
        const to = points[i];
        distance += Math.hypot(to.x - from.x, to.z - from.z);
    }
    return distance;
}

function pointerEventToWorld(event, canvas, centerX, centerZ, zoom) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || !Number.isFinite(zoom) || zoom <= 0) {
        return null;
    }

    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;
    const x = centerX + ((nx - 0.5) * canvas.width) / zoom;
    const z = centerZ + ((ny - 0.5) * canvas.height) / zoom;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return null;
    }
    return { x, z };
}

function resolveOverviewBounds({ worldBounds, cityMapLayout, staticFeatures, chargingZones }) {
    let minX = Number(worldBounds.minX);
    let maxX = Number(worldBounds.maxX);
    let minZ = Number(worldBounds.minZ);
    let maxZ = Number(worldBounds.maxZ);

    const xLines = Array.isArray(cityMapLayout?.roadAxisLinesX) ? cityMapLayout.roadAxisLinesX : [];
    const zLines = Array.isArray(cityMapLayout?.roadAxisLinesZ) ? cityMapLayout.roadAxisLinesZ : [];

    for (let i = 0; i < xLines.length; i += 1) {
        const line = xLines[i];
        const coord = Number(line?.coord);
        const halfWidth = Math.max(0, (Number(line?.roadWidth) || 0) * 0.5);
        if (!Number.isFinite(coord)) {
            continue;
        }
        minX = Math.min(minX, coord - halfWidth);
        maxX = Math.max(maxX, coord + halfWidth);
    }

    for (let i = 0; i < zLines.length; i += 1) {
        const line = zLines[i];
        const coord = Number(line?.coord);
        const halfWidth = Math.max(0, (Number(line?.roadWidth) || 0) * 0.5);
        if (!Number.isFinite(coord)) {
            continue;
        }
        minZ = Math.min(minZ, coord - halfWidth);
        maxZ = Math.max(maxZ, coord + halfWidth);
    }

    const buildings = Array.isArray(staticFeatures?.buildings) ? staticFeatures.buildings : [];
    for (let i = 0; i < buildings.length; i += 1) {
        const building = buildings[i];
        if (!building) {
            continue;
        }
        if (Number.isFinite(building.minX)) {
            minX = Math.min(minX, building.minX);
        }
        if (Number.isFinite(building.maxX)) {
            maxX = Math.max(maxX, building.maxX);
        }
        if (Number.isFinite(building.minZ)) {
            minZ = Math.min(minZ, building.minZ);
        }
        if (Number.isFinite(building.maxZ)) {
            maxZ = Math.max(maxZ, building.maxZ);
        }
    }

    const circles = [
        ...(Array.isArray(staticFeatures?.trees) ? staticFeatures.trees : []),
        ...(Array.isArray(staticFeatures?.lamps) ? staticFeatures.lamps : []),
        ...(Array.isArray(chargingZones) ? chargingZones : []),
    ];
    for (let i = 0; i < circles.length; i += 1) {
        const circle = circles[i];
        const x = Number(circle?.x);
        const z = Number(circle?.z);
        const radius = Math.max(0, Number(circle?.radius) || 0);
        if (!Number.isFinite(x) || !Number.isFinite(z)) {
            continue;
        }
        minX = Math.min(minX, x - radius);
        maxX = Math.max(maxX, x + radius);
        minZ = Math.min(minZ, z - radius);
        maxZ = Math.max(maxZ, z + radius);
    }

    const padding = WORLD_MAP_OVERVIEW_UNIT_PADDING;
    return {
        minX: minX - padding,
        maxX: maxX + padding,
        minZ: minZ - padding,
        maxZ: maxZ + padding,
    };
}

function resolveFitZoom(canvasWidth, canvasHeight, bounds) {
    const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
    const worldHeight = Math.max(1, bounds.maxZ - bounds.minZ);
    const horizontalFit = (canvasWidth * WORLD_MAP_OVERVIEW_VIEWPORT_FILL) / worldWidth;
    const verticalFit = (canvasHeight * WORLD_MAP_OVERVIEW_VIEWPORT_FILL) / worldHeight;
    return Math.max(0.1, Math.min(horizontalFit, verticalFit));
}

function resizeCanvasToDisplaySize(canvas, maxDpr = 2) {
    const dpr = clamp(window.devicePixelRatio || 1, 1, maxDpr);
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));

    if (canvas.width === width && canvas.height === height) {
        return false;
    }

    canvas.width = width;
    canvas.height = height;
    return true;
}

function drawRoundedPanel(ctx, x, y, width, height, radius) {
    roundedRectPath(ctx, x, y, width, height, radius);
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, 'rgba(10, 21, 37, 0.92)');
    gradient.addColorStop(1, 'rgba(7, 14, 24, 0.96)');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(149, 201, 241, 0.42)';
    ctx.stroke();
}

function clipRoundedRect(ctx, x, y, width, height, radius) {
    roundedRectPath(ctx, x, y, width, height, radius);
    ctx.clip();
}

function roundedRectPath(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width * 0.5, height * 0.5));
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

function drawPlayerArrow(ctx, x, y, rotation, size, { fillColor, strokeColor }) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.65, size * 0.74);
    ctx.lineTo(0, size * 0.32);
    ctx.lineTo(-size * 0.65, size * 0.74);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
    ctx.restore();
}

function drawDiamond(ctx, x, y, size, fillColor, strokeColor) {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
}

function drawCrossMarker(ctx, x, y, size, color, width = 1.5) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x - size, y + size);
    ctx.lineTo(x + size, y - size);
    ctx.stroke();
    ctx.restore();
}

function clampPointToBounds(point, worldBounds) {
    return {
        x: clamp(point.x, worldBounds.minX, worldBounds.maxX),
        z: clamp(point.z, worldBounds.minZ, worldBounds.maxZ),
    };
}

function isWorldPointVisible(point, centerX, centerZ, range = null) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) {
        return false;
    }
    if (!Number.isFinite(range)) {
        return true;
    }
    return Math.abs(point.x - centerX) <= range && Math.abs(point.z - centerZ) <= range;
}

function normalizeAngle(value) {
    const fullTurn = Math.PI * 2;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return ((((numeric + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
}

function resolveMinimapRange(speedKph) {
    const speedRatio = clamp(speedKph / MINIMAP_SPEED_FOR_MAX_RANGE_KPH, 0, 1);
    return MINIMAP_RANGE_NEAR_M + (MINIMAP_RANGE_FAR_M - MINIMAP_RANGE_NEAR_M) * speedRatio;
}

function toCssHexColor(value, fallback = '#8fd9ff') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    const clamped = Math.max(0, Math.min(0xffffff, Math.round(numeric))) >>> 0;
    return `#${clamped.toString(16).padStart(6, '0')}`;
}

function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}

function createNoopController() {
    return {
        update() {},
        toggleExpanded() {
            return {
                open: false,
                message: 'Map UI unavailable.',
            };
        },
        isExpanded() {
            return false;
        },
        closeExpanded() {},
        clearWaypoint() {
            return false;
        },
        getWaypoint() {
            return null;
        },
        dispose() {},
    };
}
