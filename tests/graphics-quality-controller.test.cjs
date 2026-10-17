const test = require('node:test');
const assert = require('node:assert/strict');

const controllerModule = import('../public/js/graphics-quality-controller.js');

test.before(() => {
    global.window = { devicePixelRatio: 2 };
});
test.after(() => {
    delete global.window;
});

async function createController(initialMode = 'auto', renderer = { setPixelRatio() {} }) {
    const { createGraphicsQualityController } = await controllerModule;
    return createGraphicsQualityController({
        renderer,
        renderSettings: { maxPixelRatio: 1 },
        initialMode,
    });
}

test('automatic quality recovers on a 60 Hz display after sustained slow frames', async () => {
    const controller = await createController();
    for (let frame = 0; frame < 120; frame += 1) {
        controller.sampleFrame(1 / 25);
    }
    const reducedScale = controller.getSnapshot().autoScale;
    assert.ok(reducedScale < 1, 'slow frames should lower rendering load');

    for (let frame = 0; frame < 600; frame += 1) {
        controller.sampleFrame(1 / 60);
    }
    assert.ok(
        controller.getSnapshot().autoScale > reducedScale,
        'stable 60 FPS should recover quality instead of leaving the image permanently blurred'
    );
});

test('manual graphics settings remain unchanged during slow frames', async () => {
    const controller = await createController('quality');
    const initialCap = controller.getSnapshot().pixelRatioCap;
    for (let frame = 0; frame < 120; frame += 1) {
        controller.sampleFrame(0.1);
    }
    assert.equal(controller.getMode(), 'quality');
    assert.equal(controller.getSnapshot().pixelRatioCap, initialCap);
});

test('frames excluded from adaptation do not lower automatic quality', async () => {
    const controller = await createController();
    for (let frame = 0; frame < 120; frame += 1) {
        controller.sampleFrame(0.1, { allowAdaptive: false });
    }
    assert.equal(controller.getSnapshot().autoScale, 1);
});

test('a render stall preserves the completed frame until the next frame is prepared', async () => {
    const pixelRatios = [];
    const controller = await createController('auto', {
        setPixelRatio(value) {
            pixelRatios.push(value);
        },
    });
    const initialCap = controller.getSnapshot().pixelRatioCap;
    const initialResizeCount = pixelRatios.length;

    const result = controller.reportRenderStall({ frameMs: 100, renderMs: 90 });
    assert.equal(result.triggered, true);
    assert.equal(result.applied, false);
    assert.equal(
        pixelRatios.length,
        initialResizeCount,
        'the completed canvas must not be cleared'
    );
    assert.equal(controller.getSnapshot().pixelRatioCap, initialCap);

    controller.sampleFrame(1 / 60);
    assert.ok(pixelRatios.length > initialResizeCount, 'apply the reduction before drawing again');
    assert.ok(controller.getSnapshot().pixelRatioCap < initialCap);
});
