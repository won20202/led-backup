-- ============================================================
--  LED 플래카드 시뮬레이터 — 미실시자 코드 발급 오류 수정 (10-1단계)
--  ※ 10단계를 실행한 뒤에 이것도 Run 하세요.
--
--  10단계의 발급 함수가 돌려주는 칸 이름(until)이 표의 열 이름(until)과 겹쳐
--  부를 때 "42702 ambiguous" 오류가 났습니다. 칸 이름을 바꿔 고칩니다.
-- ============================================================

drop function if exists public.lps_teacher_stucode(text, text, int);

create or replace function public.lps_teacher_stucode(p_key text, p_sid text, p_minutes int default 40)
returns table (code text, expires timestamptz)
language plpgsql security definer
set search_path = public, private, extensions
as $$
declare t timestamptz; thepid text;
begin
  if p_key is distinct from (select v from private.lps_secret where k = 'teacher') then
    raise exception '교사 열쇠가 맞지 않습니다';
  end if;
  t := now() + make_interval(mins => greatest(1, least(480, p_minutes)));
  thepid := private.lps_pid(p_sid);

  insert into private.lps_stu as s (pid, until) values (thepid, t)
  on conflict (pid) do update set until = excluded.until;

  delete from private.lps_stu s where s.until < now() - interval '1 day';

  return query select private.lps_codeof('stu', private.lps_today(), p_sid), t;
end;
$$;

grant execute on function public.lps_teacher_stucode(text, text, int) to anon, authenticated;

select '완료 — 이제 발급 버튼이 실제로 동작합니다' as 결과;
