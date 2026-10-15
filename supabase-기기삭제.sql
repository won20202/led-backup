-- ============================================================
--  LED 플래카드 시뮬레이터 — 지정한 학생 기기만 지우기 (6단계, 1회만)
--  ※ 앞의 1~5단계를 실행한 뒤에 돌리세요.
--  Supabase → SQL Editor 에 붙여넣고 [Run]
--
--  하는 일
--   · 선생님이 학생 작업을 [삭제]하면, 그 학생 기기도 '지우기 예약'이 걸린다
--   · 그 학생이 다음에 들어올 때만 "이 기기에 저장된 내 작업 지우기" 창이 뜬다
--   · 다른 학생에게는 아무것도 보이지 않는다 (호기심에 지울 수 없다)
-- ============================================================

-- 기기 지우기 예약 (바깥에서 못 읽는 자리)
create table if not exists private.lps_wipe (
  pid   text primary key,
  until timestamptz not null
);

-- 교사: 학생 작업을 지우면서 기기 지우기도 함께 예약한다 (기본 30일)
create or replace function public.lps_teacher_delete(p_key text, p_sid text)
returns void
language plpgsql security definer
set search_path = public, private, extensions
as $$
declare thepid text;
begin
  if p_key is distinct from (select v from private.lps_secret where k = 'teacher') then
    raise exception '교사 열쇠가 맞지 않습니다';
  end if;
  thepid := private.lps_pid(p_sid);
  delete from public.lps_works    where id  = thepid;
  delete from private.lps_history where pid = thepid;
  delete from private.lps_permit  where pid = thepid;
  insert into private.lps_wipe (pid, until) values (thepid, now() + interval '30 days')
  on conflict (pid) do update set until = excluded.until;
  delete from private.lps_wipe where until < now();   -- 지난 예약 정리
end;
$$;

-- 학생 앱: 나한테 지우기 예약이 걸려 있나? (내 학번으로만 물어본다)
create or replace function public.lps_wipe_due(p_sid text)
returns boolean
language sql stable security definer
set search_path = public, private, extensions
as $$
  select exists (select 1 from private.lps_wipe
                  where pid = private.lps_pid(p_sid) and until > now());
$$;

-- 학생 앱: 다 지웠다고 알린다 (다음부터는 창이 안 뜬다)
create or replace function public.lps_wipe_done(p_sid text)
returns void
language sql security definer
set search_path = public, private, extensions
as $$
  delete from private.lps_wipe where pid = private.lps_pid(p_sid);
$$;

grant execute on function
  public.lps_wipe_due(text),
  public.lps_wipe_done(text)
to anon, authenticated;

select '완료 — 이제 [삭제]한 학생에게만 기기 지우기 창이 뜹니다' as 결과;
