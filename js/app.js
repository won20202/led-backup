// 앱 진입점: 로그인(반·번호) → 탭 화면
import { config, login, student, onCloudStatus, sheetLog, todayCode,
         sessionCodeValid, studentDayCode, sidInList, parseSid, makeSid, sidLength,
         rosterActive, rosterStatus, BLOCKED_STATUS, work, touch, allowedGrades,
         checkAdminPin, setDemoAccount } from './state.js?v=29';
import { initCase, refreshFromWork } from './case3d.js?v=29';
import { initCircuit, refreshCircuit } from './circuit.js?v=29';
import { initDesign, refreshDesign } from './design.js?v=29';
import { initAssembly, refreshAssembly } from './assembly.js?v=29';
import { initPreview, drawPreview } from './preview.js?v=29';
import { initFaq } from './faq.js?v=29';
import { initAdmin, openAdmin } from './admin.js?v=29';

const $ = id => document.getElementById(id);

// 설정(입장 방식·학번 자리수)이 바뀌면 로그인 화면도 연동되어 4자리/5자리 예시 자동 표시
// 시연 학번을 입력하면 코드 칸이 '관리자 PIN' 칸으로 바뀐다 (입력값은 가려진다)
function isDemoSid(v) { return sidInList(config.demoSids, String(v || '').trim()); }
// 제작자 표시 — 로그인 화면과 작업 화면 머리글에 같은 문구로
// 제작자 표시는 설정이 아니라 코드에 고정한다 — 공유받은 사람이 자기 것처럼 바꾸지 못하게
const MADE_BY = 'won';
function showCredit() {
  const sub = $('login-subtitle');
  if (sub) {
    const t = String(config.subtitle || '').trim();
    sub.textContent = t;
    sub.style.display = t ? '' : 'none';
  }
  const html = `made by <b>${MADE_BY}</b>`;
  ['login-credit', 'header-credit'].forEach(id => { const el = $(id); if (el) el.innerHTML = html; });
}
function refreshCodeField() {
  const demo = isDemoSid($('login-sid').value);
  const box = $('login-code');
  $('login-code-row').style.display = (demo || config.entryMode !== 'none') ? '' : 'none';
  box.type = demo ? 'password' : 'text';
  box.placeholder = demo ? '관리자 PIN' : '입장 코드 (선생님이 알려줌)';
}

function refreshLoginUI() {
  $('login-code-row').style.display = config.entryMode !== 'none' ? '' : 'none';
  // 학번 자리수는 학교 체계 설정을 따른다 (예: 반 2자리 20627, 반 1자리 2527)
  const exampleSid = makeSid(Math.min(6, config.banCount), 27);
  $('login-sid').placeholder = `학번 (예: ${exampleSid})`;
  $('login-sid').maxLength = Math.max(5, sidLength());
}

function setupLogin() {
  refreshLoginUI();
  $('adm-close').addEventListener('click', refreshLoginUI); // 관리자에서 바꾸고 닫으면 즉시 반영

  try {
    const last = localStorage.getItem('lps_last_sid');
    if (last) $('login-sid').value = last;
  } catch (e) { /* ignore */ }

  showCredit();
  $('login-sid').addEventListener('input', refreshCodeField);
  refreshCodeField();
  $('login-admin').addEventListener('click', openAdmin);
  $('header-admin').addEventListener('click', openAdmin);
  ['login-sid', 'login-code'].forEach(id =>
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('login-btn').click(); }));

  $('login-btn').addEventListener('click', async () => {
    const sid = $('login-sid').value.trim();
    const p = parseSid(sid);
    if (!p) {
      $('login-err').textContent = `학번을 확인해 주세요. (4자리 또는 5자리 숫자 입력)`;
      return;
    }
    if (sidInList(config.excludedSids, sid)) {
      $('login-err').textContent = '이 학번은 명단에서 제외되어 있어요. 선생님께 문의하세요.';
      return;
    }
    // 명단(학적)이 등록되어 있으면 그것을 기준으로 검사
    if (rosterActive()) {
      const st = rosterStatus(sid);
      if (st && BLOCKED_STATUS.some(b => String(st).includes(b))) {
        $('login-err').textContent = '이 학번은 지금 명단에서 사용할 수 없어요. 선생님께 문의하세요.';
        return;
      }
    }
    const isExtra = sidInList(config.extraSids, sid) || (rosterActive() && !!rosterStatus(sid));
    const grades = allowedGrades();
    const inBase = grades.includes(p.grade) && p.ban >= 1 && p.ban <= config.banCount && p.num >= 1 && p.num <= config.numCount;
    const entered = $('login-code').value.trim();
    const ban = p.ban, num = p.num;
    // 교사 시연용 학번: 수업 화면을 보여줄 때 쓴다. 코드·시간표·명단을 따지지 않는다.
    const isDemo = sidInList(config.demoSids, sid);
    let codeOk = true, errMsg = '', viaSession = false;
    if (config.entryMode === 'fixed') {
      codeOk = entered === config.classCode;
      errMsg = '반 코드가 다릅니다. 선생님께 확인하세요.';
    } else if (config.entryMode === 'daily') {
      codeOk = entered === todayCode();
      errMsg = '오늘의 입장 코드가 다릅니다. 선생님께 확인하세요.';
    } else if (config.entryMode === 'session') {
      const v = sessionCodeValid(entered, p, sid);
      viaSession = v.ok;
      codeOk = v.ok || entered === studentDayCode(sid);
      errMsg = '지금 시간, 이 수업의 입장 코드가 아닙니다. 학번과 코드를 다시 확인해 보세요.';
    }
    setDemoAccount(isDemo);
    if (isDemo) {
      // 학생이 이 학번을 알아내도 못 들어오게, 관리자 PIN을 확인한다
      codeOk = await checkAdminPin(entered);
      viaSession = codeOk;
      errMsg = '관리자 PIN을 입력해야 합니다.';
    }
    if (!codeOk) { $('login-err').textContent = errMsg; return; }
    // 명단 밖 학생(다른 학년·그룹 수업 등)은 유효한 수업 코드가 있어야 입장
    if (!inBase && !isExtra && !viaSession) {
      $('login-err').textContent = `학번을 다시 확인해 보세요. (기본 명단: ${grades.join(', ')}학년 1~${config.banCount}반, 1~${config.numCount}번)`;
      return;
    }
    localStorage.setItem('lps_last_sid', sid);
    await login(ban, num, p.grade); // 서버 작업을 받아온 뒤 화면을 연다
    sheetLog('접속', '');
    $('student-badge').textContent = `${p.grade}학년 ${ban}반 ${num}번`;
    $('login-modal').classList.add('hidden');
    $('app').classList.remove('hidden');
    document.dispatchEvent(new CustomEvent('work-loaded'));
    const tabs = ['case', 'circuit', 'design', 'order', 'preview'];
    switchTab(tabs.includes(config.startTab) ? config.startTab : 'case');
  });
}

const refreshers = {
  case: refreshFromWork,
  circuit: refreshCircuit,
  design: refreshDesign,
  order: refreshAssembly,
  preview: drawPreview,
};

export function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  window.dispatchEvent(new Event('resize'));
  // 교사 보드가 "지금 보고 있는 탭"을 알 수 있게 기록
  work.activeTab = name;
  touch();
  const fn = refreshers[name];
  if (fn) fn();
}

document.querySelectorAll('.tab-btn').forEach(b =>
  b.addEventListener('click', () => switchTab(b.dataset.tab)));

onCloudStatus(s => {
  const el = $('cloud-dot');
  el.className = 'cloud-dot ' + s;
  el.title = s === 'ok' ? '서버에 저장되고 있습니다'
    : s === 'error' ? '서버 연결 안 됨 — 이 기기에만 저장됩니다'
    : '이 기기에만 저장됩니다';
});

// 개발·수업 중 문제 진단용 (학생 화면에는 영향 없음)
import * as state from './state.js?v=29';
window.__lps = state;

setupLogin();
initCase();
initCircuit();
initDesign();
initAssembly();
initPreview();
initFaq();
initAdmin();

// 선생님이 배포한 수업 설정을 자동으로 받아온다 (학생이 설정 코드를 넣을 필요 없음)
// 1) 저장소의 class-config.json (서버 없이 동작 — Supabase 접속 정보도 여기 실을 수 있다)
// 2) Supabase가 연결돼 있으면 서버의 최신 설정이 그 위를 덮는다
(async () => {
  const fromFile = await state.fileConfigPull();
  const fromCloud = await state.cloudPullConfig();
  if (fromFile || fromCloud) {
    refreshLoginUI(); // 입장 방식·학번 자리수가 바뀌었을 수 있다
    document.dispatchEvent(new CustomEvent('work-loaded')); // 각 탭이 새 설정으로 다시 그림
  }
})();
