-- ============================================================
--  LED 플래카드 시뮬레이터 — 수업 설정을 교사만 바꿀 수 있게 (7단계, 1회만)
--  ※ 앞의 1~6단계를 실행한 뒤에 돌리세요.
--  Supabase → SQL Editor 에 붙여넣고 [Run]
--
--  지금까지는 접속 키를 아는 사람이면 누구나 수업 설정(시간표·평가 기준 등)을
--  바꿀 수 있었다. 앞으로는 읽기만 열려 있고, 바꾸는 건 교사 열쇠가 있어야 한다.
-- ============================================================

-- 읽기만 열어 둔다 (학생 앱이 수업 설정을 받아가야 하므로)
alter table public.lps_config enable row level security;
drop policy if exists lps_config_all  on public.lps_config;
drop policy if exists lps_config_read on public.lps_config;
create policy lps_config_read on public.lps_config for select using (true);

revoke insert, update, delete on table public.lps_config from anon, authenticated;

-- 교사: 수업 설정 저장
create or replace function public.lps_config_set(p_key text, p_payload jsonb)
returns void
language plpgsql security definer
set search_path = public, private
as $$
begin
  if p_key is distinct from (select v from private.lps_secret where k = 'teacher') then
    raise exception '교사 열쇠가 맞지 않습니다';
  end if;
  insert into public.lps_config (id, payload, updated_at)
  values ('config', p_payload, now())
  on conflict (id) do update set payload = excluded.payload, updated_at = now();
end;
$$;

grant execute on function public.lps_config_set(text, jsonb) to anon, authenticated;

select '완료 — 이제 수업 설정은 교사 열쇠가 있어야 바꿀 수 있습니다' as 결과;
