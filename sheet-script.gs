/**
 * LED 플래카드 — 실시간 관찰 시트 (개선판 2026-09-21)
 *
 * 고친 것
 *  1) '미시도'가 '시도'로 잡혀 아무것도 안 한 학생까지 진도율 60%로 보이던 오류
 *  2) '오류 극복 후 성공'처럼 잘한 학생이 빨간 경고로 뜨던 오류
 *  3) 회로 기록('회로 — LED 8개 중 3개 켜짐')이 케이스 단계로 집계되던 오류
 *  4) 학번이 아닌 기록(수업 기록·시트 테스트)이 학생처럼 쌓이던 문제
 *
 * 진도는 '순서'가 아니라 '체크리스트' — 도안부터 하든 케이스부터 하든
 * 한 항목씩 채워진다. 앱이 '진도' 신호로 지금 상태를 보내 주므로,
 * 학생이 작업을 지우면 그 항목도 함께 내려간다 (모든 학생에게 같은 기준).
 *
 * 선생님이 직접 체크하는 확인①~④ 칸은 S~V열. 스크립트는 R열까지만 쓰므로
 * 기록이 갱신돼도 체크는 지워지지 않는다.
 *
 * 붙여넣은 뒤: 배포 → 배포 관리 → ✏️ → 버전 "새 버전" → 배포 (URL이 그대로 유지됩니다)
 */

var DASH = '과세특_실시간관찰';
var NEED = '🔴 지금 도움 필요';
var HEAD = ['반', '번호', '학번', '상태', '진도', '남은 것', '최근 활동 · 막힌 곳', '교사가 할 일',
            '도안', '케이스', '회로', '조립',
            '도안 시도', '케이스 시도', '회로 시도', '조립 시도',
            '오류', '활동수', '마지막 활동', '특이학적', '달성항목', '과세특 요약 팩트'];
// 열 번호(1부터). 열을 옮기면 여기만 고치면 된다.
var C = { design: 9, kase: 10, circ: 11, build: 12,
          tDesign: 13, tKase: 14, tCirc: 15, tBuild: 16,
          errs: 17, acts: 18, when: 19, status: 20, done: 21, fact: 22 };
var CHECK_HEAD = ['확인① 전개도·등각투상도', '확인② 도안·회로도', '확인③ 가공·점등', '확인④ 조립·마감'];

// 수업하는 학년과 반 수 — 여기만 고치면 탭 정리가 그에 맞춰 돌아간다
var GRADE = 2, BAN_COUNT = 10;
var MISC = '기타 기록';                       // 학생 기록이 아닌 것(수업 기록·테스트)
var TIMELINE_HEAD = ['시각', '학년', '반', '번호', '학번', '학적', '활동 단계',
                     '학생의 구체적 조작 내용 및 오류/성공 팩트'];
function banTabName(ban) { return GRADE + '학년 ' + Number(ban) + '반'; }

// 진도 체크리스트 — 수업 순서(도안 먼저)대로 적되, 순서는 강제하지 않는다
var ITEMS = ['도안 작업', '도안 조건 충족', '케이스 치수 입력', '케이스 통과',
             '회로 연습', '켜기 전 예측', '전 LED 점등', '홀더 위치'];

function onOpen() {
  buildMenu();
  try { autoTidyOnce(); } catch (e) { /* 실패해도 메뉴는 그대로 쓸 수 있다 */ }
}

// 탭이 어질러져 있으면 한 번만 스스로 정리한다 (이미 정돈돼 있으면 아무것도 하지 않는다)
function autoTidyOnce() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var messy = false;
  ss.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (/타임라인$/.test(n)) messy = true;                       // 잘못 생긴 탭
    if (/^\d+학년 \d+반$/.test(n) && n.indexOf(GRADE + '학년 ') !== 0) messy = true;
  });
  if (!ss.getSheetByName(banTabName(1))) messy = true;           // 1반 탭이 아직 없음
  var dash0 = ss.getSheetByName(DASH);                          // 테스트 학번이 아직 남아 있으면
  if (dash0 && dash0.getLastRow() >= 2) {
    dash0.getRange(2, 3, dash0.getLastRow() - 1, 1).getValues().forEach(function (v) {
      if (TEST_SIDS.indexOf(String(v[0]).replace(/^'/, '')) !== -1) messy = true;
    });
  }
  if (messy) tidySheets(true);

  var dash = ss.getSheetByName(DASH);
  if (!dash || dash.getLastRow() < 2) rebuildFromTimeline(true); // 표가 비어 있으면 원본에서 되살린다
}

function buildMenu() {
  SpreadsheetApp.getUi().createMenu('LED 수업')
    .addItem('지금 상태로 백업 사본 만들기', 'makeBackupCopy')
    .addSeparator()
    .addItem('탭 정리 (반 순서대로)', 'tidySheets')
    .addSeparator()
    .addItem('대시보드 다시 만들기 (타임라인에서)', 'rebuildFromTimeline')
    .addSeparator()
    .addItem('오늘 기록만 남기고 이전 것 정리', 'keepTodayOnly')
    .addSeparator()
    .addItem('오늘부터 새로 기록 (전체 초기화)', 'resetRecords')
    .addToUi();
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return ContentService.createTextOutput('busy'); }
  try {
    var rows = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dash = getDash(ss);
    var table = dash.getDataRange().getValues();   // 시트를 한 번만 읽는다
    var added = false;

    rows.forEach(function (r) {
      if (r.event !== '진도') appendTimeline(ss, r);   // 진도 신호는 타임라인에 쌓지 않는다
      if (isStudent(r) && updateDashboard(dash, table, r)) added = true;
    });
    if (added) sortDash(dash);                     // 정렬은 마지막에 한 번만
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}

/** 학번이 숫자 4~6자리인 진짜 학생 기록만 대시보드에 올린다 */
function isStudent(r) {
  return /^\d{4,6}$/.test(String(r.sid || '')) && Number(r.ban) > 0;
}

/** 반별 타임라인 — 있는 그대로 쌓는 원본 기록 */
function appendTimeline(ss, r) {
  // 학생 기록만 반 탭으로. 수업 기록·테스트는 '기타 기록' 한 곳에 모은다
  // (예전에는 수업명이 학년 자리에 들어가 '2-3학년 반별_타임라인' 같은 탭이 생겼다)
  var sh = timelineSheet(ss, isStudent(r) ? banTabName(r.ban) : MISC);
  sh.appendRow([new Date(r.ts), r.grade || '', r.ban || '', r.num || '',
                "'" + String(r.sid || ''), r.status || '', r.event, r.detail]);
}

function timelineSheet(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(TIMELINE_HEAD);
    sh.getRange(1, 1, 1, TIMELINE_HEAD.length)
      .setBackground('#e9eef6').setFontWeight('bold').setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 135);
    sh.setColumnWidth(8, 520);
  }
  return sh;
}

/** 대시보드 가져오기 — 표 구조가 예전 것이면 보관해 두고 새로 만든다 */
function getDash(ss) {
  var dash = ss.getSheetByName(DASH);
  if (dash) {
    var head = dash.getRange(1, 1, 1, HEAD.length).getValues()[0].join('|');
    if (head !== HEAD.join('|')) {
      var tz = ss.getSpreadsheetTimeZone();
      dash.setName(DASH + '_예전_' + Utilities.formatDate(new Date(), tz, 'MMdd_HHmm'));
      dash = null;                                  // 예전 자료는 그대로 남는다
    }
  }
  if (!dash) {
    dash = ss.insertSheet(DASH, 0);
    dash.appendRow(HEAD.concat(CHECK_HEAD));
    dash.getRange(1, 1, 1, HEAD.length)
        .setBackground('#343a40').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
    dash.getRange(1, HEAD.length + 1, 1, CHECK_HEAD.length)   // 선생님이 체크하는 칸은 다른 색
        .setBackground('#2b6cb0').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
    dash.setFrozenRows(1);
    dash.setFrozenColumns(3);
    [45, 45, 68, 92, 135, 190, 300, 280, 110, 105, 105, 90, 62, 68, 62, 62, 45, 55, 125, 65, 90, 400]
      .forEach(function (w, i) { dash.setColumnWidth(i + 1, w); });
    for (var i = 0; i < CHECK_HEAD.length; i++) dash.setColumnWidth(HEAD.length + 1 + i, 120);
    makeCheckBoxes(dash);
    paintRules(dash);
    makeNeedSheet(ss);
  }
  return dash;
}

/** 확인①~④ 칸은 체크박스로 — 선생님이 클릭만 하면 된다 */
function makeCheckBoxes(dash) {
  dash.getRange(2, HEAD.length + 1, dash.getMaxRows() - 1, CHECK_HEAD.length)
      .insertCheckboxes()
      .setHorizontalAlignment('center');
}

/** 색은 조건부 서식으로 한 번만 걸어 둔다 — 정렬해도 색이 따라간다 */
function paintRules(dash) {
  var body = dash.getRange(2, 1, dash.getMaxRows() - 1, HEAD.length);
  dash.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=REGEXMATCH($D2,"도움 필요")').setBackground('#fff0f0').setRanges([body]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=REGEXMATCH($D2,"완료")').setBackground('#f2fbf4').setRanges([body]).build(),
  ]);
}

/** 도움이 필요한 학생만 자동으로 모이는 탭 (수식이라 저절로 갱신된다) */
function makeNeedSheet(ss) {
  if (ss.getSheetByName(NEED)) return;
  var sh = ss.insertSheet(NEED, 1);
  sh.getRange('A1').setValue('지금 도움이 필요한 학생 — 자동 갱신 (위에서부터 최근 순)')
    .setFontWeight('bold').setFontSize(13);
  sh.getRange('A2').setFormula(
    "=IFERROR(QUERY('" + DASH + "'!A2:V, \"select A,B,C,E,G,H,S where D contains '도움' order by S desc\", 0)," +
    " \"지금 막혀 있는 학생이 없습니다\")");
  sh.setColumnWidths(1, 7, 110);
  sh.setColumnWidth(5, 300);
  sh.setColumnWidth(6, 300);
  sh.setFrozenRows(1);
}

/** 학생 한 명의 상태를 새로 계산해 그 줄만 다시 쓴다. 새 학생이면 true */
function updateDashboard(dash, table, r) {
  var sid = String(r.sid);
  var row = -1, cur = null;
  for (var i = 1; i < table.length; i++) {
    if (String(table[i][2]).replace(/^'/, '') === sid) { row = i + 1; cur = table[i]; break; }
  }
  var isNew = (row === -1);
  if (isNew) cur = ['', '', '', '', '', '', '', '', '미작업', '미시도', '미시도', '미작업',
                    0, 0, 0, 0, 0, 0, '', '', '', ''];

  var design = String(cur[C.design - 1]), kase = String(cur[C.kase - 1]);
  var circ = String(cur[C.circ - 1]), build = String(cur[C.build - 1]);
  var tDesign = Number(cur[C.tDesign - 1]) || 0, tKase = Number(cur[C.tKase - 1]) || 0;
  var tCirc = Number(cur[C.tCirc - 1]) || 0, tBuild = Number(cur[C.tBuild - 1]) || 0;
  var errs = Number(cur[C.errs - 1]) || 0;
  var acts = (Number(cur[C.acts - 1]) || 0) + (String(r.event) === '진도' ? 0 : 1);
  var done = parseDone(cur[C.done - 1]);            // 지금까지 달성한 항목
  var event = String(r.event || ''), detail = String(r.detail || '');
  var note = String(cur[6] || ''), trouble = false, c;

  // ── 어떤 활동인지 정확히 갈라낸다 ──────────────────────────────
  if (event === '진도') {
    // 앱이 계산한 지금 상태를 그대로 받는다 — 학생이 지우면 항목도 함께 내려간다
    done = parseDone(detail === '없음' ? '' : detail);
    if (!note) note = '작업 중';

  } else if (event === '도안 피드백') {
    tDesign++;
    done['도안 작업'] = true;
    if (detail.indexOf('안쪽 조각') === 0 || !detail) {
      design = '조건 충족'; note = '도안 조건을 모두 충족 — ' + detail;
      done['도안 조건 충족'] = true;
    } else {
      design = '수정 필요'; note = detail; trouble = true;
    }
  } else if (event === '도안') {
    tDesign++;
    design = (design === '조건 충족') ? design : '작업 중';
    note = detail; done['도안 작업'] = true;

  } else if (event === '설계 일지' && detail.indexOf('회로') === 0) {
    tCirc++;
    c = readCircuit(detail);                        // '회로 — …' 는 케이스가 아니라 회로다
    circ = c.stat; note = c.note; trouble = c.bad;
    done['회로 연습'] = true;
    if (c.stat === '점등 성공') done['전 LED 점등'] = true;
    if (detail.indexOf('예측') !== -1) done['켜기 전 예측'] = true;

  } else if (event === '설계 일지') {
    tKase++;
    done['케이스 치수 입력'] = true;
    if (detail.indexOf('완성') !== -1) {
      if (detail.indexOf('겹침') !== -1 || detail.indexOf('틈') !== -1) {
        kase = '치수 오차'; note = '조각 치수에 겹침·틈 — ' + detail; trouble = true;
      } else {
        kase = '통과'; note = '케이스 치수 정확히 산출 — ' + detail;
        done['케이스 통과'] = true;
      }
    } else {
      kase = '치수 입력 중'; note = detail;
    }

  } else if (event === '회로 점등') {
    tCirc++;
    c = readCircuit(detail);
    circ = c.stat; note = c.note; trouble = c.bad;
    if (c.stat === '점등 성공') done['전 LED 점등'] = true;
    if (detail.indexOf('예측') !== -1) done['켜기 전 예측'] = true;

  } else if (event === '실험실 점등') {
    tCirc++;
    note = '실험실에서 연습 — ' + detail;
    done['회로 연습'] = true;                        // 연습은 연습으로만 센다

  } else if (event.indexOf('조립') === 0) {
    tBuild++;
    build = '홀더 배치'; note = '조립 — ' + detail;
    done['홀더 위치'] = true;

  } else if (event.indexOf('도움말 검색') === 0) {
    note = '도움말에서 답을 못 찾음: "' + detail + '"'; trouble = true;

  } else if (event === '접속') {
    if (!note) note = '입장함 — 아직 활동 없음';
  } else {
    note = event + (detail ? ' — ' + detail : '');
  }
  if (trouble) errs++;

  // ── 진도: 달성한 항목 수 (순서 무관) ──────────────────────────
  var doneList = ITEMS.filter(function (n) { return done[n]; });
  var left = ITEMS.filter(function (n) { return !done[n]; });
  var bar = '';
  for (var b = 0; b < ITEMS.length; b++) bar += (done[ITEMS[b]] ? '■' : '□');
  var pct = Math.round(doneList.length * 100 / ITEMS.length);
  var progress = bar + ' ' + pct + '% (' + doneList.length + '/' + ITEMS.length + ')';

  // ── 상태와 교사가 할 일 ──────────────────────────────────────
  var state, todo;
  if (!left.length) {
    state = '✅ 완료'; todo = '전 항목 완료. 마감 상태를 함께 점검하고 포트폴리오 제출을 안내하세요.';
  } else if (event === '진도' && String(cur[3]).indexOf('도움') !== -1) {
    // 진도 신호는 '막혀 있음' 표시를 지우지 않는다.
    // 🔴는 학생이 실제로 문제를 해결한 기록(성공한 점등·조건 충족 등)이 올 때 풀린다.
    state = cur[3]; todo = cur[7];
  } else if (trouble) {
    state = '🔴 도움 필요'; todo = troubleTodo(kase, circ, design, note);
  } else if (acts <= 1) {
    state = '⚪ 시작 전'; todo = '아직 조작이 없습니다. 도안 탭에서 글자 배치부터 하도록 안내하세요.';
  } else if (doneList.length >= 6) {
    state = '🟢 순조'; todo = '남은 것: ' + left.join(' · ') + '. 마무리로 유도하세요.';
  } else {
    state = '🟡 진행 중'; todo = '남은 것: ' + left.join(' · ');
  }

  var line = [Number(r.ban) || '', Number(r.num) || '', "'" + sid, state, progress,
              left.join(' · ') || '없음', note, todo,
              design, kase, circ, build,
              tDesign, tKase, tCirc, tBuild,
              errs, acts, new Date(r.ts),
              (!r.status || r.status === '재학') ? (cur[C.status - 1] || '') : r.status,
              doneList.join(','),
              makeFact(kase, circ, design, build, acts, errs, doneList.length, tDesign, tKase, tCirc, tBuild)];

  if (isNew) {
    dash.appendRow(line);
    table.push(line);
    dash.getRange(dash.getLastRow(), 1, 1, 5).setHorizontalAlignment('center');
  } else {
    dash.getRange(row, 1, 1, HEAD.length).setValues([line]);   // 한 번에 쓴다 (확인칸은 안 건드림)
    for (var k = 0; k < line.length; k++) table[row - 1][k] = line[k];
  }
  return isNew;
}

/** '달성항목' 칸(도안 작업,케이스 통과,…)을 다시 읽어 들인다 */
function parseDone(text) {
  var done = {};
  String(text || '').split(',').forEach(function (n) {
    n = n.trim();
    if (n) done[n] = true;
  });
  return done;
}

/** '회로 — LED 8개 중 3개 켜짐, 합선' 같은 문장을 읽는다 */
function readCircuit(detail) {
  var m = detail.match(/LED\s*(\d+)\s*개 중\s*(\d+)\s*개/);
  var total = m ? Number(m[1]) : 0, lit = m ? Number(m[2]) : 0;
  if (detail.indexOf('합선') !== -1)
    return { stat: '합선', note: '합선 — (+)줄과 (−)줄이 닿은 곳이 있음', bad: true };
  if (detail.indexOf('과전류') !== -1 || detail.indexOf('소손') !== -1)
    return { stat: '과전류', note: '과전류·소손 — 전지 직결 또는 저항 누락', bad: true };
  if (detail.indexOf('직렬') !== -1 || detail.indexOf('전압 부족') !== -1)
    return { stat: '일부만 점등', note: '직렬로 이어 어둡거나 소등 — 병렬로 바꿔야 함', bad: true };
  if (total > 0 && lit === total)
    return { stat: '점등 성공', note: 'LED ' + total + '개 전부 점등 성공', bad: false };
  if (lit > 0)
    return { stat: '일부만 점등', note: total + '개 중 ' + lit + '개만 켜짐 — 안 켜진 LED의 극성·접촉 확인', bad: true };
  if (total > 0)
    return { stat: '배선 중', note: '하나도 켜지지 않음 — 극성·테이프 연결 확인 필요', bad: true };
  return { stat: '배선 중', note: '회로 배치 중 — ' + detail, bad: false };
}

function troubleTodo(kase, circ, design, note) {
  if (circ === '합선') return '합선: (+)줄과 (−)줄이 닿은 곳을 스스로 찾게 하세요. "두 줄이 만나는 곳이 어디일까?"';
  if (circ === '과전류') return '과전류: 전지를 바로 잇지 않았는지 확인. "전류를 줄이려면 무엇이 필요할까?"';
  if (circ === '일부만 점등') return '일부만 점등: 안 켜진 LED의 긴 다리가 (+)줄에 붙었는지 함께 확인하세요.';
  if (circ === '배선 중') return '점등 실패: 극성 → 테이프 끊김 → 두 줄 간격 순으로 짚어 주세요.';
  if (design === '수정 필요') return '도안 조건 미충족: 작업 영역·글자 크기·획 굵기 중 무엇이 어긋났는지 함께 보세요. (' + note + ')';
  if (kase === '치수 오차') return '치수 오차: 우드락 두께 0.5cm를 조각 치수에 반영했는지 물어보세요.';
  return '막힌 지점: ' + note;
}

function makeFact(kase, circ, design, build, acts, errs, doneN, tD, tK, tC, tB) {
  var f = '[실습 요약] 달성 ' + doneN + '/' + ITEMS.length +
          ' (도안 ' + (tD || 0) + '회 · 케이스 ' + (tK || 0) + '회 · 회로 ' + (tC || 0) + '회 · 조립 ' + (tB || 0) + '회)' +
          (errs ? ', 오류 ' + errs + '회 경험' : '') + '. ';
  if (design === '조건 충족') f += '도안을 작업 영역·글자 크기·획 굵기 조건에 맞게 완성함. ';
  else if (design === '수정 필요') f += '도안 조건에 맞추어 배치를 수정하는 중. ';
  if (kase === '통과') f += '재료 두께를 반영한 조각 치수를 정확히 산출함. ';
  else if (kase === '치수 오차') f += '조각 치수에서 겹침·틈이 생겨 재계산 중. ';
  if (circ === '점등 성공') f += '병렬 회로의 전류 흐름을 이해하고 전 LED 점등에 성공함. ';
  else if (circ === '합선' || circ === '과전류') f += '합선·과전류를 직접 겪으며 회로 조건을 탐색함. ';
  if (build === '홀더 배치') f += '무게중심을 고려해 건전지 홀더 위치를 정함. ';
  if (errs >= 3 && circ === '점등 성공') f += '반복된 시행착오 끝에 스스로 해결함(문제해결 태도 우수). ';
  return f;
}

function sortDash(dash) {
  var last = dash.getLastRow();
  if (last > 2) {
    dash.getRange(2, 1, last - 1, HEAD.length)
        .sort([{ column: 1, ascending: true }, { column: 2, ascending: true }]);
  }
}

/** 시트 메뉴: 지금 상태로 백업 사본 */
function makeBackupCopy() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = ss.getName() + ' 백업 ' +
    Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
  ss.copy(name);
  SpreadsheetApp.getUi().alert('사본을 만들었습니다.\n\n' + name + '\n\n내 드라이브에서 열 수 있습니다.');
}

/** 시트 메뉴: 오늘부터 새로 기록 */
function resetRecords() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('오늘부터 새로 기록',
      '대시보드와 반별 타임라인을 모두 비웁니다.\n먼저 [지금 상태로 백업 사본 만들기]를 해 두셨나요?',
      ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dash = ss.getSheetByName(DASH);
  if (dash && dash.getLastRow() > 1) dash.deleteRows(2, dash.getLastRow() - 1);
  ss.getSheets().forEach(function (sh) {
    if (/반$/.test(sh.getName()) && sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  });
  ui.alert('초기화했습니다. 이제부터 들어오는 기록만 쌓입니다.');
}


/** 시트 메뉴: 오늘 기록만 남기고 그 이전 것을 정리한다 (오늘 수업 기록은 그대로) */
function keepTodayOnly() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var cut = new Date(Utilities.formatDate(new Date(), tz, 'yyyy/MM/dd') + ' 00:00:00');
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { /* 편집기에서 실행하면 대화상자가 없다 */ }
  if (ui && ui.alert('오늘 기록만 남기기',
        '오늘(' + Utilities.formatDate(cut, tz, 'MM월 dd일') + ') 이전 기록을 모두 지웁니다. 오늘 수업 기록은 그대로 남습니다. 계속할까요?',
        ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  var removed = 0, tabsGone = [];

  // 1) 대시보드: 마지막 활동이 오늘 이전인 학생 줄을 지운다
  var dash = ss.getSheetByName(DASH);
  if (dash && dash.getLastRow() > 1) {
    var last = dash.getRange(2, 1, dash.getLastRow() - 1, HEAD.length).getValues();
    for (var i = last.length - 1; i >= 0; i--) {
      var when = last[i][14];                       // '마지막 활동'
      if (!(when instanceof Date) || when < cut) { dash.deleteRow(i + 2); removed++; }
    }
  }

  // 2) 반별 타임라인: 오늘 이전 행을 지우고, 남는 게 없으면 탭째 정리
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (!/반$/.test(name) || sh.getLastRow() < 2) return;
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      var when = vals[i][0];
      if (!(when instanceof Date) || when < cut) { sh.deleteRow(i + 2); removed++; }
    }
    if (sh.getLastRow() < 2) { ss.deleteSheet(sh); tabsGone.push(name); }
  });

  var msg = '정리했습니다. 지운 줄 ' + removed + '개'
          + (tabsGone.length ? ', 비어서 없앤 탭: ' + tabsGone.join(', ') : '')
          + '. 오늘 수업 기록은 그대로 있습니다.';
  if (ui && !quiet) ui.alert(msg);
  return msg;
}

/**
 * 반별 타임라인에 쌓인 원본 기록을 그대로 다시 읽어 대시보드를 만든다.
 * 표 구조를 바꿨을 때나 실수로 표를 지웠을 때 쓴다. 타임라인이 원본이라 손실이 없다.
 */
function rebuildFromTimeline(quiet) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { /* 편집기 실행 */ }

  var events = [];
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (!/반$/.test(name) || sh.getLastRow() < 2) return;
    sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues().forEach(function (v) {
      if (!(v[0] instanceof Date)) return;
      events.push({ ts: v[0].getTime(), grade: v[1], ban: v[2], num: v[3],
                    sid: String(v[4]).replace(/^'/, ''), status: v[5],
                    event: String(v[6] || ''), detail: String(v[7] || '') });
    });
  });
  if (!events.length) {
    if (ui) ui.alert('반별 타임라인에 기록이 없습니다.');
    return '기록 없음';
  }
  events.sort(function (a, b) { return a.ts - b.ts; });   // 시간 순서대로 다시 재생

  var dash = ss.getSheetByName(DASH);
  if (dash && dash.getLastRow() > 1) dash.deleteRows(2, dash.getLastRow() - 1);
  dash = getDash(ss);
  var table = dash.getDataRange().getValues();
  events.forEach(function (r) { if (isStudent(r)) updateDashboard(dash, table, r); });
  sortDash(dash);

  var msg = '타임라인 ' + events.length + '건을 다시 읽어 대시보드를 만들었습니다. 학생 ' + (dash.getLastRow() - 1) + '명.';
  if (ui && !quiet) ui.alert(msg);
  return msg;
}


/**
 * 시트 탭을 교사가 보기 좋게 정리한다.
 *  - 잘못 만들어진 타임라인 탭(2-3학년 반별_타임라인 등)의 기록을 제자리로 옮긴다
 *  - 2학년 1~10반 탭을 빠짐없이 만들어 둔다
 *  - 탭 순서: 대시보드 → 도움 필요 → 1반~10반 → 기타 기록 → 보관 탭
 *  - 지정한 테스트 학번의 기록은 지운다
 */
var TEST_SIDS = ['29999', '21035', '20630'];   // 기록에서 걷어낼 테스트 학번

function tidySheets(quiet) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { /* 편집기 실행 */ }

  var moved = 0, dropped = 0, killed = [];
  var proper = {};
  for (var b = 1; b <= BAN_COUNT; b++) proper[banTabName(b)] = true;

  // 1) 타임라인 탭을 훑어 기록을 제자리로 옮긴다
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    var isTimeline = /반$/.test(name) || /타임라인$/.test(name) || name === MISC;
    if (!isTimeline || proper[name] || name === MISC) return;      // 제자리 탭은 그대로
    if (sh.getLastRow() >= 2) {
      var rows = sh.getRange(2, 1, sh.getLastRow() - 1, TIMELINE_HEAD.length).getValues();
      var bucket = {};
      rows.forEach(function (v) {
        var sid = String(v[4]).replace(/^'/, '');
        if (TEST_SIDS.indexOf(sid) !== -1) { dropped++; return; }
        var ban = Number(v[2]);
        var key = (/^\d{4,6}$/.test(sid) && ban > 0) ? banTabName(ban) : MISC;
        (bucket[key] = bucket[key] || []).push(v);
      });
      Object.keys(bucket).forEach(function (key) {
        var dest = timelineSheet(ss, key);
        dest.getRange(dest.getLastRow() + 1, 1, bucket[key].length, TIMELINE_HEAD.length)
            .setValues(bucket[key]);
        moved += bucket[key].length;
      });
    }
    ss.deleteSheet(sh);
    killed.push(name);
  });

  // 2) 제자리 탭에서도 테스트 기록을 걷어낸다
  for (var b2 = 1; b2 <= BAN_COUNT; b2++) {
    var sh2 = ss.getSheetByName(banTabName(b2));
    if (!sh2 || sh2.getLastRow() < 2) continue;
    var vals = sh2.getRange(2, 1, sh2.getLastRow() - 1, 5).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      if (TEST_SIDS.indexOf(String(vals[i][4]).replace(/^'/, '')) !== -1) { sh2.deleteRow(i + 2); dropped++; }
    }
  }

  // 3) 1~10반 탭을 빠짐없이 만들고, 시간순으로 정렬해 둔다
  for (var b3 = 1; b3 <= BAN_COUNT; b3++) {
    var sh3 = timelineSheet(ss, banTabName(b3));
    if (sh3.getLastRow() > 2) sh3.getRange(2, 1, sh3.getLastRow() - 1, TIMELINE_HEAD.length).sort(1);
  }
  timelineSheet(ss, MISC);

  // 4) 대시보드에서도 테스트 학생 줄을 지운다
  var dash = ss.getSheetByName(DASH);
  if (dash && dash.getLastRow() >= 2) {
    var d = dash.getRange(2, 3, dash.getLastRow() - 1, 1).getValues();
    for (var j = d.length - 1; j >= 0; j--) {
      if (TEST_SIDS.indexOf(String(d[j][0]).replace(/^'/, '')) !== -1) { dash.deleteRow(j + 2); dropped++; }
    }
  }

  // 5) 탭 순서를 정한다 — 보는 순서대로
  var order = [DASH, NEED];
  for (var b4 = 1; b4 <= BAN_COUNT; b4++) order.push(banTabName(b4));
  order.push(MISC);
  var pos = 1;
  order.forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (!sh) return;
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(pos++);
  });
  ss.setActiveSheet(ss.getSheetByName(DASH));

  var msg = '탭을 정리했습니다. 옮긴 기록 ' + moved + '건, 지운 테스트 기록 ' + dropped + '건'
          + (killed.length ? ', 없앤 탭: ' + killed.join(', ') : '') + '.';
  if (ui) ui.alert(msg);
  return msg;
}
