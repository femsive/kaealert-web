import { pageStrings } from './page-strings.mjs';
import { messages } from './messages.mjs';

export const languages = { ko: '한국어', en: 'English', ja: '日本語' };
export const storageKey = 'kaealert.web.language';

export function chooseLanguage(saved, preferred) {
  if (Object.hasOwn(languages, saved)) return saved;
  for (const tag of preferred) {
    const language = tag.toLowerCase().split('-')[0];
    if (Object.hasOwn(languages, language)) return language;
  }
  return 'en';
}

export function translate(language, key, values = {}) {
  const pair = Object.hasOwn(messages, key) ? messages[key] :
    Object.hasOwn(pageStrings, key) ? pageStrings[key] : null;
  const text = language === 'ko' || !pair ? key : pair[language === 'ja' ? 1 : 0];
  return text.replace(/\{([a-z]+)\}/gu, (token, name) => Object.hasOwn(values, name) ? values[name] : token);
}

const errorPatterns = [
  [/^(v[123])에서 지원하지 않는 필드가 있습니다\.$/u, '{version}에서 지원하지 않는 필드가 있습니다.', ['version']],
  [/^길이는 UTF-16 기준 (\d+) 이하여야 합니다\.$/u, '길이는 UTF-16 기준 {max} 이하여야 합니다.', ['max']],
  [/^(\d+)~(\d+) 사이의 정수를 입력하세요\.$/u, '{min}~{max} 사이의 정수를 입력하세요.', ['min', 'max']],
  [/^항목을 1~(\d+)개 선택하세요\.$/u, '항목을 1~{max}개 선택하세요.', ['max']],
  [/^최대 (\d+)개까지 입력하세요\.$/u, '최대 {max}개까지 입력하세요.', ['max']],
  [/^0~(\d+) 범위의 정수를 입력하세요\.$/u, '0~{max} 범위의 정수를 입력하세요.', ['max']],
];

export function translateError(language, message) {
  for (const [pattern, key, names] of errorPatterns) {
    const match = pattern.exec(message);
    if (match) return translate(language, key, Object.fromEntries(names.map((name, i) => [name, match[i + 1]])));
  }
  return translate(language, message);
}
