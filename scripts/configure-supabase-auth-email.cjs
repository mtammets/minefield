#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

require('dotenv').config();

const TEMPLATE_DIR = path.join(__dirname, '..', 'supabase', 'auth-email-templates');
const MANAGEMENT_API_BASE_URL = 'https://api.supabase.com/v1';
const DEFAULT_APP_NAME = 'Minefield Drift';
const DEFAULT_PRIMARY_COLOR = '#2643d2';
const DEFAULT_SUPPORT_EMAIL = 'support@minefield.games';
const RESEND_SMTP_HOST = 'smtp.resend.com';
const RESEND_SMTP_PORT = 465;
const RESEND_SMTP_USER = 'resend';

const TEMPLATE_DEFINITIONS = [
    {
        id: 'confirmation',
        fileName: 'confirmation.html',
        subjectField: 'mailer_subjects_confirmation',
        contentField: 'mailer_templates_confirmation_content',
        buildSubject: (appName) => `Confirm your ${appName} account`,
    },
    {
        id: 'recovery',
        fileName: 'recovery.html',
        subjectField: 'mailer_subjects_recovery',
        contentField: 'mailer_templates_recovery_content',
        buildSubject: (appName) => `Reset your ${appName} password`,
    },
    {
        id: 'magic_link',
        fileName: 'magic-link.html',
        subjectField: 'mailer_subjects_magic_link',
        contentField: 'mailer_templates_magic_link_content',
        buildSubject: (appName) => `Sign in to ${appName}`,
    },
    {
        id: 'invite',
        fileName: 'invite.html',
        subjectField: 'mailer_subjects_invite',
        contentField: 'mailer_templates_invite_content',
        buildSubject: (appName) => `You are invited to ${appName}`,
    },
    {
        id: 'email_change',
        fileName: 'email-change.html',
        subjectField: 'mailer_subjects_email_change',
        contentField: 'mailer_templates_email_change_content',
        buildSubject: () => 'Confirm your new email address',
    },
    {
        id: 'reauthentication',
        fileName: 'reauthentication.html',
        subjectField: 'mailer_subjects_reauthentication',
        contentField: 'mailer_templates_reauthentication_content',
        buildSubject: () => 'Confirm it is you',
    },
];

async function main() {
    const args = new Set(process.argv.slice(2));
    const live = args.has('--live');
    const dryRun = args.has('--dry-run') || !live;
    const projectRef = sanitizeProjectRef(process.env.SUPABASE_PROJECT_REF || '');
    const accessToken = sanitizeText(
        process.env.SUPABASE_MANAGEMENT_TOKEN || process.env.SUPABASE_ACCESS_TOKEN || ''
    );
    const appName = sanitizeText(process.env.AUTH_EMAIL_APP_NAME || '') || DEFAULT_APP_NAME;
    const primaryColor = sanitizeHexColor(
        process.env.AUTH_EMAIL_PRIMARY_COLOR || DEFAULT_PRIMARY_COLOR
    );
    const supportEmail =
        sanitizeEmail(process.env.AUTH_EMAIL_SUPPORT_EMAIL || '') || DEFAULT_SUPPORT_EMAIL;
    const fromEmail =
        sanitizeEmail(process.env.SUPABASE_AUTH_FROM_EMAIL || '') ||
        sanitizeEmail(process.env.RESEND_FROM_EMAIL || '');
    const senderName = sanitizeText(process.env.SUPABASE_AUTH_SENDER_NAME || appName);
    const resendApiKey = sanitizeText(process.env.RESEND_API_KEY || '');
    const smtpHost =
        sanitizeText(process.env.SUPABASE_AUTH_SMTP_HOST || '') ||
        (resendApiKey ? RESEND_SMTP_HOST : '');
    const smtpUser =
        sanitizeText(process.env.SUPABASE_AUTH_SMTP_USER || '') ||
        (resendApiKey ? RESEND_SMTP_USER : '');
    const smtpPass = sanitizeText(process.env.SUPABASE_AUTH_SMTP_PASS || '') || resendApiKey;
    const smtpPort =
        sanitizePort(process.env.SUPABASE_AUTH_SMTP_PORT || '') ||
        (resendApiKey ? RESEND_SMTP_PORT : 0);

    const replacements = {
        __APP_NAME__: escapeHtml(appName),
        __PRIMARY_COLOR__: primaryColor,
        __SUPPORT_EMAIL__: escapeHtml(supportEmail),
    };

    const payload = buildTemplatePayload(appName, replacements);
    const smtpConfig = {
        smtp_admin_email: fromEmail,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_pass: smtpPass,
        smtp_sender_name: senderName,
    };
    const missingSmtpKeys = listMissingSmtpKeys(smtpConfig);
    const notes = [];

    if (missingSmtpKeys.length === 0) {
        payload.external_email_enabled = true;
        Object.assign(payload, smtpConfig);
    } else {
        notes.push(
            `SMTP config not included. Missing: ${missingSmtpKeys.join(
                ', '
            )}. Without custom SMTP the sender will still appear as Supabase Auth.`
        );
    }
    if (resendApiKey) {
        notes.push('Resend mode detected: using smtp.resend.com, port 465, username resend.');
    }

    if (dryRun) {
        console.log(
            JSON.stringify(
                {
                    mode: 'dry-run',
                    projectRef: projectRef || '(not set)',
                    updatedKeys: Object.keys(payload),
                    notes,
                    payload,
                },
                null,
                2
            )
        );
        console.log('\nRun again with --live to update the hosted Supabase project.');
        return;
    }

    if (!live) {
        return;
    }
    if (!projectRef) {
        throw new Error('Set SUPABASE_PROJECT_REF before running with --live.');
    }
    if (!accessToken) {
        throw new Error(
            'Set SUPABASE_MANAGEMENT_TOKEN (or SUPABASE_ACCESS_TOKEN) before running with --live.'
        );
    }

    const response = await fetch(`${MANAGEMENT_API_BASE_URL}/projects/${projectRef}/config/auth`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
            `Supabase Management API request failed (${response.status} ${response.statusText}): ${errorBody}`
        );
    }

    console.log(`Updated Supabase Auth email config for project ${projectRef}.`);
    console.log(`Patched keys: ${Object.keys(payload).join(', ')}`);
    for (const note of notes) {
        console.log(`Note: ${note}`);
    }
}

function buildTemplatePayload(appName, replacements) {
    const payload = {};
    for (const definition of TEMPLATE_DEFINITIONS) {
        const templatePath = path.join(TEMPLATE_DIR, definition.fileName);
        const templateContent = fs.readFileSync(templatePath, 'utf8');
        const resolvedTemplate = applyTemplateReplacements(templateContent, replacements);
        payload[definition.subjectField] = definition.buildSubject(appName);
        payload[definition.contentField] = resolvedTemplate;
    }
    return payload;
}

function applyTemplateReplacements(templateContent, replacements) {
    return Object.entries(replacements).reduce(
        (content, [token, replacement]) => content.split(token).join(replacement),
        templateContent
    );
}

function listMissingSmtpKeys(smtpConfig = {}) {
    return Object.entries(smtpConfig)
        .filter(([, value]) => !value)
        .map(([key]) => key);
}

function sanitizeProjectRef(value) {
    const normalized = sanitizeText(value).toLowerCase();
    return /^[a-z0-9]{6,32}$/u.test(normalized) ? normalized : '';
}

function sanitizeText(value) {
    return typeof value === 'string' ? value.trim().slice(0, 512) : '';
}

function sanitizeEmail(value) {
    const normalized = sanitizeText(value);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized) ? normalized : '';
}

function sanitizePort(value) {
    const parsed = Number.parseInt(String(value).trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 0;
}

function sanitizeHexColor(value) {
    const normalized = sanitizeText(value);
    return /^#[0-9a-f]{6}$/iu.test(normalized) ? normalized : DEFAULT_PRIMARY_COLOR;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
