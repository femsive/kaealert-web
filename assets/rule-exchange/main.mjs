import { ACTIONS, ExchangeError, MAX_CONDITIONS, parseExchange, serializeRule, testRule } from './exchange.mjs';
import { bindCopy } from './copy.mjs';
import { MAX_INTERVALS, serializeSelection, WEEKDAYS } from './schedule-exchange.mjs';

const byId = id => document.getElementById(id);
const ruleForm = byId('rule-form');
const trialForm = byId('trial-form');
const conditions = byId('conditions');
const output = byId('output');
const copy = byId('copy');
const ruleMode = byId('create-rule');
const scheduleMode = byId('create-schedule');
const scheduleType = byId('schedule-type');
const conditionReaders = new Map();
let revision = 0;

function show(id, message = '', tone = '') {
  const status = byId(id);
  status.textContent = message;
  status.dataset.tone = tone;
}

function showError(id, error) {
  const labels = {
    JSON_SYNTAX: 'JSON 구문 오류',
    REGEX_SYNTAX: '정규식 구문 오류',
    REGEX_UNSUPPORTED: '미지원 정규식 문법',
  };
  const location = error.path === '$' ? '' : error.path + ' · ';
  show(id, location + (labels[error.code] ? labels[error.code] + ' · ' : '') + error.message, 'error');
}

function invalidate() {
  revision++;
  output.value = '';
  copy.disabled = true;
  show('copy-status');
  show('compatibility-status');
  show('form-status');
  show('trial-status');
}

function updateScope(resetSample = false) {
  const byPackage = byId('rule-scope').value === 'app';
  byId('package-field').hidden = !byPackage;
  byId('sample-package-field').hidden = !byPackage;
  if (resetSample) byId('sample-package').value = byId('rule-package').value;
}

function updateConditionControls() {
  const rows = [...conditions.children];
  byId('condition-count').textContent = rows.length + ' / ' + MAX_CONDITIONS;
  byId('add-condition').disabled = rows.length >= MAX_CONDITIONS;
  rows.forEach((row, index) => {
    row.querySelector('legend').textContent = '조건 ' + (index + 1);
    const remove = row.querySelector('[data-remove]');
    remove.disabled = rows.length === 1;
    remove.setAttribute('aria-label', '조건 ' + (index + 1) + ' 삭제');
  });
}

function addCondition(data = { field: 'BODY', op: 'CONTAINS', value: '' }) {
  const row = byId('condition-template').content.firstElementChild.cloneNode(true);
  const field = row.querySelector('[data-field]');
  const op = row.querySelector('[data-op]');
  const value = row.querySelector('[data-value]');
  field.value = data.field;
  op.value = data.op;

  // A textarea normalizes CR and CRLF. Display those imported values as JSON strings
  // so users can edit and round-trip them without changing their matching semantics.
  const escaped = data.value.includes('\r');
  value.value = escaped ? JSON.stringify(data.value) : data.value;
  row.querySelector('[data-value-note]').hidden = !escaped;

  function updateOperator() {
    op.querySelector('[value=NOT_CONTAINS]').disabled = field.value === 'TITLE_OR_BODY';
  }
  updateOperator();
  field.addEventListener('change', () => {
    updateOperator();
    if (op.selectedOptions[0]?.disabled) op.value = 'CONTAINS';
  });
  const read = () => ({
    field: field.value,
    op: op.value,
    value: escaped ? readJsonString(value.value, 'rule.conditions[' + [...conditions.children].indexOf(row) + '].value') : value.value,
  });
  conditionReaders.set(row, read);
  row.querySelector('[data-remove]').addEventListener('click', () => {
    const focusTo = row.nextElementSibling ?? row.previousElementSibling;
    conditionReaders.delete(row);
    row.remove();
    updateConditionControls();
    invalidate();
    focusTo?.querySelector('[data-field]').focus();
  });
  conditions.append(row);
  updateConditionControls();
  return field;
}

function readRule() {
  return {
    name: byId('rule-name').value,
    sourcePackage: byId('rule-scope').value === 'app' ? byId('rule-package').value : null,
    enabled: byId('rule-enabled').checked,
    action: byId('rule-action').value,
    match: byId('rule-match').value,
    conditions: [...conditionReaders.values()].map(read => read()),
  };
}

function applyRule(rule) {
  byId('rule-name').value = rule.name;
  byId('rule-scope').value = rule.sourcePackage === null ? 'common' : 'app';
  byId('rule-package').value = rule.sourcePackage ?? '';
  byId('rule-enabled').checked = rule.enabled;
  byId('rule-action').value = rule.action;
  byId('rule-match').value = rule.match;
  conditions.replaceChildren();
  conditionReaders.clear();
  rule.conditions.forEach(addCondition);
  updateScope(true);
  invalidate();
}

function renderJson(text) {
  output.value = text;
  copy.disabled = false;
  show('copy-status');
  const schedule = JSON.parse(text).schedule;
  const compatibility = schedule
    ? 'JSON v2 · Google Play 비공개 테스트 깨알 Alpha 0.1.3 (6)에서 지원합니다. 앱에서 저장할 때 규칙과 일정 한도를 확인합니다.'
    : 'JSON v1 · 깨알 Alpha 0.1.2 (5)부터 규칙 가져오기를 지원합니다. 앱에서 저장 한도를 확인합니다.';
  show('compatibility-status', compatibility + (schedule?.recurrence ? ' 반복 일정 추가에는 Pro가 필요합니다.' : ''));
}

function syncModes() {
  byId('rule-editor').hidden = !ruleMode.checked;
  byId('trial-editor').hidden = !ruleMode.checked;
  byId('schedule-editor').hidden = !scheduleMode.checked;
  const noneSelected = !ruleMode.checked && !scheduleMode.checked;
  byId('generate-json').disabled = noneSelected;
  if (noneSelected) show('form-status', '규칙 또는 일정을 선택하세요.');
}

function syncScheduleType() {
  const type = scheduleType.value;
  byId('explicit-fields').hidden = type !== 'EXPLICIT';
  byId('recurrence-fields').hidden = type === 'EXPLICIT';
  byId('recurrence-dates').hidden = type === 'SPECIFIC_DATES';
  byId('weekday-fields').hidden = type !== 'WEEKLY_SELECTED_DAYS';
  byId('interval-days-field').hidden = type !== 'EVERY_N_DAYS';
  byId('monthly-days-field').hidden = type !== 'MONTHLY_DAYS';
  byId('specific-dates-field').hidden = type !== 'SPECIFIC_DATES';
}

function addInterval() {
  const list = byId('schedule-intervals');
  const row = byId('interval-template').content.firstElementChild.cloneNode(true);
  const update = () => {
    byId('add-interval').disabled = list.children.length >= MAX_INTERVALS;
    for (const [index, item] of [...list.children].entries()) {
      item.querySelector('legend').textContent = '시간 구간 ' + (index + 1);
      item.querySelector('[data-remove]').disabled = list.children.length === 1;
    }
  };
  row.querySelector('[data-remove]').addEventListener('click', () => {
    row.remove();
    update();
    invalidate();
    byId('add-interval').focus();
  });
  list.append(row);
  update();
  return row.querySelector('[data-start]');
}

function listInput(id) {
  return byId(id).value.trim().split(/[\s,]+/u).filter(Boolean);
}

function integerInput(value) {
  return /^[0-9]+$/u.test(value) ? Number(value) : null;
}

function readSchedule() {
  const type = scheduleType.value;
  const schedule = {
    name: byId('schedule-name').value,
    zoneId: byId('schedule-zone').value,
    enabled: byId('schedule-enabled').checked,
    mode: type === 'EXPLICIT' ? 'EXPLICIT' : 'RECURRING',
  };
  if (type === 'EXPLICIT') {
    schedule.intervals = [...byId('schedule-intervals').children].map(row => ({
      start: row.querySelector('[data-start]').value,
      end: row.querySelector('[data-end]').value,
    }));
    return schedule;
  }
  const recurrence = {
    type,
    startDate: byId('recurrence-start-date').value,
    endDate: byId('recurrence-end-date').value || null,
    startTime: byId('recurrence-start-time').value,
    endTime: byId('recurrence-end-time').value,
    crossesMidnight: byId('crosses-midnight').checked,
  };
  if (type === 'WEEKLY_SELECTED_DAYS') {
    recurrence.weekdays = [...byId('weekdays').querySelectorAll('input:checked')].map(input => input.value);
  } else if (type === 'EVERY_N_DAYS') {
    recurrence.intervalDays = integerInput(byId('interval-days').value);
  } else if (type === 'MONTHLY_DAYS') {
    recurrence.selectedDays = listInput('monthly-days').map(integerInput);
  } else if (type === 'SPECIFIC_DATES') {
    recurrence.selectedDates = listInput('specific-dates').sort();
    recurrence.startDate = recurrence.selectedDates[0] ?? '';
    recurrence.endDate = null;
  }
  schedule.recurrence = recurrence;
  return schedule;
}

function readJsonString(value, path) {
  let decoded;
  try { decoded = JSON.parse(value); } catch { /* handled below */ }
  if (typeof decoded !== 'string') throw new ExchangeError('TYPE', path, '큰따옴표로 감싼 JSON 문자열을 입력하세요.');
  return decoded;
}

byId('add-condition').addEventListener('click', () => {
  if (conditions.children.length >= MAX_CONDITIONS) return;
  addCondition().focus();
  invalidate();
});
ruleForm.addEventListener('input', event => {
  if (event.target.id === 'rule-scope' || event.target.id === 'rule-package') updateScope(true);
  invalidate();
  if (event.target === scheduleType) syncScheduleType();
  syncModes();
});
ruleForm.addEventListener('submit', event => {
  event.preventDefault();
  try {
    renderJson(serializeSelection({
      rule: ruleMode.checked ? readRule() : null,
      schedule: scheduleMode.checked ? readSchedule() : null,
    }));
    show('form-status', 'JSON을 만들었습니다.', 'ok');
  } catch (error) {
    if (!(error instanceof ExchangeError)) throw error;
    invalidate();
    showError('form-status', error);
  }
});

byId('load').addEventListener('click', () => {
  try {
    const rule = parseExchange(byId('json-input').value);
    const text = serializeRule(rule);
    applyRule(rule);
    ruleMode.checked = true;
    scheduleMode.checked = false;
    syncModes();
    renderJson(text);
    show('load-status', '검사한 규칙을 폼에 불러왔습니다.', 'ok');
  } catch (error) {
    if (!(error instanceof ExchangeError)) throw error;
    showError('load-status', error);
  }
});
byId('json-input').addEventListener('input', () => show('load-status'));

function sampleValue(field) {
  if (byId(field + '-missing').checked) return null;
  const value = byId('sample-' + field).value;
  return byId('sample-escaped').checked ? readJsonString(value, 'sample.' + field) : value;
}

trialForm.addEventListener('input', () => {
  for (const field of ['title', 'body']) byId('sample-' + field).disabled = byId(field + '-missing').checked;
  show('trial-status');
});
trialForm.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const result = testRule(readRule(), {
      title: sampleValue('title'), body: sampleValue('body'), sourcePackage: byId('sample-package').value,
    });
    if (result.status === 'outside-scope') {
      show('trial-status', '시험 패키지가 규칙의 대상과 다릅니다.');
      return;
    }
    const labels = result.results.map((matched, index) => '조건 ' + (index + 1) + ' ' + (matched ? '일치' : '미일치'));
    const outcome = result.status === 'matched' ? '일치 · ' + ACTIONS[result.action] : '미일치';
    show('trial-status', outcome + ' (' + labels.join(', ') + ')', result.status === 'matched' ? 'ok' : '');
  } catch (error) {
    if (!(error instanceof ExchangeError)) throw error;
    showError('trial-status', error);
  }
});

bindCopy(copy, output, copied => {
  if (copied) show('copy-status', 'JSON 전체를 복사했습니다.', 'ok');
  else show('copy-status', '자동 복사에 실패했습니다. 선택된 JSON을 직접 복사하세요.', 'error');
}, { version: () => revision });

addCondition();
updateScope();
byId('creation-modes').hidden = false;
const labels = ['월', '화', '수', '목', '금', '토', '일'];
WEEKDAYS.forEach((day, index) => {
  const label = document.createElement('label');
  label.className = 'check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = day;
  label.append(input, labels[index]);
  byId('weekdays').append(label);
});
for (const zone of new Set(['UTC', 'Asia/Seoul', ...(Intl.supportedValuesOf?.('timeZone') ?? [])])) {
  const option = document.createElement('option');
  option.value = zone;
  byId('schedule-zones').append(option);
}
addInterval();
byId('add-interval').addEventListener('click', () => {
  addInterval().focus();
  invalidate();
});
syncModes();
