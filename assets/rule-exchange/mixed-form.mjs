import { localize, t } from './i18n.mjs';
import { decodeExchange, ExchangeError } from './exchange.mjs';
import { BUNDLE_LIMITS, checkFields, parseRuleDocument, serializeBundle } from './mixed-exchange.mjs';

const ko = {
  add: '묶음에 추가했습니다.',
  choose: '규칙 또는 일정을 선택하세요.',
  integer: '범위 안의 정수를 입력하세요.',
  remove: '제거',
  loaded: '형식을 확인했습니다. 앱이 중복, 등록 앱과 저장 한도를 다시 확인합니다.',
  types: { schedules: '일정', rules: '일반 규칙', FIRST_OCCURRENCES: '최초 몇 건 무시', RECEPTION_WAIT: '같은 대상 재알람 대기' },
};

export function bindMixed({ readRule, readSchedule, renderJson, show, showError, invalidate }) {
  const byId = id => document.getElementById(id);
  const bundle = { schedules: [], rules: [], statefulRules: [] };
  const active = () => byId('use-mixed').checked;
  const kind = () => byId('mixed-kind').value;
  const rulesSelected = () => byId('create-rule').checked;

  function sync() {
    const advanced = active() && rulesSelected();
    byId('mixed-controls').hidden = !active();
    byId('mixed-rule-options').hidden = !advanced;
    byId('mixed-flow').disabled = kind() !== 'ordinary';
    byId('mixed-flow-field').hidden = kind() !== 'ordinary';
    byId('mixed-stateful').hidden = kind() === 'ordinary';
    byId('mixed-first').hidden = kind() !== 'FIRST_OCCURRENCES';
    byId('mixed-wait').hidden = kind() !== 'RECEPTION_WAIT';
    byId('rule-enabled').disabled = active();
    byId('schedule-enabled').disabled = active();
    byId('rule-action').disabled = advanced && kind() !== 'ordinary';
    byId('trial-editor').hidden = !rulesSelected() || (advanced && kind() !== 'ordinary');
    for (const input of document.querySelectorAll('[data-key]')) {
      input.querySelector('[data-labeled]').hidden = !['TITLE', 'BODY'].includes(input.querySelector('select').value);
    }
  }

  function list() {
    const ref = byId('mixed-schedule');
    const selected = ref.value;
    const none = new Option('', '');
    localize(none, () => t('일정 없음'));
    ref.replaceChildren(none);
    for (const schedule of bundle.schedules) ref.add(new Option(schedule.name, schedule.ref));
    if (bundle.schedules.some(s => s.ref === selected)) ref.value = selected;
    const list = byId('mixed-list');
    list.replaceChildren();
    for (const [field, items] of Object.entries(bundle)) {
      items.forEach((item, index) => {
        const row = document.createElement('li');
        const label = () => t(ko.types[item.type ?? field]) + ' · ' + item.name;
        const title = document.createElement('span');
        localize(title, label);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'secondary';
        localize(remove, () => t(ko.remove));
        localize(remove, () => t('{name} 제거', { name: label() }), 'aria-label');
        remove.disabled = field === 'schedules' && [...bundle.rules, ...bundle.statefulRules]
          .some(rule => rule.scheduleRef === item.ref);
        remove.addEventListener('click', () => {
          items.splice(index, 1);
          listAndInvalidate();
          byId('mixed-add').focus();
        });
        row.append(title, ' ', remove);
        list.append(row);
      });
    }
  }

  function listAndInvalidate() {
    list();
    invalidate();
  }

  function readKey(id) {
    const box = byId(id);
    const [field, token] = box.querySelectorAll('select');
    if (!field.value) return undefined;
    return { field: field.value, prefix: box.querySelector('input').value, token: token.value };
  }

  function fragment(id) {
    const text = byId(id).value;
    if (new TextEncoder().encode(text).length > 65536) throw new ExchangeError('SIZE', id, '추출 필드를 확인하세요.');
    const parsed = decodeExchange('{"formatVersion":4,"value":' + text + '}', 8);
    if (!parsed.unsignedIntegerTokensOnly) throw new ExchangeError('VALUE', id, ko.integer);
    return parsed.document.value;
  }
  function serialize(items) {
    return serializeBundle(byId('use-v4').checked ? { ...items, fields: fragment('v4-fields') } : items);
  }

  function append() {
    const next = Object.fromEntries(Object.entries(bundle).map(([key, values]) => [key, values.slice()]));
    const addSchedule = byId('create-schedule').checked;
    if (!addSchedule && !rulesSelected()) throw new ExchangeError('VALUE', '', ko.choose);
    let scheduleRef = byId('mixed-schedule').value;
    if (addSchedule) {
      const ref = Array.from({ length: BUNDLE_LIMITS.schedules }, (_, i) => 's' + (i + 1))
        .find(candidate => !next.schedules.some(s => s.ref === candidate));
      next.schedules.push({ ...readSchedule(), ref, enabled: false });
      scheduleRef = ref;
    }
    if (rulesSelected()) {
      const { action, name, sourcePackage, conditions, match } = readRule();
      const base = { name, sourcePackage, conditions, match, enabled: false };
      const advanced = byId('use-v4').checked;
      if (advanced && byId('v4-conditions').value.trim()) base.conditions = fragment('v4-conditions');
      if (scheduleRef) base.scheduleRef = scheduleRef;
      if (kind() === 'ordinary') {
        next.rules.push({ ...base, ...(advanced ? { phase: byId('v4-phase').value } : {}), action, flowControl: byId('mixed-flow').value });
      } else {
        const first = kind() === 'FIRST_OCCURRENCES';
        const field = first ? 'n' : 'seconds';
        const amount = byId(first ? 'mixed-count' : 'mixed-seconds').value;
        if (!/^(?:0|[1-9][0-9]*)$/u.test(amount)) throw new ExchangeError('VALUE', field, ko.integer);
        const draft = { ...base, type: kind(), [field]: Number(amount) };
        if (first) {
          draft.eventKey = advanced ? {fieldRef: byId('v4-key').value} : readKey('mixed-event');
          const group = advanced ? (byId('v4-group').value ? {fieldRef: byId('v4-group').value} : null) : readKey('mixed-group');
          if (group) draft.groupKey = group;
        } else {
          draft.targetKey = advanced ? {fieldRef: byId('v4-key').value} : readKey('mixed-target');
        }
        const exclude = byId('mixed-exclude').value;
        if (exclude.trim()) {
          const prefix = '{"formatVersion":3,"value":';
          try { draft.exclude = decodeExchange(prefix + exclude + '}', 8).document.value; }
          catch (error) {
            if (!(error instanceof ExchangeError)) throw error;
            throw new ExchangeError(error.code, 'exclude', error.message);
          }
        }
        next.statefulRules.push(draft);
      }
    }
    serialize(next);
    Object.assign(bundle, next);
    listAndInvalidate();
    if (scheduleRef) byId('mixed-schedule').value = scheduleRef;
    show('form-status', ko.add, 'ok');
  }

  byId('v4-add-field').addEventListener('click', () => {
    try {
      const fields = fragment('v4-fields');
      const row = {ref:byId('v4-ref').value,input:byId('v4-input').value,label:byId('v4-label').value,
        separator:byId('v4-separator').value};
      if (byId('v4-piece').value) {
        if (!/^(0|[1-9][0-9]{0,2})$/u.test(byId('v4-index').value)) throw new ExchangeError('VALUE','index',ko.integer);
        row.columnSeparator = byId('v4-piece').value;
        row.index = Number(byId('v4-index').value);
      }
      if (!Array.isArray(fields)) throw new ExchangeError('VALUE','fields','추출 필드를 확인하세요.');
      const next = [...fields,row];
      checkFields(next);
      byId('v4-fields').value = JSON.stringify(next,null,2);
      invalidate();
      show('form-status',ko.add,'ok');
    } catch (error) {
      if (!(error instanceof ExchangeError)) throw error;
      showError('form-status',error);
    }
  });
  byId('mixed-add').addEventListener('click', () => {
    try { append(); } catch (error) {
      if (!(error instanceof ExchangeError)) throw error;
      showError('form-status', error);
    }
  });
  byId('validate-document').addEventListener('click', () => {
    try {
      const text = byId('json-input').value;
      parseRuleDocument(text);
      renderJson(text);
      show('load-status', ko.loaded, 'ok');
    } catch (error) {
      if (!(error instanceof ExchangeError)) throw error;
      invalidate();
      showError('load-status', error);
    }
  });
  return { active, sync, serialize: () => serialize(bundle) };
}
