const MINIMAP_RANGE_NEAR_M = 24;
const MINIMAP_RANGE_FAR_M = 44;
const MINIMAP_SPEED_FOR_MAX_RANGE_KPH = 74;
const MINIMAP_MAX_DPR = 2;
const WORLD_MAP_MAX_DPR = 2;
const WORLD_MAP_ZOOM_MIN_FACTOR = 0.35;
const WORLD_MAP_ZOOM_MAX_FACTOR = 8;
const WORLD_MAP_ZOOM_STEP = 1.12;
const WORLD_MAP_LOCK_OVERVIEW = true;
const WORLD_MAP_OVERVIEW_UNIT_PADDING = 0.75;
const WORLD_MAP_OVERVIEW_VIEWPORT_FILL = 1;
const MAP_RESIZE_CHECK_INTERVAL_SEC = 0.5;
const MINIMAP_DRAW_INTERVAL_SEC = 1 / 30;
const WORLD_MAP_DRAW_INTERVAL_SEC = 1 / 60;
const MAP_UI_LABEL_UPDATE_INTERVAL_SEC = 1 / 12;
const ROUTE_REBUILD_INTERVAL_SEC = 0.16;
const ROUTE_REBUILD_DISTANCE_SQ = 2.2 * 2.2;
const ENTITY_SYNC_INTERVAL_SEC = 1 / 30;
const STATIC_FEATURE_INDEX_CELL_SIZE = 22;
const DEFAULT_MAP_QUALITY_PROFILE = Object.freeze({
    minimapMaxDpr: MINIMAP_MAX_DPR,
    worldMapMaxDpr: WORLD_MAP_MAX_DPR,
    minimapDrawIntervalSec: MINIMAP_DRAW_INTERVAL_SEC,
    worldMapDrawIntervalSec: WORLD_MAP_DRAW_INTERVAL_SEC,
    labelUpdateIntervalSec: MAP_UI_LABEL_UPDATE_INTERVAL_SEC,
    entitySyncIntervalSec: ENTITY_SYNC_INTERVAL_SEC,
    routeRebuildIntervalSec: ROUTE_REBUILD_INTERVAL_SEC,
    routeRebuildDistanceSq: ROUTE_REBUILD_DISTANCE_SQ,
});

export function createMapUiController(options = {}) {
    const dom = resolveDom();
    if (!dom.ready) {
        return createNoopController();
    }
    const miniMapCtx = dom.miniMapCanvas.getContext('2d');
    const worldMapCtx = dom.worldMapCanvas.getContext('2d');
    if (!miniMapCtx || !worldMapCtx) {
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
    const onExpandedChanged =
        typeof options.onExpandedChanged === 'function' ? options.onExpandedChanged : () => {};

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
        animationTime: 0,
        routeDistanceMeters: null,
        filters: {
            roads: true,
            buildings: true,
            pickups: false,
            vehicles: true,
            mines: false,
            charging: false,
            trees: false,
            lamps: false,
        },
        qualityProfile: { ...DEFAULT_MAP_QUALITY_PROFILE },
        timers: {
            resizeCheck: MAP_RESIZE_CHECK_INTERVAL_SEC,
            minimapDraw: DEFAULT_MAP_QUALITY_PROFILE.minimapDrawIntervalSec,
            worldMapDraw: DEFAULT_MAP_QUALITY_PROFILE.worldMapDrawIntervalSec,
            labelUpdate: DEFAULT_MAP_QUALITY_PROFILE.labelUpdateIntervalSec,
            entitySync: DEFAULT_MAP_QUALITY_PROFILE.entitySyncIntervalSec,
            routeRebuild: DEFAULT_MAP_QUALITY_PROFILE.routeRebuildIntervalSec,
        },
        routeBuildState: {
            playerX: Number.NaN,
            playerZ: Number.NaN,
            waypointX: Number.NaN,
            waypointZ: Number.NaN,
        },
        previousLabelText: {
            legend: '',
            liveStats: '',
            mode: '',
            range: '',
            coord: '',
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
        setQualityProfile(profile = {}) {
            const nextProfile = normalizeMapQualityProfile(profile, state.qualityProfile);
            if (mapQualityProfilesEqual(state.qualityProfile, nextProfile)) {
                return false;
            }
            state.qualityProfile = nextProfile;
            state.timers.minimapDraw = Math.min(
                state.timers.minimapDraw,
                state.qualityProfile.minimapDrawIntervalSec
            );
            state.timers.worldMapDraw = Math.min(
                state.timers.worldMapDraw,
                state.qualityProfile.worldMapDrawIntervalSec
            );
            state.timers.labelUpdate = Math.min(
                state.timers.labelUpdate,
                state.qualityProfile.labelUpdateIntervalSec
            );
            state.timers.entitySync = Math.min(
                state.timers.entitySync,
                state.qualityProfile.entitySyncIntervalSec
            );
            state.timers.routeRebuild = Math.min(
                state.timers.routeRebuild,
                state.qualityProfile.routeRebuildIntervalSec
            );
            refreshCanvasSizes(true);
            return true;
        },
        dispose,
    };

    function update(deltaTime = 1 / 60, frameState = {}) {
        const dt = Math.min(Math.max(Number(deltaTime) || 0, 0), 0.25);
        state.animationTime = (state.animationTime + dt) % 3600;
        state.timers.entitySync += dt;
        const shouldSyncEntities =
            state.timers.entitySync >= state.qualityProfile.entitySyncIntervalSec;
        syncFrameState(frameState, { syncEntities: shouldSyncEntities });
        if (shouldSyncEntities) {
            state.timers.entitySync = 0;
        }

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

        state.timers.resizeCheck += dt;
        if (state.timers.resizeCheck >= MAP_RESIZE_CHECK_INTERVAL_SEC) {
            state.timers.resizeCheck = 0;
            refreshCanvasSizes();
        }

        state.timers.routeRebuild += dt;
        rebuildRoute();

        if (minimapVisible) {
            state.timers.minimapDraw += dt;
            if (state.timers.minimapDraw >= state.qualityProfile.minimapDrawIntervalSec) {
                state.timers.minimapDraw = 0;
                drawMinimap(dt);
            }
        }
        if (state.expanded) {
            state.timers.worldMapDraw += dt;
            if (state.timers.worldMapDraw >= state.qualityProfile.worldMapDrawIntervalSec) {
                state.timers.worldMapDraw = 0;
                drawWorldMap(dt);
            }
        }

        state.timers.labelUpdate += dt;
        if (state.timers.labelUpdate >= state.qualityProfile.labelUpdateIntervalSec) {
            state.timers.labelUpdate = 0;
            updateMetaLabels();
            renderLegend();
        }
    }

    function toggleExpanded(forceState = null) {
        const nextExpanded = forceState == null ? !state.expanded : Boolean(forceState);
        if (nextExpanded === state.expanded) {
            return {
                open: state.expanded,
                message: null,
            };
        }

        setExpanded(nextExpanded, { announce: true });
        return {
            open: state.expanded,
            message: null,
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
        onExpandedChanged(expanded);

        if (expanded) {
            refreshCanvasSizes(true);
            if (WORLD_MAP_LOCK_OVERVIEW) {
                fitWorldOverview();
            } else {
                state.followPlayer = true;
                state.centerX = state.player.x;
                state.centerZ = state.player.z;
            }
            drawWorldMapNow(1 / 60);
            return;
        }
    }

    function syncFrameState(frameState = {}, { syncEntities = true } = {}) {
        const playerPoint = normalizeWorldPoint(frameState.playerPosition, state.player);
        state.player.x = playerPoint.x;
        state.player.z = playerPoint.z;
        state.player.heading = normalizeAngle(Number(frameState.playerHeading) || 0);
        state.player.speedKph = Math.max(0, Number(frameState.playerSpeedKph) || 0);

        state.mode = frameState.gameMode === 'online' ? 'online' : 'bots';
        state.overlays.welcomeVisible = Boolean(frameState.welcomeVisible);
        state.overlays.raceIntroActive = Boolean(frameState.raceIntroActive);
        state.overlays.editModeActive = Boolean(frameState.editModeActive);

        if (!syncEntities) {
            return;
        }

        const pickupsPayload =
            typeof frameState.getPickups === 'function'
                ? frameState.getPickups()
                : frameState.pickups;
        const botDescriptorsPayload =
            typeof frameState.getBotDescriptors === 'function'
                ? frameState.getBotDescriptors()
                : frameState.botDescriptors;
        const remotePlayersPayload =
            typeof frameState.getRemotePlayers === 'function'
                ? frameState.getRemotePlayers()
                : frameState.remotePlayers;
        const minesPayload =
            typeof frameState.getMines === 'function' ? frameState.getMines() : frameState.mines;

        normalizePickupsInPlace(state.pickups, pickupsPayload);
        normalizeVehiclesInPlace(state.vehicles, botDescriptorsPayload, remotePlayersPayload);
        normalizeMinesInPlace(state.mines, minesPayload);
    }

    function rebuildRoute() {
        if (!state.waypoint) {
            state.routePoints = [];
            state.routeDistanceMeters = null;
            state.routeBuildState.waypointX = Number.NaN;
            state.routeBuildState.waypointZ = Number.NaN;
            return;
        }

        const playerMovedSq = distanceSq2D(
            state.player.x,
            state.player.z,
            state.routeBuildState.playerX,
            state.routeBuildState.playerZ
        );
        const waypointMovedSq = distanceSq2D(
            state.waypoint.x,
            state.waypoint.z,
            state.routeBuildState.waypointX,
            state.routeBuildState.waypointZ
        );
        if (
            state.routePoints.length > 0 &&
            state.timers.routeRebuild < state.qualityProfile.routeRebuildIntervalSec &&
            playerMovedSq < state.qualityProfile.routeRebuildDistanceSq &&
            waypointMovedSq < 0.05
        ) {
            return;
        }
        state.timers.routeRebuild = 0;

        const routePoints = buildRoadRoute(
            { x: state.player.x, z: state.player.z },
            state.waypoint,
            cityMapLayout,
            worldBounds
        );
        state.routePoints = routePoints;
        state.routeDistanceMeters = computePathDistance(routePoints);
        state.routeBuildState.playerX = state.player.x;
        state.routeBuildState.playerZ = state.player.z;
        state.routeBuildState.waypointX = state.waypoint.x;
        state.routeBuildState.waypointZ = state.waypoint.z;
    }

    function drawMinimap(_deltaTime) {
        const canvas = dom.miniMapCanvas;
        const ctx = miniMapCtx;

        const width = canvas.width;
        const height = canvas.height;
        const minCanvasSize = Math.min(width, height);
        if (!Number.isFinite(width) || !Number.isFinite(height) || minCanvasSize < 24) {
            ctx.clearRect(0, 0, width, height);
            return;
        }

        const panelPadding = clamp(Math.round(width * 0.03), 4, Math.floor(minCanvasSize * 0.2));
        const cornerRadius = Math.round(width * 0.065);
        const mapRect = {
            x: panelPadding,
            y: panelPadding,
            w: width - panelPadding * 2,
            h: height - panelPadding * 2,
        };
        if (mapRect.w <= 4 || mapRect.h <= 4) {
            ctx.clearRect(0, 0, width, height);
            return;
        }

        ctx.clearRect(0, 0, width, height);
        drawRoundedPanel(ctx, mapRect.x, mapRect.y, mapRect.w, mapRect.h, cornerRadius);

        const rangeMeters = resolveMinimapRange(state.player.speedKph);
        const zoom = Math.min(mapRect.w, mapRect.h) / (rangeMeters * 2);
        const centerX = mapRect.x + mapRect.w * 0.5;
        const centerY = mapRect.y + mapRect.h * 0.5;

        ctx.save();
        clipRoundedRect(ctx, mapRect.x, mapRect.y, mapRect.w, mapRect.h, cornerRadius);
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
                spatialIndex: staticFeatures.buildingsIndex,
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
                spatialIndex: staticFeatures.treesIndex,
                color: 'rgba(112, 166, 122, 0.74)',
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
                spatialIndex: staticFeatures.lampsIndex,
                color: 'rgba(255, 215, 150, 0.76)',
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

        drawPlayerArrow(ctx, centerX, centerY, 0, resolveVehicleArrowSize('minimap', zoom), {
            fillColor: '#f4fbff',
            strokeColor: 'rgba(125, 217, 255, 0.98)',
            glassColor: 'rgba(212, 239, 255, 0.86)',
        });
        drawCompassTicks(ctx, mapRect);
    }

    function drawMinimapNow(deltaTime = 1 / 60) {
        state.timers.minimapDraw = 0;
        drawMinimap(deltaTime);
    }

    function drawWorldMap(_deltaTime) {
        if (WORLD_MAP_LOCK_OVERVIEW) {
            fitWorldOverview();
        }

        const canvas = dom.worldMapCanvas;
        const ctx = worldMapCtx;
        const width = canvas.width;
        const height = canvas.height;
        const centerScreenX = width * 0.5;
        const centerScreenY = height * 0.5;
        const worldMinX = centerScreenX + (worldBounds.minX - state.centerX) * state.zoom;
        const worldMaxX = centerScreenX + (worldBounds.maxX - state.centerX) * state.zoom;
        const worldMinY = centerScreenY + (worldBounds.minZ - state.centerZ) * state.zoom;
        const worldMaxY = centerScreenY + (worldBounds.maxZ - state.centerZ) * state.zoom;
        const worldDrawWidth = Math.max(1, worldMaxX - worldMinX);
        const worldDrawHeight = Math.max(1, worldMaxY - worldMinY);

        ctx.clearRect(0, 0, width, height);

        ctx.save();
        ctx.beginPath();
        ctx.rect(worldMinX, worldMinY, worldDrawWidth, worldDrawHeight);
        ctx.clip();
        drawWorldBackgroundGrid(ctx, {
            width,
            height,
            centerX: state.centerX,
            centerZ: state.centerZ,
            zoom: state.zoom,
            alpha: Math.max(0.012, Math.min(0.045, state.zoom * 0.006)),
        });

        ctx.save();
        ctx.translate(centerScreenX, centerScreenY);

        drawRoadBands(ctx, {
            mode: 'full',
            zoom: state.zoom,
            centerX: state.centerX,
            centerZ: state.centerZ,
            range: null,
            worldBounds,
            cityMapLayout,
        });

        drawBuildingFootprints(ctx, {
            mode: 'full',
            zoom: state.zoom,
            centerX: state.centerX,
            centerZ: state.centerZ,
            range: null,
            buildings: staticFeatures.buildings,
            spatialIndex: staticFeatures.buildingsIndex,
        });

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

        drawVehicleMarkers(ctx, {
            mode: 'full',
            zoom: state.zoom,
            centerX: state.centerX,
            centerZ: state.centerZ,
            range: null,
            vehicles: state.vehicles,
        });

        drawTrafficPulseRing(
            ctx,
            (state.player.x - state.centerX) * state.zoom,
            (state.player.z - state.centerZ) * state.zoom,
            resolveVehicleArrowSize('full', state.zoom) * 1.15,
            'rgba(123, 219, 255, 0.34)'
        );
        drawPlayerArrow(
            ctx,
            (state.player.x - state.centerX) * state.zoom,
            (state.player.z - state.centerZ) * state.zoom,
            -state.player.heading,
            resolveVehicleArrowSize('full', state.zoom),
            {
                fillColor: '#ffffff',
                strokeColor: 'rgba(122, 217, 255, 0.98)',
                glassColor: 'rgba(219, 243, 255, 0.88)',
            }
        );
        ctx.restore();
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

    function drawWorldMapNow(deltaTime = 1 / 60) {
        state.timers.worldMapDraw = 0;
        drawWorldMap(deltaTime);
    }

    function drawRoadBands(
        ctx,
        { mode, zoom, centerX, centerZ, range, worldBounds, cityMapLayout }
    ) {
        const xLines = cityMapLayout.roadAxisLinesX;
        const zLines = cityMapLayout.roadAxisLinesZ;
        const xMin = worldBounds.minX;
        const xMax = worldBounds.maxX;
        const zMin = worldBounds.minZ;
        const zMax = worldBounds.maxZ;

        for (let i = 0; i < xLines.length; i += 1) {
            const line = xLines[i];
            if (
                !Number.isFinite(line?.coord) ||
                !Number.isFinite(line?.roadWidth) ||
                (Number.isFinite(range) &&
                    Math.abs(line.coord - centerX) > range + Math.max(4, line.roadWidth * 1.4))
            ) {
                continue;
            }
            drawSingleRoadBand(ctx, {
                axis: 'x',
                line,
                mode,
                zoom,
                centerX,
                centerZ,
                extentMin: zMin,
                extentMax: zMax,
            });
        }

        for (let i = 0; i < zLines.length; i += 1) {
            const line = zLines[i];
            if (
                !Number.isFinite(line?.coord) ||
                !Number.isFinite(line?.roadWidth) ||
                (Number.isFinite(range) &&
                    Math.abs(line.coord - centerZ) > range + Math.max(4, line.roadWidth * 1.4))
            ) {
                continue;
            }
            drawSingleRoadBand(ctx, {
                axis: 'z',
                line,
                mode,
                zoom,
                centerX,
                centerZ,
                extentMin: xMin,
                extentMax: xMax,
            });
        }

        if (mode === 'full') {
            drawRoadIntersections(ctx, {
                zoom,
                centerX,
                centerZ,
                xLines,
                zLines,
            });
        }
    }

    function drawSingleRoadBand(
        ctx,
        { axis, line, mode, zoom, centerX, centerZ, extentMin, extentMax }
    ) {
        const appearance = resolveRoadAppearance(line.styleKey, mode);
        const roadHalfWidth = line.roadWidth * 0.5;
        const sidewalkWidth = resolveRenderedSidewalkWidth(line.styleKey, line.sidewalkWidth);
        if (sidewalkWidth > 0) {
            ctx.fillStyle = appearance.sidewalkColor;
            fillRoadRect(
                ctx,
                axis,
                line.coord,
                roadHalfWidth + sidewalkWidth,
                extentMin,
                extentMax,
                centerX,
                centerZ,
                zoom
            );
        }

        ctx.fillStyle = appearance.roadColor;
        fillRoadRect(
            ctx,
            axis,
            line.coord,
            roadHalfWidth,
            extentMin,
            extentMax,
            centerX,
            centerZ,
            zoom
        );

        if (appearance.glowColor) {
            ctx.save();
            ctx.strokeStyle = appearance.glowColor;
            ctx.lineWidth = mode === 'full' ? clamp(zoom * 0.14, 3.2, 8.4) : 1.4;
            ctx.shadowColor = appearance.glowColor;
            ctx.shadowBlur = mode === 'full' ? clamp(zoom * 0.88, 10, 24) : 5.5;
            strokeRoadRect(
                ctx,
                axis,
                line.coord,
                roadHalfWidth,
                extentMin,
                extentMax,
                centerX,
                centerZ,
                zoom
            );
            ctx.restore();
        }

        ctx.strokeStyle = appearance.edgeColor;
        ctx.lineWidth = mode === 'full' ? 1 : 0.8;
        strokeRoadRect(
            ctx,
            axis,
            line.coord,
            roadHalfWidth,
            extentMin,
            extentMax,
            centerX,
            centerZ,
            zoom
        );

        drawRoadMarkings(ctx, {
            axis,
            line,
            mode,
            zoom,
            centerX,
            centerZ,
            extentMin,
            extentMax,
            appearance,
        });
    }

    function drawRoadIntersections(ctx, { zoom, centerX, centerZ, xLines, zLines }) {
        void ctx;
        void zoom;
        void centerX;
        void centerZ;
        void xLines;
        void zLines;
    }

    function drawRoadMarkings(
        ctx,
        { axis, line, mode, zoom, centerX, centerZ, extentMin, extentMax, appearance }
    ) {
        if (mode === 'minimap' && zoom < 4.6) {
            return;
        }

        const edgeOffsets = appearance.sideLinePositionRatios.map(
            (ratio) => (ratio - 0.5) * line.roadWidth
        );
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = appearance.edgeLineColor;
        ctx.lineWidth = clamp(zoom * appearance.edgeLineWidthScale, 1.05, 2.3);
        ctx.shadowColor = mode === 'full' ? appearance.edgeLineColor : 'transparent';
        ctx.shadowBlur = mode === 'full' ? clamp(zoom * 0.42, 3, 10) : 0;
        ctx.setLineDash([]);
        for (let i = 0; i < edgeOffsets.length; i += 1) {
            drawRoadStripe(
                ctx,
                axis,
                line.coord,
                edgeOffsets[i],
                extentMin,
                extentMax,
                centerX,
                centerZ,
                zoom
            );
        }

        if (appearance.centerMode === 'none') {
            ctx.restore();
            return;
        }

        ctx.strokeStyle = appearance.centerLineColor;
        ctx.lineWidth = clamp(zoom * appearance.centerLineWidthScale, 1.25, 3.2);
        if (appearance.centerMode === 'double-solid') {
            const medianOffset = clamp(zoom * 0.26, 2.4, 4.8) / Math.max(zoom, 0.001);
            ctx.setLineDash([]);
            drawRoadStripe(
                ctx,
                axis,
                line.coord,
                -medianOffset,
                extentMin,
                extentMax,
                centerX,
                centerZ,
                zoom
            );
            drawRoadStripe(
                ctx,
                axis,
                line.coord,
                medianOffset,
                extentMin,
                extentMax,
                centerX,
                centerZ,
                zoom
            );
        } else {
            const dashBase = mode === 'full' ? clamp(zoom * 0.68, 8, 18) : clamp(zoom * 0.6, 5, 12);
            ctx.setLineDash([dashBase, dashBase * 0.85]);
            ctx.lineDashOffset = -state.animationTime * (mode === 'full' ? 26 : 18);
            drawRoadStripe(ctx, axis, line.coord, 0, extentMin, extentMax, centerX, centerZ, zoom);
        }

        ctx.restore();
    }

    function drawRoadStripe(
        ctx,
        axis,
        fixedCoord,
        offset,
        extentMin,
        extentMax,
        centerX,
        centerZ,
        zoom
    ) {
        const coord = fixedCoord + offset;
        if (axis === 'x') {
            const px = (coord - centerX) * zoom;
            const py0 = (extentMin - centerZ) * zoom;
            const py1 = (extentMax - centerZ) * zoom;
            ctx.beginPath();
            ctx.moveTo(px, py0);
            ctx.lineTo(px, py1);
            ctx.stroke();
            return;
        }

        const py = (coord - centerZ) * zoom;
        const px0 = (extentMin - centerX) * zoom;
        const px1 = (extentMax - centerX) * zoom;
        ctx.beginPath();
        ctx.moveTo(px0, py);
        ctx.lineTo(px1, py);
        ctx.stroke();
    }

    function drawBuildingFootprints(
        ctx,
        { mode, zoom, centerX, centerZ, range, buildings, spatialIndex = null }
    ) {
        const drawBuildings =
            Number.isFinite(range) && spatialIndex
                ? querySpatialIndexItems(
                      buildings,
                      spatialIndex,
                      centerX - range,
                      centerX + range,
                      centerZ - range,
                      centerZ + range
                  )
                : buildings;

        for (let i = 0; i < drawBuildings.length; i += 1) {
            const building = drawBuildings[i];
            if (Number.isFinite(range)) {
                if (building.maxX < centerX - range || building.minX > centerX + range) {
                    continue;
                }
                if (building.maxZ < centerZ - range || building.minZ > centerZ + range) {
                    continue;
                }
            }

            const left = (building.minX - centerX) * zoom;
            const top = (building.minZ - centerZ) * zoom;
            const widthPx = Math.max(0.8, (building.maxX - building.minX) * zoom);
            const heightPx = Math.max(0.8, (building.maxZ - building.minZ) * zoom);
            const radius = clamp(
                Math.min(widthPx, heightPx) * (mode === 'full' ? 0.16 : 0.12),
                mode === 'full' ? 2.4 : 1.2,
                mode === 'full' ? 8 : 4
            );
            const shadowOffset =
                mode === 'full' ? clamp(Math.min(widthPx, heightPx) * 0.16, 2, 6.5) : 1;
            const palette = resolveBuildingPalette(building, mode);

            if (mode === 'full') {
                ctx.save();
                ctx.shadowColor = palette.glow;
                ctx.shadowBlur = clamp(Math.min(widthPx, heightPx) * 0.85, 10, 28);
                ctx.fillStyle = palette.glowFill;
                roundedRectPath(ctx, left, top, widthPx, heightPx, radius);
                ctx.fill();
                ctx.restore();
            }

            ctx.fillStyle = palette.shadow;
            roundedRectPath(
                ctx,
                left + shadowOffset,
                top + shadowOffset,
                widthPx,
                heightPx,
                radius
            );
            ctx.fill();

            ctx.fillStyle = palette.body;
            roundedRectPath(ctx, left, top, widthPx, heightPx, radius);
            ctx.fill();

            if (mode === 'full') {
                ctx.save();
                ctx.strokeStyle = palette.outlineGlow;
                ctx.lineWidth = 1.8;
                ctx.shadowColor = palette.glow;
                ctx.shadowBlur = 14;
                roundedRectPath(ctx, left, top, widthPx, heightPx, radius);
                ctx.stroke();
                ctx.restore();
            }

            ctx.strokeStyle = palette.outline;
            ctx.lineWidth = mode === 'full' ? 1.1 : 0.9;
            roundedRectPath(ctx, left, top, widthPx, heightPx, radius);
            ctx.stroke();

            const roofInset = clamp(
                Math.min(widthPx, heightPx) * 0.16,
                1.2,
                mode === 'full' ? 8 : 7
            );
            if (widthPx > roofInset * 2 + 1 && heightPx > roofInset * 2 + 1) {
                ctx.fillStyle = palette.roof;
                roundedRectPath(
                    ctx,
                    left + roofInset,
                    top + roofInset,
                    widthPx - roofInset * 2,
                    heightPx - roofInset * 2,
                    Math.max(1, radius * 0.62)
                );
                ctx.fill();
                if (mode === 'full') {
                    ctx.strokeStyle = palette.roofOutline;
                    ctx.lineWidth = 0.9;
                    roundedRectPath(
                        ctx,
                        left + roofInset,
                        top + roofInset,
                        widthPx - roofInset * 2,
                        heightPx - roofInset * 2,
                        Math.max(1, radius * 0.62)
                    );
                    ctx.stroke();
                }
            }

            if (mode === 'full' && widthPx > 18 && heightPx > 16) {
                drawBuildingScanlines(ctx, {
                    left: left + roofInset,
                    top: top + roofInset,
                    widthPx: widthPx - roofInset * 2,
                    heightPx: heightPx - roofInset * 2,
                    color: palette.detail,
                });
            }
        }
    }

    function drawBuildingScanlines(ctx, { left, top, widthPx, heightPx, color }) {
        if (widthPx <= 8 || heightPx <= 8) {
            return;
        }

        const horizontal = widthPx >= heightPx;
        const step = clamp(Math.min(widthPx, heightPx) * 0.22, 6, 14);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        for (
            let offset = step * 0.8;
            offset < (horizontal ? heightPx : widthPx) - step * 0.4;
            offset += step
        ) {
            ctx.beginPath();
            if (horizontal) {
                ctx.moveTo(left + widthPx * 0.18, top + offset);
                ctx.lineTo(left + widthPx * 0.82, top + offset);
            } else {
                ctx.moveTo(left + offset, top + heightPx * 0.18);
                ctx.lineTo(left + offset, top + heightPx * 0.82);
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawCircleObstacles(
        ctx,
        { mode, zoom, centerX, centerZ, range, circles, color, spatialIndex = null }
    ) {
        ctx.fillStyle = color;
        const minRadiusPx = mode === 'full' ? 0.8 : 0.7;
        const drawCircles =
            Number.isFinite(range) && spatialIndex
                ? querySpatialIndexItems(
                      circles,
                      spatialIndex,
                      centerX - range,
                      centerX + range,
                      centerZ - range,
                      centerZ + range
                  )
                : circles;
        for (let i = 0; i < drawCircles.length; i += 1) {
            const circle = drawCircles[i];
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
        const pulse = 0.5 + 0.5 * Math.sin(state.animationTime * 3.4);
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
            const radius = Math.max(mode === 'full' ? 4 : 3, zone.radius * zoom);

            ctx.save();
            ctx.beginPath();
            ctx.arc(px, py, radius + pulse * (mode === 'full' ? 5.4 : 3), 0, Math.PI * 2);
            ctx.strokeStyle =
                mode === 'full' ? 'rgba(126, 236, 201, 0.18)' : 'rgba(126, 236, 201, 0.14)';
            ctx.lineWidth = mode === 'full' ? 2 : 1.2;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fillStyle = mode === 'full' ? 'rgba(46, 90, 79, 0.36)' : 'rgba(46, 90, 79, 0.28)';
            ctx.fill();
            ctx.strokeStyle =
                mode === 'full' ? 'rgba(132, 244, 214, 0.92)' : 'rgba(132, 244, 214, 0.84)';
            ctx.lineWidth = mode === 'full' ? 2 : 1.3;
            ctx.stroke();
            ctx.restore();
        }
    }

    function drawRouteLine(ctx, { mode, zoom, centerX, centerZ, range, routePoints }) {
        if (!Array.isArray(routePoints) || routePoints.length < 2) {
            return;
        }

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        let started = false;
        for (let pass = 0; pass < 2; pass += 1) {
            started = false;
            ctx.beginPath();
            for (let i = 0; i < routePoints.length; i += 1) {
                const point = routePoints[i];
                if (!isWorldPointVisible(point, centerX, centerZ, range)) {
                    continue;
                }
                const px = (point.x - centerX) * zoom;
                const py = (point.z - centerZ) * zoom;
                if (!started) {
                    ctx.moveTo(px, py);
                    started = true;
                } else {
                    ctx.lineTo(px, py);
                }
            }

            if (!started) {
                continue;
            }

            if (pass === 0) {
                ctx.strokeStyle =
                    mode === 'full' ? 'rgba(93, 232, 255, 0.22)' : 'rgba(93, 232, 255, 0.18)';
                ctx.lineWidth = mode === 'full' ? 8 : 5;
                ctx.setLineDash([]);
                ctx.shadowColor =
                    mode === 'full' ? 'rgba(93, 232, 255, 0.32)' : 'rgba(93, 232, 255, 0.18)';
                ctx.shadowBlur = mode === 'full' ? 18 : 8;
                ctx.stroke();
            } else {
                ctx.strokeStyle =
                    mode === 'full' ? 'rgba(217, 248, 255, 0.95)' : 'rgba(196, 246, 255, 0.92)';
                ctx.lineWidth = mode === 'full' ? 3.2 : 2.3;
                const dashBase =
                    mode === 'full' ? clamp(zoom * 0.72, 10, 20) : clamp(zoom * 0.5, 6, 10);
                ctx.setLineDash([dashBase, dashBase * 0.9]);
                ctx.lineDashOffset = -state.animationTime * 22;
                ctx.shadowColor = 'transparent';
                ctx.stroke();
            }
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
            const outerRadius = mode === 'full' ? 5.2 : 4;
            const innerRadius = mode === 'full' ? 2.5 : 2;

            ctx.beginPath();
            ctx.arc(px, py, outerRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(8, 16, 23, 0.44)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(px, py, outerRadius - 1, 0, Math.PI * 2);
            ctx.strokeStyle = pickup.isTarget
                ? 'rgba(240, 250, 255, 0.98)'
                : 'rgba(212, 239, 255, 0.48)';
            ctx.lineWidth = pickup.isTarget ? 1.8 : 1.2;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(px, py, innerRadius, 0, Math.PI * 2);
            ctx.fillStyle = pickup.color;
            ctx.fill();
        }
    }

    function drawVehicleMarkers(ctx, { mode, zoom, centerX, centerZ, range, vehicles }) {
        for (let i = 0; i < vehicles.length; i += 1) {
            const vehicle = vehicles[i];
            const px = (vehicle.x - centerX) * zoom;
            const py = (vehicle.z - centerZ) * zoom;
            const markerSize =
                resolveVehicleArrowSize(mode, zoom) * (vehicle.type === 'player' ? 1.02 : 0.92);
            const markerStyle = resolveVehicleArrowStyle(vehicle.color, mode);
            const pulseColor =
                vehicle.type === 'player'
                    ? 'rgba(255, 151, 126, 0.34)'
                    : 'rgba(108, 221, 255, 0.26)';
            const visible = isWorldPointVisible(vehicle, centerX, centerZ, range);

            if (!visible) {
                if (mode !== 'minimap' || vehicle.type !== 'bot') {
                    continue;
                }

                drawMinimapEdgeVehicleIndicator(ctx, {
                    px,
                    py,
                    range,
                    zoom,
                    markerSize,
                    markerStyle,
                    pulseColor,
                });
                continue;
            }

            drawTrafficPulseRing(ctx, px, py, markerSize * 0.95, pulseColor);
            drawPlayerArrow(ctx, px, py, -vehicle.heading, markerSize, {
                fillColor: markerStyle.fillColor,
                strokeColor: markerStyle.strokeColor,
                glassColor:
                    vehicle.type === 'player'
                        ? 'rgba(255, 233, 229, 0.82)'
                        : 'rgba(214, 238, 255, 0.82)',
                accentColor:
                    vehicle.type === 'player'
                        ? 'rgba(121, 39, 34, 0.32)'
                        : 'rgba(17, 39, 56, 0.28)',
                widthScale: vehicle.type === 'player' ? 1.03 : 0.96,
                lengthScale: vehicle.type === 'player' ? 1.04 : 0.94,
            });
        }
    }

    function drawMinimapEdgeVehicleIndicator(
        ctx,
        { px, py, range, zoom, markerSize, markerStyle, pulseColor }
    ) {
        if (!Number.isFinite(range) || !Number.isFinite(zoom)) {
            return;
        }

        const distance = Math.hypot(px, py);
        if (!Number.isFinite(distance) || distance < 0.001) {
            return;
        }

        const edgeRadius = Math.max(markerSize * 2.3, range * zoom - markerSize * 2.65 - 6);
        const unitX = px / distance;
        const unitY = py / distance;
        const indicatorX = unitX * edgeRadius;
        const indicatorY = unitY * edgeRadius;
        const rotation = Math.atan2(py, px) + Math.PI * 0.5;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(indicatorX - unitX * markerSize * 1.5, indicatorY - unitY * markerSize * 1.5);
        ctx.lineTo(indicatorX - unitX * markerSize * 3.1, indicatorY - unitY * markerSize * 3.1);
        ctx.strokeStyle = 'rgba(125, 226, 255, 0.34)';
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();

        drawTrafficPulseRing(ctx, indicatorX, indicatorY, markerSize * 0.86, pulseColor);
        drawPlayerArrow(ctx, indicatorX, indicatorY, rotation, markerSize * 0.92, {
            fillColor: markerStyle.fillColor,
            strokeColor: markerStyle.strokeColor,
            glassColor: 'rgba(214, 238, 255, 0.88)',
            accentColor: 'rgba(17, 39, 56, 0.28)',
            widthScale: 0.92,
            lengthScale: 0.9,
        });
    }

    function drawMineMarkers(ctx, { mode, zoom, centerX, centerZ, range, mines }) {
        for (let i = 0; i < mines.length; i += 1) {
            const mine = mines[i];
            if (!isWorldPointVisible(mine, centerX, centerZ, range)) {
                continue;
            }
            const px = (mine.x - centerX) * zoom;
            const py = (mine.z - centerZ) * zoom;
            const size = mode === 'full' ? 5.4 : 4.2;
            drawCrossMarker(
                ctx,
                px,
                py,
                size,
                mine.armed ? 'rgba(255, 127, 127, 0.98)' : 'rgba(255, 204, 138, 0.94)',
                mine.armed ? 2 : 1.5
            );
        }
    }

    function drawWaypointMarker(ctx, { mode, zoom, centerX, centerZ, range, waypoint }) {
        if (!waypoint || !isWorldPointVisible(waypoint, centerX, centerZ, range)) {
            return;
        }
        const px = (waypoint.x - centerX) * zoom;
        const py = (waypoint.z - centerZ) * zoom;
        const pulse = 0.5 + 0.5 * Math.sin(state.animationTime * 4.4);
        const outerRadius = mode === 'full' ? 9 + pulse * 4 : 6 + pulse * 2;
        const innerRadius = mode === 'full' ? 4 : 3;

        ctx.beginPath();
        ctx.arc(px, py, outerRadius, 0, Math.PI * 2);
        ctx.strokeStyle =
            mode === 'full' ? 'rgba(111, 235, 255, 0.42)' : 'rgba(111, 235, 255, 0.34)';
        ctx.lineWidth = mode === 'full' ? 2.2 : 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, innerRadius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232, 249, 255, 0.96)';
        ctx.lineWidth = mode === 'full' ? 2 : 1.4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, innerRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(126, 241, 255, 0.98)';
        ctx.fill();
    }

    function drawMinimapGrid(ctx, range, zoom) {
        const ringRadii = [range * 0.36, range * 0.68, range];
        const sweepRadius = range * zoom;
        const sweepAngle = state.animationTime * 0.95;
        ctx.save();
        ctx.rotate(sweepAngle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, sweepRadius, -0.2, 0.1);
        ctx.closePath();
        ctx.fillStyle = 'rgba(116, 240, 255, 0.08)';
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = 'rgba(172, 208, 230, 0.12)';
        ctx.lineWidth = 1;
        for (let i = 0; i < ringRadii.length; i += 1) {
            ctx.beginPath();
            ctx.arc(0, 0, ringRadii[i] * zoom, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.moveTo(-range * zoom, 0);
        ctx.lineTo(range * zoom, 0);
        ctx.moveTo(0, -range * zoom);
        ctx.lineTo(0, range * zoom);
        ctx.strokeStyle = 'rgba(172, 208, 230, 0.1)';
        ctx.stroke();
    }

    function drawWorldBackgroundGrid(ctx, { width, height, centerX, centerZ, zoom, alpha }) {
        const baseGradient = ctx.createLinearGradient(0, 0, 0, height);
        baseGradient.addColorStop(0, 'rgba(5, 13, 19, 0.46)');
        baseGradient.addColorStop(1, 'rgba(2, 8, 13, 0.58)');
        ctx.fillStyle = baseGradient;
        ctx.fillRect(0, 0, width, height);

        const centerGlow = ctx.createRadialGradient(
            width * 0.5,
            height * 0.5,
            0,
            width * 0.5,
            height * 0.5,
            Math.min(width, height) * 0.46
        );
        centerGlow.addColorStop(0, 'rgba(81, 224, 255, 0.16)');
        centerGlow.addColorStop(0.45, 'rgba(81, 224, 255, 0.06)');
        centerGlow.addColorStop(1, 'rgba(81, 224, 255, 0)');
        ctx.fillStyle = centerGlow;
        ctx.fillRect(0, 0, width, height);

        const playerScreenX = width * 0.5 + (state.player.x - centerX) * zoom;
        const playerScreenY = height * 0.5 + (state.player.z - centerZ) * zoom;
        const playerGlow = ctx.createRadialGradient(
            playerScreenX,
            playerScreenY,
            0,
            playerScreenX,
            playerScreenY,
            Math.max(width, height) * 0.24
        );
        playerGlow.addColorStop(0, 'rgba(134, 237, 255, 0.14)');
        playerGlow.addColorStop(1, 'rgba(134, 237, 255, 0)');
        ctx.fillStyle = playerGlow;
        ctx.fillRect(0, 0, width, height);

        drawWorldGridLines(ctx, {
            width,
            height,
            centerX,
            centerZ,
            zoom,
            step: 6,
            lineWidth: 1,
            color: `rgba(129, 231, 255, ${alpha.toFixed(3)})`,
        });
        drawWorldGridLines(ctx, {
            width,
            height,
            centerX,
            centerZ,
            zoom,
            step: 18,
            lineWidth: 1.35,
            color: `rgba(201, 247, 255, ${Math.min(alpha * 2.6, 0.12).toFixed(3)})`,
        });

        const sweepY = ((state.animationTime * 34) % (height + 220)) - 110;
        const sweepGradient = ctx.createLinearGradient(0, sweepY - 90, 0, sweepY + 90);
        sweepGradient.addColorStop(0, 'rgba(134, 237, 255, 0)');
        sweepGradient.addColorStop(0.5, 'rgba(134, 237, 255, 0.06)');
        sweepGradient.addColorStop(1, 'rgba(134, 237, 255, 0)');
        ctx.fillStyle = sweepGradient;
        ctx.fillRect(0, sweepY - 90, width, 180);
    }

    function drawWorldFrame(ctx, { width, height, worldBounds, centerX, centerZ, zoom }) {
        const insetX = clamp(width * 0.09, 46, 112);
        const insetY = clamp(height * 0.05, 28, 74);
        const frameX = insetX;
        const frameY = insetY;
        const frameW = width - insetX * 2;
        const frameH = height - insetY * 2;
        const traffic = summarizeTraffic(state.vehicles);
        const zoomPercent = Math.round((zoom / Math.max(state.fitZoom, 0.001)) * 100);

        ctx.save();

        const edgeFade = ctx.createRadialGradient(
            width * 0.5,
            height * 0.5,
            Math.min(width, height) * 0.24,
            width * 0.5,
            height * 0.5,
            Math.max(width, height) * 0.72
        );
        edgeFade.addColorStop(0, 'rgba(0, 0, 0, 0)');
        edgeFade.addColorStop(1, 'rgba(2, 8, 13, 0.28)');
        ctx.fillStyle = edgeFade;
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = 'rgba(164, 239, 255, 0.24)';
        ctx.lineWidth = 1;
        ctx.strokeRect(frameX, frameY, frameW, frameH);
        drawHudFrameBrackets(ctx, frameX, frameY, frameW, frameH);

        drawHudTitle(ctx, frameX + 18, frameY - 6, 'TACTICAL HOLOGRAM', 'CITY BLUEPRINT');
        drawHudBadge(
            ctx,
            frameX + frameW - 18,
            frameY + 24,
            state.routeDistanceMeters != null
                ? `ROUTE ${Math.round(state.routeDistanceMeters)}M`
                : `LIVE ${traffic.total}`,
            'right'
        );
        drawHudBadge(ctx, frameX + frameW - 18, frameY + 56, `ZOOM ${zoomPercent}%`, 'right');
        drawHudFooterText(
            ctx,
            frameX + 18,
            frameY + frameH + 26,
            `PLAYER X ${Math.round(state.player.x)}  Z ${Math.round(state.player.z)}`
        );
        drawHudFooterText(
            ctx,
            frameX + frameW - 18,
            frameY + frameH + 26,
            WORLD_MAP_LOCK_OVERVIEW ? 'OVERVIEW LOCKED  M CLOSE' : 'LMB WAYPOINT  RMB CLEAR',
            'right'
        );
        drawHudFooterText(
            ctx,
            width * 0.5,
            frameY + frameH + 26,
            `SECTOR ${Math.round(worldBounds.maxX - worldBounds.minX)} x ${Math.round(worldBounds.maxZ - worldBounds.minZ)}`,
            'center'
        );

        const focusX = width * 0.5 + (state.player.x - centerX) * zoom;
        const focusY = height * 0.5 + (state.player.z - centerZ) * zoom;
        ctx.beginPath();
        ctx.moveTo(focusX - 12, focusY);
        ctx.lineTo(focusX + 12, focusY);
        ctx.moveTo(focusX, focusY - 12);
        ctx.lineTo(focusX, focusY + 12);
        ctx.strokeStyle = 'rgba(215, 248, 255, 0.38)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }

    function drawCompassTicks(ctx, mapRect) {
        const cx = mapRect.x + mapRect.w * 0.5;
        const cy = mapRect.y + mapRect.h * 0.5;
        const radius = Math.max(0, Math.min(mapRect.w, mapRect.h) * 0.5 - 9);
        if (!Number.isFinite(radius) || radius < 1) {
            return;
        }
        ctx.save();
        ctx.strokeStyle = 'rgba(175, 234, 248, 0.24)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy - radius);
        ctx.lineTo(cx, cy - radius + 12);
        ctx.strokeStyle = 'rgba(235, 250, 255, 0.72)';
        ctx.stroke();
        ctx.font = "700 10px 'Orbitron', 'Sora', sans-serif";
        ctx.fillStyle = 'rgba(226, 248, 255, 0.94)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('N', cx, cy - radius + 20);
        ctx.restore();
    }

    function drawWorldGridLines(
        ctx,
        { width, height, centerX, centerZ, zoom, step, lineWidth, color }
    ) {
        if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(zoom) || zoom <= 0) {
            return;
        }

        const halfWorldWidth = (width / Math.max(1e-6, zoom)) * 0.5;
        const halfWorldHeight = (height / Math.max(1e-6, zoom)) * 0.5;
        const minWorldX = centerX - halfWorldWidth;
        const maxWorldX = centerX + halfWorldWidth;
        const minWorldZ = centerZ - halfWorldHeight;
        const maxWorldZ = centerZ + halfWorldHeight;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();

        const startX = Math.floor(minWorldX / step) * step;
        for (let worldX = startX; worldX <= maxWorldX + step; worldX += step) {
            const screenX = width * 0.5 + (worldX - centerX) * zoom;
            ctx.moveTo(screenX, 0);
            ctx.lineTo(screenX, height);
        }

        const startZ = Math.floor(minWorldZ / step) * step;
        for (let worldZ = startZ; worldZ <= maxWorldZ + step; worldZ += step) {
            const screenY = height * 0.5 + (worldZ - centerZ) * zoom;
            ctx.moveTo(0, screenY);
            ctx.lineTo(width, screenY);
        }

        ctx.stroke();
        ctx.restore();
    }

    function drawHudFrameBrackets(ctx, x, y, width, height) {
        const segment = clamp(Math.min(width, height) * 0.045, 18, 34);
        ctx.save();
        ctx.strokeStyle = 'rgba(176, 241, 255, 0.78)';
        ctx.lineWidth = 1.4;
        ctx.shadowColor = 'rgba(91, 223, 255, 0.28)';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(x, y + segment);
        ctx.lineTo(x, y);
        ctx.lineTo(x + segment, y);
        ctx.moveTo(x + width - segment, y);
        ctx.lineTo(x + width, y);
        ctx.lineTo(x + width, y + segment);
        ctx.moveTo(x, y + height - segment);
        ctx.lineTo(x, y + height);
        ctx.lineTo(x + segment, y + height);
        ctx.moveTo(x + width - segment, y + height);
        ctx.lineTo(x + width, y + height);
        ctx.lineTo(x + width, y + height - segment);
        ctx.stroke();
        ctx.restore();
    }

    function drawHudTitle(ctx, x, y, kicker, title) {
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = "700 10px 'Sora', sans-serif";
        ctx.fillStyle = 'rgba(157, 230, 247, 0.88)';
        ctx.fillText(kicker, x, y);
        ctx.font = "800 18px 'Orbitron', 'Sora', sans-serif";
        ctx.fillStyle = 'rgba(236, 250, 255, 0.96)';
        ctx.fillText(title, x, y + 14);
        ctx.restore();
    }

    function drawHudBadge(ctx, x, y, text, align = 'left') {
        ctx.save();
        ctx.font = "800 11px 'Orbitron', 'Sora', sans-serif";
        const paddingX = 12;
        const width = ctx.measureText(text).width + paddingX * 2;
        const height = 28;
        const left = align === 'right' ? x - width : align === 'center' ? x - width * 0.5 : x;
        const top = y - height * 0.5;
        roundedRectPath(ctx, left, top, width, height, 12);
        ctx.fillStyle = 'rgba(8, 20, 28, 0.62)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(165, 237, 255, 0.28)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(225, 249, 255, 0.96)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, left + width * 0.5, top + height * 0.54);
        ctx.restore();
    }

    function drawHudFooterText(ctx, x, y, text, align = 'left') {
        ctx.save();
        ctx.font = "700 10px 'Orbitron', 'Sora', sans-serif";
        ctx.fillStyle = 'rgba(182, 235, 246, 0.74)';
        ctx.textBaseline = 'middle';
        ctx.textAlign = align;
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    function fillWorldQuadFromBounds(ctx, centerX, centerZ, zoom, minX, maxX, minZ, maxZ) {
        const x0 = (minX - centerX) * zoom;
        const x1 = (maxX - centerX) * zoom;
        const y0 = (minZ - centerZ) * zoom;
        const y1 = (maxZ - centerZ) * zoom;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x0, y1);
        ctx.closePath();
        ctx.fill();
    }

    function strokeWorldQuadFromBounds(ctx, centerX, centerZ, zoom, minX, maxX, minZ, maxZ) {
        const x0 = (minX - centerX) * zoom;
        const x1 = (maxX - centerX) * zoom;
        const y0 = (minZ - centerZ) * zoom;
        const y1 = (maxZ - centerZ) * zoom;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x0, y1);
        ctx.closePath();
        ctx.stroke();
    }

    function strokeAndFillWorldQuadFromBounds(ctx, centerX, centerZ, zoom, minX, maxX, minZ, maxZ) {
        fillWorldQuadFromBounds(ctx, centerX, centerZ, zoom, minX, maxX, minZ, maxZ);
        strokeWorldQuadFromBounds(ctx, centerX, centerZ, zoom, minX, maxX, minZ, maxZ);
    }

    function fillRoadRect(
        ctx,
        axis,
        coord,
        halfWidth,
        extentMin,
        extentMax,
        centerX,
        centerZ,
        zoom
    ) {
        if (axis === 'x') {
            fillWorldQuadFromBounds(
                ctx,
                centerX,
                centerZ,
                zoom,
                coord - halfWidth,
                coord + halfWidth,
                extentMin,
                extentMax
            );
            return;
        }
        fillWorldQuadFromBounds(
            ctx,
            centerX,
            centerZ,
            zoom,
            extentMin,
            extentMax,
            coord - halfWidth,
            coord + halfWidth
        );
    }

    function strokeRoadRect(
        ctx,
        axis,
        coord,
        halfWidth,
        extentMin,
        extentMax,
        centerX,
        centerZ,
        zoom
    ) {
        if (axis === 'x') {
            strokeWorldQuadFromBounds(
                ctx,
                centerX,
                centerZ,
                zoom,
                coord - halfWidth,
                coord + halfWidth,
                extentMin,
                extentMax
            );
            return;
        }
        strokeWorldQuadFromBounds(
            ctx,
            centerX,
            centerZ,
            zoom,
            extentMin,
            extentMax,
            coord - halfWidth,
            coord + halfWidth
        );
    }

    function resolveRoadAppearance(styleKey, mode) {
        const fullMode = mode === 'full';
        if (styleKey === 'boulevard') {
            return {
                sidewalkColor: fullMode ? 'rgba(51, 120, 156, 0.12)' : 'rgba(76, 134, 170, 0.2)',
                roadColor: fullMode ? 'rgba(7, 20, 29, 0.34)' : 'rgba(16, 30, 43, 0.82)',
                glowColor: fullMode ? 'rgba(93, 229, 255, 0.16)' : 'rgba(93, 229, 255, 0.1)',
                edgeColor: fullMode ? 'rgba(199, 242, 255, 0.18)' : 'rgba(210, 236, 245, 0.08)',
                edgeLineColor: fullMode ? 'rgba(174, 241, 255, 0.5)' : 'rgba(208, 241, 250, 0.28)',
                edgeLineWidthScale: 0.052,
                sideLinePositionRatios: [0.17, 0.83],
                centerLineColor: fullMode
                    ? 'rgba(155, 241, 255, 0.46)'
                    : 'rgba(155, 241, 255, 0.36)',
                centerLineWidthScale: 0.045,
                centerMode: 'dashed',
            };
        }
        if (styleKey === 'service') {
            return {
                sidewalkColor: fullMode ? 'rgba(48, 86, 112, 0.08)' : 'rgba(63, 96, 123, 0.1)',
                roadColor: fullMode ? 'rgba(7, 16, 24, 0.2)' : 'rgba(14, 23, 34, 0.66)',
                glowColor: fullMode ? 'rgba(92, 213, 255, 0.08)' : 'rgba(92, 213, 255, 0.04)',
                edgeColor: 'rgba(214, 238, 250, 0.08)',
                edgeLineColor: fullMode ? 'rgba(149, 209, 226, 0.16)' : 'rgba(149, 209, 226, 0.1)',
                edgeLineWidthScale: 0.032,
                sideLinePositionRatios: [0.14, 0.86],
                centerLineColor: 'rgba(0, 0, 0, 0)',
                centerLineWidthScale: 0.03,
                centerMode: 'none',
            };
        }
        return {
            sidewalkColor: fullMode ? 'rgba(54, 112, 144, 0.1)' : 'rgba(75, 130, 162, 0.18)',
            roadColor: fullMode ? 'rgba(7, 18, 28, 0.28)' : 'rgba(16, 29, 42, 0.78)',
            glowColor: fullMode ? 'rgba(91, 223, 255, 0.12)' : 'rgba(91, 223, 255, 0.08)',
            edgeColor: fullMode ? 'rgba(205, 243, 255, 0.14)' : 'rgba(214, 238, 248, 0.08)',
            edgeLineColor: fullMode ? 'rgba(196, 241, 255, 0.34)' : 'rgba(208, 239, 250, 0.22)',
            edgeLineWidthScale: 0.047,
            sideLinePositionRatios: [0.16, 0.84],
            centerLineColor: fullMode ? 'rgba(173, 241, 255, 0.38)' : 'rgba(193, 244, 255, 0.32)',
            centerLineWidthScale: 0.041,
            centerMode: 'dashed',
        };
    }

    function resolveBuildingPalette(building, mode) {
        const key =
            Math.abs(
                Math.round(
                    (building.minX + building.maxX) * 0.9 +
                        (building.minZ + building.maxZ) * 1.3 +
                        (building.maxX - building.minX) * 2.7
                )
            ) % 3;

        const fullMode = mode === 'full';
        if (key === 0) {
            return {
                shadow: fullMode ? 'rgba(5, 10, 15, 0.12)' : 'rgba(6, 10, 14, 0.22)',
                glow: fullMode ? 'rgba(73, 219, 255, 0.26)' : 'rgba(73, 219, 255, 0.08)',
                glowFill: fullMode ? 'rgba(41, 175, 219, 0.08)' : 'rgba(41, 175, 219, 0.04)',
                body: fullMode ? 'rgba(54, 192, 227, 0.16)' : 'rgba(88, 167, 195, 0.44)',
                roof: fullMode ? 'rgba(179, 242, 255, 0.08)' : 'rgba(179, 242, 255, 0.26)',
                roofOutline: 'rgba(211, 249, 255, 0.18)',
                outline: 'rgba(193, 245, 255, 0.54)',
                outlineGlow: 'rgba(148, 239, 255, 0.24)',
                detail: 'rgba(187, 246, 255, 0.22)',
            };
        }
        if (key === 1) {
            return {
                shadow: fullMode ? 'rgba(5, 10, 14, 0.12)' : 'rgba(7, 12, 16, 0.22)',
                glow: fullMode ? 'rgba(140, 234, 255, 0.24)' : 'rgba(140, 234, 255, 0.08)',
                glowFill: fullMode ? 'rgba(108, 214, 255, 0.08)' : 'rgba(108, 214, 255, 0.04)',
                body: fullMode ? 'rgba(149, 224, 255, 0.16)' : 'rgba(132, 194, 223, 0.42)',
                roof: fullMode ? 'rgba(231, 250, 255, 0.1)' : 'rgba(213, 243, 255, 0.26)',
                roofOutline: 'rgba(241, 252, 255, 0.18)',
                outline: 'rgba(231, 249, 255, 0.56)',
                outlineGlow: 'rgba(179, 241, 255, 0.24)',
                detail: 'rgba(214, 249, 255, 0.22)',
            };
        }
        return {
            shadow: fullMode ? 'rgba(5, 10, 14, 0.12)' : 'rgba(7, 11, 15, 0.22)',
            glow: fullMode ? 'rgba(85, 255, 228, 0.22)' : 'rgba(85, 255, 228, 0.08)',
            glowFill: fullMode ? 'rgba(71, 220, 192, 0.08)' : 'rgba(71, 220, 192, 0.04)',
            body: fullMode ? 'rgba(64, 220, 192, 0.14)' : 'rgba(90, 185, 165, 0.4)',
            roof: fullMode ? 'rgba(203, 255, 241, 0.08)' : 'rgba(191, 246, 230, 0.24)',
            roofOutline: 'rgba(231, 255, 247, 0.16)',
            outline: 'rgba(188, 255, 236, 0.48)',
            outlineGlow: 'rgba(145, 255, 228, 0.22)',
            detail: 'rgba(205, 255, 241, 0.2)',
        };
    }

    function drawPlayerArrow(
        ctx,
        x,
        y,
        rotation,
        size,
        {
            fillColor,
            strokeColor,
            glassColor = 'rgba(214, 238, 255, 0.84)',
            accentColor = 'rgba(20, 34, 48, 0.24)',
            widthScale = 1,
            lengthScale = 1,
        }
    ) {
        const bodyWidth = size * 0.94 * widthScale;
        const bodyLength = size * 1.72 * lengthScale;
        const cornerRadius = bodyWidth * 0.28;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);

        roundedRectPath(
            ctx,
            -bodyWidth * 0.5,
            -bodyLength * 0.5,
            bodyWidth,
            bodyLength,
            cornerRadius
        );
        ctx.shadowColor = 'rgba(5, 11, 16, 0.3)';
        ctx.shadowBlur = Math.max(6, size * 0.46);
        ctx.shadowOffsetY = Math.max(1, size * 0.08);
        ctx.fillStyle = fillColor;
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.lineWidth = Math.max(1.4, size * 0.15);
        ctx.strokeStyle = strokeColor;
        ctx.stroke();

        roundedRectPath(
            ctx,
            -bodyWidth * 0.28,
            -bodyLength * 0.28,
            bodyWidth * 0.56,
            bodyLength * 0.54,
            bodyWidth * 0.14
        );
        ctx.fillStyle = glassColor;
        ctx.fill();

        ctx.beginPath();
        roundedRectPath(
            ctx,
            -bodyWidth * 0.22,
            bodyLength * 0.1,
            bodyWidth * 0.44,
            bodyLength * 0.18,
            bodyWidth * 0.12
        );
        ctx.fillStyle = accentColor;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, -bodyLength * 0.62);
        ctx.lineTo(bodyWidth * 0.22, -bodyLength * 0.36);
        ctx.lineTo(-bodyWidth * 0.22, -bodyLength * 0.36);
        ctx.closePath();
        ctx.fillStyle = strokeColor;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, -bodyLength * 0.88);
        ctx.lineTo(0, -bodyLength * 0.48);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(1.9, size * 0.18);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, -bodyLength * 0.94, Math.max(2, size * 0.13), 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
        ctx.fill();
        ctx.restore();
    }

    function drawTrafficPulseRing(ctx, x, y, baseRadius, color) {
        const pulse = 0.5 + 0.5 * Math.sin(state.animationTime * 5 + x * 0.02 + y * 0.02);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, baseRadius + pulse * baseRadius * 0.24, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.9;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, baseRadius * 0.66 + pulse * baseRadius * 0.12, 0, Math.PI * 2);
        ctx.strokeStyle = color.replace(/0\.\d+\)/, '0.18)');
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
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

    function bindDomEvents() {
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
        drawWorldMapNow(1 / 60);
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
                drawWorldMapNow(1 / 60);
                drawMinimapNow(1 / 60);
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
        drawWorldMapNow(1 / 60);
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
        drawWorldMapNow(1 / 60);
        drawMinimapNow(1 / 60);
        updateMetaLabels();
        renderLegend();
        onStatus('Waypoint cleared.', 1400);
    }

    function refreshCanvasSizes(force = false) {
        const miniChanged = resizeCanvasToDisplaySize(
            dom.miniMapCanvas,
            state.qualityProfile.minimapMaxDpr
        );
        const worldChanged = resizeCanvasToDisplaySize(
            dom.worldMapCanvas,
            state.qualityProfile.worldMapMaxDpr
        );

        if (worldChanged || force) {
            const fitTargetBounds = overviewBounds;
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
                drawMinimapNow(1 / 60);
            }
            if (state.expanded) {
                drawWorldMapNow(1 / 60);
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
        return;
    }

    function updateMetaLabels() {
        const traffic = summarizeTraffic(state.vehicles);
        const nextModeText = state.mode === 'online' ? 'ONLINE' : 'CITY';
        if (nextModeText !== state.previousLabelText.mode) {
            dom.modeLabel.textContent = nextModeText;
            state.previousLabelText.mode = nextModeText;
        }
        const nextRangeText =
            state.routeDistanceMeters != null
                ? `ROUTE ${Math.round(state.routeDistanceMeters)}M`
                : `LIVE ${traffic.total}`;
        if (nextRangeText !== state.previousLabelText.range) {
            dom.rangeLabel.textContent = nextRangeText;
            state.previousLabelText.range = nextRangeText;
        }
    }

    function updateCoordinateReadout(x, z) {
        return;
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
        clampCenterToWorld();
    }
}

function resolveDom() {
    const miniMapHud = document.getElementById('miniMapHud');
    const miniMapCanvas = document.getElementById('miniMapCanvas');
    const modeLabel = document.getElementById('miniMapModeLabel');
    const rangeLabel = document.getElementById('miniMapRangeLabel');

    const worldMapOverlay = document.getElementById('worldMapOverlay');
    const worldMapCanvas = document.getElementById('worldMapCanvas');

    const ready = Boolean(
        miniMapHud && miniMapCanvas && modeLabel && rangeLabel && worldMapOverlay && worldMapCanvas
    );

    return {
        ready,
        miniMapHud,
        miniMapCanvas,
        modeLabel,
        rangeLabel,
        worldMapOverlay,
        worldMapCanvas,
    };
}

function initializeFilterInputs(_filters, _dom) {}

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

    return {
        buildings,
        trees,
        lamps,
        buildingsIndex: buildSpatialIndex(buildings, (entry) => ({
            minX: entry.minX,
            maxX: entry.maxX,
            minZ: entry.minZ,
            maxZ: entry.maxZ,
        })),
        treesIndex: buildSpatialIndex(trees, (entry) => ({
            minX: entry.x - entry.radius,
            maxX: entry.x + entry.radius,
            minZ: entry.z - entry.radius,
            maxZ: entry.z + entry.radius,
        })),
        lampsIndex: buildSpatialIndex(lamps, (entry) => ({
            minX: entry.x - entry.radius,
            maxX: entry.x + entry.radius,
            minZ: entry.z - entry.radius,
            maxZ: entry.z + entry.radius,
        })),
    };
}

function buildSpatialIndex(
    items = [],
    getBounds = () => null,
    cellSize = STATIC_FEATURE_INDEX_CELL_SIZE
) {
    const safeCellSize = clamp(Number(cellSize) || STATIC_FEATURE_INDEX_CELL_SIZE, 4, 2000);
    const cells = new Map();

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const bounds = getBounds(item, index);
        if (!bounds) {
            continue;
        }
        const minX = Number(bounds.minX);
        const maxX = Number(bounds.maxX);
        const minZ = Number(bounds.minZ);
        const maxZ = Number(bounds.maxZ);
        if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) {
            continue;
        }
        if (maxX < minX || maxZ < minZ) {
            continue;
        }

        const minCellX = Math.floor(minX / safeCellSize);
        const maxCellX = Math.floor(maxX / safeCellSize);
        const minCellZ = Math.floor(minZ / safeCellSize);
        const maxCellZ = Math.floor(maxZ / safeCellSize);
        for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
            for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
                const key = toSpatialCellKey(cellX, cellZ);
                const bucket = cells.get(key);
                if (bucket) {
                    bucket.push(index);
                } else {
                    cells.set(key, [index]);
                }
            }
        }
    }

    return {
        cellSize: safeCellSize,
        cells,
        visitMarks: new Uint32Array(Math.max(1, items.length)),
        queryToken: 0,
        queryBuffer: [],
    };
}

function querySpatialIndexItems(items = [], index = null, minX, maxX, minZ, maxZ) {
    if (
        !index ||
        !Number.isFinite(minX) ||
        !Number.isFinite(maxX) ||
        !Number.isFinite(minZ) ||
        !Number.isFinite(maxZ)
    ) {
        return items;
    }
    if (maxX < minX || maxZ < minZ) {
        return [];
    }

    const queryBuffer = index.queryBuffer || [];
    queryBuffer.length = 0;

    let token = (index.queryToken || 0) + 1;
    if (token >= 0xfffffffe) {
        index.visitMarks.fill(0);
        token = 1;
    }
    index.queryToken = token;

    const cellSize = index.cellSize;
    const minCellX = Math.floor(minX / cellSize);
    const maxCellX = Math.floor(maxX / cellSize);
    const minCellZ = Math.floor(minZ / cellSize);
    const maxCellZ = Math.floor(maxZ / cellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
            const key = toSpatialCellKey(cellX, cellZ);
            const bucket = index.cells.get(key);
            if (!bucket) {
                continue;
            }

            for (let i = 0; i < bucket.length; i += 1) {
                const itemIndex = bucket[i];
                if (index.visitMarks[itemIndex] === token) {
                    continue;
                }
                index.visitMarks[itemIndex] = token;
                const entry = items[itemIndex];
                if (entry) {
                    queryBuffer.push(entry);
                }
            }
        }
    }

    return queryBuffer;
}

function toSpatialCellKey(cellX, cellZ) {
    return `${cellX}:${cellZ}`;
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
        const sidewalkWidth = Math.max(0, Number(line.sidewalkWidth) || 0);
        if (!Number.isFinite(coord) || !Number.isFinite(roadWidth) || roadWidth <= 0) {
            continue;
        }
        result.push({
            coord,
            roadWidth,
            sidewalkWidth,
            styleKey: typeof line.styleKey === 'string' ? line.styleKey : 'avenue',
        });
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

function normalizePickupsInPlace(target, pickups) {
    if (!Array.isArray(target)) {
        return [];
    }
    if (!Array.isArray(pickups)) {
        target.length = 0;
        return target;
    }

    let count = 0;
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
        let normalized = target[count];
        if (!normalized) {
            normalized = {};
            target[count] = normalized;
        }
        normalized.x = x;
        normalized.z = z;
        normalized.color = toCssHexColor(pickup.colorHex, '#8fd9ff');
        normalized.isTarget = Boolean(pickup.isTarget);
        count += 1;
    }
    target.length = count;
    return target;
}

function normalizeVehiclesInPlace(target, botDescriptors, remotePlayers) {
    if (!Array.isArray(target)) {
        return [];
    }

    let count = 0;
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
            let normalized = target[count];
            if (!normalized) {
                normalized = {};
                target[count] = normalized;
            }
            normalized.x = x;
            normalized.z = z;
            normalized.heading = normalizeAngle(Number(entry.heading) || 0);
            normalized.color = toCssHexColor(entry.colorHex, '#3fa9ff');
            normalized.type = 'bot';
            count += 1;
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
            let normalized = target[count];
            if (!normalized) {
                normalized = {};
                target[count] = normalized;
            }
            normalized.x = x;
            normalized.z = z;
            normalized.heading = normalizeAngle(Number(entry.heading) || 0);
            normalized.color = toCssHexColor(entry.colorHex, '#ff9f4a');
            normalized.type = 'player';
            count += 1;
        }
    }

    target.length = count;
    return target;
}

function normalizeMinesInPlace(target, mines) {
    if (!Array.isArray(target)) {
        return [];
    }
    if (!Array.isArray(mines)) {
        target.length = 0;
        return target;
    }

    let count = 0;
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
        let normalized = target[count];
        if (!normalized) {
            normalized = {};
            target[count] = normalized;
        }
        normalized.x = x;
        normalized.z = z;
        normalized.armed = Boolean(mine.armed);
        count += 1;
    }
    target.length = count;
    return target;
}

function summarizeTraffic(vehicles = []) {
    let bots = 0;
    let remotePlayers = 0;
    for (let i = 0; i < vehicles.length; i += 1) {
        const type = vehicles[i]?.type;
        if (type === 'bot') {
            bots += 1;
        } else if (type === 'player') {
            remotePlayers += 1;
        }
    }
    return {
        bots,
        remotePlayers,
        total: vehicles.length + 1,
    };
}

function buildWorldMapStatCard(label, value, tone = '') {
    const toneAttr = tone ? ` data-tone="${tone}"` : '';
    return (
        `<div class="worldMapStatCard">` +
        `<div class="worldMapStatLabel">${label}</div>` +
        `<div class="worldMapStatValue"${toneAttr}>${value}</div>` +
        `</div>`
    );
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

function distanceSq2D(ax, az, bx, bz) {
    if (![ax, az, bx, bz].every(Number.isFinite)) {
        return Infinity;
    }
    const dx = ax - bx;
    const dz = az - bz;
    return dx * dx + dz * dz;
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
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    let hasContent = false;
    void chargingZones;
    const includeBounds = (nextMinX, nextMaxX, nextMinZ, nextMaxZ) => {
        if (![nextMinX, nextMaxX, nextMinZ, nextMaxZ].every(Number.isFinite)) {
            return;
        }
        minX = Math.min(minX, nextMinX);
        maxX = Math.max(maxX, nextMaxX);
        minZ = Math.min(minZ, nextMinZ);
        maxZ = Math.max(maxZ, nextMaxZ);
        hasContent = true;
    };

    const xLines = Array.isArray(cityMapLayout?.roadAxisLinesX) ? cityMapLayout.roadAxisLinesX : [];
    const zLines = Array.isArray(cityMapLayout?.roadAxisLinesZ) ? cityMapLayout.roadAxisLinesZ : [];
    const xLineBounds = resolveRoadLineBounds(xLines);
    const zLineBounds = resolveRoadLineBounds(zLines);
    const roadMinX = Number.isFinite(xLineBounds.min) ? xLineBounds.min : worldBounds.minX;
    const roadMaxX = Number.isFinite(xLineBounds.max) ? xLineBounds.max : worldBounds.maxX;
    const roadMinZ = Number.isFinite(zLineBounds.min) ? zLineBounds.min : worldBounds.minZ;
    const roadMaxZ = Number.isFinite(zLineBounds.max) ? zLineBounds.max : worldBounds.maxZ;

    for (let i = 0; i < xLines.length; i += 1) {
        const line = xLines[i];
        const coord = Number(line?.coord);
        const halfWidth = Math.max(0, (Number(line?.roadWidth) || 0) * 0.5);
        const sidewalkWidth = resolveRenderedSidewalkWidth(line?.styleKey, line?.sidewalkWidth);
        if (!Number.isFinite(coord)) {
            continue;
        }
        includeBounds(
            coord - halfWidth - sidewalkWidth,
            coord + halfWidth + sidewalkWidth,
            roadMinZ,
            roadMaxZ
        );
    }

    for (let i = 0; i < zLines.length; i += 1) {
        const line = zLines[i];
        const coord = Number(line?.coord);
        const halfWidth = Math.max(0, (Number(line?.roadWidth) || 0) * 0.5);
        const sidewalkWidth = resolveRenderedSidewalkWidth(line?.styleKey, line?.sidewalkWidth);
        if (!Number.isFinite(coord)) {
            continue;
        }
        includeBounds(
            roadMinX,
            roadMaxX,
            coord - halfWidth - sidewalkWidth,
            coord + halfWidth + sidewalkWidth
        );
    }

    const buildings = Array.isArray(staticFeatures?.buildings) ? staticFeatures.buildings : [];
    for (let i = 0; i < buildings.length; i += 1) {
        const building = buildings[i];
        if (!building) {
            continue;
        }
        includeBounds(building.minX, building.maxX, building.minZ, building.maxZ);
    }

    if (!hasContent) {
        minX = Number(worldBounds.minX);
        maxX = Number(worldBounds.maxX);
        minZ = Number(worldBounds.minZ);
        maxZ = Number(worldBounds.maxZ);
    }

    const padding = WORLD_MAP_OVERVIEW_UNIT_PADDING;
    return {
        minX: minX - padding,
        maxX: maxX + padding,
        minZ: minZ - padding,
        maxZ: maxZ + padding,
    };
}

function resolveRoadLineBounds(lines = []) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < lines.length; i += 1) {
        const coord = Number(lines[i]?.coord);
        const halfWidth = Math.max(0, (Number(lines[i]?.roadWidth) || 0) * 0.5);
        const sidewalkWidth = resolveRenderedSidewalkWidth(
            lines[i]?.styleKey,
            lines[i]?.sidewalkWidth
        );
        if (!Number.isFinite(coord)) {
            continue;
        }
        min = Math.min(min, coord - halfWidth - sidewalkWidth);
        max = Math.max(max, coord + halfWidth + sidewalkWidth);
    }
    return { min, max };
}

function resolveRenderedSidewalkWidth(styleKey = '', baseWidth = 0) {
    const numericBaseWidth = Math.max(0, Number(baseWidth) || 0);
    if (numericBaseWidth <= 0) {
        return 0;
    }
    if (styleKey === 'boulevard') {
        return numericBaseWidth + 0.9;
    }
    if (styleKey === 'service') {
        return Math.max(1.9, numericBaseWidth - 0.3);
    }
    return numericBaseWidth + 0.35;
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

function drawPlayerArrow(
    ctx,
    x,
    y,
    rotation,
    size,
    {
        fillColor,
        strokeColor,
        glassColor = 'rgba(225, 240, 249, 0.84)',
        accentColor = 'rgba(17, 38, 54, 0.26)',
        widthScale = 1,
        lengthScale = 1,
    }
) {
    const bodyWidth = size * 0.96 * widthScale;
    const bodyLength = size * 1.82 * lengthScale;
    const cornerRadius = bodyWidth * 0.28;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    ctx.shadowColor = 'rgba(5, 11, 16, 0.34)';
    ctx.shadowBlur = Math.max(6, size * 0.55);
    ctx.shadowOffsetY = Math.max(1, size * 0.08);
    roundedRectPath(ctx, -bodyWidth * 0.5, -bodyLength * 0.5, bodyWidth, bodyLength, cornerRadius);
    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.lineWidth = Math.max(1.7, size * 0.15);
    ctx.strokeStyle = strokeColor;
    ctx.stroke();

    roundedRectPath(
        ctx,
        -bodyWidth * 0.28,
        -bodyLength * 0.28,
        bodyWidth * 0.56,
        bodyLength * 0.54,
        bodyWidth * 0.14
    );
    ctx.fillStyle = glassColor;
    ctx.fill();

    roundedRectPath(
        ctx,
        -bodyWidth * 0.2,
        bodyLength * 0.08,
        bodyWidth * 0.4,
        bodyLength * 0.18,
        bodyWidth * 0.1
    );
    ctx.fillStyle = accentColor;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -bodyLength * 0.64);
    ctx.lineTo(bodyWidth * 0.22, -bodyLength * 0.35);
    ctx.lineTo(-bodyWidth * 0.22, -bodyLength * 0.35);
    ctx.closePath();
    ctx.fillStyle = strokeColor;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -bodyLength * 0.94);
    ctx.lineTo(0, -bodyLength * 0.48);
    ctx.lineWidth = Math.max(2, size * 0.16);
    ctx.strokeStyle = strokeColor;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, -bodyLength * 0.98, Math.max(2, size * 0.13), 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
    ctx.restore();
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

function resolveVehicleArrowSize(mode, zoom) {
    if (mode === 'full') {
        return clamp(zoom * 2.1, 18, 30);
    }
    return 8.2;
}

function resolveVehicleArrowStyle(baseColor, mode) {
    const fillColor = toVisibleVehicleMarkerColor(baseColor, mode);
    const rgb = parseCssHexColor(fillColor);
    if (!rgb) {
        return {
            fillColor,
            strokeColor: 'rgba(14, 24, 38, 0.96)',
        };
    }

    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return {
        fillColor,
        strokeColor: luminance >= 0.58 ? 'rgba(10, 20, 34, 0.97)' : 'rgba(236, 248, 255, 0.97)',
    };
}

function toVisibleVehicleMarkerColor(color, mode) {
    const rgb = parseCssHexColor(color);
    if (!rgb) {
        return mode === 'full' ? '#60b6ff' : '#7cc7ff';
    }

    const { h, s, l } = rgbToHsl(rgb.r / 255, rgb.g / 255, rgb.b / 255);
    const boostedSaturation = clamp(s * 1.28 + 0.08, 0.72, 1);
    const lightnessBias = mode === 'full' ? 0.02 : 0.06;
    const boostedLightness = clamp(0.48 + (l - 0.5) * 0.45 + lightnessBias, 0.42, 0.7);
    const boostedRgb = hslToRgb(h, boostedSaturation, boostedLightness);
    return rgbToCssHex(boostedRgb.r, boostedRgb.g, boostedRgb.b);
}

function parseCssHexColor(color) {
    if (typeof color !== 'string') {
        return null;
    }
    const normalized = color.trim();
    const matchLong = normalized.match(/^#([0-9a-f]{6})$/i);
    if (matchLong) {
        const value = parseInt(matchLong[1], 16);
        return {
            r: (value >> 16) & 255,
            g: (value >> 8) & 255,
            b: value & 255,
        };
    }

    const matchShort = normalized.match(/^#([0-9a-f]{3})$/i);
    if (!matchShort) {
        return null;
    }
    const shortValue = matchShort[1];
    return {
        r: parseInt(shortValue[0] + shortValue[0], 16),
        g: parseInt(shortValue[1] + shortValue[1], 16),
        b: parseInt(shortValue[2] + shortValue[2], 16),
    };
}

function rgbToCssHex(r, g, b) {
    const rr = clamp(Math.round(r), 0, 255);
    const gg = clamp(Math.round(g), 0, 255);
    const bb = clamp(Math.round(b), 0, 255);
    return `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb
        .toString(16)
        .padStart(2, '0')}`;
}

function rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) * 0.5;
    const delta = max - min;
    if (delta <= 1e-8) {
        return { h: 0, s: 0, l: lightness };
    }

    const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let hue;
    if (max === r) {
        hue = (g - b) / delta + (g < b ? 6 : 0);
    } else if (max === g) {
        hue = (b - r) / delta + 2;
    } else {
        hue = (r - g) / delta + 4;
    }
    return { h: hue / 6, s: saturation, l: lightness };
}

function hslToRgb(h, s, l) {
    if (s <= 1e-8) {
        const channel = l * 255;
        return { r: channel, g: channel, b: channel };
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
        r: hueToRgb(p, q, h + 1 / 3) * 255,
        g: hueToRgb(p, q, h) * 255,
        b: hueToRgb(p, q, h - 1 / 3) * 255,
    };
}

function hueToRgb(p, q, t) {
    let value = t;
    if (value < 0) {
        value += 1;
    } else if (value > 1) {
        value -= 1;
    }
    if (value < 1 / 6) {
        return p + (q - p) * 6 * value;
    }
    if (value < 1 / 2) {
        return q;
    }
    if (value < 2 / 3) {
        return p + (q - p) * (2 / 3 - value) * 6;
    }
    return p;
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

function normalizeMapQualityProfile(profile = {}, fallback = DEFAULT_MAP_QUALITY_PROFILE) {
    const safeFallback = {
        ...DEFAULT_MAP_QUALITY_PROFILE,
        ...(fallback || {}),
    };
    return {
        minimapMaxDpr: clamp(Number(profile.minimapMaxDpr) || safeFallback.minimapMaxDpr, 1, 3),
        worldMapMaxDpr: clamp(Number(profile.worldMapMaxDpr) || safeFallback.worldMapMaxDpr, 1, 3),
        minimapDrawIntervalSec: clamp(
            Number(profile.minimapDrawIntervalSec) || safeFallback.minimapDrawIntervalSec,
            1 / 72,
            0.2
        ),
        worldMapDrawIntervalSec: clamp(
            Number(profile.worldMapDrawIntervalSec) || safeFallback.worldMapDrawIntervalSec,
            1 / 72,
            0.25
        ),
        labelUpdateIntervalSec: clamp(
            Number(profile.labelUpdateIntervalSec) || safeFallback.labelUpdateIntervalSec,
            1 / 60,
            0.35
        ),
        entitySyncIntervalSec: clamp(
            Number(profile.entitySyncIntervalSec) || safeFallback.entitySyncIntervalSec,
            1 / 72,
            0.25
        ),
        routeRebuildIntervalSec: clamp(
            Number(profile.routeRebuildIntervalSec) || safeFallback.routeRebuildIntervalSec,
            1 / 120,
            0.5
        ),
        routeRebuildDistanceSq: clamp(
            Number(profile.routeRebuildDistanceSq) || safeFallback.routeRebuildDistanceSq,
            0.01,
            400
        ),
    };
}

function mapQualityProfilesEqual(a, b) {
    if (!a || !b) {
        return false;
    }
    return (
        a.minimapMaxDpr === b.minimapMaxDpr &&
        a.worldMapMaxDpr === b.worldMapMaxDpr &&
        a.minimapDrawIntervalSec === b.minimapDrawIntervalSec &&
        a.worldMapDrawIntervalSec === b.worldMapDrawIntervalSec &&
        a.labelUpdateIntervalSec === b.labelUpdateIntervalSec &&
        a.entitySyncIntervalSec === b.entitySyncIntervalSec &&
        a.routeRebuildIntervalSec === b.routeRebuildIntervalSec &&
        a.routeRebuildDistanceSq === b.routeRebuildDistanceSq
    );
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
        setQualityProfile() {
            return false;
        },
        dispose() {},
    };
}
