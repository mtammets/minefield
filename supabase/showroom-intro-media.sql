insert into storage.buckets (id, name, public, allowed_mime_types)
values (
    'showroom-intro-media',
    'showroom-intro-media',
    true,
    array['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/mpeg', 'video/avi', 'video/x-msvideo']
)
on conflict (id) do update
set
    public = excluded.public,
    allowed_mime_types = excluded.allowed_mime_types;
