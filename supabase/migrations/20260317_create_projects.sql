create extension if not exists "pgcrypto";

insert into storage.buckets (id, name, public)
values ('project-assets', 'project-assets', true)
on conflict (id) do nothing;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  room_name text not null,
  country text not null,
  building_type text not null,
  raw_file_path text,
  semantic_file_path text,
  instanced_file_path text,
  bim_obj_file_path text,
  bim_ifc_file_path text,
  bim_props_file_path text,
  image_url text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.projects enable row level security;

create policy "Users can read their own projects"
on public.projects
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own projects"
on public.projects
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own projects"
on public.projects
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own projects"
on public.projects
for delete
to authenticated
using (auth.uid() = user_id);

create policy "Public can read project assets"
on storage.objects
for select
to public
using (bucket_id = 'project-assets');

create policy "Authenticated users can upload project assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-assets'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "Authenticated users can update project assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-assets'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'project-assets'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "Authenticated users can delete project assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-assets'
  and split_part(name, '/', 1) = auth.uid()::text
);
