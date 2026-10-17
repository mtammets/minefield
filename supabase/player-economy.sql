create table if not exists public.player_economy_wallets (
    user_id text primary key,
    credits integer not null default 0 check (credits >= 0),
    unlocked_vehicle_ids jsonb not null default '[]'::jsonb,
    unlocked_wheel_preset_ids jsonb not null default '[]'::jsonb,
    lifetime_earned integer not null default 0 check (lifetime_earned >= 0),
    lifetime_spent integer not null default 0 check (lifetime_spent >= 0),
    transaction_count integer not null default 0 check (transaction_count >= 0),
    last_transaction_kind text not null default '',
    last_transaction_summary text not null default '',
    last_synced_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.player_economy_wallets
    add column if not exists unlocked_wheel_preset_ids jsonb not null default '[]'::jsonb;

create table if not exists public.player_economy_transactions (
    id uuid primary key,
    user_id text not null,
    kind text not null,
    credits_delta integer not null,
    balance_after integer not null check (balance_after >= 0),
    summary text not null default '',
    metadata_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists player_economy_wallets_last_synced_idx
    on public.player_economy_wallets (last_synced_at desc);

create index if not exists player_economy_transactions_user_created_idx
    on public.player_economy_transactions (user_id, created_at desc);

alter table public.player_economy_wallets enable row level security;
alter table public.player_economy_transactions enable row level security;

drop policy if exists "Users can read own wallet" on public.player_economy_wallets;
create policy "Users can read own wallet"
    on public.player_economy_wallets
    for select
    to authenticated
    using (auth.uid()::text = user_id);

drop policy if exists "Users can upsert own wallet" on public.player_economy_wallets;
create policy "Users can upsert own wallet"
    on public.player_economy_wallets
    for all
    to authenticated
    using (auth.uid()::text = user_id)
    with check (auth.uid()::text = user_id);

drop policy if exists "Users can read own wallet transactions" on public.player_economy_transactions;
create policy "Users can read own wallet transactions"
    on public.player_economy_transactions
    for select
    to authenticated
    using (auth.uid()::text = user_id);

drop policy if exists "Users can write own wallet transactions" on public.player_economy_transactions;
create policy "Users can write own wallet transactions"
    on public.player_economy_transactions
    for all
    to authenticated
    using (auth.uid()::text = user_id)
    with check (auth.uid()::text = user_id);
