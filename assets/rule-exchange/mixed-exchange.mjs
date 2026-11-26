import { checkedText, decodeExchange, ExchangeError, FORMAT, objectKeys, validateRule } from './exchange.mjs';
import { checkSchedule, parseScheduleDocument } from './schedule-exchange.mjs';

export const MAX_BUNDLE_BYTES = 64 * 1024;
export const BUNDLE_LIMITS = { schedules: 16, rules: 16, statefulRules: 8 };
const encoder = new TextEncoder();

function invalid(path, message) {
  throw new ExchangeError('VALUE', path, message);
}

function keys(value, path, required, optional) {
  objectKeys(value, path, required, optional, 'v3');
}

function atPath(path, validate) {
  try { return validate(); }
  catch (error) {
    if (!(error instanceof ExchangeError)) throw error;
    const suffix = error.path?.replace(/^(rule|schedule)(?=\.|$)/u, '');
    throw new ExchangeError(error.code, suffix?.startsWith('.') ? path + suffix : path, error.message.replace(/v[12]에서/gu, '교환 형식에서'));
  }
}

function checkRef(ref, refs, path) {
  if (!refs.has(ref)) invalid(path, '이 묶음에 있는 일정 참조를 선택하세요.');
}

function off(value, path) {
  if (Object.hasOwn(value, 'enabled') && value.enabled !== false) invalid(path, '꺼진 상태(false)로 작성하세요.');
}

export function checkFields(items) {
  if (!Array.isArray(items) || items.length > 16) invalid('fields', '추출 필드를 확인하세요.');
  const result = new Map();
  for (const row of items) {
    keys(row, 'fields', ['ref', 'input', 'label', 'separator'],
      ['columnSeparator', 'index', 'pick', 'trim', 'case', 'validate']);
    const bad = () => invalid('fields', '추출 필드를 확인하세요.');
    const literal = (s, max) => typeof s === 'string' && s.length >= 1 && s.length <= max &&
      !/[\u0000-\u001f\u007f-\u009f]/u.test(s);
    if (typeof row.ref !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,31}$/u.test(row.ref) || result.has(row.ref) ||
        !['TITLE','BODY'].includes(row.input) || !literal(row.label,32) || !literal(row.separator,16) ||
        (row.label + row.separator).indexOf(row.separator) !== row.label.length) bad();
    const piece = Object.hasOwn(row, 'index');
    if (piece !== Object.hasOwn(row, 'columnSeparator') || piece && (!literal(row.columnSeparator,16) ||
        !Number.isInteger(row.index) || row.index < 0 || row.index > 127)) bad();
    for (const [k, choices] of Object.entries({pick:['UNIQUE','FIRST_NONEMPTY'],trim:['ASCII_EDGE','NONE'],
      case:['EXACT','ASCII_UPPER'],validate:['TEXT','ASCII_TOKEN','IPV4']})) {
      if (Object.hasOwn(row,k) && !choices.includes(row[k])) bad();
    }
    const signature = [row.input,row.label,row.separator,row.columnSeparator,row.index,row.pick ?? 'UNIQUE',
      row.trim ?? 'ASCII_EDGE',row.case ?? 'EXACT',row.validate ?? 'TEXT'];
    result.set(row.ref, {input:row.input, signature});
  }
  return result;
}

function checkKey(key, path, fields) {
  if (fields) {
    keys(key, path, ['fieldRef']);
    if (!fields.has(key.fieldRef)) invalid(path, '추출 필드를 확인하세요.');
    return;
  }
  keys(key, path, ['field'], ['prefix', 'token']);
  if (!['TITLE', 'BODY'].includes(key.field)) invalid(path + '.field', '키를 읽을 필드를 선택하세요.');
  checkedText(key.prefix, path + '.prefix', 32);
  if (/[;\u0000-\u001f\u007f-\u009f]/u.test(key.prefix)) {
    invalid(path + '.prefix', '접두사에 세미콜론이나 제어 문자를 사용할 수 없습니다.');
  }
  if (!['ASCII_ALNUM', 'ASCII_TOKEN'].includes(key.token)) invalid(path + '.token', '지원하는 키 문자 범위를 선택하세요.');
}

function checkStateful(item, refs, path, fields) {
  const first = item?.type === 'FIRST_OCCURRENCES';
  if (!first && item?.type !== 'RECEPTION_WAIT') invalid(path + '.type', '지원하는 규칙 종류를 선택하세요.');
  const limit = first ? 'n' : 'seconds';
  const key = first ? 'eventKey' : 'targetKey';
  keys(item, path, ['type', 'name', 'sourcePackage', 'conditions', limit, key, ...(first ? ['scheduleRef'] : [])],
    ['match', 'exclude', 'enabled', ...(first ? ['groupKey'] : ['scheduleRef'])]);
  off(item, path + '.enabled');
  if (typeof item.sourcePackage !== 'string') invalid(path + '.sourcePackage', '등록된 앱의 패키지 이름을 입력하세요.');
  const testConditions = (group, groupPath) => atPath(groupPath, () => validateRule({
    action: 'ALERT', name: item.name, sourcePackage: item.sourcePackage,
    conditions: group.conditions, ...(Object.hasOwn(group, 'match') ? { match: group.match } : {}),
  }, fields));
  testConditions(item, path);
  if (Object.hasOwn(item, 'exclude')) {
    keys(item.exclude, path + '.exclude', ['conditions'], ['match']);
    testConditions(item.exclude, path + '.exclude');
  }
  const max = first ? 100 : 86400;
  if (!Number.isInteger(item[limit]) || item[limit] < 0 || item[limit] > max) {
    invalid(path + '.' + limit, '0~' + max + ' 범위의 정수를 입력하세요.');
  }
  checkKey(item[key], path + '.' + key, fields);
  if (Object.hasOwn(item, 'groupKey')) checkKey(item.groupKey, path + '.groupKey', fields);
  if (Object.hasOwn(item, 'scheduleRef')) checkRef(item.scheduleRef, refs, path + '.scheduleRef');
}

/** Syntax validation only. Android rechecks installed sources, entitlements and existing rows. */
export function parseRuleDocument(text) {
  if (text.length > MAX_BUNDLE_BYTES || encoder.encode(text).length > MAX_BUNDLE_BYTES) {
    invalid('$', 'JSON 전체는 UTF-8 기준 64 KiB 이하여야 합니다.');
  }
  const { document, versionToken, unsignedIntegerTokensOnly } = decodeExchange(text, 8);
  if (versionToken === '1' || versionToken === '2') return parseScheduleDocument(text);
  if (document?.format !== FORMAT) invalid('format', '깨알 규칙 교환 형식을 입력하세요.');
  const advanced = versionToken === '4';
  if (!advanced && versionToken !== '3') invalid('formatVersion', '버전은 숫자 1, 2 또는 3으로 표기하세요.');
  if (!unsignedIntegerTokensOnly) invalid('$', '정수 필드에 음수, 소수 또는 지수 표기를 사용할 수 없습니다.');
  keys(document, '$', ['format', 'formatVersion', 'schedules', 'rules', 'statefulRules', ...(advanced ? ['fields'] : [])]);
  const fields = advanced ? checkFields(document.fields) : null;
  let count = 0;
  for (const [field, max] of Object.entries(BUNDLE_LIMITS)) {
    if (!Array.isArray(document[field]) || document[field].length > max) invalid(field, '최대 ' + max + '개까지 입력하세요.');
    count += document[field].length;
  }
  if (!count) invalid('$', '가져올 규칙 또는 일정을 하나 이상 추가하세요.');
  const refs = new Set();
  document.schedules.forEach((schedule, i) => {
    const path = 'schedules[' + i + ']';
    atPath(path, () => checkSchedule(schedule, true));
    if (refs.has(schedule.ref)) invalid(path + '.ref', '일정 참조가 이미 있습니다.');
    refs.add(schedule.ref);
  });
  document.rules.forEach((rule, i) => {
    const path = 'rules[' + i + ']';
    keys(rule, path, ['name', 'sourcePackage', 'action', 'conditions'], ['match', 'enabled', 'scheduleRef', 'flowControl', ...(advanced ? ['phase'] : [])]);
    off(rule, path + '.enabled');
    const { scheduleRef, flowControl, phase, ...body } = rule;
    if (Object.hasOwn(rule, 'phase') && !['ORDINARY','PRE_STATE'].includes(phase)) invalid(path + '.phase', '평가 시점을 확인하세요.');
    if (Object.hasOwn(rule, 'flowControl') && !['STOP', 'CONTINUE'].includes(flowControl)) {
      invalid(path + '.flowControl', '계속 평가 또는 평가 중단을 선택하세요.');
    }
    if (Object.hasOwn(rule, 'scheduleRef')) checkRef(scheduleRef, refs, path + '.scheduleRef');
    atPath(path, () => validateRule(body, fields));
  });
  document.statefulRules.forEach((item, i) => checkStateful(item, refs, 'statefulRules[' + i + ']', fields));
  return document;
}

export function serializeBundle(bundle) {
  const document = { format: FORMAT, formatVersion: Object.hasOwn(bundle, 'fields') ? 4 : 3, ...bundle };
  const compact = JSON.stringify(document);
  parseRuleDocument(compact);
  const pretty = JSON.stringify(document, null, 2);
  return encoder.encode(pretty).length <= MAX_BUNDLE_BYTES ? pretty : compact;
}
