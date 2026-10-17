#!/usr/bin/env node

// Run against `npm run dev`. Exercise the real damage, debris and respawn paths.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = process.env.E2E_COMBAT_URL || 'http://localhost:3000';

async function main() {
    const browser = await chromium.launch({
        headless: true,
        args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : [],
    });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));

        // Expose internal controllers in the test response only, without production hooks.
        await page.route('**/js/game-runtime.js', async (route) => {
            const source = await fs.readFile(path.join(ROOT, 'public/js/game-runtime.js'), 'utf8');
            await route.fulfill({
                contentType: 'text/javascript',
                body: `${source}\nwindow.__combatTest = {scene, renderer, camera, car, runtimeState};`,
            });
        });
        await page.route('**/js/vehicle-weapon-system.js', async (route) => {
            const source = await fs.readFile(
                path.join(ROOT, 'public/js/vehicle-weapon-system.js'),
                'utf8'
            );
            const anchor = 'const roofLayout = getLorienVelmoreRoofLiftLayout();';
            assert.ok(source.includes(anchor), 'player hit callback instrumentation exists');
            await route.fulfill({
                contentType: 'text/javascript',
                body: source.replace(anchor, `window.__combatPlayerHit = onPlayerHit; ${anchor}`),
            });
        });

        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__combatTest, null, { timeout: 90_000 });
        await page.evaluate(() => {
            document.getElementById('welcomeIntroVideo').dispatchEvent(new Event('error'));
        });
        await page.locator('#welcomeStartBtn').click();
        await page.waitForFunction(
            () => !window.__combatTest.runtimeState.isWelcomeModalVisible,
            null,
            { timeout: 180_000 }
        );
        await page.waitForFunction(
            () =>
                window.__combatTest.runtimeState.botTrafficSystem
                    .getCollectorDescriptors()
                    .some((bot) => !bot.mineImmune),
            null,
            { timeout: 30_000 }
        );

        const botIds = await page.evaluate(() => {
            const { renderer, scene, camera, runtimeState } = window.__combatTest;
            // Keep mission reinforcements from changing the test's targets.
            runtimeState.botsMissionDirector = null;
            window.__combatFrames = [];
            window.__combatOffscreenPasses = 0;
            let drawingWorld = false;
            const setTarget = renderer.setRenderTarget.bind(renderer);
            renderer.setRenderTarget = (target, ...args) => {
                if (drawingWorld && target) window.__combatOffscreenPasses += 1;
                return setTarget(target, ...args);
            };
            const render = renderer.render.bind(renderer);
            renderer.render = (renderScene, ...args) => {
                drawingWorld = renderScene === scene;
                const start = performance.now();
                try {
                    return render(renderScene, ...args);
                } finally {
                    if (drawingWorld) {
                        const lights = [];
                        scene.traverseVisible((node) => {
                            if (node.isLight && node.layers.test(camera.layers))
                                lights.push(node.id);
                        });
                        window.__combatFrames.push({
                            ms: performance.now() - start,
                            lights: lights.sort((a, b) => a - b).join(','),
                            programs: renderer.info.programs.length,
                        });
                    }
                    drawingWorld = false;
                }
            };
            return runtimeState.botTrafficSystem
                .getCollectorDescriptors()
                .filter((bot) => !bot.mineImmune)
                .map((bot) => bot.id);
        });
        assert.ok(botIds.length > 0, 'there must be a live opponent');
        await page.waitForTimeout(500);

        // Test player destruction first: its freeze must not be hidden by earlier warmup.
        const playerHit = await page.evaluate(() => {
            const { car } = window.__combatTest;
            return window.__combatPlayerHit({
                position: car.position.clone(),
                shotDirection: car.position.clone().set(0, 0, -1),
                shooterName: 'Rendering regression test',
            });
        });
        assert.equal(playerHit.destroyed, true);
        await page.waitForFunction(() => !window.__combatTest.runtimeState.isCarDestroyed, null, {
            timeout: 15_000,
        });
        assert.equal(await page.evaluate(() => window.__combatTest.car.visible), true);

        for (const botId of botIds) {
            let destroyed = false;
            for (let hit = 0; hit < 10 && !destroyed; hit += 1) {
                const result = await page.evaluate((id) => {
                    const { runtimeState } = window.__combatTest;
                    return runtimeState.botTrafficSystem.triggerWeaponHit(id, {
                        crashContext: { debrisSpawnBudget: 12, impactSpeed: 48 },
                    });
                }, botId);
                assert.equal(result.ok, true, `weapon hit accepted for ${botId}: ${result.reason}`);
                destroyed = result.destroyed;
                await page.waitForTimeout(500);
            }
            assert.equal(destroyed, true, `${botId} must explode`);
        }
        await page.waitForTimeout(1500);
        const result = await page.evaluate(() => ({
            frames: window.__combatFrames,
            offscreenPasses: window.__combatOffscreenPasses,
        }));
        assert.ok(result.frames.length > 60, 'sample damage, debris and respawn frames');
        assert.equal(
            new Set(result.frames.map((frame) => frame.lights)).size,
            1,
            'damage and destruction must preserve the scene light set'
        );
        assert.equal(
            result.offscreenPasses,
            0,
            'combat must not trigger a full-city transmission pass'
        );
        assert.deepEqual(errors, [], 'no browser runtime errors');
        console.log(
            JSON.stringify(
                {
                    opponentsDestroyed: botIds.length,
                    playerRespawned: true,
                    frames: result.frames.length,
                    maxRenderMs: Math.max(...result.frames.map((frame) => frame.ms)),
                    programsBefore: result.frames[0].programs,
                    programsAfter: result.frames.at(-1).programs,
                    offscreenPasses: result.offscreenPasses,
                },
                null,
                2
            )
        );
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
