import { bindCopy } from './copy.mjs';

const source = document.getElementById('ai-instructions');
const status = document.getElementById('guide-copy-status');
bindCopy(document.getElementById('copy-guide'), source, copied => {
  status.dataset.tone = copied ? 'ok' : 'error';
  status.textContent = copied ? 'AI 지침 전체를 복사했습니다.' : '자동 복사에 실패했습니다. 선택된 지침을 직접 복사하세요.';
});
