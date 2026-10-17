#!/usr/bin/env node

require('dotenv').config();

global.WebSocket = require('ws');

const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const ROOT_DIR = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'server', 'server.js');
const TEST_PORT = Number.parseInt(process.env.E2E_ACCOUNT_SETTINGS_PORT || '3310', 10);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const SERVER_START_TIMEOUT_MS = 60_000;
const DEBUG_E2E = process.env.E2E_ACCOUNT_SETTINGS_DEBUG === '1';
const EMAIL = String(process.env.USERNAME || '').trim();
const PASSWORD = String(process.env.PASSWORD || '');
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || '').trim();
const ACCOUNT_SETTING_FIELDS = ['auto_fullscreen_on_start', 'profile_screensaver_enabled'];

function assertRequiredEnv() {
    const missing = [];
    if (!EMAIL) {
        missing.push('USERNAME');
    }
    if (!PASSWORD) {
        missing.push('PASSWORD');
    }
    if (!SUPABASE_URL) {
        missing.push('SUPABASE_URL');
    }
    if (!SUPABASE_ANON_KEY) {
        missing.push('SUPABASE_ANON_KEY');
    }
    if (missing.length) {
        throw new Error(`Missing required env vars: ${missing.join(', ')}`);
    }
}

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function formatSettings(settings) {
    return JSON.stringify(settings, null, 2);
}

function extractAccountSettings(metadata = {}) {
    return {
        auto_fullscreen_on_start: Boolean(metadata.auto_fullscreen_on_start),
        profile_screensaver_enabled: Boolean(metadata.profile_screensaver_enabled),
    };
}

function mergeMetadataWithOriginalSettings(currentMetadata = {}, originalMetadata = {}) {
    const nextMetadata = {
        ...(currentMetadata && typeof currentMetadata === 'object' ? clone(currentMetadata) : {}),
    };
    for (const field of ACCOUNT_SETTING_FIELDS) {
        const originalValue = originalMetadata?.[field];
        if (originalValue === undefined) {
            delete nextMetadata[field];
        } else {
            nextMetadata[field] = clone(originalValue);
        }
    }
    return nextMetadata;
}

function createAuthClient(label) {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
        global: {
            headers: {
                'X-E2E-Test-Client': label,
            },
        },
    });
}

async function signInFresh(label) {
    const client = createAuthClient(label);
    const { data, error } = await client.auth.signInWithPassword({
        email: EMAIL,
        password: PASSWORD,
    });
    if (error) {
        throw error;
    }
    if (!data?.user?.id) {
        throw new Error('Sign-in succeeded without a user object.');
    }
    return {
        client,
        user: data.user,
    };
}

async function readAccountSettingsViaApi(label) {
    const session = await signInFresh(label);
    try {
        return {
            metadata: clone(session.user.user_metadata || {}),
            settings: extractAccountSettings(session.user.user_metadata || {}),
        };
    } finally {
        await session.client.auth.signOut();
    }
}

async function restoreOriginalAccountSettings(originalMetadata = {}) {
    const session = await signInFresh('account-settings-restore');
    try {
        const nextMetadata = mergeMetadataWithOriginalSettings(
            session.user.user_metadata || {},
            originalMetadata
        );
        const { error } = await session.client.auth.updateUser({
            data: nextMetadata,
        });
        if (error) {
            throw error;
        }
    } finally {
        await session.client.auth.signOut();
    }
}

function createServerController() {
    const outputLines = [];
    const child = spawn('node', [SERVER_ENTRY], {
        cwd: ROOT_DIR,
        env: {
            ...process.env,
            PORT: String(TEST_PORT),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    function appendOutput(source, chunk) {
        const text = String(chunk || '');
        for (const line of text.split(/\r?\n/)) {
            if (!line) {
                continue;
            }
            outputLines.push(`[${source}] ${line}`);
            if (outputLines.length > 200) {
                outputLines.shift();
            }
        }
    }

    child.stdout?.on('data', (chunk) => {
        appendOutput('stdout', chunk);
    });
    child.stderr?.on('data', (chunk) => {
        appendOutput('stderr', chunk);
    });

    async function stop() {
        if (child.exitCode !== null) {
            return;
        }
        child.kill('SIGTERM');
        await Promise.race([
            new Promise((resolve) => {
                child.once('exit', resolve);
            }),
            sleep(5000).then(() => {
                if (child.exitCode === null) {
                    child.kill('SIGKILL');
                }
            }),
        ]);
    }

    return {
        child,
        async waitUntilReady() {
            const startedAt = Date.now();
            while (Date.now() - startedAt < SERVER_START_TIMEOUT_MS) {
                if (child.exitCode !== null) {
                    throw new Error(
                        `Local server exited early with code ${child.exitCode}.\n${outputLines.join('\n')}`
                    );
                }
                try {
                    const response = await fetch(BASE_URL, {
                        redirect: 'manual',
                    });
                    if (response.ok || response.status === 304) {
                        return;
                    }
                } catch {}
                await sleep(500);
            }
            throw new Error(
                `Timed out waiting for local server on ${BASE_URL}.\n${outputLines.join('\n')}`
            );
        },
        getLogs() {
            return outputLines.join('\n');
        },
        stop,
    };
}

async function dismissCookieBanner(page) {
    const declineButton = page.locator('#cookieConsentDeclineBtn');
    if (await declineButton.isVisible().catch(() => false)) {
        await activateControl(declineButton);
        await declineButton.waitFor({
            state: 'hidden',
            timeout: 10_000,
        });
    }
}

async function activateControl(locator) {
    await locator.waitFor({
        state: 'attached',
        timeout: 15_000,
    });
    try {
        await locator.click({
            timeout: 5000,
        });
    } catch {
        await locator.evaluate((element) => {
            element.click();
        });
    }
}

async function openAccountOverlay(page) {
    const overlay = page.locator('#welcomePreviewAccountOverlay');
    const button = page.locator('#welcomeAccountBtn');
    const startedAt = Date.now();
    while (Date.now() - startedAt < 20_000) {
        if (await overlay.isVisible().catch(() => false)) {
            return;
        }
        await activateControl(button);
        try {
            await overlay.waitFor({
                state: 'visible',
                timeout: 1200,
            });
            return;
        } catch {}
        await page.waitForTimeout(250);
    }
    throw new Error('Timed out opening the account overlay.');
}

async function openSettingsOverlay(page) {
    const overlay = page.locator('#welcomePreviewSettingsOverlay');
    const button = page.locator('#welcomeSettingsBtn');
    const startedAt = Date.now();
    while (Date.now() - startedAt < 20_000) {
        if (await overlay.isVisible().catch(() => false)) {
            return;
        }
        await activateControl(button);
        try {
            await overlay.waitFor({
                state: 'visible',
                timeout: 1200,
            });
            return;
        } catch {}
        await page.waitForTimeout(250);
    }
    throw new Error('Timed out opening the settings overlay.');
}

async function signInThroughUi(page) {
    await openAccountOverlay(page);
    await activateControl(page.locator('#welcomeAuthSignInTab'));
    await page.waitForFunction(() => {
        const emailInput = document.querySelector('#welcomeAuthEmailInput');
        const passwordInput = document.querySelector('#welcomeAuthPasswordInput');
        const submitButton = document.querySelector('#welcomeAuthSubmitBtn');
        return Boolean(
            emailInput &&
            passwordInput &&
            submitButton &&
            !emailInput.disabled &&
            !passwordInput.disabled &&
            !submitButton.disabled
        );
    });
    await page.locator('#welcomeAuthEmailInput').fill(EMAIL);
    await page.locator('#welcomeAuthPasswordInput').fill(PASSWORD);
    await activateControl(page.locator('#welcomeAuthSubmitBtn'));
    try {
        await page.locator('#welcomeAuthSignedInView').waitFor({
            state: 'visible',
            timeout: 30_000,
        });
    } catch (error) {
        const statusText = await page
            .locator('#welcomeAuthStatus')
            .textContent()
            .catch(() => '');
        throw new Error(
            [
                'Sign-in did not complete in the browser UI.',
                `Status: ${String(statusText || '').trim() || '(empty)'}`,
                error?.message || String(error),
            ].join('\n')
        );
    }
}

async function openAccountTools(page) {
    await openAccountOverlay(page);
    const toolsToggleButton = page.locator('#welcomePreviewAccountToolsToggleBtn');
    if (await toolsToggleButton.isVisible()) {
        const expanded = await toolsToggleButton.getAttribute('aria-expanded');
        if (expanded !== 'true') {
            await activateControl(toolsToggleButton);
        }
    }
    await page.locator('#welcomeAuthSignOutBtn').waitFor({
        state: 'visible',
        timeout: 15_000,
    });
}

async function signOutThroughUi(page) {
    await openAccountTools(page);
    await activateControl(page.locator('#welcomeAuthSignOutBtn'));
    await page.locator('#welcomeAuthSignedOutView').waitFor({
        state: 'visible',
        timeout: 15_000,
    });
}

async function readSettingsFromUi(page) {
    await openSettingsOverlay(page);
    return {
        auto_fullscreen_on_start: await page.locator('#welcomeAutoFullscreenInput').isChecked(),
        profile_screensaver_enabled: await page
            .locator('#welcomeProfileScreensaverInput')
            .isChecked(),
    };
}

async function setToggleCardState(page, inputSelector, cardSelector, nextValue) {
    const input = page.locator(inputSelector);
    if ((await input.isChecked()) === nextValue) {
        return;
    }
    await activateControl(page.locator(cardSelector));
    await page.waitForFunction(
        ({ selector, expectedValue }) => {
            const inputEl = document.querySelector(selector);
            return Boolean(inputEl && inputEl.checked === expectedValue);
        },
        {
            selector: inputSelector,
            expectedValue: nextValue,
        }
    );
}

async function setSettingsInUi(page, targetSettings) {
    await openSettingsOverlay(page);
    await setToggleCardState(
        page,
        '#welcomeAutoFullscreenInput',
        '#welcomeSettingsFullscreenCard',
        targetSettings.auto_fullscreen_on_start
    );
    await setToggleCardState(
        page,
        '#welcomeProfileScreensaverInput',
        '#welcomeSettingsProfileScreensaverCard',
        targetSettings.profile_screensaver_enabled
    );
}

async function createIsolatedPage(browser) {
    const context = await browser.newContext({
        viewport: {
            width: 1600,
            height: 1000,
        },
    });
    const page = await context.newPage();
    await page.goto(BASE_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
    });
    await page.locator('#welcomeAccountBtn').waitFor({
        state: 'visible',
        timeout: 20_000,
    });
    await page.locator('#welcomePreviewLoading').waitFor({
        state: 'hidden',
        timeout: 30_000,
    });
    await dismissCookieBanner(page);
    return {
        context,
        page,
    };
}

async function run() {
    assertRequiredEnv();

    const originalSnapshot = await readAccountSettingsViaApi('account-settings-original');
    const targetSettings = {
        auto_fullscreen_on_start: !originalSnapshot.settings.auto_fullscreen_on_start,
        profile_screensaver_enabled: !originalSnapshot.settings.profile_screensaver_enabled,
    };

    const server = createServerController();
    let browser = null;
    let contextOne = null;
    let contextTwo = null;
    const settingsSaveRequests = [];

    console.log(`Original account settings: ${formatSettings(originalSnapshot.settings)}`);
    console.log(`Target account settings: ${formatSettings(targetSettings)}`);

    try {
        await server.waitUntilReady();
        browser = await chromium.launch({
            headless: true,
        });

        contextOne = await createIsolatedPage(browser);
        contextOne.page.on('requestfinished', async (request) => {
            if (request.method() !== 'PUT' || !request.url().includes('/auth/v1/user')) {
                return;
            }
            const response = await request.response().catch(() => null);
            settingsSaveRequests.push({
                url: request.url(),
                status: response?.status?.() ?? null,
            });
        });
        await signInThroughUi(contextOne.page);
        await setSettingsInUi(contextOne.page, targetSettings);
        if (DEBUG_E2E) {
            const samePageSettings = await readSettingsFromUi(contextOne.page);
            const apiBeforeLogout = await readAccountSettingsViaApi(
                'account-settings-before-logout'
            );
            console.log(`Same-session UI settings: ${formatSettings(samePageSettings)}`);
            console.log(`API before logout: ${formatSettings(apiBeforeLogout.settings)}`);
            console.log(`Observed settings save requests: ${settingsSaveRequests.length}`);
        }
        await signOutThroughUi(contextOne.page);
        await contextOne.context.close();
        contextOne = null;

        contextTwo = await createIsolatedPage(browser);
        await signInThroughUi(contextTwo.page);
        const restoredSettings = await readSettingsFromUi(contextTwo.page);
        console.log(`Fresh login UI settings: ${formatSettings(restoredSettings)}`);

        if (
            restoredSettings.auto_fullscreen_on_start !== targetSettings.auto_fullscreen_on_start ||
            restoredSettings.profile_screensaver_enabled !==
                targetSettings.profile_screensaver_enabled
        ) {
            const apiSnapshot = await readAccountSettingsViaApi('account-settings-debug');
            throw new Error(
                [
                    'Fresh login UI settings did not match the saved account settings.',
                    `Expected: ${formatSettings(targetSettings)}`,
                    `UI: ${formatSettings(restoredSettings)}`,
                    `API: ${formatSettings(apiSnapshot.settings)}`,
                ].join('\n')
            );
        }

        console.log('PASS: UI settings survived logout and a fresh sign-in context.');
    } finally {
        let restoreError = null;
        if (contextTwo) {
            await contextTwo.context.close().catch(() => {});
        }
        if (contextOne) {
            await contextOne.context.close().catch(() => {});
        }
        if (browser) {
            await browser.close().catch(() => {});
        }
        await restoreOriginalAccountSettings(originalSnapshot.metadata).catch((error) => {
            const message = error?.message || 'Unknown restore failure.';
            restoreError = new Error(`Failed to restore original account settings.\n${message}`);
        });
        await server.stop().catch(() => {});
        if (restoreError) {
            throw restoreError;
        }
    }
}

run()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error(error?.stack || error?.message || String(error));
        process.exit(1);
    });
