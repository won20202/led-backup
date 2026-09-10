// 앱 진입점: 로그인(반·번호) → 탭 화면
import { config, login, student, onCloudStatus, sheetLog, todayCode,
         sessionCodeValid, studentDayCode, sidInList, parseSid, makeSid, sidLength,
         rosterActive, rosterStatus, BLOCKED_STATUS, work, touch, allowedGrades } from './state.js';
import { initCase, refreshFromWork } from './case3d.js';
import { initCircuit, refreshCircuit } from './circuit.js';
import { initDesign, refreshDesign } from './design.js';
import { initAssembly, refreshAssembly } from './assembly.js';
import { initPreview, drawPreview } from './preview.js';
import { initFaq } from './faq.js';
import { initAdmin, openAdmin } from './admin.js';

const $ = id => document.getElementById(id);

// 설정(입장 방식·학번 자리수)에 따른 UI 자동 연동
function refreshLoginUI() {
  $('login-code-row').style.display = config.entryMode !== 'none' ? '' : 'none';
  const exampleSid = makeSid(Math.min(2, config.banCount), 4);
  $('login-sid').placeholder = `학번 (예: ${exampleSid})`;
  $('login-sid').maxLength = Math.max(5, sidLength());
}

function setupLogin() {
  refreshLoginUI();
  $('adm-close').addEventListener('click', refreshLoginUI);

  try {
    const last = localStorage.getItem('lps_last_sid');
    if (last) $('login-sid').value = last;
  } catch (e) { /* ignore */ }

  $('login-admin').addEventListener('click', openAdmin);
  $('header-admin').addEventListener('click', openAdmin);
  ['login-sid', 'login-code'].forEach(id =>
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('login-btn').click(); }));

  $('login-btn').addEventListener('click', async () => {
    const sid = $('login-sid').value.trim();
    const p = parseSid(sid);
    if (!p) {
      $('login-err').textContent = '학번을 확인해 주세요. (예: 2204 또는 20204)';
      return;
    }
    if (sidInList(config.excludedSids, sid)) {
      $('login-err').textContent = '이 학번은 명단에서 제외되어 있어요. 선생님께 문의하세요.';
      return;
    }
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
    let codeOk = true, errMsg = '', viaSession = false;
    if (config.entryMode === 'fixed') {
      codeOk = entered === config.classCode;
      errMsg = '입장 코드가 다릅니다. 선생님께 확인하세요.';
    } else if (config.entryMode === 'daily') {
      codeOk = entered === todayCode();
      errMsg = '오늘의 입장 코드가 다릅니다. 선생님께 확인하세요.';
    } else if (config.entryMode === 'session') {
      const v = sessionCodeValid(entered, p, sid);
      viaSession = v.ok;
      codeOk = v.ok || entered === studentDayCode(sid);
      errMsg = '지금 시간, 이 수업의 입장 코드가 아닙니다. 학번과 코드를 다시 확인해 보세요.';
    }
    if (!codeOk) { $('login-err').textContent = errMsg; return; }
    if (!inBase && !isExtra && !viaSession) {
      $('login-err').textContent = `학번을 다시 확인해 보세요. (허용 학년: ${grades.join(', ')}학년, 1~${config.banCount}반, 1~${config.numCount}번)`;
      return;
    }
    localStorage.setItem('lps_last_sid', sid);
    await login(ban, num, p.grade);
    sheetLog('접속', '');
    $('student-badge').textContent = `${p.grade}학년 ${ban}반 ${num}번`;
    $('login-modal').classList.add('hidden');
    $('app').classList.remove('hidden');
    document.dispatchEvent(new CustomEvent('work-loaded'));
    switchTab('case');
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

import * as state from './state.js';
window.__lps = state;

setupLogin();
initCase();
initCircuit();
initDesign();
initAssembly();
initPreview();
initFaq();
initAdmin();

(async () => {
  const fromFile = await state.fileConfigPull();
  const fromCloud = await state.cloudPullConfig();
  if (fromFile || fromCloud) {
    refreshLoginUI();
    document.dispatchEvent(new CustomEvent('work-loaded'));
  }
})();
