insert into storage.buckets (id, name, public, allowed_mime_types)
values (
    'garage-wrap-presets',
    'garage-wrap-presets',
    true,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
    public = excluded.public,
    allowed_mime_types = excluded.allowed_mime_types;
