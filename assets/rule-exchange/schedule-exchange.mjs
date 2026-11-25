import { checkedText, decodeExchange, ExchangeError, FORMAT, objectKeys, parseExchange, serializeRule, validateRule } from './exchange.mjs';

export const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
export const MAX_SELECTED_DATES = 1000;
export const MAX_INTERVALS = 128;
const REF = 's1';
const MAX_BYTES = 64 * 1024;
const END_OF_RANGE = '9999-12-31';
const dayMs = 86_400_000;
const encoder = new TextEncoder();
const knownZones = new Set(['UTC', 'Asia/Seoul', ...(Intl.supportedValuesOf?.('timeZone') ?? [])]);
const extra = new Map([
  ['DAILY', []], ['WEEKLY_SELECTED_DAYS', ['weekdays']], ['EVERY_N_DAYS', ['intervalDays']],
  ['MONTHLY_DAYS', ['selectedDays']], ['SPECIFIC_DATES', ['selectedDates']],
]);

function error(code, path, message) {
  throw new ExchangeError(code, path, message);
}

function keys(object, path, required, optional) {
  objectKeys(object, path, required, optional, 'v2');
}

function value(path, message) {
  error('VALUE', path, message);
}

function boolean(input, path) {
  if (typeof input !== 'boolean') value(path, '참 또는 거짓이어야 합니다.');
  return input;
}

function date(input, path) {
  if (typeof input !== 'string' || input.length !== 10 || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(input)) {
    value(path, 'YYYY-MM-DD 형식의 날짜를 입력하세요.');
  }
  const [year, month, day] = input.split('-').map(Number);
  const instant = new Date(wallTime(year, month, day));
  if (!year || instant.getUTCFullYear() !== year || instant.getUTCMonth() + 1 !== month || instant.getUTCDate() !== day) {
    value(path, '달력에 존재하는 날짜를 입력하세요.');
  }
  return input;
}

function clock(input, path) {
  if (typeof input !== 'string' || input.length !== 5 || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/u.test(input)) {
    value(path, '00:00~23:59 사이의 시각을 입력하세요.');
  }
  return input;
}

function wallTime(year, month, day, hour = 0, minute = 0, second = 0) {
  const time = new Date(0);
  time.setUTCFullYear(year, month - 1, day);
  return time.setUTCHours(hour, minute, second, 0);
}

function localEpoch(day, hhmm = '00:00') {
  return wallTime(...day.split('-').map(Number), ...hhmm.split(':').map(Number));
}

function zoneFormatter(zoneId) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zoneId, calendar: 'gregory', numberingSystem: 'latn', hourCycle: 'h23',
    era: 'short', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function zonedWallTime(formatter, instant) {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value }) => [type, value]));
  const year = parts.era === 'BC' ? 1 - Number(parts.year) : Number(parts.year);
  return wallTime(year, ...['month', 'day', 'hour', 'minute', 'second'].map(key => Number(parts[key])));
}

function intervalInstant(input, path, formatter) {
  if (typeof input !== 'string' || input.length !== 16 || input[10] !== 'T') {
    value(path, '날짜와 시각을 분 단위로 입력하세요.');
  }
  const wall = localEpoch(date(input.slice(0, 10), path), clock(input.slice(11), path));
  // Collect offsets on both sides of nearby transitions and round-trip each candidate.
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = wall + hours * 3_600_000;
    offsets.add(zonedWallTime(formatter, probe) - probe);
  }
  const instants = [...offsets].map(offset => wall - offset).filter(instant => zonedWallTime(formatter, instant) === wall);
  if (instants.length !== 1) value(path, '이 시간대에서 존재하지 않거나 두 번 나타나는 시각입니다.');
  return instants[0];
}

function checkIntervals(intervals, zoneId) {
  const path = 'schedule.intervals';
  if (!Array.isArray(intervals) || intervals.length < 1 || intervals.length > MAX_INTERVALS) {
    value(path, '구간을 1~128개 입력하세요.');
  }
  const formatter = zoneFormatter(zoneId);
  const windows = intervals.map((interval, index) => {
    const field = path + '[' + (index + 1) + ']';
    keys(interval, field, ['start', 'end']);
    const start = intervalInstant(interval.start, field + '.start', formatter);
    const end = intervalInstant(interval.end, field + '.end', formatter);
    if (end <= start) value(field + '.end', '종료는 시작보다 늦어야 합니다.');
    return { start, end };
  }).sort((a, b) => a.start - b.start);
  if (windows.some((window, i) => i > 0 && window.start < windows[i - 1].end)) {
    value(path, '같은 일정 안의 구간은 서로 겹칠 수 없습니다.');
  }
  return intervals.map(({ start, end }) => ({ start, end }));
}

function integer(input, min, max, path) {
  if (!Number.isInteger(input) || input < min || input > max) value(path, min + '~' + max + ' 사이의 정수를 입력하세요.');
  return input;
}

function distinctItems(input, max, path, validate) {
  if (!Array.isArray(input) || input.length < 1 || input.length > max) value(path, '항목을 1~' + max + '개 선택하세요.');
  const items = input.map(item => validate(item, path));
  if (new Set(items).size !== items.length) value(path, '같은 항목을 두 번 입력할 수 없습니다.');
  return items;
}

function checkRecurrence(input) {
  const path = 'schedule.recurrence';
  if (!extra.has(input?.type)) value(path + '.type', '지원하는 일정 유형을 선택하세요.');
  const { type } = input;
  keys(input, path, ['type', 'startDate', 'endDate', 'startTime', 'endTime', 'crossesMidnight', ...extra.get(type)]);
  const startDate = date(input.startDate, path + '.startDate');
  const endDate = input.endDate === null ? null : date(input.endDate, path + '.endDate');
  if (endDate !== null && endDate < startDate) value(path + '.endDate', '종료 날짜는 시작 날짜보다 앞설 수 없습니다.');
  const startTime = clock(input.startTime, path + '.startTime');
  const endTime = clock(input.endTime, path + '.endTime');
  const crossesMidnight = boolean(input.crossesMidnight, path + '.crossesMidnight');
  if (crossesMidnight !== (endTime <= startTime)) value(path + '.endTime', '종료 시각과 다음 날 종료 설정이 맞지 않습니다.');
  const result = { type, startDate, endDate, startTime, endTime, crossesMidnight };
  switch (type) {
    case 'WEEKLY_SELECTED_DAYS':
      result.weekdays = distinctItems(input.weekdays, 7, path + '.weekdays', (day, field) => {
        if (!WEEKDAYS.includes(day)) value(field, '월요일부터 일요일 중에서 선택하세요.');
        return day;
      }).sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
      break;
    case 'EVERY_N_DAYS':
      result.intervalDays = integer(input.intervalDays, 1, 365, path + '.intervalDays');
      break;
    case 'MONTHLY_DAYS':
      result.selectedDays = distinctItems(input.selectedDays, 31, path + '.selectedDays',
        (day, field) => integer(day, 1, 31, field)).sort((a, b) => a - b);
      break;
    case 'SPECIFIC_DATES':
      result.selectedDates = distinctItems(input.selectedDates, MAX_SELECTED_DATES, path + '.selectedDates', date).sort();
      if (result.selectedDates[0] !== startDate) value(path + '.startDate', '가장 이른 선택 날짜를 시작 날짜로 사용하세요.');
      if (endDate !== null) value(path + '.endDate', '특정 날짜 선택은 종료 날짜가 null이어야 합니다.');
      if (crossesMidnight && result.selectedDates.includes(END_OF_RANGE)) {
        value(path + '.selectedDates', '다음 날이 지원 날짜 범위를 벗어납니다.');
      }
      break;
  }
  if (crossesMidnight && (startDate === END_OF_RANGE || endDate === END_OF_RANGE)) {
    const last = localEpoch(END_OF_RANGE);
    const startsOnLast = type === 'DAILY' ||
      result.weekdays?.includes(WEEKDAYS[(new Date(last).getUTCDay() + 6) % 7]) ||
      result.selectedDays?.includes(31) ||
      (last - localEpoch(startDate)) / dayMs % result.intervalDays === 0;
    if (startsOnLast) value(path + '.endDate', '다음 날이 지원 날짜 범위를 벗어납니다.');
  }
  return result;
}

function checkSchedule(schedule) {
  const mode = schedule?.mode;
  if (mode !== 'EXPLICIT' && mode !== 'RECURRING') value('schedule.mode', '지원하는 일정 유형을 선택하세요.');
  const detail = mode === 'EXPLICIT' ? 'intervals' : 'recurrence';
  keys(schedule, 'schedule', ['ref', 'name', 'zoneId', 'mode', detail], ['enabled']);
  if (schedule.ref !== REF) value('schedule.ref', '문서 안에서만 사용하는 일정 참조가 필요합니다.');
  checkedText(schedule.name, 'schedule.name', 80, true);
  if (!knownZones.has(schedule.zoneId)) value('schedule.zoneId', '이 브라우저가 지원하는 시간대 ID를 입력하세요.');
  const enabled = Object.hasOwn(schedule, 'enabled') ? boolean(schedule.enabled, 'schedule.enabled') : false;
  return {
    ref: REF, name: schedule.name, zoneId: schedule.zoneId, enabled, mode,
    [detail]: mode === 'EXPLICIT' ? checkIntervals(schedule.intervals, schedule.zoneId) : checkRecurrence(schedule.recurrence),
  };
}

export function parseScheduleDocument(text) {
  checkSize(text);
  const { document, versionToken, integerTokensOnly } = decodeExchange(text, 5);
  if (versionToken === '1') return { format: FORMAT, formatVersion: 1, rule: parseExchange(text) };
  if (document?.format !== FORMAT) error('FORMAT', 'format', '깨알 규칙 교환 형식을 입력하세요.');
  if (versionToken !== '2') error('VERSION', 'formatVersion', '버전은 숫자 1 또는 2로 표기하세요.');
  if (!integerTokensOnly) value('schedule', '정수 필드에는 소수나 지수 표기를 사용할 수 없습니다.');
  keys(document, '$', ['format', 'formatVersion', 'schedule'], ['rule']);
  const schedule = checkSchedule(document.schedule);
  if (!Object.hasOwn(document, 'rule')) return { format: FORMAT, formatVersion: 2, schedule };
  const { rule } = document;
  if (rule?.scheduleRef !== REF) value('rule.scheduleRef', '이 문서 안의 일정을 참조해야 합니다.');
  const { scheduleRef, ...ruleBody } = rule;
  return { format: FORMAT, formatVersion: 2, schedule, rule: { ...validateRule(ruleBody), scheduleRef } };
}

function checkSize(text) {
  if (text.length > MAX_BYTES || encoder.encode(text).length > MAX_BYTES) {
    error('SIZE', '$', 'JSON 전체는 UTF-8 기준 64 KiB 이하여야 합니다.');
  }
}

export function serializeSelection({ rule, schedule }) {
  if (!rule && !schedule) value('$', '규칙 또는 일정을 선택하세요.');
  if (!schedule) return serializeRule(rule);
  const draft = { format: FORMAT, formatVersion: 2, schedule: { ...schedule, ref: REF } };
  if (rule) draft.rule = { ...rule, scheduleRef: REF };
  const verified = parseScheduleDocument(JSON.stringify(draft));
  const pretty = JSON.stringify(verified, null, 2);
  return encoder.encode(pretty).length <= MAX_BYTES ? pretty : JSON.stringify(verified);
}
