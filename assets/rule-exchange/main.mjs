import { ACTIONS, ExchangeError, MAX_CONDITIONS, parseExchange, serializeRule, testRule } from './exchange.mjs';
import { bindCopy } from './copy.mjs';

const byId = id => document.getElementById(id);
const ruleForm = byId('rule-form');
const trialForm = byId('trial-form');
const conditions = byId('conditions');
const output = byId('output');
const copy = byId('copy');
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
});
ruleForm.addEventListener('submit', event => {
  event.preventDefault();
  try {
    renderJson(serializeRule(readRule()));
    show('form-status', '유효한 v1 JSON을 만들었습니다.', 'ok');
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
  if (copied) show('copy-status', '규칙 JSON 전체를 복사했습니다.', 'ok');
  else show('copy-status', '자동 복사에 실패했습니다. 선택된 JSON을 직접 복사하세요.', 'error');
}, { version: () => revision });

addCondition();
updateScope();
