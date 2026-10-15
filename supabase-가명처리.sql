-- ============================================================
--  LED 플래카드 시뮬레이터 — 학번 가명처리 적용 (1회만 실행)
--  Supabase → SQL Editor 에 통째로 붙여넣고 [Run]
--
--  이 스크립트가 하는 일
--   ① 학생 작업 표(lps_works)를 바깥에서 직접 못 읽게 잠근다
--   ② 저장된 학번을 '되돌릴 수 없는 구분 기호'로 바꾼다 (반 번호는 남기고 번호는 지운다)
--   ③ 앱이 쓸 수 있도록 꼭 필요한 통로(함수)만 열어 준다
--   ④ 수업 설정은 개인정보가 아니므로 별도 표로 옮긴다
--
--  실행이 끝나면 맨 아래에 '교사 열쇠'가 한 줄 나옵니다.
--  그 값을 복사해서 앱의 관리자 화면에 붙여넣으세요.
-- ============================================================

-- ---------- ① 준비 ----------
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.lps_secret (
  k text primary key,
  v text not null
);

-- 열쇠 두 개를 무작위로 만든다 (이미 있으면 그대로 둔다)
insert into private.lps_secret (k, v) values
  ('pid',     encode(extensions.gen_random_bytes(32), 'hex')),   -- 학번 → 구분 기호 변환용
  ('teacher', encode(extensions.gen_random_bytes(16), 'hex'))    -- 교사만 쓰는 열쇠
on conflict (k) do nothing;

-- 학번을 구분 기호로 바꾸는 함수 (바깥에서는 호출할 수 없다)
create or replace function private.lps_pid(p_sid text)
returns text
language sql stable security definer
set search_path = private, extensions
as $$
  select encode(
    extensions.hmac(p_sid, (select v from private.lps_secret where k = 'pid'), 'sha256'),
    'hex');
$$;

-- ---------- ② 수업 설정을 따로 보관 ----------
create table if not exists public.lps_config (
  id         text primary key,
  payload    jsonb not null,
  updated_at timestamptz default now()
);
alter table public.lps_config enable row level security;
drop policy if exists lps_config_all on public.lps_config;
create policy lps_config_all on public.lps_config for all using (true) with check (true);

-- 기존 설정을 옮긴다
insert into public.lps_config (id, payload, updated_at)
select 'config', payload, coalesce(updated_at, now())
from public.lps_works where id = 'config'
on conflict (id) do update set payload = excluded.payload, updated_at = excluded.updated_at;

delete from public.lps_works where id = 'config';

-- ---------- ③ 이미 저장된 학번을 구분 기호로 바꾼다 ----------
-- 이미 바뀐 행(64자리 16진수)은 건드리지 않으므로 여러 번 실행해도 안전하다.
update public.lps_works
   set id  = private.lps_pid(id),
       num = 0                       -- 번호를 지운다 (반은 남긴다 — 반별 조회용)
 where id !~ '^[0-9a-f]{64}$';

-- ---------- ④ 표를 잠근다 ----------
-- 접속 키를 아는 사람이라도 표를 직접 읽거나 쓸 수 없다. 아래 함수로만 드나든다.
alter table public.lps_works enable row level security;
drop policy if exists "lps_read"   on public.lps_works;
drop policy if exists "lps_insert" on public.lps_works;
drop policy if exists "lps_update" on public.lps_works;
drop policy if exists "lps_delete" on public.lps_works;
revoke all on table public.lps_works from anon, authenticated;

-- ---------- ⑤ 앱이 쓸 통로 ----------

-- 학생: 자기 작업 저장
create or replace function public.lps_save(p_sid text, p_ban int, p_payload jsonb)
returns void
language plpgsql security definer
set search_path = public, private, extensions
as $$
begin
  insert into public.lps_works (id, ban, num, payload, updated_at)
  values (private.lps_pid(p_sid), p_ban, 0, p_payload, now())
  on conflict (id) do update
    set payload = excluded.payload, ban = excluded.ban, updated_at = now();
end;
$$;

-- 학생: 자기 작업 불러오기
create or replace function public.lps_load(p_sid text)
returns jsonb
language sql stable security definer
set search_path = public, private, extensions
as $$
  select payload from public.lps_works where id = private.lps_pid(p_sid);
$$;

-- 교사: 한 반의 작업을 번호와 함께 (교사 열쇠가 있어야 한다)
create or replace function public.lps_teacher_list(
  p_key text, p_grade int, p_ban int,
  p_max int default 45, p_bd int default 2, p_nd int default 2)
returns table (num int, updated_at timestamptz, payload jsonb)
language plpgsql stable security definer
set search_path = public, private, extensions
as $$
begin
  if p_key is distinct from (select v from private.lps_secret where k = 'teacher') then
    raise exception '교사 열쇠가 맞지 않습니다';
  end if;
  return query
    select n::int, w.updated_at, w.payload
      from generate_series(1, p_max) as n
      join public.lps_works w
        on w.id = private.lps_pid(
             p_grade::text || lpad(p_ban::text, p_bd, '0') || lpad(n::text, p_nd, '0'))
     order by n;
end;
$$;

-- 교사: 전체 현황 (내용 없이 목록만)
create or replace function public.lps_teacher_all(
  p_key text, p_grade int, p_bans int,
  p_max int default 45, p_bd int default 2, p_nd int default 2)
returns table (ban int, num int, updated_at timestamptz)
language plpgsql stable security definer
set search_path = public, private, extensions
as $$
begin
  if p_key is distinct from (select v from private.lps_secret where k = 'teacher') then
    raise exception '교사 열쇠가 맞지 않습니다';
  end if;
  return query
    select b::int, n::int, w.updated_at
      from generate_series(1, p_bans) as b
      cross join generate_series(1, p_max) as n
      join public.lps_works w
        on w.id = private.lps_pid(
             p_grade::text || lpad(b::text, p_bd, '0') || lpad(n::text, p_nd, '0'))
     order by b, n;
end;
$$;

-- 교사: 학생 한 명 작업 지우기
create or replace function public.lps_teacher_delete(p_key text, p_sid text)
returns void
language plpgsql security definer
set search_path = public, private, extensions
as $$
begin
  if p_key is distinct from (select v from private.lps_secret where k = 'teacher') then
    raise exception '교사 열쇠가 맞지 않습니다';
  end if;
  delete from public.lps_works where id = private.lps_pid(p_sid);
end;
$$;

-- 교사: 학생 작업 전부 지우기 (파기)
create or replace function public.lps_teacher_reset(p_key text)
returns int
language plpgsql security definer
set search_path = public, private, extensions
as $$
declare n int;
begin
  if p_key is distinct from (select v from private.lps_secret where k = 'teacher') then
    raise exception '교사 열쇠가 맞지 않습니다';
  end if;
  delete from public.lps_works;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 통로만 열어 준다
grant execute on function
  public.lps_save(text, int, jsonb),
  public.lps_load(text),
  public.lps_teacher_list(text, int, int, int, int, int),
  public.lps_teacher_all(text, int, int, int, int, int),
  public.lps_teacher_delete(text, text),
  public.lps_teacher_reset(text)
to anon, authenticated;

-- ============================================================
--  ↓↓↓ 아래 값을 복사해서 앱 관리자 화면에 붙여넣으세요 ↓↓↓
-- ============================================================
select v as "교사 열쇠" from private.lps_secret where k = 'teacher';
