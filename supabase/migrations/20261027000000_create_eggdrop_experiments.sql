-- EggDrop Lab 실험 데이터 테이블 및 RLS 마이그레이션
-- 주의: 인증 없이 모든 사용자에게 읽기/쓰기를 허용하는 정책(using (true))은 보안상 생성하지 않습니다.
-- 반드시 Supabase Auth 사용자(auth.uid()) 본인의 데이터만 접근 가능하도록 제한합니다.

create table if not exists public.eggdrop_experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  floors smallint not null check (floors in (2, 3, 4, 5)),
  floor_height_m numeric(4, 2) not null check (floor_height_m between 2.0 and 6.0),
  drop_height_m numeric(6, 3) not null check (drop_height_m > 0),
  egg_mass_g numeric(5, 1) not null check (egg_mass_g between 20 and 150),
  conditions jsonb not null,
  configs jsonb not null default '[]'::jsonb,
  result jsonb not null,
  actual jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_eggdrop_experiments_user_created
  on public.eggdrop_experiments (user_id, created_at desc);

alter table public.eggdrop_experiments enable row level security;

-- 본인(인증된 사용자)의 실험만 조회 가능
create policy "eggdrop_experiments_select_own"
  on public.eggdrop_experiments
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 본인(인증된 사용자)의 실험만 생성 가능
create policy "eggdrop_experiments_insert_own"
  on public.eggdrop_experiments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- 본인(인증된 사용자)의 실험만 수정 가능
create policy "eggdrop_experiments_update_own"
  on public.eggdrop_experiments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 본인(인증된 사용자)의 실험만 삭제 가능
create policy "eggdrop_experiments_delete_own"
  on public.eggdrop_experiments
  for delete
  to authenticated
  using (auth.uid() = user_id);
