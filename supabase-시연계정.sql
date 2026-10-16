-- ============================================================
--  LED 플래카드 시뮬레이터 — 교사 시연 계정 저장 허용 (9단계, 1회만)
--  ※ 8단계까지 실행한 뒤에 돌리세요.
--  Supabase → SQL Editor 에 붙여넣고 [Run]
--
--  시연 계정(학번 00000)은 입장 코드가 아니라 관리자 PIN으로 들어오기 때문에
--  8단계를 적용한 뒤로는 저장이 막혔다. 교사 열쇠를 코드 자리에 넣어 보내면
--  저장되도록 길을 하나 열어 준다. (교사 열쇠는 교사 기기에만 있다)
-- ============================================================

create or replace function public.lps_save(p_sid text, p_ban int, p_payload jsonb, p_code text default null)
returns void
language plpgsql security definer
set search_path = public, private, extensions
as $$
begin
  if coalesce(p_code, '') is distinct from (select v from private.lps_secret where k = 'teacher')
     and not private.lps_code_ok(p_sid, coalesce(p_code, '')) then
    raise exception '입장 코드가 맞지 않습니다';
  end if;
  insert into public.lps_works (id, ban, num, payload, updated_at)
  values (private.lps_pid(p_sid), p_ban, 0, p_payload, now())
  on conflict (id) do update
    set payload = excluded.payload, ban = excluded.ban, updated_at = now();
end;
$$;

grant execute on function public.lps_save(text, int, jsonb, text) to anon, authenticated;

select '완료 — 교사 시연 계정도 다른 기기에서 이어서 쓸 수 있습니다' as 결과;
