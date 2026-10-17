#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');

const projectRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const {
    createBillboardContentStore,
    ensureBillboardContentSchema,
} = require('../server/billboard-content-store');
const {
    createSupabaseServiceClient,
    resolveSupabaseRuntimeConfig,
} = require('../server/supabase-config');

const ALLOWED_BUCKET_MIME_TYPES = Object.freeze([
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
]);

async function main() {
    const supabaseConfig = resolveSupabaseRuntimeConfig(process.env);
    if (!supabaseConfig.serviceEnabled) {
        throw new Error('Supabase service role config is missing.');
    }
    if (!supabaseConfig.databaseEnabled) {
        throw new Error('Supabase database connection string is missing.');
    }

    const supabaseClient = createSupabaseServiceClient(supabaseConfig);
    if (!supabaseClient) {
        throw new Error('Supabase service client could not be created.');
    }

    await ensureBillboardContentSchema(supabaseConfig);
    await ensureBillboardBucket(supabaseClient, supabaseConfig.billboardMediaBucket);

    const store = createBillboardContentStore({
        manifestFilePath: path.join(projectRoot, 'server/data/billboard-content.json'),
        uploadsDirectoryPath: path.join(projectRoot, 'public/uploads/billboards'),
        uploadsPublicBasePath: '/uploads/billboards',
        supabaseConfig,
        storageBucket: supabaseConfig.billboardMediaBucket,
        publicBaseUrl: supabaseConfig.url,
    });
    if (!store.isConfigured?.()) {
        throw new Error('Billboard content store did not enter Supabase mode.');
    }
    if (typeof store.reprocessGroups !== 'function') {
        throw new Error('Billboard content store does not support reprocessing.');
    }

    const beforeManifest = await store.readManifest();
    console.log(`Billboard groups before reprocess: ${formatManifestSummary(beforeManifest)}`);

    const result = await store.reprocessGroups([], {
        userId: 'codex-script',
    });
    const afterManifest = await store.readManifest();

    console.log(`Processed groups: ${result.processedGroupIds.join(', ') || 'none'}`);
    console.log(`Skipped groups: ${result.skippedGroupIds.join(', ') || 'none'}`);
    console.log(`Billboard groups after reprocess: ${formatManifestSummary(afterManifest)}`);
}

async function ensureBillboardBucket(supabaseClient, bucketName) {
    const { data, error } = await supabaseClient.storage.listBuckets();
    if (error) {
        throw error;
    }

    const exists = Array.isArray(data)
        ? data.some((bucket) => bucket?.name === bucketName || bucket?.id === bucketName)
        : false;
    if (exists) {
        const { error: updateError } = await supabaseClient.storage.updateBucket(bucketName, {
            public: true,
            allowedMimeTypes: ALLOWED_BUCKET_MIME_TYPES.slice(),
        });
        if (updateError) {
            throw updateError;
        }
        return;
    }

    const { error: createError } = await supabaseClient.storage.createBucket(bucketName, {
        public: true,
        allowedMimeTypes: ALLOWED_BUCKET_MIME_TYPES.slice(),
    });
    if (createError) {
        throw createError;
    }
}

function formatManifestSummary(manifest) {
    const groups = Object.values(manifest?.groups || {});
    if (groups.length === 0) {
        return 'no custom groups';
    }
    return groups
        .map((group) => {
            const itemCount = Array.isArray(group?.items) ? group.items.length : 0;
            return `${group.groupId}:${group.mediaKind}:${itemCount}`;
        })
        .join(', ');
}

main().catch((error) => {
    console.error('Billboard reprocess failed:', error);
    process.exitCode = 1;
});
