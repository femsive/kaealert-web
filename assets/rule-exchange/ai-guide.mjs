import { bindCopy } from './copy.mjs';
import { currentLanguage, localize, t } from './i18n.mjs';
import { guides } from './ai-strings.mjs';

const source = document.getElementById('ai-instructions');
const korean = source.defaultValue;
const [valid, invalid] = korean.split('\n').filter(line => line.startsWith('{"format":'));
const status = document.getElementById('guide-copy-status');
let revision = 0;

function updateGuide() {
  const localized = guides[currentLanguage()];
  source.value = localized ? localized.replace(/\{(valid|invalid)\}/gu,
    (_, key) => key === 'valid' ? valid : invalid) : korean;
  revision++;
  localize(status, () => '');
  status.dataset.tone = '';
}

document.addEventListener('kaealert-language-change', updateGuide);
updateGuide();
bindCopy(document.getElementById('copy-guide'), source, copied => {
  status.dataset.tone = copied ? 'ok' : 'error';
  localize(status, () => t(copied ? 'AI 지침 전체를 복사했습니다.' :
    '자동 복사에 실패했습니다. 선택된 지침을 직접 복사하세요.'));
}, { version: () => revision });
