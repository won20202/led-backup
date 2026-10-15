-- ============================================================
--  LED 플래카드 시뮬레이터 — 작업 되살리기 (4단계, 1회만)
--  ※ 앞의 1·2·3단계를 실행한 뒤에 돌리세요.
--  Supabase → SQL Editor 에 붙여넣고 [Run]
--
--  하는 일
--   · 학생 작업이 바뀌기 직전 모습을 15분에 한 장씩 따로 보관한다 (학생당 최근 8장)
--   · 누가 덮어쓰거나 학생이 실수로 지워도 선생님이 그 시점으로 되돌릴 수 있다
--   · 보관본도 [서버 자료 완전 삭제(파기)] 때 함께 지워진다
-- ============================================================

-- 지난 모습 보관함 (바깥에서 못 읽는 자리)
create table if not exists private.lps_history (
  pid      text        not null,
  saved_at timestamptz not null default now(),
  payload  jsonb       not null,
  primary key (pid, saved_at)
);

-- 저장이 일어나기 직전의 모습을 남긴다 (너무 자주 쌓이지 않게 10분 간격)
create or replace function private.lps_snap()
returns trigger
language plpgsql security definer
set search_path = private, public
as $$
declare last_at timestamptz;
begin
  select max(saved_at) into last_at from private.lps_history where pid = old.id;
  if last_at is null or last_at < now() - interval '15 minutes' then
    insert into private.lps_history (pid, payload) values (old.id, old.payload)
    on conflict do nothing;
    -- 학생당 최근 8장만 남긴다 (무료 용량 안에서도 넉넉하도록)
    delete from private.lps_history h
     where h.pid = old.id
       and h.saved_at < (select min(saved_at) from (
             select saved_at from private.lps_history where pid = old.id
              order by saved_at desc limit 8) t);
  end if;
  return new;
end;
$$;

drop trigger if exists lps_snap_trg on public.lps_works;
create trigger lps_snap_trg
  before update on public.lps_works
  for each row when (old.payload is distinct from new.payload)
  execute function private.lps_snap();

-- 교사: 되살릴 수 있는 시각 목록 (내용은 주지 않는다)
create or replace function public.lps_teacher_history(p_key text, p_sid text)
returns table (saved_at timestamptz, bytes int)
language plpgsql stable security definer
set search_path = public, private, extensions
as $$
begin
  if p_key is distinct from (select v from private.lps_secret where k = 'teacher') then
    raise exception '교사 열쇠가 맞지 않습니다';
  end if;
  return query
    select h.saved_at, length(h.payload::text)
      from private.lps_history h
     where h.pid = private.lps_pid(p_sid)
     order by h.saved_at desc;
end;
$$;

-- 교사: 고른 시각으로 되돌린다 (지금 모습도 한 장 남겨 두므로 다시 되돌릴 수 있다)
create or replace function public.lps_teacher_restore(p_key text, p_sid text, p_at timestamptz)
returns boolean
language plpgsql security definer
set search_path = public, private, extensions
as $$
declare target jsonb; cur jsonb; thepid text;
begin
  if p_key is distinct from (select v from private.lps_secret where k = 'teacher') then
    raise exception '교사 열쇠가 맞지 않습니다';
  end if;
  thepid := private.lps_pid(p_sid);
  select payload into target from private.lps_history where pid = thepid and saved_at = p_at;
  if target is null then return false; end if;
  select payload into cur from public.lps_works where id = thepid;
  if cur is not null then
    insert into private.lps_history (pid, payload) values (thepid, cur) on conflict do nothing;
  end if;
  update public.lps_works set payload = target, updated_at = now() where id = thepid;
  return true;
end;
$$;

-- 파기할 때 보관본도 함께 지운다
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
  delete from private.lps_history;      -- 지난 모습 보관본도 함께
  delete from private.lps_permit;
  return n;
end;
$$;

grant execute on function
  public.lps_teacher_history(text, text),
  public.lps_teacher_restore(text, text, timestamptz)
to anon, authenticated;

select '완료 — 이제부터 저장되는 작업은 15분 간격으로 지난 모습이 보관됩니다' as 결과;
