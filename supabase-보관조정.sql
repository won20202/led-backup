-- ============================================================
--  LED 플래카드 시뮬레이터 — 보관 간격 조정 + 삭제 시 보관본도 함께 (5단계, 1회만)
--  ※ 앞의 1~4단계를 실행한 뒤에 돌리세요.
--  Supabase → SQL Editor 에 붙여넣고 [Run]
--
--  바뀌는 것
--   · 보관 간격 15분 → 20분, 학생당 8장 → 14장
--     (2시간 블록 수업 두 번 = 약 2주치를 덮습니다)
--   · 학생 한 명의 작업을 지울 때 그 학생의 보관본·허가증도 함께 지워집니다
-- ============================================================

-- 보관 규칙: 20분에 한 장, 학생당 최근 14장
create or replace function private.lps_snap()
returns trigger
language plpgsql security definer
set search_path = private, public
as $$
declare last_at timestamptz;
begin
  select max(saved_at) into last_at from private.lps_history where pid = old.id;
  if last_at is null or last_at < now() - interval '20 minutes' then
    insert into private.lps_history (pid, payload) values (old.id, old.payload)
    on conflict do nothing;
    delete from private.lps_history h
     where h.pid = old.id
       and h.saved_at < (select min(saved_at) from (
             select saved_at from private.lps_history where pid = old.id
              order by saved_at desc limit 14) t);
  end if;
  return new;
end;
$$;

-- 한 학생을 지울 때 보관본·허가증도 함께 (삭제 요구에 완전히 응하기 위해)
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
end;
$$;

select '완료 — 20분 간격 · 학생당 14장으로 바뀌었습니다' as 결과;
