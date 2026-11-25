export const FORMAT = 'kaealert-rule-exchange';
export const MAX_BYTES = 8 * 1024;
export const MAX_CONDITIONS = 8;
export const MAX_SAMPLE = 4096;
export const FIELDS = { TITLE: '제목', BODY: '본문', TITLE_OR_BODY: '제목 또는 본문' };
export const OPERATORS = { EQUALS: '정확히 같음', CONTAINS: '포함', NOT_CONTAINS: '포함하지 않음', REGEX: '정규식' };
export const ACTIONS = { ALERT: '알람 울리기', SUPPRESS: '무시하기' };
export const MATCH = { ALL: '모든 조건', ANY: '조건 중 하나' };

const encoder = new TextEncoder();
const blank = /^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028-\u2029\u202f\u205f\u3000\ufeff]*$/u;
const invalidCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ud800-\udfff]/u;
const packagePart = /^[A-Za-z][A-Za-z0-9_]*$/u;

export class ExchangeError extends Error {
  constructor(code, path, message) {
    super(message);
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new ExchangeError(code, path, message);
}

function checkByteLength(text) {
  if (text.length > MAX_BYTES || encoder.encode(text).length > MAX_BYTES) {
    fail('SIZE', '$', 'JSON 전체는 UTF-8 기준 8 KiB 이하여야 합니다.');
  }
}

// JSON.parse establishes syntax. The token pass retains duplicate keys and the raw version token
// before their spelling is lost in the decoded object.
function inspectTokens(text, maxDepth) {
  const tokens = Array.from(text.matchAll(/"(?:[^"\\]|\\.)*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null|[{}\[\],:]/gsu), match => match[0]);
  const containers = [];
  let versionToken;
  let integerTokensOnly = true;
  let unsignedIntegerTokensOnly = true;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '{' || token === '[') {
      containers.push(token === '{' ? new Set() : null);
      if (containers.length > maxDepth) fail('DEPTH', '$', 'JSON 컨테이너 깊이 한도를 초과했습니다.');
    } else if (token === '}' || token === ']') {
      containers.pop();
    } else if (token.startsWith('"')) {
      const value = JSON.parse(token);
      if (invalidCharacters.test(value)) fail('CHARACTERS', '$', 'JSON 문자열에 지원하지 않는 제어 문자 또는 잘못된 Unicode가 있습니다.');
      if (tokens[i + 1] !== ':') continue;
      const keys = containers.at(-1);
      if (keys.has(value)) fail('DUPLICATE_KEY', '$', '같은 JSON 객체에 중복된 필드가 있습니다.');
      keys.add(value);
      if (containers.length === 1 && value === 'formatVersion') versionToken = tokens[i + 2];
    } else if (/^-?[0-9]/u.test(token)) {
      if (!/^-?[0-9]+$/u.test(token)) integerTokensOnly = false;
      if (!/^[0-9]+$/u.test(token)) unsignedIntegerTokensOnly = false;
    }
  }
  return { versionToken, integerTokensOnly, unsignedIntegerTokensOnly };
}

export function parseExchange(text) {
  checkByteLength(text);
  const { document, versionToken } = decodeExchange(text, 4);
  const rule = validateExchange(document);
  if (versionToken !== '1') fail('VERSION', 'formatVersion', '버전은 숫자 1로 표기하세요.');
  return rule;
}

export function decodeExchange(text, maxDepth) {
  if (text.startsWith('\ufeff')) fail('JSON_SYNTAX', '$', 'JSON 앞의 BOM을 제거하세요.');
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    fail('JSON_SYNTAX', '$', 'JSON 객체 한 개를 입력하세요. 코드 표시, 설명, 주석, 끝 쉼표는 허용하지 않습니다.');
  }
  return { document, ...inspectTokens(text, maxDepth) };
}

export function objectKeys(value, path, required, optional = [], version = 'v1') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('TYPE', path, 'JSON 객체여야 합니다.');
  }
  if (Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) {
    fail('UNKNOWN_FIELD', path, version + '에서 지원하지 않는 필드가 있습니다.');
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail('MISSING', path === '$' ? key : path + '.' + key, '필수 필드입니다.');
  }
}

function enumValue(value, options, path) {
  if (typeof value !== 'string') fail('TYPE', path, '문자열이어야 합니다.');
  if (!Object.hasOwn(options, value)) fail('UNSUPPORTED_VALUE', path, 'v1에서 지원하지 않는 값입니다.');
}

export function checkedText(value, path, max, singleLine = false) {
  if (typeof value !== 'string') fail('TYPE', path, '문자열이어야 합니다.');
  if (invalidCharacters.test(value) || (singleLine && /[\t\r\n]/u.test(value))) {
    fail('CHARACTERS', path, '지원하지 않는 제어 문자 또는 잘못된 Unicode가 있습니다.');
  }
  if (blank.test(value)) fail('EMPTY', path, '값을 입력하세요. 공백만 사용할 수 없습니다.');
  if (value.length > max) fail('LENGTH', path, '길이는 UTF-16 기준 ' + max + ' 이하여야 합니다.');
}

function validateExchange(document) {
  if (document?.format === 'kaealert-backup') {
    fail('FORMAT', 'format', 'Backup 파일 대신 깨알 규칙 교환 JSON을 입력하세요.');
  }
  objectKeys(document, '$', ['format', 'formatVersion', 'rule']);
  if (typeof document.format !== 'string') fail('TYPE', 'format', '문자열이어야 합니다.');
  if (document.format !== FORMAT) fail('FORMAT', 'format', '깨알 규칙 교환 형식 v1이 필요합니다.');
  if (typeof document.formatVersion !== 'number') fail('TYPE', 'formatVersion', '숫자여야 합니다.');
  if (document.formatVersion !== 1) fail('VERSION', 'formatVersion', '이 도구는 v1만 지원합니다.');

  return validateRule(document.rule);
}

export function validateRule(rule) {
  objectKeys(rule, 'rule', ['name', 'sourcePackage', 'action', 'conditions'], ['enabled', 'match']);
  checkedText(rule.name, 'rule.name', 80, true);
  if (rule.sourcePackage !== null) {
    if (typeof rule.sourcePackage !== 'string') fail('TYPE', 'rule.sourcePackage', '패키지 문자열 또는 null이어야 합니다.');
    const parts = rule.sourcePackage.split('.');
    if (rule.sourcePackage.length > 255 || parts.length < 2 || !parts.every(part => packagePart.test(part) && !/[\r\n\u2028\u2029]/u.test(part))) {
      fail('PACKAGE', 'rule.sourcePackage', 'com.example.app과 같은 패키지 이름을 입력하세요.');
    }
  }
  if (Object.hasOwn(rule, 'enabled') && typeof rule.enabled !== 'boolean') fail('TYPE', 'rule.enabled', '참 또는 거짓이어야 합니다.');
  if (Object.hasOwn(rule, 'match')) enumValue(rule.match, MATCH, 'rule.match');
  enumValue(rule.action, ACTIONS, 'rule.action');
  if (!Array.isArray(rule.conditions)) fail('TYPE', 'rule.conditions', '조건 배열이어야 합니다.');
  if (rule.conditions.length < 1 || rule.conditions.length > MAX_CONDITIONS) {
    fail('COUNT', 'rule.conditions', '조건은 1~8개여야 합니다.');
  }
  const seen = new Set();
  const conditions = rule.conditions.map((condition, index) => {
    const path = 'rule.conditions[' + index + ']';
    objectKeys(condition, path, ['field', 'op', 'value']);
    const { field, op, value } = condition;
    enumValue(field, FIELDS, path + '.field');
    enumValue(op, OPERATORS, path + '.op');
    if (field === 'TITLE_OR_BODY' && op === 'NOT_CONTAINS') {
      fail('UNSUPPORTED_VALUE', path + '.op', '제목 또는 본문에는 포함하지 않음 조건을 쓸 수 없습니다.');
    }
    checkedText(value, path + '.value', op === 'REGEX' ? 128 : 256);
    const signature = JSON.stringify([field, op, value]);
    if (seen.has(signature)) fail('DUPLICATE_CONDITION', path, '동일한 조건이 이미 있습니다.');
    seen.add(signature);
    if (op === 'REGEX') compilePattern(value, path + '.value');
    return { field, op, value };
  });
  return {
    name: rule.name, sourcePackage: rule.sourcePackage, enabled: rule.enabled ?? false,
    action: rule.action, match: rule.match ?? 'ALL', conditions,
  };
}

export function serializeRule(rule) {
  const document = { format: FORMAT, formatVersion: 1, rule };
  const normalized = validateExchange(document);
  // Choose compact JSON when formatting alone would exceed the wire size limit.
  const result = { format: FORMAT, formatVersion: 1, rule: normalized };
  const pretty = JSON.stringify(result, null, 2);
  const text = encoder.encode(pretty).length <= MAX_BYTES ? pretty : JSON.stringify(result);
  checkByteLength(text);
  return text;
}

const reserved = '\\.^$|?*+()[]{}';
const classes = new Set(['[0-9]', '[A-Z]', '[a-z]', '[A-Za-z0-9_]']);

function checkDelimiters(pattern, syntax) {
  // Find unclosed groups and classes even when their contents are outside the subset.
  let insideClass = false;
  let groups = 0;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') {
      if (++i === pattern.length) syntax('정규식 끝의 역슬래시 뒤에 문자가 필요합니다.');
    } else if (insideClass) {
      if (ch === ']') insideClass = false;
    } else if (ch === '[') {
      insideClass = true;
    } else if (ch === '(') {
      groups++;
    } else if (ch === ')') {
      if (groups === 0) syntax('짝이 없는 닫는 괄호가 있습니다.');
      groups--;
    }
  }
  if (insideClass || groups) syntax('닫히지 않은 괄호 또는 문자 클래스가 있습니다.');
}

function compilePattern(pattern, path) {
  const syntax = message => fail('REGEX_SYNTAX', path, message);
  const unsupported = message => fail('REGEX_UNSUPPORTED', path, message);
  checkDelimiters(pattern, syntax);

  let offset = 0;
  let branches = 1;
  let branchLength = 0;
  let nonWhitespace = false;
  while (offset < pattern.length) {
    const ch = pattern[offset++];
    if (ch === '|') {
      if (!branchLength || offset === pattern.length) unsupported('정규식 선택지에는 빈 가지를 넣을 수 없습니다.');
      if (++branches > 4) unsupported('정규식 선택지는 최대 4개입니다.');
      branchLength = 0;
      continue;
    }

    if (ch === '\\') {
      const next = pattern[offset++];
      if (!'nrt'.includes(next) && !reserved.includes(next)) unsupported('이 역슬래시 문법은 v1에서 지원하지 않습니다.');
      nonWhitespace ||= reserved.includes(next);
    } else if (ch === '[') {
      const end = pattern.indexOf(']', offset);
      const characterClass = pattern.slice(offset - 1, end + 1);
      if (!classes.has(characterClass)) unsupported('v1에서 허용한 문자 클래스만 사용할 수 있습니다.');
      offset = end + 1;
      nonWhitespace = true;
    } else if ('?*+{}'.includes(ch)) {
      syntax('반복 표기 앞에는 반복할 문자나 클래스가 필요합니다.');
    } else {
      if (reserved.includes(ch) || !/^[\u0020-\u007e\uac00-\ud7a3]$/u.test(ch)) {
        unsupported('이 문자 또는 정규식 문법은 v1에서 지원하지 않습니다. 키워드는 포함 조건으로 시험할 수 있습니다.');
      }
      nonWhitespace ||= ch !== ' ';
    }

    let repeat = 1;
    if (pattern[offset] === '{') {
      const end = pattern.indexOf('}', offset + 1);
      if (end < 0) syntax('고정 반복 표기의 닫는 중괄호가 필요합니다.');
      const count = pattern.slice(offset + 1, end);
      if (/^[0-9]+,[0-9]*$/u.test(count)) unsupported('범위 반복은 지원하지 않습니다. {n}을 사용하세요.');
      if (!/^[0-9]+$/u.test(count)) syntax('고정 반복은 {n} 형식이어야 합니다.');
      repeat = Number(count);
      if (count.startsWith('0') || repeat > 16) unsupported('고정 반복 횟수는 앞에 0이 없는 1~16이어야 합니다.');
      offset = end + 1;
    }
    if (offset < pattern.length && '?*+'.includes(pattern[offset])) unsupported('가변 반복과 반복 옵션은 지원하지 않습니다.');
    branchLength += repeat;
    if (branchLength > 128) unsupported('반복을 펼친 선택지의 길이는 최대 128입니다.');
  }
  if (!nonWhitespace) fail('EMPTY', path, '공백만 찾는 정규식은 사용할 수 없습니다.');
  try {
    return new RegExp(pattern);
  } catch {
    syntax('정규식을 해석할 수 없습니다.');
  }
}

export function testRule(rule, { title, body, sourcePackage }) {
  const normalized = validateExchange({ format: FORMAT, formatVersion: 1, rule });
  for (const [field, text] of Object.entries({ title, body })) {
    if (text !== null && typeof text !== 'string') fail('TYPE', field, '시험 값은 문자열 또는 누락이어야 합니다.');
    if (text !== null && text.length > MAX_SAMPLE) fail('SAMPLE_LENGTH', field, '시험 제목과 본문은 각각 4,096자 이하여야 합니다.');
  }
  if (normalized.sourcePackage !== null && normalized.sourcePackage !== sourcePackage) return { status: 'outside-scope' };

  const results = normalized.conditions.map(({ field, op, value }, index) => {
    const pattern = op === 'REGEX' ? compilePattern(value, 'rule.conditions[' + index + '].value') : null;
    const inputs = field === 'TITLE' ? [title] : field === 'BODY' ? [body] : [title, body];
    return inputs.some(text => {
      if (text === null) return false;
      if (op === 'EQUALS') return text === value;
      if (op === 'CONTAINS') return text.includes(value);
      if (op === 'NOT_CONTAINS') return !text.includes(value);
      return pattern.test(text);
    });
  });
  const matched = normalized.match === 'ALL' ? results.every(Boolean) : results.some(Boolean);
  return { status: matched ? 'matched' : 'unmatched', results, action: matched ? normalized.action : null };
}
