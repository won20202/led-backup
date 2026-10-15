-- ============================================================
--  LED 플래카드 시뮬레이터 — 관리자 PIN을 모든 기기에서 쓰기 (2단계, 1회만)
--  ※ 앞서 'supabase-가명처리.sql'을 실행한 뒤에 돌리세요.
--  Supabase → SQL Editor 에 붙여넣고 [Run] ("Run and enable RLS" 를 눌러도 됩니다)
--
--  하는 일
--   · 관리자 PIN의 지문을 '열쇠 보관함'(바깥에서 못 읽는 곳)에 둔다
--   · 다른 노트북에서도 PIN만 치면 들어가지도록 확인 통로를 연다
--   · PIN이 맞으면 교사 열쇠도 그 기기로 받아오게 한다 (열쇠를 들고 다닐 필요 없음)
--
--  주의: PIN이 곧 교사 열쇠를 여는 문이 됩니다.
--        네 자리 숫자 대신 여섯 자리 이상(숫자+글자)으로 바꿔 두세요.
-- ============================================================

-- 교사가 PIN을 정할 때 — 교사 열쇠가 있어야 한다
create or replace function public.lps_admin_set(p_key text, p_hash text)
returns void
language plpgsql security definer
set search_path = public, private
as $$
begin
  if p_key is distinct from (select v from private.lps_secret where k = 'teacher') then
    raise exception '교사 열쇠가 맞지 않습니다';
  end if;
  insert into private.lps_secret (k, v) values ('pinhash', p_hash)
  on conflict (k) do update set v = excluded.v;
end;
$$;

-- 틀린 시도를 기록해 두는 곳 (바깥에서 못 읽는 자리)
create table if not exists private.lps_try (at timestamptz default now());

-- 다른 기기에서 PIN 확인 — 맞으면 교사 열쇠를 돌려준다
--  · 한 번 호출마다 0.3초를 쉰다
--  · 틀린 시도가 10분에 10번을 넘으면 그 뒤로는 아예 받지 않는다
--    (맞는 PIN은 제한에 걸리지 않으므로 선생님이 잠기는 일은 없다)
create or replace function public.lps_admin_open(p_hash text)
returns text
language plpgsql security definer
set search_path = public, private
as $$
declare stored text; fails int;
begin
  perform pg_sleep(0.3);
  select v into stored from private.lps_secret where k = 'pinhash';

  if stored is not null and p_hash = stored then
    delete from private.lps_try where at < now() - interval '1 day';
    return (select v from private.lps_secret where k = 'teacher');   -- 맞음 → 교사 열쇠
  end if;

  select count(*) into fails from private.lps_try where at > now() - interval '10 minutes';
  if fails >= 10 then
    raise exception '시도가 너무 많습니다. 잠시 후 다시 해 주세요.';
  end if;
  insert into private.lps_try default values;
  return null;                                                       -- 틀림
end;
$$;

grant execute on function
  public.lps_admin_set(text, text),
  public.lps_admin_open(text)
to anon, authenticated;

select '완료 — 관리자 화면에서 PIN을 한 번 저장하면 다른 기기에서도 그 PIN으로 열립니다' as 결과;
