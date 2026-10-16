-- ============================================================
--  LED 플래카드 시뮬레이터 — 미실시자 개인 코드에 시간 주기 (10단계, 1회만)
--  ※ 9단계까지 실행한 뒤에 돌리세요.
--  Supabase → SQL Editor 에 붙여넣고 [Run]
--
--  지금까지 미실시자 개인 코드(학번 하나로 그날 하루)는 시간 제한이 없었다.
--  앞으로는 선생님이 발급한 때부터 정한 시간 동안만 쓸 수 있다.
--  발급하지 않으면 개인 코드로는 들어올 수 없다.
-- ============================================================

-- 개인 코드 사용 허가 (바깥에서 못 읽는 자리)
create table if not exists private.lps_stu (
  pid   text primary key,
  until timestamptz not null
);

-- 교사: 한 학생에게 개인 코드를 발급한다 (기본 40분)
create or replace function public.lps_teacher_stucode(p_key text, p_sid text, p_minutes int default 40)
returns table (code text, until timestamptz)
language plpgsql security definer
set search_path = public, private, extensions
as $$
declare t timestamptz;
begin
  if p_key is distinct from (select v from private.lps_secret where k = 'teacher') then
    raise exception '교사 열쇠가 맞지 않습니다';
  end if;
  t := now() + make_interval(mins => greatest(1, least(480, p_minutes)));
  insert into private.lps_stu (pid, until) values (private.lps_pid(p_sid), t)
  on conflict (pid) do update set until = excluded.until;
  delete from private.lps_stu where until < now() - interval '1 day';   -- 지난 허가 정리
  return query select private.lps_codeof('stu', private.lps_today(), p_sid), t;
end;
$$;

-- 교사: 발급한 개인 코드를 거둬들인다
create or replace function public.lps_teacher_stucode_off(p_key text, p_sid text)
returns void
language plpgsql security definer
set search_path = public, private, extensions
as $$
begin
  if p_key is distinct from (select v from private.lps_secret where k = 'teacher') then
    raise exception '교사 열쇠가 맞지 않습니다';
  end if;
  delete from private.lps_stu where pid = private.lps_pid(p_sid);
end;
$$;

-- 코드 판정에서 개인 코드는 '발급받은 시간 안'일 때만 통과시킨다
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

  mode := coalesce(cfg->>'entryMode', 'none');
  if mode = 'none' then return true; end if;

  today := private.lps_today();
  if mode = 'fixed' then return p_code = coalesce(cfg->>'classCode', ''); end if;
  if mode = 'daily' then return p_code = private.lps_codeof('day', today); end if;

  -- 1) 미실시자 개인 코드 — 선생님이 발급한 시간 안에서만
  if p_code = private.lps_codeof('stu', today, p_sid)
     and exists (select 1 from private.lps_stu
                  where pid = private.lps_pid(p_sid) and until > now()) then
    return true;
  end if;

  bd := coalesce((cfg->>'banDigits')::int, 2);
  nd := coalesce((cfg->>'numDigits')::int, 2);
  if length(p_sid) <> 1 + bd + nd or p_sid !~ '^\d+$' then return false; end if;
  g := substr(p_sid, 1, 1)::int;
  b := substr(p_sid, 2, bd)::int;

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
          continue;
        end if;
        if cfg->'groups' ? tok then
          if cfg->'groups'->tok @> to_jsonb(p_sid) then toks := toks || tok; end if;
        else
          toks := toks || tok;
        end if;
      end loop;
    end loop;
  end if;

  np       := coalesce(jsonb_array_length(cfg->'periods'), 7);
  limit_on := p_time and coalesce((cfg->>'codeTimeLimit')::boolean, false);
  pad      := coalesce((cfg->>'codeWindowMin')::int, 20);
  nowmin   := extract(hour from (now() at time zone 'Asia/Seoul'))::int * 60
            + extract(minute from (now() at time zone 'Asia/Seoul'))::int;

  foreach tok in array toks loop
    for p1 in 0..np-1 loop
      for p2 in p1..np-1 loop
        ov := cfg->'codeOverrides'->>(today || '|' || tok || '|' || p1 || '|' || p2);
        if ov ~ '^\d{4}$' then
          hit := (p_code = ov);
        else
          hit := (p_code = private.lps_codeof('ban', today, tok, p1::text, p2::text));
        end if;
        if hit then
          if not limit_on then return true; end if;
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

grant execute on function
  public.lps_teacher_stucode(text, text, int),
  public.lps_teacher_stucode_off(text, text)
to anon, authenticated;

select '완료 — 미실시자 개인 코드는 이제 발급한 시간 동안만 쓸 수 있습니다' as 결과;
