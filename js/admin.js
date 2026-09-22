// 관리자 모드: 로그인 화면의 [관리자] 버튼 또는 URL ?admin=1 → PIN 입력.
import { config, saveConfig, exportConfigCode, importConfigCode, getMisses, clearMisses,
         cloudList, cloudListBan, cloudGet, cloudDelete, cloudPushConfig, setReadOnlyWork, DEFAULT_CONFIG, DEFAULT_RUBRIC,
         sheetLogFor, sheetFlushNow, todayCode, classSessionCode, codeKeyOf, autoSessionCode, studentDayCode,
         checkAdminPin, syncAdminPin,
         makeSid, parseSid, weekKeyOf, timetableForWeek, runsOf, todayRuns,
         rosterActive, readOnly, presetNames, savePreset, loadPreset, deletePreset,
         BLOCKED_STATUS } from './state.js?v=34';
import { TIPS as ORDER_TIPS, SAFETY as ORDER_SAFETY } from './assembly.js?v=34';
import { switchTab } from './app.js?v=34';

const $ = id => document.getElementById(id);

const FIELDS = [
  ['grade', '학년', 'number'],
  ['banCount', '반 수', 'number'],
  ['numCount', '한 반의 최대 번호', 'number'],
  ['banDigits', '학번의 반 자리수 (10반 이상이면 2, 9반 이하 학교는 1)', 'number'],
  ['numDigits', '학번의 번호 자리수 (보통 2)', 'number'],
  ['excludedSids', '명단 제외 학번 (전출 등 — 쉼표 구분, 예: 20627)', 'text'],
  ['extraSids', '추가 학번 (전입생 등 — 번호 범위 밖이어도 입장 허용)', 'text'],
  ['demoSids', '교사 시연용 학번 (관리자 PIN으로 아무 때나 입장, 쉼표로)', 'text'],
  ['subtitle', '로그인 화면 부제 (학년·수행 이름 등, 비우면 숨김)', 'text'],
  ['thickness', '재료(우드락) 두께 (cm)', 'number'],
  ['targetW', '완성 목표 가로 (cm)', 'number'],
  ['targetH', '완성 목표 높이 (cm)', 'number'],
  ['targetD', '완성 목표 깊이 (cm)', 'number'],
  ['showTarget', '완성 목표 치수를 학생 화면에 표시', 'checkbox'],
  ['ledCount', 'LED 지급 개수', 'number'],
  ['advanced', '심화 모드 (저항 부품 + 실제 색 LED)', 'checkbox'],
  ['resistorOhm', '저항값 (Ω)', 'number'],
  ['voltage', '전원 전압 (V)', 'number'],
  ['vf', 'LED 점등 문턱 전압 (V) — 직렬 소등 기준', 'number'],
  ['rint', '내부 저항 (Ω) — 밝기 계산용', 'number'],
  ['imax', '전지 최대 공급 전류 (mA)', 'number'],
  ['frontW', '앞면 종이 가로 (cm)', 'number'],
  ['frontH', '앞면 종이 세로 (cm)', 'number'],
  ['areaW', '도안 작업 영역 가로 (cm)', 'number'],
  ['areaH', '도안 작업 영역 세로 (cm)', 'number'],
  ['dLetters', '도안 글자 수 (한 글자씩 배치)', 'number'],
  ['dDrawing', '도안에 그림 포함', 'checkbox'],
  ['dFree', '도안 자유 모드 (글자 수·크기 조건 없음, 글자를 마음껏 추가)', 'checkbox'],
  ['strokeMin', '획 굵기 하한 (cm)', 'number'],
  ['letterMin', '글자 세로 최소 (cm)', 'number'],
  ['letterMax', '글자 세로 최대 (cm)', 'number'],
  ['pictoMin', '그림 크기 최소 (cm)', 'number'],
  ['pictoMax', '그림 크기 최대 (cm)', 'number'],
  ['boardW', '우드락 판 가로 (cm)', 'number'],
  ['boardH', '우드락 판 세로 (cm)', 'number'],
  ['showMeasure', '실측값 표시', 'checkbox'],
  ['logMax', '설계 일지 보관 개수 (케이스·회로·조립 순서 합계)', 'number'],
  ['attemptSteps', '생각 유도 안내를 띄울 회차 (쉼표로, 예: 20,40,60)', 'text'],
  ['attemptWarnFrom', '남은 횟수를 알려 줄 회차', 'number'],
  ['attemptGuide', '권장 시도 횟수 (넘어도 막지 않음)', 'number'],
  ['askPredict', '예측 먼저 (조립·점등 전 예측 입력)', 'checkbox'],
  ['questionFeedback', '질문형 피드백 표시', 'checkbox'],
  ['classCode', '고정 코드 (입장 방식이 "고정 코드"일 때)', 'text'],
  ['codeTimeLimit', '수업 코드를 그 수업 시간에만 허용 (앞 교시 반 차단)', 'checkbox'],
  ['codeWindowMin', '수업 시간 앞뒤 여유 (분) — 수업이 밀릴 때 대비', 'number'],
  ['adminPin', '관리자 PIN (저장하면 모든 기기에 적용)', 'text'],
  ['supabaseUrl', 'Supabase URL (비우면 이 기기에만 저장)', 'text'],
  ['supabaseKey', 'Supabase anon key', 'text'],
  ['sheetUrl', 'Google Sheet 기록 URL (Apps Script 배포 주소, README 참고)', 'text'],
];

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

function renderSettings() {
  const codeBanner =
    config.entryMode === 'daily'
      ? `<p class="measure">오늘의 입장 코드: <b style="font-size:20px">${todayCode()}</b> — 자정에 자동으로 바뀝니다. (모든 기기에서 같은 코드가 계산되므로 재배포 불필요)</p>`
      : config.entryMode === 'session'
        ? `<p class="measure">입장 방식이 "수업 코드"입니다 — 아래 [입장 코드] 섹션에서 반·교시를 골라 코드를 만드세요.</p>`
        : '';
  $('adm-settings').innerHTML = codeBanner +
  `<label class="adm-row"><span>입장 방식</span>
     <select data-k="entryMode">
       <option value="none" ${config.entryMode === 'none' ? 'selected' : ''}>코드 없음</option>
       <option value="fixed" ${config.entryMode === 'fixed' ? 'selected' : ''}>고정 코드</option>
       <option value="daily" ${config.entryMode === 'daily' ? 'selected' : ''}>매일 바뀌는 코드</option>
       <option value="session" ${config.entryMode === 'session' ? 'selected' : ''}>수업 코드 (반·교시 지정, 권장)</option>
     </select></label>` +
  FIELDS.map(([k, label, type]) => {
    if (type === 'checkbox')
      return `<label class="adm-row"><span>${label}</span><input type="checkbox" data-k="${k}" ${config[k] ? 'checked' : ''}></label>`;
    return `<label class="adm-row"><span>${label}</span><input type="${type}" data-k="${k}" value="${esc(config[k] ?? '')}" step="any"></label>`;
  }).join('') +
  `<label class="adm-row"><span>처음 열리는 탭</span>
     <select data-k="startTab">
       <option value="case" ${config.startTab === 'case' ? 'selected' : ''}>케이스</option>
       <option value="circuit" ${config.startTab === 'circuit' ? 'selected' : ''}>회로</option>
       <option value="design" ${config.startTab === 'design' ? 'selected' : ''}>도안</option>
       <option value="order" ${config.startTab === 'order' ? 'selected' : ''}>조립 순서</option>
       <option value="preview" ${config.startTab === 'preview' ? 'selected' : ''}>미리보기</option>
     </select></label>` +
  `<label class="adm-row"><span>초과 시 동작</span>
     <select data-k="overLimit">
       <option value="warn" ${config.overLimit === 'warn' ? 'selected' : ''}>경고만 (권장)</option>
       <option value="block" ${config.overLimit === 'block' ? 'selected' : ''}>차단</option>
     </select></label>`;
}

function collectSettings() {
  $('adm-settings').querySelectorAll('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (el.type === 'checkbox') config[k] = el.checked;
    else if (el.type === 'number') config[k] = parseFloat(el.value) || DEFAULT_CONFIG[k];
    else config[k] = el.value;
  });
  // Apps Script 코드는 [코드 수정] 잠금을 푼 동안에만 저장한다 (평소엔 실수로도 안 바뀜)
  if ($('adm-gas') && !$('adm-gas').readOnly && $('adm-gas').value.trim()) {
    config.customGasScript = $('adm-gas').value;
  }
  collectPeriods();
  collectTimetable();
  collectCodeOverrides();
  saveConfig();
}

// 화면에 열려 있는 모든 탭의 입력을 한 번에 모아 이 기기에 저장한다.
// (탭마다 따로 저장하러 가지 않아도 되도록 — 저장 버튼도, 자동 저장도 이 함수를 쓴다)
let unlocked = false;
export function collectAll() {
  if (!unlocked) return false;
  collectSettings(); collectRubric(); collectFaq(); collectMats(); collectOrderTexts();
  saveConfig();
  return true;
}
function stamp() {
  const t = new Date();
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}
function saveStatus(msg, cls) {
  const el = $('adm-save-status');
  if (el) { el.textContent = msg; el.className = 'save-status ' + (cls || ''); }
}
// push=false: 이 기기에만 (입력이 바뀔 때마다 자동) / push=true: 서버에 올려 학생 기기까지 반영
async function saveAll(push) {
  if (!collectAll()) return;
  await syncAdminPin();      // 바뀐 PIN의 지문을 서버로 함께 보낸다
  saveConfig();
  if (!push) { saveStatus(`이 기기에 자동 저장됨 ${stamp()} — 학생 기기에 반영하려면 [설정 저장]`, 'ok'); return; }
  saveStatus('서버에 올리는 중…');
  const pushed = await cloudPushConfig();
  renderSettings(); renderEntry();
  saveStatus(pushed
    ? `저장 완료 ${stamp()} — 학생은 새로고침하면 이 설정으로 바뀝니다`
    : `이 기기에 저장됨 ${stamp()} — 서버 연결 안 됨(설정 코드로 배포하세요)`, pushed ? 'ok' : 'bad');
}

// ---- 입장 코드 (수업 코드·미실시자·시간표) ----
function periodRow(p, i) {
  return `<div class="tool-row ec-p-row"><span>${i + 1}교시</span>
    <input type="time" class="ec-ps" value="${p.start}"> ~ <input type="time" class="ec-pe" value="${p.end}">
    <button class="ec-p-del small-btn">✕</button></div>`;
}
function collectPeriods() {
  const rows = [...document.querySelectorAll('#adm-entry .ec-p-row')];
  if (rows.length)
    config.periods = rows.map(r => ({
      start: r.querySelector('.ec-ps').value || '09:00',
      end: r.querySelector('.ec-pe').value || '09:45',
    }));
}
// 시간표 편집 대상: 'base'(기본) 또는 주 시작(월요일) 날짜 키
let entrySel = { kind: 'base', off: 0 };  // 기본 시간표부터 보여 준다 (이번 주만 바꾸려면 [주차별 보기])
function entryWeekKey() {
  const d = new Date();
  d.setDate(d.getDate() + entrySel.off * 7);
  return weekKeyOf(d);
}
// 교사가 직접 고쳐 쓴 오늘의 코드 (지난 날짜 것은 자동으로 버린다)
function collectCodeOverrides() {
  const rows = [...document.querySelectorAll('#adm-entry .ec-code-ov')];
  if (!rows.length) return;
  const today = new Date();
  const prefix = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}|`;
  const keep = {};
  Object.keys(config.codeOverrides || {}).forEach(k => {
    if (k.indexOf(prefix) === 0) keep[k] = config.codeOverrides[k];
  });
  rows.forEach(el => {
    const v = el.value.trim();
    const auto = el.dataset.auto;
    if (/^\d{4}$/.test(v) && v !== auto) keep[el.dataset.key] = v;
    else delete keep[el.dataset.key];
  });
  config.codeOverrides = keep;
}
function collectTimetable() {
  const grid = document.querySelector('#adm-entry .tt-grid');
  if (!grid) return;
  const tt = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  grid.querySelectorAll('.tt-cell').forEach(el => {
    tt[+el.dataset.d][+el.dataset.p] = el.value.trim();
  });
  const target = grid.dataset.target;
  if (target === 'base') config.timetable = tt;
  else {
    config.weekOverrides = config.weekOverrides || {};
    const norm = t => JSON.stringify([1, 2, 3, 4, 5].map(d =>
      Array.from({ length: 7 }, (_, p) => (((t || {})[d] || [])[p] || '').trim())));
    if (norm(tt) === norm(config.timetable)) delete config.weekOverrides[target];
    else config.weekOverrides[target] = tt;
  }
}
function allTokens() {
  const set = new Set();
  const add = tt => Object.values(tt || {}).forEach(col => (col || []).forEach(t => { if (t && String(t).trim()) set.add(String(t).trim()); }));
  add(config.timetable);
  Object.values(config.weekOverrides || {}).forEach(add);
  Object.keys(config.groups || {}).forEach(g => set.add(g));
  for (let b = 1; b <= config.banCount; b++) set.add(String(b));
  return [...set];
}
function tokenLabel(t) { return /^\d+$/.test(t) ? `${t}반` : t; }

function renderEntry() {
  const per = config.periods || [];
  const days = ['', '월', '화', '수', '목', '금'];
  const dow = new Date().getDay();
  const perOpts = per.map((p, i) => `<option value="${i}">${i + 1}교시 (${p.start}~${p.end})</option>`).join('');

  const runs = todayRuns();
  const todayHtml = runs.length
    ? `<div class="measure">오늘(${days[dow] || '주말'})의 수업별 코드 — 수업마다 코드가 다릅니다. 해당 수업 칠판에 적어 주세요<br>` +
      runs.map((r, i) =>
        `<div class="tool-row">${r.p1 + 1}${r.p2 > r.p1 ? '~' + (r.p2 + 1) : ''}교시 <b>${tokenLabel(r.token)}</b> →
         <input class="ec-code-ov" data-key="${esc(codeKeyOf(r.token, r.p1, r.p2))}" maxlength="4" inputmode="numeric"
                data-auto="${autoSessionCode(r.token, r.p1, r.p2)}" value="${classSessionCode(r.token, r.p1, r.p2)}">
         <button class="ec-log small-btn" data-i="${i}">시트에 수업 기록</button></div>`).join('') +
      '<p class="muted small">코드를 직접 고쳐 써도 됩니다(숫자 4자리, 오늘만 적용). 칸을 비우면 자동 코드로 돌아갑니다.</p></div>'
    : `<p class="muted small">시간표를 채우면 요일에 맞춰 오늘의 수업 코드가 자동으로 나옵니다.</p>`;

  const isBase = entrySel.kind === 'base';
  const wk = entryWeekKey();
  const tt = isBase ? (config.timetable || {}) : timetableForWeek(wk);
  const hasOverride = !isBase && !!(config.weekOverrides || {})[wk];
  const wkEnd = (() => { const d = new Date(wk); d.setDate(d.getDate() + 4); return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const wkLabel = `${wk.slice(5)}~${wkEnd}` + (entrySel.off === 0 ? ' (이번 주)' : entrySel.off === 1 ? ' (다음 주)' : '');

  $('adm-entry').innerHTML = `
    <h4>오늘의 수업 코드</h4>
    ${todayHtml}
    <h4>수동 생성 (수업 변경·보강 시)</h4>
    <div class="tool-row">
      <input id="ec-token" list="ec-token-list" placeholder="수업명 (예: 7, 2-7, 메이커반)" style="width:150px">
      <datalist id="ec-token-list">${allTokens().map(t => `<option value="${esc(t)}">`).join('')}</datalist>
      <select id="ec-p1">${perOpts}</select> ~ <select id="ec-p2">${perOpts}</select>
      <button id="ec-make" class="primary">코드 생성</button>
    </div>
    <div id="ec-manual-out"></div>
    <p class="muted small">"반"이나 "학년-반" 수업은 그 반 학생만 통과합니다. 그룹 수업명(메이커반 등)은 [학생 관리]에서 그룹 명단을 등록하면 그 명단의 학생만 통과합니다. 그룹 수업 코드는 시간표에 적혀 있어야 동작해요.</p>
    <h4>미실시자 개인 코드 (결석·보충용)</h4>
    <div class="tool-row"><input id="ec-stu" placeholder="학번을 쉼표로: ${makeSid(3, 21)}, ${makeSid(5, 7)}" style="flex:1"><button id="ec-stu-btn">코드 만들기</button></div>
    <div id="ec-stu-list"></div>
    <h4>시간표</h4>
    <div class="tool-row">
      <button id="ec-w-base" class="${isBase ? 'active' : ''}">기본 시간표</button>
      <button id="ec-w-prev" ${isBase ? 'disabled' : ''}>◀</button>
      <button id="ec-w-cur" class="${!isBase ? 'active' : ''}">${isBase ? '주차별 보기' : wkLabel}</button>
      <button id="ec-w-next" ${isBase ? 'disabled' : ''}>▶</button>
      ${hasOverride ? '<span class="att-badge">이 주만 수정됨</span><button id="ec-w-reset" class="small-btn">이 주 수정 취소</button>' : (!isBase ? '<span class="muted small">기본 시간표 적용 중 — 칸을 고치면 이 주만 바뀝니다</span>' : '')}
    </div>
    <div class="tt-grid" data-target="${isBase ? 'base' : wk}">
    <table class="adm-table tt-table"><tr><th>교시</th>${[1, 2, 3, 4, 5].map(d => `<th>${days[d]}</th>`).join('')}</tr>
      ${per.map((p, pi) => `<tr><td>${pi + 1} (${p.start})</td>` +
        [1, 2, 3, 4, 5].map(d =>
          `<td><input class="tt-cell" data-d="${d}" data-p="${pi}" value="${esc((tt[d] || [])[pi] || '')}" placeholder="-"></td>`).join('') + '</tr>').join('')}
    </table>
    </div>
    <p class="muted small">칸에 수업명을 적으세요: 반 번호(7), 학년-반(2-7, 1-8), 또는 그룹 이름(메이커반·동아리A). 비우면 수업 없음.</p>
    <h4>교시 시간</h4>
    <div id="ec-periods">${per.map(periodRow).join('')}</div>
    <button id="ec-p-add" class="small-btn">+ 교시 추가</button>
    <p class="muted small">바꿨으면 [수업 설정] 탭의 [설정 저장]을 누르고, 설정 코드로 다른 기기에도 배포하세요.</p>`;

  const makeManual = () => {
    let p1 = +$('ec-p1').value, p2 = +$('ec-p2').value;
    if (p2 < p1) { p2 = p1; $('ec-p2').value = String(p1); }
    const tok = $('ec-token').value.trim();
    if (!tok) { $('ec-manual-out').innerHTML = '<p class="warn">수업명을 먼저 입력하세요 (예: 7, 2-7, 메이커반)</p>'; $('ec-token').focus(); return; }
    $('ec-manual-out').innerHTML = `
      <div class="measure tool-row" style="align-items:center">
        <span>${tokenLabel(tok)} ${p1 + 1}${p2 > p1 ? '~' + (p2 + 1) : ''}교시 →</span>
        <b style="font-size:32px">${classSessionCode(tok, p1, p2)}</b>
        <button id="ec-log-manual" class="small-btn">시트에 수업 기록</button>
      </div>`;
    $('ec-log-manual').addEventListener('click', () => logLesson(tok, p1, p2));
  };
  $('ec-make').addEventListener('click', makeManual);
  $('ec-token').addEventListener('keydown', e => { if (e.key === 'Enter') makeManual(); });

  const goto = (kind, off) => { collectTimetable(); entrySel = { kind, off }; renderEntry(); };
  $('ec-w-base').addEventListener('click', () => goto('base', 0));
  $('ec-w-cur').addEventListener('click', () => goto('week', isBase ? 0 : entrySel.off));
  $('ec-w-prev').addEventListener('click', () => goto('week', entrySel.off - 1));
  $('ec-w-next').addEventListener('click', () => goto('week', entrySel.off + 1));
  const resetBtn = $('ec-w-reset');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    delete config.weekOverrides[wk];
    saveConfig();
    renderEntry();
  });

  const logLesson = (token, p1, p2) => {
    if (!config.sheetUrl) { alert('먼저 수업 설정에 Google Sheet 기록 URL을 넣어 주세요.'); return; }
    const ban = /^\d+$/.test(token) ? +token : token;
    sheetLogFor(ban, 0, '수업 실시', `${tokenLabel(token)} ${p1 + 1}${p2 > p1 ? '~' + (p2 + 1) : ''}교시`);
    sheetFlushNow();
    alert('시트에 기록했습니다.');
  };
  $('adm-entry').querySelectorAll('.ec-log').forEach(b => b.addEventListener('click', () => {
    const r = runs[+b.dataset.i];
    logLesson(r.token, r.p1, r.p2);
  }));

  $('ec-stu').addEventListener('keydown', e => { if (e.key === 'Enter') $('ec-stu-btn').click(); });
  $('ec-stu-btn').addEventListener('click', () => {
    const list = $('ec-stu').value.split(',').map(s => s.trim()).filter(Boolean);
    $('ec-stu-list').innerHTML = list.map(s => {
      const p = parseSid(s);
      if (!p) return `<div class="warn">"${esc(s)}"은(는) 학번 형식이 아니에요 (예: ${makeSid(3, 21)})</div>`;
      return `<div class="adm-work-row">${esc(s)} (${p.grade}학년 ${p.ban}반 ${p.num}번) → <b>${studentDayCode(s)}</b> <span class="muted small">오늘만 유효</span></div>`;
    }).join('') || '<p class="muted">학번을 입력하세요.</p>';
  });
  $('ec-p-add').addEventListener('click', () => {
    collectPeriods(); collectTimetable();
    config.periods.push({ start: '16:00', end: '16:45' });
    renderEntry();
  });
  $('adm-entry').querySelectorAll('.ec-p-del').forEach((b, i) => b.addEventListener('click', () => {
    collectPeriods(); collectTimetable(); config.periods.splice(i, 1); renderEntry();
  }));
}

// ---- 명단(학적)·그룹 관리 ----
function downloadText(name, text) {
  const a = document.createElement('a');
  const bom = name.endsWith('.json') ? '' : '﻿';
  a.href = URL.createObjectURL(new Blob([bom + text], { type: name.endsWith('.json') ? 'application/json' : 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
function rosterTemplate() {
  const rows = [['학번', '학적(재학/전입/전출/유예/휴학)']];
  for (let b = 1; b <= config.banCount; b++)
    for (let n = 1; n <= config.numCount; n++)
      rows.push([makeSid(b, n), '재학']);
  downloadText('학생명단_양식.csv', rows.map(r => r.join(',')).join('\r\n'));
}
function importRoster(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const entries = [];
  for (const line of lines) {
    const cols = line.split(/[,\t]/).map(c => c.trim().replace(/^"|"$/g, ''));
    const p = parseSid(cols[0]);
    if (!p) continue;
    entries.push({ sid: cols[0], status: cols[1] || '재학', key: `${p.grade}-${p.ban}` });
  }
  if (!entries.length) { alert('학번을 읽을 수 없습니다. 양식(학번,학적)을 확인해 주세요.'); return; }
  const touched = new Set(entries.map(e => e.key));
  const next = {};
  Object.entries(config.roster || {}).forEach(([sid, st]) => {
    const p = parseSid(sid);
    if (!p || !touched.has(`${p.grade}-${p.ban}`)) next[sid] = st;
  });
  entries.forEach(e => next[e.sid] = e.status);
  config.roster = next;
  saveConfig();
  renderRosterSummary();
  alert(`${entries.length}명을 등록했습니다 (${[...touched].join(', ')} 반 교체). 설정 코드로 다른 기기에도 배포하세요.`);
}
function renderRosterSummary() {
  const el = $('adm-roster-summary');
  const r = config.roster || {};
  const sids = Object.keys(r);
  if (!sids.length) { el.innerHTML = '<p class="muted small">등록된 명단 없음 — 기본 규칙으로 동작 중.</p>'; return; }
  const byStatus = {};
  sids.forEach(s => { const st = r[s] || '재학'; byStatus[st] = (byStatus[st] || 0) + 1; });
  el.innerHTML = `<p class="supply">명단 ${sids.length}명 등록됨 — ` +
    Object.entries(byStatus).map(([st, n]) => `${st} ${n}`).join(' · ') + '</p>';
}
function renderGroups() {
  const g = config.groups || {};
  $('adm-groups').innerHTML = Object.keys(g).map(name => `
    <div class="adm-area" data-g="${esc(name)}">
      <div class="adm-area-head"><b>${esc(name)}</b> <span class="muted small">${g[name].length}명</span>
        <button class="g-del">삭제</button></div>
      <textarea class="g-sids" rows="2" placeholder="학번을 쉼표로 (예: ${makeSid(3, 21)}, 10821)">${esc(g[name].join(', '))}</textarea>
    </div>`).join('') || '<p class="muted small">등록된 그룹 없음</p>';
  $('adm-groups').querySelectorAll('.adm-area').forEach(div => {
    const name = div.dataset.g;
    div.querySelector('.g-del').addEventListener('click', () => {
      delete config.groups[name]; saveConfig(); renderGroups();
    });
    div.querySelector('.g-sids').addEventListener('change', e => {
      config.groups[name] = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
      saveConfig();
    });
  });
}

// ---- 평가 기준(배점표) 편집 ----
function renderRubric() {
  const rub = config.rubric && config.rubric.length ? config.rubric : JSON.parse(JSON.stringify(DEFAULT_RUBRIC));
  config.rubric = rub;
  $('adm-rubric').innerHTML = rub.map((area, ai) => `
    <div class="adm-area" data-ai="${ai}">
      <div class="adm-area-head">
        <input class="ra-name" value="${esc(area.name)}" placeholder="평가 영역 이름 (예: 설계 포트폴리오)">
        <button class="ra-del">영역 삭제</button>
      </div>
      <textarea class="ra-note" rows="2" placeholder="평가 준거 조건 설명 (선택)">${esc(area.note || '')}</textarea>
      <table class="adm-table">
        <tr><th>평가 준거 (수준별)</th><th style="width:70px">배점</th><th style="width:46px"></th></tr>
        ${area.levels.map((lv, li) => `
          <tr data-li="${li}">
            <td><input class="ra-desc" value="${esc(lv.d)}" placeholder="예: 4가지 조건을 모두 충족함"></td>
            <td><input class="ra-pts" type="number" step="1" value="${lv.p}"></td>
            <td><button class="ra-lvdel">✕</button></td>
          </tr>`).join('')}
      </table>
      <button class="ra-lvadd small-btn">+ 수준 추가</button>
    </div>`).join('');

  const total = rub.reduce((a, r) => a + (r.levels[0] ? r.levels[0].p : 0), 0);
  $('adm-rubric').innerHTML += `<p class="muted small">영역 최고점 합계: ${total}점</p>`;

  $('adm-rubric').querySelectorAll('.adm-area').forEach(div => {
    const ai = +div.dataset.ai;
    div.querySelector('.ra-del').addEventListener('click', () => {
      collectRubric(); config.rubric.splice(ai, 1); renderRubric();
    });
    div.querySelector('.ra-lvadd').addEventListener('click', () => {
      collectRubric(); config.rubric[ai].levels.push({ d: '', p: 0 }); renderRubric();
    });
    div.querySelectorAll('.ra-lvdel').forEach((b, li) =>
      b.addEventListener('click', () => {
        collectRubric(); config.rubric[ai].levels.splice(li, 1); renderRubric();
      }));
  });
}
function collectRubric() {
  if (!$('adm-rubric').children.length) return; // 아직 안 그려졌으면 건드리지 않는다
  const out = [];
  $('adm-rubric').querySelectorAll('.adm-area').forEach(div => {
    const levels = [];
    div.querySelectorAll('tr[data-li]').forEach(tr => {
      const d = tr.querySelector('.ra-desc').value.trim();
      const p = parseFloat(tr.querySelector('.ra-pts').value) || 0;
      if (d) levels.push({ d, p });
    });
    const name = div.querySelector('.ra-name').value.trim();
    if (name) out.push({ name, note: div.querySelector('.ra-note').value.trim(), levels });
  });
  config.rubric = out;
}

// ---- FAQ 편집 ----
function renderFaqEditor() {
  $('adm-faq').innerHTML = config.faq.map((f, i) =>
    `<div class="adm-faq-item" data-i="${i}">
       <input class="fq" value="${esc(f.q)}" placeholder="질문">
       <input class="fk" value="${esc(f.k || '')}" placeholder="검색 키워드 (띄어쓰기로 구분)">
       <textarea class="fa" rows="2" placeholder="답변">${esc(f.a)}</textarea>
       <div><select class="ft">
         ${['all', 'case', 'circuit', 'design', 'order', 'preview'].map(t =>
           `<option value="${t}" ${f.tab === t ? 'selected' : ''}>${{ all: '공통', case: '케이스', circuit: '회로', design: '도안', order: '조립순서', preview: '미리보기' }[t]}</option>`).join('')}
       </select> <button class="fdel">삭제</button></div>
     </div>`).join('');
  $('adm-faq').querySelectorAll('.fdel').forEach((b, i) =>
    b.addEventListener('click', () => { config.faq.splice(i, 1); saveConfig(); renderFaqEditor(); }));
}
function collectFaq() {
  if (!$('adm-faq').children.length) return;
  const items = [];
  $('adm-faq').querySelectorAll('.adm-faq-item').forEach(div => {
    const q = div.querySelector('.fq').value.trim();
    const a = div.querySelector('.fa').value.trim();
    if (q && a) items.push({ q, k: div.querySelector('.fk').value.trim(), a, tab: div.querySelector('.ft').value });
  });
  config.faq = items;
  saveConfig();
}

// ---- 재료·도구 카드 편집 (도움말에 표시) ----
function renderMatEditor() {
  const mats = config.materials || [];
  $('adm-mats').innerHTML = mats.map((m, i) =>
    `<div class="adm-faq-item adm-mat-item" data-i="${i}">
       <input class="mn" value="${esc(m.n)}" placeholder="재료 이름">
       <textarea class="mf" rows="2" placeholder="설명 (한 줄에 하나씩)">${esc((m.f || []).join('\n'))}</textarea>
       <input class="mt" value="${esc(m.t || '')}" placeholder="팁 한 줄">
       <div><button class="mdel">삭제</button></div>
     </div>`).join('');
  $('adm-mats').querySelectorAll('.mdel').forEach((b, i) =>
    b.addEventListener('click', () => { collectMats(); config.materials.splice(i, 1); saveConfig(); renderMatEditor(); }));
}
function collectMats() {
  if (!$('adm-mats').children.length) return;
  const items = [];
  const palette = ['#f0e3c0', '#fff3b0', '#d7dde6', '#eef4f0', '#c9cdd3', '#d9e6d5', '#f3d9d3', '#dcd6ea'];
  $('adm-mats').querySelectorAll('.adm-mat-item').forEach((div, i) => {
    const n = div.querySelector('.mn').value.trim();
    if (!n) return;
    const old = (config.materials || [])[i] || {};
    items.push({
      n, c: old.c || palette[i % palette.length],
      f: div.querySelector('.mf').value.split('\n').map(s => s.trim()).filter(Boolean),
      t: div.querySelector('.mt').value.trim(),
    });
  });
  config.materials = items;
  saveConfig();
}

// ---- 조립 순서 팁·안전 문구 편집 (기본 문구 위에 덮어쓰기) ----
const ORDER_LABELS = {
  cut: '우드락 재단', dryfit: '가조립', front: '앞면 가공', wire: '회로 연결(테이프·LED)',
  lightcheck: '점등 확인', glue5: '5면 조립', battery: '홀더 — 전선 피복 벗기기',
  battery2: '홀더 — 송곳 구멍·전선 연결', finalcheck: '최종 점등 확인', backclose: '뒷면 조립',
};
function renderOrderTextEditor() {
  const ov = config.orderTips || {}, sv = config.orderSafety || {};
  $('adm-otips').innerHTML = Object.keys(ORDER_LABELS).map(id => `
    <div class="adm-faq-item">
      <b>${ORDER_LABELS[id]}</b>
      ${ORDER_SAFETY[id] !== undefined ? `<label class="small">안전 경고</label>
        <textarea class="osv" data-id="${id}" rows="2">${esc(sv[id] || ORDER_SAFETY[id])}</textarea>` : ''}
      <label class="small">팁</label>
      <textarea class="otv" data-id="${id}" rows="3">${esc(ov[id] || ORDER_TIPS[id] || '')}</textarea>
    </div>`).join('');
}
function collectOrderTexts() {
  if (!$('adm-otips').children.length) return;
  const tips = {}, safe = {};
  $('adm-otips').querySelectorAll('.otv').forEach(t => {
    const v = t.value.trim();
    if (v && v !== (ORDER_TIPS[t.dataset.id] || '')) tips[t.dataset.id] = v;
  });
  $('adm-otips').querySelectorAll('.osv').forEach(t => {
    const v = t.value.trim();
    if (v && v !== (ORDER_SAFETY[t.dataset.id] || '')) safe[t.dataset.id] = v;
  });
  config.orderTips = tips;
  config.orderSafety = safe;
  saveConfig();
}

function renderMisses() {
  const m = getMisses();
  $('adm-miss').innerHTML = m.length
    ? m.slice(-40).reverse().map(x => `<div>· ${esc(x.q)}</div>`).join('')
    : '<p class="muted">학생이 검색했지만 답을 못 찾은 검색어가 여기에 쌓입니다.</p>';
}

function localWorks() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const m = k && k.match(/^lps_work_(?:(\d+)-)?(\d+)-(\d+)$/);
    if (m) {
      try {
        const w = JSON.parse(localStorage.getItem(k));
        out.push({ grade: m[1] ? +m[1] : null, ban: +m[2], num: +m[3], id: k.slice('lps_work_'.length), updated: w.updatedAt, w });
      } catch (e) { /* ignore */ }
    }
  }
  return out.sort((a, b) => a.ban - b.ban || a.num - b.num);
}

let cloudRows = [];
// [이전 작업 접고 새로 시작] 버튼의 현재 상태
function renderResetBtn() {
  const b = $('adm-reset-works');
  if (!b) return;
  b.textContent = config.resetAt
    ? `새로 시작 적용 중 (${new Date(config.resetAt).toLocaleString('ko-KR')}) — 되돌리기`
    : '이전 작업 접고 새로 시작';
}
async function renderWorks() {
  renderResetBtn();
  const el = $('adm-works');
  if (!el) return;
  let html = '<h4>이 기기에 저장된 작업</h4>';
  const loc = localWorks();
  html += loc.length
    ? loc.map(r => `<div class="adm-work-row">${r.grade ? r.grade + '학년 ' : ''}${r.ban}반 ${r.num}번 <span class="muted">${r.updated ? new Date(r.updated).toLocaleString('ko-KR') : ''}</span>
        <button class="w-open" data-id="local:${r.id}">보기</button>
        <button class="w-note" data-bn="${r.ban}:${r.num}">메모</button>
        <button class="w-del" data-id="local:${r.id}">삭제</button></div>`).join('')
    : '<p class="muted">없음</p>';
  html += '<h4>서버(Supabase)에 모인 작업</h4>';
  if (!config.supabaseUrl) {
    html += '<p class="muted">Supabase가 설정되지 않았습니다. 설정하면 모든 학생의 작업이 여기에 모이고 20초마다 자동 갱신됩니다.</p>';
    el.innerHTML = html; bindWorkButtons(); return;
  }
  try {
    cloudRows = await cloudList();
    const openBans = new Set([...document.querySelectorAll('.adm-ban[open]')].map(d => d.dataset.ban));
    const byBan = {};
    cloudRows.forEach(r => { (byBan[r.ban] = byBan[r.ban] || []).push(r); });
    const liveCut = Date.now() - 10 * 60 * 1000;
    const liveRows = cloudRows.filter(r => new Date(r.updated_at).getTime() > liveCut);
    const liveOpen = document.querySelector('#live-sec[open]') !== null;
    if (cloudRows.length)
      html += `<details class="adm-ban" id="live-sec" ${liveOpen ? 'open' : ''}>
        <summary>지금 작업 중 — 최근 10분, 반 상관없이 (${liveRows.length}명)</summary>
        <div class="board-grid" id="live-grid"><p class="muted">불러오는 중…</p></div>
      </details>`;
    html += cloudRows.length
      ? Object.keys(byBan).sort((a, b) => a - b).map(ban =>
          `<details class="adm-ban" data-ban="${ban}" ${openBans.has(String(ban)) ? 'open' : ''}>
             <summary>${ban}반 실시간 보드 (${byBan[ban].length}명)</summary>
             <div class="board-grid" data-ban="${ban}"><p class="muted">불러오는 중…</p></div>
           </details>`).join('')
      : '<p class="muted">아직 저장된 학생 작업이 없습니다.</p>';
  } catch (e) {
    html += `<p class="warn">서버에서 불러오지 못했습니다: ${esc(e.message)}</p>`;
  }
  el.innerHTML = html;
  bindWorkButtons();
  el.querySelectorAll('.adm-ban').forEach(det => {
    const load = () => {
      if (!det.open) return;
      if (det.id === 'live-sec') loadLiveBoard();
      else loadBanBoard(det.dataset.ban);
    };
    det.addEventListener('toggle', load);
    load();
  });
}

async function loadLiveBoard() {
  const grid = $('live-grid');
  if (!grid) return;
  const cut = Date.now() - 10 * 60 * 1000;
  const act = cloudRows.filter(r => new Date(r.updated_at).getTime() > cut)
    .sort((a, b) => a.ban - b.ban || a.num - b.num);
  if (!act.length) { grid.innerHTML = '<p class="muted">최근 10분 안에 작업한 학생이 없습니다.</p>'; return; }
  const rowsByKey = {};
  for (const ban of [...new Set(act.map(r => r.ban))]) {
    try { (await cloudListBan(ban)).forEach(r => { rowsByKey[`${r.ban}-${r.num}`] = r; }); } catch (e) { /* ignore */ }
  }
  grid.innerHTML = act.map(r0 => {
    const r = rowsByKey[`${r0.ban}-${r0.num}`] || r0;
    const tabBadge = `<span class="tab-badge">${TAB_NAMES[(r.payload || {}).activeTab] || '케이스'}</span>`;
    return `
      <div class="stu-card">
        <div class="stu-head"><b>${r.ban}반 ${r.num}번</b>${tabBadge}${activityBadge(r.updated_at)}
          <span class="muted small">${new Date(r.updated_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <canvas class="stu-thumb" data-key="${r.ban}-${r.num}" title="눌러서 크게 보기"></canvas>
        <div class="stu-chips">${summarize(r.payload || {})}</div>
        <div class="stu-btns"><button class="w-open" data-id="cloud:${r.id}">보기</button></div>
      </div>`;
  }).join('');
  grid.querySelectorAll('.stu-thumb').forEach(cnv => {
    const r = rowsByKey[cnv.dataset.key];
    try { drawThumb(cnv, r && r.payload); } catch (e) { /* ignore */ }
    cnv.addEventListener('click', () => cnv.parentElement.querySelector('.w-open')?.click());
  });
  bindOpenButtons(grid);
}

function summarize(w) {
  const chips = [];
  const on = (label, ok) => chips.push(`<span class="chip ${ok ? 'on' : ''}">${label}</span>`);
  on('케이스', w.caseTab && w.caseTab.assembled);
  const leds = (w.circuit && w.circuit.leds || []).length;
  on(leds ? `LED ${leds}` : 'LED', leds > 0);
  on('점등', w.circuit && w.circuit.tested);
  on('도안', w.design && ((w.design.letters || []).some(l => l.text) || (w.design.drawing && w.design.drawing.strokes.length)));
  on('조립순서', (w.order || []).length === 9);
  return chips.join('');
}

export const TAB_NAMES = { case: '케이스', circuit: '회로', design: '도안', order: '조립 순서', preview: '미리보기' };

function thumbLetters(ctx, w, s, alpha) {
  const D = w.design || {};
  ctx.fillStyle = `rgba(255,252,235,${alpha})`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  (D.letters || []).forEach(l => {
    if (!l.text) return;
    ctx.font = `600 ${(l.size || 6) * s}px "Noto Sans KR","Malgun Gothic",sans-serif`;
    ctx.fillText(l.text, l.x * s, l.y * s);
  });
  ctx.strokeStyle = `rgba(255,252,235,${alpha})`; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ((D.drawing || {}).strokes || []).forEach(st => {
    ctx.lineWidth = (st.w || 0.8) * s;
    ctx.beginPath();
    st.pts.forEach((p, i) => i ? ctx.lineTo(p.x * s, p.y * s) : ctx.moveTo(p.x * s, p.y * s));
    ctx.stroke();
  });
}
function thumbCircuit(ctx, M, s, scale, ox, oy) {
  ctx.strokeStyle = 'rgba(130,140,155,0.9)'; ctx.lineWidth = 2;
  (M.tapes || []).forEach(t => {
    ctx.beginPath();
    t.pts.forEach((p, i) => i
      ? ctx.lineTo(ox + p.x * scale * s, oy + p.y * scale * s)
      : ctx.moveTo(ox + p.x * scale * s, oy + p.y * scale * s));
    ctx.stroke();
  });
  (M.holders || (M.holder ? [M.holder] : [])).forEach(h => {
    if (h.x === undefined) return;
    ctx.fillStyle = '#3b4552';
    ctx.fillRect(ox + (h.x - 1.7) * scale * s, oy + (h.y - 2.5) * scale * s, 3.4 * scale * s, 5 * scale * s);
  });
  (M.leds || []).forEach(l => {
    const x = ox + l.x * scale * s, y = oy + l.y * scale * s;
    if (M.tested) {
      const g = ctx.createRadialGradient(x, y, 1, x, y, 8);
      g.addColorStop(0, 'rgba(255,225,120,0.95)');
      g.addColorStop(1, 'rgba(255,225,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill();
    }
    ctx.fillStyle = M.tested ? '#f5b942' : '#aab2bd';
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill();
  });
}
export function drawThumb(cnv, w) {
  const ctx = cnv.getContext('2d');
  const s = 6;
  const W = cnv.width = 25 * s, H = cnv.height = 10 * s;
  ctx.fillStyle = '#eef1f6';
  ctx.fillRect(0, 0, W, H);
  if (!w) return;
  const tab = w.activeTab || 'case';
  const num = v => { const x = parseFloat(v); return isFinite(x) && x > 0 ? x : null; };

  if (tab === 'design' || tab === 'preview') {
    ctx.fillStyle = tab === 'preview' ? '#0d0f14' : '#1a1c22';
    ctx.fillRect(0, 0, W, H);
    thumbLetters(ctx, w, s, tab === 'preview' ? 0.95 : 0.85);
    if (tab === 'preview') {
      const C = w.circuit || {};
      if (C.tested) (C.leds || []).forEach(l => {
        const x = Math.max(0, Math.min(W, l.x * s)), y = Math.max(0, Math.min(H, l.y * s));
        const g = ctx.createRadialGradient(x, y, 1, x, y, 14);
        g.addColorStop(0, 'rgba(255,235,150,0.5)');
        g.addColorStop(1, 'rgba(255,235,150,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.fill();
      });
    }
    return;
  }
  if (tab === 'circuit') {
    const lab = (w.circuitMode || 'lab') === 'lab';
    const M = lab ? (w.lab || {}) : (w.circuit || {});
    ctx.fillStyle = lab ? '#fbfcfe' : '#fbf9f2';
    ctx.fillRect(0, 0, W, H);
    const scale = lab ? Math.min(25 / 44, 10 / 21) : 0.85;
    thumbCircuit(ctx, M, s, scale, lab ? 4 : 8, lab ? 4 : 8);
    ctx.fillStyle = '#8a93a2'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(lab ? '회로 실험실' : '플래카드 전개도', 4, H - 4);
    return;
  }
  if (tab === 'order') {
    const n = (w.order || []).length;
    ctx.fillStyle = '#f4f6f9'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = i < n ? '#4a6cf0' : '#d5dbe6';
      ctx.fillRect(8 + i * 15, H / 2 - 5, 11, 10);
    }
    ctx.fillStyle = '#5a6474'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`작업 카드 ${n}/9 배열`, 8, H - 6);
    return;
  }
  const P = (w.caseTab || {}).pieces || {};
  const bw = num(P.back && P.back.w), bh = num(P.back && P.back.h), d = num(P.side && P.side.w);
  ctx.fillStyle = '#f4f6f9'; ctx.fillRect(0, 0, W, H);
  if (!bw || !bh) {
    ctx.fillStyle = '#8a93a2'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('케이스 치수 입력 중', W / 2, H / 2);
    return;
  }
  const sc = Math.min((W - 30) / (bw + (d || 5)), (H - 16) / (bh + (d || 5) * 0.5));
  const fw = bw * sc, fh = bh * sc, dep = (d || 5) * sc * 0.55;
  const x0 = (W - fw - dep) / 2, y0 = (H - fh + dep) / 2;
  ctx.strokeStyle = '#7a8794'; ctx.lineWidth = 1.4; ctx.fillStyle = '#ffffff';
  ctx.fillRect(x0, y0, fw, fh); ctx.strokeRect(x0, y0, fw, fh);
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x0 + dep, y0 - dep);
  ctx.lineTo(x0 + dep + fw, y0 - dep); ctx.lineTo(x0 + fw, y0);
  ctx.moveTo(x0 + dep + fw, y0 - dep); ctx.lineTo(x0 + fw + dep, y0 - dep + fh); ctx.lineTo(x0 + fw, y0 + fh);
  ctx.stroke();
  ctx.fillStyle = '#5a6474'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const f = v => v ? (Math.round(v * 10) / 10) : '?';
  ctx.fillText(`${f(bw)} × ${f(bh)} × ${f((d || 0) + 0.5)}`, 4, H - 4);
}

function activityBadge(updatedAt) {
  const ageMin = (Date.now() - new Date(updatedAt).getTime()) / 60000;
  if (ageMin < 2) return '<span class="live-dot on"></span><span class="small" style="color:#1e8e4e">작업 중</span>';
  if (ageMin < 10) return '<span class="live-dot recent"></span><span class="small muted">방금 전까지</span>';
  return '';
}

function attKey() { return 'lps_att_' + new Date().toISOString().slice(0, 10); }
function getAtt() { try { return JSON.parse(localStorage.getItem(attKey()) || '{}'); } catch (e) { return {}; } }

async function loadBanBoard(ban) {
  const grid = document.querySelector(`.board-grid[data-ban="${ban}"]`);
  if (!grid) return;
  try {
    const rows = await cloudListBan(ban);
    const byNum = {};
    rows.forEach(r => byNum[r.num] = r);
    const att = getAtt();
    const sidOf = num => makeSid(+ban, num);
    const parseList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
    const excluded = new Set(parseList(config.excludedSids));
    let roster, statusOf = {};
    if (rosterActive()) {
      roster = [];
      Object.entries(config.roster).forEach(([sid, st]) => {
        const q = parseSid(sid);
        if (q && q.grade === config.grade && q.ban === +ban) { roster.push(q.num); statusOf[q.num] = st; }
      });
      roster.sort((a, b) => a - b);
    } else {
      const extraNums = parseList(config.extraSids)
        .map(x => parseSid(x))
        .filter(p => p && p.ban === +ban)
        .map(p => p.num);
      roster = [...new Set([...Array.from({ length: config.numCount }, (_, i) => i + 1), ...extraNums])].sort((a, b) => a - b);
    }
    grid.innerHTML = roster.map(num => {
      const st = statusOf[num];
      const blocked = st && BLOCKED_STATUS.some(b => String(st).includes(b));
      if (excluded.has(sidOf(num)) || blocked)
        return `<div class="stu-card off"><div class="stu-head"><b>${num}번</b><span class="att-badge">${esc(st || '전출·제외')}</span></div></div>`;
      const stBadge = st && st !== '재학' ? `<span class="status-badge">${esc(st)}</span>` : '';
      const r = byNum[num];
      const a = att[`${ban}-${num}`];
      const attHtml = a ? `<div class="att-badge">${esc(a)}</div>` : '';
      if (!r) return `
        <div class="stu-card off">
          <div class="stu-head"><b>${num}번</b>${stBadge}<span class="muted small">미접속</span></div>
          ${attHtml}
          <div class="stu-btns"><button class="w-att" data-bn="${ban}:${num}">출결</button></div>
        </div>`;
      const tabBadge = `<span class="tab-badge">${TAB_NAMES[(r.payload || {}).activeTab] || '케이스'}</span>`;
      return `
        <div class="stu-card">
          <div class="stu-head"><b>${num}번</b>${stBadge}${tabBadge}
            ${activityBadge(r.updated_at)}
            <span class="muted small">${new Date(r.updated_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span></div>
          <canvas class="stu-thumb" data-num="${num}" data-open="cloud:${r.id}" title="눌러서 크게 보기"></canvas>
          ${attHtml}
          <div class="stu-chips">${summarize(r.payload || {})}</div>
          <div class="stu-btns">
            <button class="w-open" data-id="cloud:${r.id}">보기</button>
            <button class="w-note" data-bn="${ban}:${num}">메모</button>
            <button class="w-att" data-bn="${ban}:${num}">출결</button>
            <button class="w-del" data-id="cloud:${r.id}">삭제</button>
          </div>
        </div>`;
    }).join('');
    grid.querySelectorAll('.stu-thumb').forEach(cnv => {
      const row = byNum[+cnv.dataset.num];
      try { drawThumb(cnv, row && row.payload); } catch (e) { /* ignore */ }
      cnv.addEventListener('click', () => {
        const btn = cnv.parentElement.querySelector('.w-open');
        if (btn) btn.click();
      });
    });
    bindGridButtons(grid);
  } catch (e) {
    grid.innerHTML = `<p class="warn">불러오기 실패: ${esc(e.message)}</p>`;
  }
}
function bindAttButtons(scope) {
  scope.querySelectorAll('.w-att').forEach(b => b.addEventListener('click', () => {
    const [ban, num] = b.dataset.bn.split(':').map(Number);
    const cur = getAtt()[`${ban}-${num}`] || '';
    const text = prompt(`${ban}반 ${num}번 출결 (예: 결석-무단, 지각, 조퇴-병원 / 지우려면 빈칸)`, cur);
    if (text === null) return;
    const a = getAtt();
    if (text.trim()) a[`${ban}-${num}`] = text.trim();
    else delete a[`${ban}-${num}`];
    localStorage.setItem(attKey(), JSON.stringify(a));
    if (text.trim() && config.sheetUrl) { sheetLogFor(ban, num, '출결', text.trim()); sheetFlushNow(); }
    loadBanBoard(String(ban));
  }));
}
function bindGridButtons(scope) {
  bindOpenButtons(scope);
  bindNoteButtons(scope);
  bindAttButtons(scope);
  bindDelButtons(scope);
}
function bindWorkButtons() {
  const s = $('adm-works');
  bindOpenButtons(s); bindNoteButtons(s); bindDelButtons(s);
}
function bindOpenButtons(scope) {
  scope.querySelectorAll('.w-open').forEach(b => b.addEventListener('click', async () => {
    const kind = b.dataset.id.split(':')[0];
    const id = b.dataset.id.split(':').slice(1).join(':');
    let w = null;
    if (kind === 'local') {
      try { w = JSON.parse(localStorage.getItem('lps_work_' + id)); } catch (e) { /* ignore */ }
    } else {
      b.textContent = '…';
      try { w = await cloudGet(id); } catch (e) { alert('불러오기 실패: ' + e.message); }
      b.textContent = '보기';
    }
    if (!w) { alert('데이터가 없습니다.'); return; }
    openReadOnly(w, id, kind === 'cloud' ? id : null);
  }));
}
function bindNoteButtons(scope) {
  scope.querySelectorAll('.w-note').forEach(b => b.addEventListener('click', () => {
    if (!config.sheetUrl) { alert('먼저 수업 설정에 Google Sheet 기록 URL을 넣어 주세요.'); return; }
    const [ban, num] = b.dataset.bn.split(':').map(Number);
    const text = prompt(`${ban}반 ${num}번 학생에 대한 메모 (시트에 기록됩니다)`);
    if (text && text.trim()) {
      sheetLogFor(ban, num, '교사 메모', text.trim());
      sheetFlushNow();
      alert('기록했습니다.');
    }
  }));
}
function bindDelButtons(scope) {
  scope.querySelectorAll('.w-del').forEach(b => b.addEventListener('click', async () => {
    const kind = b.dataset.id.split(':')[0];
    const id = b.dataset.id.split(':').slice(1).join(':');
    if (!confirm(`${id} 작업을 삭제(초기화)할까요? 되돌릴 수 없습니다.`)) return;
    if (kind === 'local') localStorage.removeItem('lps_work_' + id);
    else {
      try { await cloudDelete(id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
    }
    renderWorks();
  }));
}

const DEFAULT_APPS_SCRIPT = `function doPost(e) {
  var rows = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  rows.forEach(function(r) {
    var grade = r.grade || (r.sid ? String(r.sid).charAt(0) : '');
    var ban = r.ban || '';
    var num = r.num || '';
    var sid = String(r.sid || '');
    var status = r.status || '';

    var timelineTabName = (grade ? grade + '학년 ' : '') + (ban ? ban + '반' : '반별_타임라인');
    var tSh = ss.getSheetByName(timelineTabName) || ss.insertSheet(timelineTabName);
    
    if (tSh.getLastRow() === 0) {
      tSh.appendRow(['시각', '학년', '반', '번호', '학번', '학적', '활동 단계', '학생의 구체적 조작 내용 및 오류/성공 팩트']);
      tSh.getRange('A1:H1').setBackground('#e9eef6').setFontWeight('bold').setHorizontalAlignment('center');
      tSh.setFrozenRows(1);
    }
    tSh.appendRow([new Date(r.ts), grade, ban, num, "'" + sid, status, r.event, r.detail]);

    updateSafeDashboard(ss, grade, ban, num, sid, status, r.event, r.detail, r.ts);
  });

  return ContentService.createTextOutput('ok');
}

function updateSafeDashboard(ss, grade, ban, num, sid, status, event, detail, ts) {
  if (!sid) return;
  var dash = ss.getSheetByName('과세특_실시간관찰') || ss.insertSheet('과세특_실시간관찰', 0);

  if (dash.getLastRow() === 0) {
    dash.appendRow([
      '학년', '반', '번호', '학번', '특이학적',
      '실습 진도율', '총 시도', '케이스', '회로', '도안/조립', 
      '현재 상태', '교사 맞춤 피드백 가이드', 'AI 프롬프트용 과정 요약 팩트', '최근 활동'
    ]);
    dash.getRange('A1:N1').setBackground('#343a40').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
    dash.setFrozenRows(1);
    dash.setColumnWidth(6, 130); 
    dash.setColumnWidth(7, 45);  
    dash.setColumnWidth(11, 130); 
    dash.setColumnWidth(12, 250); 
    dash.setColumnWidth(13, 450); 
  }

  var data = dash.getDataRange().getValues();
  var row = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][3]) === sid) { row = i + 1; break; }
  }

  var displayStatus = (status === '재학' || !status) ? '' : status;

  if (row === -1) {
    dash.appendRow([grade, ban, num, "'" + sid, displayStatus, '[□□□□□] 0%', 0, '미시도', '미시도', '미작업', '진행 중', '입장 완료. 조립을 시작하도록 안내하세요.', '아직 활동 기록이 없습니다.', new Date(ts)]);
    row = dash.getLastRow();
    dash.getRange(row, 1, 1, 10).setHorizontalAlignment('center');
    dash.getRange(row, 12, 1, 2).setHorizontalAlignment('left');
  } else {
    if (displayStatus) {
      dash.getRange(row, 5).setValue(displayStatus);
    }
  }

  var sheetRowRange = dash.getRange(row, 1, 1, 14);
  
  var tries = dash.getRange(row, 7).getValue() || 0;
  if (typeof tries === 'string') tries = parseInt(tries, 10) || 0;

  var caseStat = String(dash.getRange(row, 8).getValue());
  var circStat = String(dash.getRange(row, 9).getValue());
  var designStat = String(dash.getRange(row, 10).getValue());
  var statusMsg = String(dash.getRange(row, 11).getValue());

  var hadErrorBefore = (statusMsg.indexOf('오류') !== -1 || statusMsg.indexOf('합선') !== -1 || statusMsg.indexOf('오차') !== -1 || statusMsg.indexOf('이탈') !== -1);

  if (event === '설계 일지') {
    tries++;
    if (detail.indexOf('완성') !== -1) {
      if (detail.indexOf('겹침') !== -1 || detail.indexOf('틈') !== -1) {
        caseStat = '치수 오차 수정중';
        statusMsg = '치수 계산 오류 발생 (수정 중)';
      } else {
        caseStat = '통과 완료';
        statusMsg = hadErrorBefore ? '오류 극복 후 케이스 성공' : '케이스 우수 통과';
      }
    } else {
      caseStat = '치수 입력 중';
      statusMsg = '케이스 설계 재조정 중';
    }
  } else if (event.indexOf('점등') !== -1) {
    if (detail.indexOf('합선') !== -1) {
      circStat = '회로 합선!';
      statusMsg = '회로 합선 발생';
    } else if (detail.indexOf('소손') !== -1 || detail.indexOf('과전류') !== -1) {
      circStat = '과전류 발생';
      statusMsg = '저항 누락/전지 직결 오류';
    } else if (detail.indexOf('켜짐') !== -1) {
      circStat = '점등 성공';
      statusMsg = '병렬 회로 점등 성공';
    } else {
      circStat = '배선 시도 중'; 
      statusMsg = '회로 재배치 시도 중';
    }
  } else if (event === '도안 피드백' || event === '도안' || event === '조립') {
    if (detail.indexOf('벗어났') !== -1 || detail.indexOf('초과') !== -1) {
      designStat = '도안 영역 이탈';
      statusMsg = '도안 규격 초과 (수정 중)';
    } else if (detail.indexOf('완료') !== -1 || detail.indexOf('조립') !== -1) {
      designStat = '도안/조립 완료';
      statusMsg = hadErrorBefore ? '시행착오 후 도안·조립 완성' : '도안 조건 및 조립 완벽 충족';
    } else {
      designStat = '도안/조립 진행';
      statusMsg = '도안 배치 및 조립 마감 중';
    }
  }

  var currentScore = 0;
  if (caseStat.indexOf('입력') !== -1) currentScore = 1;
  if (caseStat === '통과 완료' || caseStat === '케이스 통과') currentScore = 2;
  if (circStat.indexOf('시도') !== -1 || circStat.indexOf('수정') !== -1 || circStat.indexOf('합선') !== -1 || circStat.indexOf('과전류') !== -1) currentScore = 3;
  if (circStat === '점등 성공') currentScore = 4;
  if (designStat.indexOf('완료') !== -1 || designStat.indexOf('통과') !== -1) currentScore = 5;

  var oldProgressBar = String(dash.getRange(row, 6).getValue() || '[□□□□□] 0%');
  var oldScore = 0;
  if (oldProgressBar.indexOf('20%') !== -1) oldScore = 1;
  else if (oldProgressBar.indexOf('40%') !== -1) oldScore = 2;
  else if (oldProgressBar.indexOf('60%') !== -1) oldScore = 3;
  else if (oldProgressBar.indexOf('80%') !== -1) oldScore = 4;
  else if (oldProgressBar.indexOf('100%') !== -1) oldScore = 5;

  var finalScore = Math.max(currentScore, oldScore);

  var progressBar = '[' + 
    (finalScore >= 1 ? '■' : '□') + 
    (finalScore >= 2 ? '■' : '□') + 
    (finalScore >= 3 ? '■' : '□') + 
    (finalScore >= 4 ? '■' : '□') + 
    (finalScore >= 5 ? '■' : '□') + '] ' + (finalScore * 20) + '%';

  var feedbackGuide = '정상적으로 다음 단계를 진행 중입니다.';
  if (statusMsg.indexOf('오류') !== -1 || statusMsg.indexOf('합선') !== -1 || statusMsg.indexOf('초과') !== -1) {
    feedbackGuide = '집중 지도 필요: 학생이 현재 오류 지점에서 막혀 있습니다. 조작 화면을 함께 점검해 주세요.';
  } else if (statusMsg.indexOf('완성') !== -1 || statusMsg.indexOf('충족') !== -1 || statusMsg.indexOf('성공') !== -1) {
    feedbackGuide = '칭찬 포인트: 해당 단계를 훌륭히 수행함. 다음 단계로 격려하며 유도';
  }

  dash.getRange(row, 6).setValue(progressBar);
  dash.getRange(row, 7).setValue(tries);
  dash.getRange(row, 8).setValue(caseStat);
  dash.getRange(row, 9).setValue(circStat);
  dash.getRange(row, 10).setValue(designStat);
  dash.getRange(row, 11).setValue(statusMsg);
  dash.getRange(row, 12).setValue(feedbackGuide);
  dash.getRange(row, 14).setValue(new Date(ts));

  if (statusMsg.indexOf('오류') !== -1 || statusMsg.indexOf('합선') !== -1 || statusMsg.indexOf('초과') !== -1) {
    sheetRowRange.setBackground('#fff5f5');
    dash.getRange(row, 11).setFontColor('#c92a2a').setFontWeight('bold'); 
  } else {
    sheetRowRange.setBackground('#ffffff');
    dash.getRange(row, 11).setFontColor('#495057').setFontWeight('normal');
  }

  var aiFact = '[실습 요약] 총 ' + tries + '회 시도. ';
  if (caseStat === '통과 완료') {
    aiFact += '케이스 설계 시 두께를 반영한 입체 규격을 정확히 산출함. ';
  }
  if (circStat === '점등 성공') {
    aiFact += '병렬 회로의 전류 흐름을 이해하고 점등을 성공함. ';
  }
  if (designStat.indexOf('완료') !== -1 || designStat.indexOf('통과') !== -1) {
    aiFact += '도안 작업 영역 조건을 준수하고 최종 조립 마감까지 완성도 있게 수행함. ';
  } else {
    aiFact += '현재 도안 배치 및 조립 마감 과정 진행 중. ';
  }

  dash.getRange(row, 13).setValue(aiFact);
}`;

async function exportCsv() {
  const rows = [['저장 위치', '반', '번호', '학번', '마지막 저장']];
  localWorks().forEach(r => rows.push(['이 기기', r.ban, r.num, `2-${r.ban}-${r.num}`,
    r.updated ? new Date(r.updated).toLocaleString('ko-KR') : '']));
  if (config.supabaseUrl) {
    try {
      (await cloudList()).forEach(r => rows.push(['서버', r.ban, r.num, r.id,
        new Date(r.updated_at).toLocaleString('ko-KR')]));
    } catch (e) { /* ignore */ }
  }
  const csv = '﻿' + rows.map(r => r.join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = '학생작업목록.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderPresets() {
  const sel = $('adm-preset');
  if (!sel) return;
  const names = presetNames();
  const keep = sel.value;
  sel.innerHTML = names.length
    ? names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')
    : '<option value="">(저장된 꾸러미가 없습니다)</option>';
  if (names.includes(keep)) sel.value = keep;
  $('adm-preset-load').disabled = !names.length;
  $('adm-preset-del').disabled = !names.length;
}

let liveTimer = null, worksTimer = null;
let roFollow = true;    // 학생이 보는 탭을 따라간다 — 교사가 탭을 누르면 멈춘다
// 열람 배너는 화면 맨 위에 떠 있다 — 그만큼 본문을 내려서 탭 줄이 가리지 않게 한다
function fitBanner() {
  const bn = $('readonly-banner');
  if (!bn || bn.classList.contains('hidden')) return;
  const h = bn.offsetHeight;
  $('app').style.marginTop = h + 'px';
  $('app').style.height = `calc(100vh - ${h}px)`;
}
window.addEventListener('resize', fitBanner);
let roTabsWired = false;
// 열람 중에는 입력칸을 잠근다 (캔버스·버튼은 각 탭에서 이미 막고 있다)
function lockInputs() {
  document.querySelectorAll('#app input, #app textarea, #app select').forEach(el => { el.disabled = true; });
}
function openReadOnly(w, label, cloudId) {
  setReadOnlyWork(w, label);
  $('admin-modal').classList.add('hidden');
  $('login-modal').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('readonly-banner').classList.remove('hidden');
  $('readonly-banner').innerHTML = `관리자 열람 중 — ${esc(label)}` +
    (cloudId ? ' (실시간 갱신)' : '') + ' · 편집 불가 · 위 탭을 눌러 다른 작업도 보세요' +
    ' <button id="ro-exit" class="small-btn">학생 목록으로</button>';
  fitBanner();
  // PIN을 다시 묻지 않도록 새로고침 없이 관리자 창만 다시 연다
  $('ro-exit').addEventListener('click', () => {
    clearInterval(liveTimer);
    $('readonly-banner').classList.add('hidden');
    $('app').classList.add('hidden');
    $('app').style.marginTop = ''; $('app').style.height = '';
    openAdmin();
  });
  roFollow = true;
  if (!roTabsWired) {
    roTabsWired = true;
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.addEventListener('click', () => { roFollow = false; }));
  }
  $('student-badge').textContent = label;
  document.dispatchEvent(new CustomEvent('work-loaded'));
  switchTab(w && w.activeTab ? w.activeTab : 'case');
  lockInputs();
  window.dispatchEvent(new Event('resize'));
  clearInterval(liveTimer);
  if (cloudId) {
    liveTimer = setInterval(async () => {
      try {
        const w2 = await cloudGet(cloudId);
        if (w2) {
          setReadOnlyWork(w2, label);
          document.dispatchEvent(new CustomEvent('work-loaded'));
          lockInputs();
          const cur = document.querySelector('.tab-btn.active')?.dataset.tab;
          if (roFollow && w2.activeTab && w2.activeTab !== cur) switchTab(w2.activeTab);
        }
      } catch (e) { /* ignore */ }
    }, 4000);
  }
}

export function openAdmin() {
  $('admin-modal').classList.remove('hidden');
  // 이미 PIN을 푼 뒤라면 다시 묻지 않는다 (학생 화면을 여러 번 드나들 수 있게)
  if (unlocked) {
    $('adm-pin-gate').classList.add('hidden');
    $('adm-content').classList.remove('hidden');
    renderWorks(); renderRosterSummary(); renderPresets();
    clearInterval(worksTimer);
    worksTimer = setInterval(() => {
      if (!$('admin-modal').classList.contains('hidden')) renderWorks();
    }, 20000);
    return;
  }
  $('adm-pin-gate').classList.remove('hidden');
  $('adm-content').classList.add('hidden');
  $('adm-pin').value = '';
  $('adm-pin-err').textContent = '';
  $('adm-pin').focus();
}

let wired = false;   // 관리자 창 안의 버튼 연결은 한 번만
export function initAdmin() {
  $('adm-pin-btn').addEventListener('click', async () => {
    if (!(await checkAdminPin($('adm-pin').value))) { $('adm-pin-err').textContent = 'PIN이 다릅니다.'; return; }
    $('adm-pin-gate').classList.add('hidden');
    $('adm-content').classList.remove('hidden');
    renderSettings(); renderEntry(); renderRubric(); renderFaqEditor(); renderMatEditor(); renderOrderTextEditor(); renderMisses(); renderWorks();
    renderRosterSummary(); renderGroups(); renderPresets();
    unlocked = true;
    saveStatus('바꾸면 자동으로 저장됩니다. 학생 기기에 반영하려면 [설정 저장]을 누르세요.');

    // Apps Script 코드 상자 — 열 때마다 잠근다. 고칠 때만 [코드 수정]으로 잠금을 푼다.
    if ($('adm-gas')) {
      $('adm-gas').value = config.customGasScript || DEFAULT_APPS_SCRIPT;
      $('adm-gas').readOnly = true;
      if ($('adm-gas-edit')) $('adm-gas-edit').textContent = '코드 수정하기 (잠김)';
    }

    clearInterval(worksTimer);   // 학생 화면 자동 새로고침 — 열 때마다 다시 건다
    worksTimer = setInterval(() => {
      if (!$('admin-modal').classList.contains('hidden')) renderWorks();
    }, 20000);

    if (wired) return;  // 아래 버튼들은 한 번만 연결한다 (다시 열 때마다 쌓이면 오동작)
    wired = true;

    $('adm-preset-save').addEventListener('click', () => {
      const name = ($('adm-preset-name').value || '').trim();
      if (!name) { alert('꾸러미 이름을 먼저 적어 주세요. 예: 제조 실습용, 영재 심화용'); return; }
      if (presetNames().includes(name) && !confirm(`'${name}' 꾸러미를 지금 설정으로 덮어쓸까요?`)) return;
      collectSettings();
      savePreset(name);
      $('adm-preset-name').value = '';
      renderPresets();
      $('adm-preset').value = name;
      saveStatus(`'${name}' 꾸러미에 지금 수업 설정을 담았습니다.`, 'ok');
    });
    $('adm-preset-load').addEventListener('click', () => {
      const n = $('adm-preset').value;
      if (!n) return;
      if (!confirm(`'${n}' 꾸러미의 수업 설정을 지금 설정으로 불러올까요?
입장 코드·시간표·명단·관리자 PIN·서버 연결은 그대로 둡니다.`)) return;
      loadPreset(n);
      renderSettings(); renderRubric(); renderFaqEditor(); renderMatEditor(); renderOrderTextEditor();
      saveStatus(`'${n}' 불러왔습니다 — 학생 기기에 반영하려면 [설정 저장]을 누르세요.`, 'ok');
    });
    $('adm-preset-del').addEventListener('click', () => {
      const n = $('adm-preset').value;
      if (!n || !confirm(`'${n}' 꾸러미를 지울까요? (지금 설정은 그대로입니다)`)) return;
      deletePreset(n);
      renderPresets();
    });
    $('adm-roster-template').addEventListener('click', rosterTemplate);
    $('adm-roster-file').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => importRoster(String(rd.result));
      rd.readAsText(f, 'utf-8');
      e.target.value = '';
    });
    $('adm-roster-clear').addEventListener('click', () => {
      if (!confirm('등록된 명단을 모두 지울까요? (기본 규칙으로 돌아갑니다)')) return;
      config.roster = {}; saveConfig(); renderRosterSummary();
    });
    $('adm-group-add').addEventListener('click', () => {
      const name = $('adm-group-name').value.trim();
      if (!name) return;
      config.groups = config.groups || {};
      if (!config.groups[name]) config.groups[name] = [];
      $('adm-group-name').value = '';
      saveConfig(); renderGroups();
    });
    // 어느 탭에서든 입력이 바뀌면 그 자리에서 이 기기에 저장된다 (탭 이동·닫기로 날아가지 않게)
    $('adm-content').addEventListener('change', e => {
      if (e.target.type === 'file' || e.target.id === 'adm-code' || e.target.id === 'adm-pin') return;
      saveAll(false);
    });

    document.querySelectorAll('#adm-tabs button').forEach(b =>
      b.addEventListener('click', () => {
        saveAll(false);                       // 탭을 옮기기 전에 지금 탭 내용을 저장
        if (b.dataset.at === 'entry') renderEntry();   // 시간표·코드를 최신 설정으로 다시 계산
        document.querySelectorAll('#adm-tabs button').forEach(x => x.classList.toggle('active', x === b));
        document.querySelectorAll('.adm-panel').forEach(p => p.classList.toggle('active', p.id === 'ap-' + b.dataset.at));
      }));
  });
  $('adm-pin').addEventListener('keydown', e => { if (e.key === 'Enter') $('adm-pin-btn').click(); });

  $('adm-save').addEventListener('click', () => saveAll(true));
  if ($('adm-gas-edit')) $('adm-gas-edit').addEventListener('click', () => {
    const box = $('adm-gas');
    if (box.readOnly) {
      if (!confirm('Apps Script 코드를 수정할 수 있게 잠금을 풀까요? 시트 연동이 잘 되고 있다면 그대로 두세요.')) return;
      box.readOnly = false;
      $('adm-gas-edit').textContent = '수정 끝 — 다시 잠그기';
      box.focus();
    } else {
      box.readOnly = true;
      $('adm-gas-edit').textContent = '코드 수정하기 (잠김)';
      saveAll(false);
    }
  });
  $('adm-gas-copy').addEventListener('click', () => {
    const currentScript = $('adm-gas').value || DEFAULT_APPS_SCRIPT;
    $('adm-gas').select();
    if (navigator.clipboard) navigator.clipboard.writeText(currentScript).catch(() => {});
    alert('복사했습니다. 새 구글 시트 → 확장 프로그램 → Apps Script에 붙여넣고, 웹 앱으로 배포(액세스: 모든 사용자)한 뒤 그 URL을 수업 설정의 [Google Sheet 기록 URL]에 넣으세요.');
  });
  $('adm-rubric-add').addEventListener('click', () => {
    collectRubric();
    config.rubric.push({ name: '', note: '', levels: [{ d: '', p: 0 }] });
    renderRubric();
  });
  $('adm-faq-add').addEventListener('click', () => {
    collectFaq();
    config.faq.push({ q: '', k: '', a: '', tab: 'all' });
    renderFaqEditor();
  });
  $('adm-mat-add').addEventListener('click', () => {
    collectMats();
    (config.materials = config.materials || []).push({ n: '', c: '#e8edf4', f: [], t: '' });
    renderMatEditor();
  });
  $('adm-export').addEventListener('click', () => {
    collectSettings(); collectRubric(); collectFaq(); collectMats(); collectOrderTexts();
    $('adm-code').value = exportConfigCode();
    $('adm-code').select();
    if (navigator.clipboard) navigator.clipboard.writeText($('adm-code').value).catch(() => {});
  });
  $('adm-cfg-file').addEventListener('click', () => {
    collectSettings(); collectRubric(); collectFaq(); collectMats(); collectOrderTexts();
    saveConfig();
    const pub = { ...config };
    delete pub.adminPin;
    delete pub.adminPinHash;   // 공개 파일에는 PIN 지문도 담지 않는다
    delete pub.codeSalt;
    downloadText('class-config.json', JSON.stringify(pub, null, 2));
  });
  $('adm-import').addEventListener('click', () => {
    try {
      importConfigCode($('adm-code').value);
      alert('설정을 불러왔습니다.');
      renderSettings(); renderRubric(); renderFaqEditor(); renderMatEditor(); renderOrderTextEditor();
    } catch (e) { alert('설정 코드가 올바르지 않습니다.'); }
  });
  $('adm-miss-clear').addEventListener('click', () => { clearMisses(); renderMisses(); });
  $('adm-close').addEventListener('click', () => {
    saveAll(false);                 // 닫기 전에 이 기기에 저장
    $('admin-modal').classList.add('hidden');
    clearInterval(worksTimer);
    // 학생 자료를 띄운 채로 나가지 않게 — 처음 화면으로 되돌린다
    if (readOnly) location.replace(location.pathname);
  });
  $('adm-works-reload').addEventListener('click', renderWorks);
  $('adm-csv').addEventListener('click', exportCsv);
  $('adm-sheet-test').addEventListener('click', () => {
    collectSettings();
    if (!config.sheetUrl) { alert('수업 설정에 Google Sheet 기록 URL을 먼저 넣고 [설정 저장]을 눌러 주세요.'); return; }
    sheetLogFor(0, 0, '테스트', '관리자 모드에서 보낸 테스트 기록입니다');
    sheetFlushNow();
    alert('테스트 기록을 보냈습니다. 잠시 후 구글 시트에 "0반" 탭이 생겼는지 확인하세요.');
  });
  $('adm-reset-works').addEventListener('click', async () => {
      if (config.resetAt) {
        if (!confirm('접어 둔 이전 작업을 다시 보이게 되돌릴까요?')) return;
        config.resetAt = 0;
      } else {
        if (!confirm('지금부터 새로 시작합니다. 이 시각 이전의 학생 작업은 학생 화면과 실시간 보드에서 빈 상태가 됩니다. 서버 자료는 지우지 않으니 언제든 되돌릴 수 있어요.')) return;
        config.resetAt = Date.now();
      }
      saveConfig();
      renderResetBtn();
      const ok = await cloudPushConfig();
      renderWorks();
      alert(ok
        ? '모든 학생 기기에 적용됩니다. 학생은 새로고침하면 새로 시작합니다.'
        : '이 기기에만 적용됐습니다 — 서버 연결을 확인하고 [설정 저장]을 눌러 주세요.');
    });

  $('adm-wipe-local').addEventListener('click', () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('lps_work_')) keys.push(k);
    }
    if (!keys.length) { alert('이 기기에 저장된 학생 작업이 없습니다.'); return; }
    if (!confirm(`이 기기에 저장된 학생 작업 ${keys.length}건을 모두 지울까요?\n(서버에 저장된 작업은 지워지지 않습니다. 학기 말·기기 정리용)`)) return;
    keys.forEach(k => localStorage.removeItem(k));
    renderWorks();
  });

  const params = new URLSearchParams(location.search);
  if (params.get('admin') === '1') openAdmin();
}
