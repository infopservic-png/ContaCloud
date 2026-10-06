-- Migración: perfil de marca de cada usuario (color corporativo, nombre y logo).
-- Cada usuario solo ve y modifica su propio perfil. Se puede correr varias veces sin error.

create table if not exists perfiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre_marca text check (nombre_marca is null or char_length(nombre_marca) <= 60),
  color_primario text check (color_primario is null or color_primario ~ '^#[0-9A-Fa-f]{6}$'),
  color_acento text check (color_acento is null or color_acento ~ '^#[0-9A-Fa-f]{6}$'),
  logo text check (
    logo is null
    or (logo ~ '^data:image/(png|jpeg|webp);base64,' and char_length(logo) <= 400000)
  ),
  updated_at timestamptz not null default now()
);

alter table perfiles enable row level security;

drop policy if exists "perfil propio: ver" on perfiles;
drop policy if exists "perfil propio: crear" on perfiles;
drop policy if exists "perfil propio: modificar" on perfiles;
drop policy if exists "perfil propio: eliminar" on perfiles;

create policy "perfil propio: ver" on perfiles
  for select using (user_id = auth.uid());
create policy "perfil propio: crear" on perfiles
  for insert with check (user_id = auth.uid());
create policy "perfil propio: modificar" on perfiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "perfil propio: eliminar" on perfiles
  for delete using (user_id = auth.uid());
