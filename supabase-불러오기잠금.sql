-- ============================================================
--  LED 플래카드 시뮬레이터 — 서버에서 '불러오기' 잠그기 (3단계, 1회만)
--  ※ 앞의 1·2단계를 실행한 뒤에 돌리세요.
--  Supabase → SQL Editor 에 붙여넣고 [Run]
--
--  무엇이 달라지나
--   · 지금까지는 학번만 알면 그 학생의 작업을 받아올 수 있었다.
--   · 앞으로는 선생님이 열어 준 학생만, 정해진 시간 동안만 받아올 수 있다.
--   · 평소 학생은 자기 크롬북에 저장된 것으로 이어서 작업하므로 달라지는 게 없다.
--   · 크롬북이 바뀐 학생은 선생님이 [이어받기 허용]을 눌러 주면 된다.
-- ============================================================

-- 이어받기 허가증 (바깥에서 못 읽는 자리)
create table if not exists private.lps_permit (
  pid   text primary key,
  until timestamptz not null
);

-- 교사: 한 학생에게 이어받기를 허용한다 (기본 30분)
create or replace function public.lps_teacher_allow(p_key text, p_sid text, p_minutes int default 30)
returns timestamptz
language plpgsql security definer
set search_path = public, private, extensions
as $$
declare t timestamptz;
begin
  if p_key is distinct from (select v from private.lps_secret where k = 'teacher') then
    raise exception '교사 열쇠가 맞지 않습니다';
  end if;
  t := now() + make_interval(mins => greatest(1, least(240, p_minutes)));
  insert into private.lps_permit (pid, until) values (private.lps_pid(p_sid), t)
  on conflict (pid) do update set until = excluded.until;
  delete from private.lps_permit where until < now() - interval '1 day';   -- 지난 허가증 정리
  return t;
end;
$$;

-- 학생: 허가가 있을 때만 받아올 수 있다 (없으면 아무것도 돌려주지 않는다)
create or replace function public.lps_load(p_sid text)
returns jsonb
language sql stable security definer
set search_path = public, private, extensions
as $$
  select w.payload
    from public.lps_works w
    join private.lps_permit p on p.pid = w.id
   where w.id = private.lps_pid(p_sid)
     and p.until > now();
$$;

-- 교사: 한 학생의 작업 보기 (교사 열쇠로)
create or replace function public.lps_teacher_one(p_key text, p_sid text)
returns jsonb
language plpgsql stable security definer
set search_path = public, private, extensions
as $$
begin
  if p_key is distinct from (select v from private.lps_secret where k = 'teacher') then
    raise exception '교사 열쇠가 맞지 않습니다';
  end if;
  return (select payload from public.lps_works where id = private.lps_pid(p_sid));
end;
$$;

grant execute on function
  public.lps_teacher_allow(text, text, int),
  public.lps_teacher_one(text, text)
to anon, authenticated;

select '완료 — 이제 학번만 알아서는 작업을 받아올 수 없습니다' as 결과;
