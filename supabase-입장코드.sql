-- ============================================================
--  LED 플래카드 시뮬레이터 — 입장 코드를 서버로 (8단계, 1회만)
--  ※ 앞의 1~7단계를 실행한 뒤에 돌리세요.
--  Supabase → SQL Editor 에 붙여넣고 [Run]
--
--  왜 하나
--   지금은 코드 계산식과 씨앗이 앱 안에 있어서, 앱을 뜯어보면 그날 그 반의
--   입장 코드를 만들어 낼 수 있다. 그래서 남의 학번으로 저장이 가능했다.
--   씨앗을 서버의 잠긴 보관함으로 옮기면 선생님만 코드를 알 수 있다.
--
--  ※ 실행하면 '코드 씨앗'이 새로 만들어지므로 오늘 알려 주신 코드는 바뀝니다.
--    (코드는 원래 날마다 바뀌므로, 다음 수업에 관리자 화면에서 새 코드를 보시면 됩니다)
-- ============================================================

-- 코드 씨앗 — 한 번만 만들고 그대로 둔다
insert into private.lps_secret (k, v)
values ('codesalt', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (k) do nothing;

-- 오늘 날짜 (앱과 같은 모양: 2026-10-16, 앞자리 0 없음, 한국 시간)
create or replace function private.lps_today()
returns text
language sql stable
as $$
  select to_char(now() at time zone 'Asia/Seoul', 'FMYYYY-FMMM-FMDD');
$$;

-- 코드 계산 — 앱의 codeOf 와 똑같이 (h = h*31 + 글자값, 32비트로 자름)
create or replace function private.lps_codeof(variadic p_parts text[])
returns text
language plpgsql stable security definer
set search_path = private
as $$
declare s text; h bigint := 0; i int;
begin
  s := (select v from private.lps_secret where k = 'codesalt') || '|' ||
       array_to_string(p_parts, '|');
  for i in 1..length(s) loop
    h := (h * 31 + ascii(substr(s, i, 1))) % 4294967296;
  end loop;
  return (1000 + (h % 9000))::text;
end;
$$;

-- 이 학번에게 이 코드가 맞는가 (앱의 판정 규칙을 그대로 옮긴 것)
--  p_time 이 true 면 '그 수업 시간대인지'까지 본다 (입장할 때만. 저장은 수업이 끝나도 되어야 한다)
create or replace function private.lps_code_ok(p_sid text, p_code text, p_time boolean default false)
returns boolean
language plpgsql stable security definer
set search_path = private, public
as $$
declare
  cfg jsonb; mode text; today text; np int;
  g int; b int; bd int; nd int;
  tok text; ov text; p1 int; p2 int;
  toks text[]; wk text; dow int; col jsonb;
  pad int; nowmin int; smin int; emin int; limit_on boolean; hit boolean;
begin
  select payload into cfg from public.lps_config where id = 'config';
  if cfg is null then return false; end if;

  mode  := coalesce(cfg->>'entryMode', 'none');
  if mode = 'none' then return true; end if;        -- 코드를 쓰지 않는 설정

  today := private.lps_today();
  if mode = 'fixed' then return p_code = coalesce(cfg->>'classCode', ''); end if;
  if mode = 'daily' then return p_code = private.lps_codeof('day', today); end if;

  -- 여기부터 '수업 코드' 방식
  -- 1) 미실시자 개인 코드 (학번 하나로 그날 하루)
  if p_code = private.lps_codeof('stu', today, p_sid) then return true; end if;

  -- 학번에서 학년·반을 읽는다
  bd := coalesce((cfg->>'banDigits')::int, 2);
  nd := coalesce((cfg->>'numDigits')::int, 2);
  if length(p_sid) <> 1 + bd + nd or p_sid !~ '^\d+$' then return false; end if;
  g := substr(p_sid, 1, 1)::int;
  b := substr(p_sid, 2, bd)::int;

  -- 2) 쓸 수 있는 수업 이름(토큰) 모으기 — 자기 반 + 오늘 시간표의 특별수업
  toks := array[ g || '-' || b, b::text ];

  wk  := to_char(date_trunc('week', (now() at time zone 'Asia/Seoul')), 'YYYY-MM-DD');
  dow := extract(isodow from (now() at time zone 'Asia/Seoul'))::int;
  if dow between 1 and 5 then
    for col in
      select c from (
        select cfg->'timetable'->dow::text as c
        union all
        select cfg->'weekOverrides'->wk->dow::text
      ) t where c is not null
    loop
      for tok in select jsonb_array_elements_text(col) loop
        tok := btrim(tok);
        continue when tok = '' or tok = any(toks);
        if tok ~ '^\d+$' or tok ~ '^\d+-\d+$' then
          continue;                                  -- 숫자형은 자기 반일 때만 (위에서 넣었다)
        end if;
        -- 이름이 붙은 특별 수업: 그룹 명단이 있으면 그 명단의 학생만
        if cfg->'groups' ? tok then
          if cfg->'groups'->tok @> to_jsonb(p_sid) then toks := toks || tok; end if;
        else
          toks := toks || tok;                       -- 명단 없는 특별 수업은 코드를 아는 학생 통과
        end if;
      end loop;
    end loop;
  end if;

  -- 3) 교시 범위를 모두 훑어 코드가 맞는지 본다 (관리자가 직접 바꾼 코드도 함께)
  np        := coalesce(jsonb_array_length(cfg->'periods'), 7);
  limit_on  := p_time and coalesce((cfg->>'codeTimeLimit')::boolean, false);
  pad       := coalesce((cfg->>'codeWindowMin')::int, 20);
  nowmin    := extract(hour from (now() at time zone 'Asia/Seoul'))::int * 60
             + extract(minute from (now() at time zone 'Asia/Seoul'))::int;

  foreach tok in array toks loop
    for p1 in 0..np-1 loop
      for p2 in p1..np-1 loop
        ov := cfg->'codeOverrides'->>(today || '|' || tok || '|' || p1 || '|' || p2);
        if ov ~ '^\d{4}$' then
          hit := (p_code = ov);                    -- 관리자가 직접 적어 둔 코드
        else
          hit := (p_code = private.lps_codeof('ban', today, tok, p1::text, p2::text));
        end if;
        if hit then
          if not limit_on then return true; end if;
          -- 그 수업 시간대인지 (앞뒤 여유 pad 분)
          smin := split_part(cfg->'periods'->p1->>'start', ':', 1)::int * 60
                + split_part(cfg->'periods'->p1->>'start', ':', 2)::int;
          emin := split_part(cfg->'periods'->p2->>'end',   ':', 1)::int * 60
                + split_part(cfg->'periods'->p2->>'end',   ':', 2)::int;
          if smin is null or emin is null then return true; end if;
          if nowmin >= smin - pad and nowmin <= emin + pad then return true; end if;
        end if;
      end loop;
    end loop;
  end loop;

  return false;
end;
$$;

-- 학생 앱: 입장할 때 코드가 맞는지 물어본다 (틀린 시도는 기록해 제한한다)
create or replace function public.lps_login_ok(p_sid text, p_code text)
returns boolean
language plpgsql security definer
set search_path = public, private
as $$
declare fails int;
begin
  if private.lps_code_ok(p_sid, p_code, true) then return true; end if;   -- 입장은 시간까지 본다
  select count(*) into fails from private.lps_try where at > now() - interval '10 minutes';
  if fails >= 60 then
    raise exception '시도가 너무 많습니다. 잠시 후 다시 해 주세요.';
  end if;
  insert into private.lps_try default values;
  return false;
end;
$$;

-- 학생 앱: 저장할 때도 코드를 함께 보낸다 → 코드를 모르면 남의 학번으로 저장할 수 없다
create or replace function public.lps_save(p_sid text, p_ban int, p_payload jsonb, p_code text default null)
returns void
language plpgsql security definer
set search_path = public, private, extensions
as $$
begin
  if not private.lps_code_ok(p_sid, coalesce(p_code, '')) then
    raise exception '입장 코드가 맞지 않습니다';
  end if;
  insert into public.lps_works (id, ban, num, payload, updated_at)
  values (private.lps_pid(p_sid), p_ban, 0, p_payload, now())
  on conflict (id) do update
    set payload = excluded.payload, ban = excluded.ban, updated_at = now();
end;
$$;

-- 교사 화면은 코드를 보여 줘야 하므로, 교사 열쇠로만 씨앗을 받아 간다
create or replace function public.lps_teacher_salt(p_key text)
returns text
language plpgsql stable security definer
set search_path = public, private
as $$
begin
  if p_key is distinct from (select v from private.lps_secret where k = 'teacher') then
    raise exception '교사 열쇠가 맞지 않습니다';
  end if;
  return (select v from private.lps_secret where k = 'codesalt');
end;
$$;

grant execute on function
  public.lps_login_ok(text, text),
  public.lps_save(text, int, jsonb, text),
  public.lps_teacher_salt(text)
to anon, authenticated;

-- 옛 3개짜리 lps_save 는 코드 없이 저장되므로 없앤다
drop function if exists public.lps_save(text, int, jsonb);

select '완료 — 입장 코드가 서버로 옮겨졌습니다. 관리자 화면에서 새 코드를 확인하세요' as 결과;
