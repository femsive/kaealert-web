import { bindCopy } from './copy.mjs';
import { currentLanguage, localize, t } from './i18n.mjs';
import { guides } from './ai-strings.mjs';

const source = document.getElementById('ai-instructions');
const korean = source.defaultValue;
const [valid, invalid] = korean.split('\n').filter(line => line.startsWith('{"format":'));
const status = document.getElementById('guide-copy-status');
let revision = 0;
const rowGuide = {
  ko: '지원 형식은 범용 JSON v1~4입니다. 새 고급 묶음에는 Alpha 0.1.6 (9)에서 지원하는 v4를 우선 사용하세요. 구형 v3의 업무 전용 키와 조건은 거부됩니다. 실제 민감한 알림 대신 합성 예시를 사용하세요. v4는 v3의 일정 6종 및 scheduleRef를 유지합니다. formatVersion을 4로 지정하고 fields, rules, schedules, statefulRules 배열을 사용합니다. Android가 본문 표현을 처리하므로 본문 선택 속성을 추가하지 않습니다. fields에 최대 16개를 정의합니다. ref는 영문자로 시작하는 영문·숫자·밑줄 1~32자입니다. input은 TITLE 또는 BODY, label은 행 이름, separator는 첫 구분자입니다. 열 선택에는 columnSeparator와 0부터 세는 index(0~127)를 함께 씁니다. pick은 UNIQUE 또는 FIRST_NONEMPTY, trim은 ASCII_EDGE 또는 NONE, validate는 TEXT, ASCII_TOKEN 또는 IPV4, case는 EXACT 또는 ASCII_UPPER입니다. 기본값은 각 첫 값입니다. conditions와 exclude는 field 또는 fieldRef를 씁니다. EXISTS·NOT_EXISTS는 value를 생략합니다. TEXT_PATTERN은 한 필드 안에서 ASCII 대소문자를 구분하지 않습니다. |는 대안, &는 같은 필드의 필수 조건, ~는 공백 0개 이상, *와 **는 한 줄과 여러 줄, #·#+·#3은 각각 숫자 1개·1개 이상·1~3개입니다. 특수문자는 역슬래시로 이스케이프합니다. NOT_TEXT_PATTERN은 값이 있을 때만 불일치를 검사합니다. {"field":"BODY","op":"TEXT_PATTERN","value":"Status:~ready|Ticket~#+"} statefulRules의 eventKey·groupKey·targetKey에는 {“fieldRef”:“이름”}만 허용됩니다. 선행 PRE_STATE STOP → 최초 N개 고유 사건 억제 → 대상별 대기 → ORDINARY 순서입니다. 새 항목은 OFF입니다. 누락 또는 모호한 키는 그 상태를 갱신하지 않습니다. 실행 상태·DB ID·업무 파서 필드·스크립트·임의 정규식은 거부합니다. 아래는 정상 예와 알 수 없는 참조로 거부되는 예입니다.',
  en: 'Use supported generic JSON v1–4. Prefer v4 for new advanced bundles on Alpha 0.1.6 (9). Legacy work-specific v3 keys and conditions are rejected. Use synthetic examples in place of sensitive notifications. Set formatVersion to 4 and use the fields, rules, schedules and statefulRules arrays. Retain the six schedule types and scheduleRef. Android handles body representations automatically. Do not add a body selector. Define up to 16 fields. A ref is 1–32 ASCII letters, digits or underscores beginning with a letter. input is TITLE or BODY. label selects the entire row name before its first literal separator. Set columnSeparator and zero-based index (0–127) together. pick: UNIQUE or FIRST_NONEMPTY; trim: ASCII_EDGE or NONE; validate: TEXT, ASCII_TOKEN or IPV4; case: EXACT or ASCII_UPPER. The first option is the default. Conditions and exclusions use field or fieldRef. Omit value for EXISTS and NOT_EXISTS. TEXT_PATTERN searches one field ignoring ASCII case. Use | for alternatives, & for requirements in that field, ~ for optional whitespace, * within a line, ** across lines, and #, #+, #3 for one, one or more, or one to three digits. Escape special characters with a backslash. NOT_TEXT_PATTERN requires a present, nonmatching field. {"field":"BODY","op":"TEXT_PATTERN","value":"Status:~ready|Ticket~#+"} eventKey, groupKey and targetKey use only fieldRef. Order: PRE_STATE STOP, first N distinct events, per-target wait, ORDINARY. All new items are off. Missing or ambiguous keys skip that state write. Do not include runtime state, DB IDs, parser fields, scripts or arbitrary regex. Examples: valid document, then rejected unresolved reference.',
  ja: '対応形式は汎用 JSON v1～4 です。新しい高度なまとめは Alpha 0.1.6 (9) が対応する v4 を優先します。旧 v3 の業務専用キーと条件は拒否されます。機密通知の代わりに架空の例を使用してください。formatVersion を 4 にし、fields、rules、schedules、statefulRules の配列を使います。予定6種と scheduleRef を引き継ぎます。本文の表現は Android が処理するため、本文選択の属性は追加しません。fields は最大16個。ref は英字で始まる英数字と下線の1～32文字です。input は TITLE または BODY、label は最初の separator より前の行名全体。列指定は columnSeparator とゼロ始まりの index (0～127) を併用します。pick は UNIQUE / FIRST_NONEMPTY、trim は ASCII_EDGE / NONE、validate は TEXT / ASCII_TOKEN / IPV4、case は EXACT / ASCII_UPPER。先頭が既定値。条件と除外は field または fieldRef を使用し、EXISTS・NOT_EXISTS では value を省略します。TEXT_PATTERN は同一フィールド内を ASCII 大文字小文字を区別せず検索します。| は選択、& は同一フィールド内の必須条件、~ は空白0個以上、* は1行、** は複数行、#・#+・#3 は数字1個・1個以上・1～3個です。特殊文字はバックスラッシュでエスケープします。NOT_TEXT_PATTERN は値が存在し一致しない場合のみ有効です。 {"field":"BODY","op":"TEXT_PATTERN","value":"Status:~ready|Ticket~#+"}eventKey・groupKey・targetKey は fieldRef のみ。PRE_STATE STOP、最初の N 件の一意イベント、対象別待機、ORDINARY の順です。新規項目はすべてオフ。キーの欠落・曖昧さは該当状態を更新しません。実行状態・内部 ID・専用パーサーフィールド・スクリプト・任意正規表現は不可。次は正常例と不明な参照で拒否される例です。',
};
const rowExample = JSON.stringify({format:'kaealert-rule-exchange',formatVersion:4,fields:[
  {ref:'device',input:'BODY',label:'Device',separator:'=',columnSeparator:'|',index:1}],
  schedules:[],rules:[{name:'Sample',sourcePackage:null,action:'ALERT',enabled:false,phase:'ORDINARY',
    conditions:[{fieldRef:'device',op:'EQUALS',value:'Q-7'}]}],statefulRules:[]});
const badRowExample = rowExample.replace('"fieldRef":"device"', '"fieldRef":"missing"');

function updateGuide() {
  const localized = guides[currentLanguage()];
  source.value = localized ? localized.replace(/\{(valid|invalid)\}/gu,
    (_, key) => key === 'valid' ? valid : invalid) : korean;
  source.value = rowGuide[currentLanguage()] + '\n' + rowExample + '\n' + badRowExample + '\n\n' + source.value;
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
