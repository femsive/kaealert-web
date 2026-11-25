export const guides = {
  en: String.raw`KAEALert rule and schedule instructions · JSON v1, v2 and v3

Turn a clear, supported request into exactly one JSON object. Omit prose, Markdown fences, comments, duplicate keys and trailing commas. Ask only for missing information. Check the installed app's supported format first. v3 import was verified on Alpha 0.1.5 (8) in the South Korea Google Play closed test. For Play Alpha 7 or earlier, use only the supported v1/v2 format. Use v3 only after confirming app support.

Format and version
- Use "format":"kaealert-rule-exchange" and numeric formatVersion. v1 has format, formatVersion and rule. v2 has format, formatVersion, schedule and optional rule. In v2 schedule.ref and any rule.scheduleRef are both "s1". v1 has no scheduleRef.
- Limits in UTF-8: v1 8 KiB and container depth 4, v2 64 KiB and depth 5, v3 64 KiB and depth 8. The root depth is 1. Use plain integer tokens (no decimal or exponent). Remove BOM, invalid Unicode surrogates and C0/C1 control characters. Condition values may use escaped TAB, LF or CR.

Ordinary rules
- Require name, sourcePackage, action and conditions. name is nonblank, single-line, up to 80 UTF-16 units, with no tabs. sourcePackage is null for a common rule or an exact confirmed package, at most 255 UTF-16 units, with at least two dot-separated parts. Each part starts with an ASCII letter then uses ASCII letters, digits or underscores.
- action is ALERT or SUPPRESS. A non-match makes no decision for this rule. Optional enabled defaults to false. In v1/v2 use true only on an explicit request. Optional match is ALL (default) or ANY.
- conditions has 1–8 distinct objects with field, op and value strings only. field is TITLE, BODY or TITLE_OR_BODY (compare title and body separately). Missing fields compare false and differ from empty strings.
- op is EQUALS, CONTAINS, NOT_CONTAINS or REGEX. TITLE_OR_BODY cannot use NOT_CONTAINS. value is nonblank, up to 256 UTF-16 units for literals or 128 for regex. Preserve case, whitespace, Unicode composition, emoji and line breaks. Use literal comparisons for characters outside the portable regex alphabet.

Schedules
- Require ref, name, zoneId, mode and exactly one applicable detail field. Use UTC or a supported IANA zone such as Asia/Seoul. Schedule names follow rule name limits. enabled is optional and defaults to false.
- EXPLICIT uses intervals, 1–128 nonoverlapping {start,end} objects. Use local YYYY-MM-DDTHH:mm without offsets. End must be later than start. Reject nonexistent or ambiguous times in the selected zone. Start is inclusive and end is exclusive.
- RECURRING uses recurrence with type, startDate, endDate, startTime, endTime and crossesMidnight. Use YYYY-MM-DD (0001–9999) and HH:mm (00:00–23:59). endDate is null or no earlier than startDate. For same-day end use false and endTime > startTime. For next-day end use true and endTime <= startTime. Do not schedule a next-day end beyond the date range.
- DAILY needs only the shared fields. WEEKLY_SELECTED_DAYS adds distinct weekdays from MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY (one or more).
- EVERY_N_DAYS adds integer intervalDays 1–365, anchored at startDate. MONTHLY_DAYS adds distinct selectedDays integers 1–31. Skip a day absent from a month.
- SPECIFIC_DATES adds 1–1,000 distinct selectedDates. Set startDate to the earliest selected date and endDate to null.

Portable regular expressions
- Matching is case-sensitive and partial. Use printable ASCII, precomposed Hangul (U+AC00–U+D7A3) and escaped n, r or t. Escape reserved characters to match them literally. A slash is ordinary text. Double backslashes in JSON. Use no raw tabs or line breaks.
- Allowed classes are [0-9], [A-Z], [a-z], [A-Za-z0-9_]. Use at most four nonempty top-level alternatives with |. One fixed {n} per atom is allowed (1–16 with no leading zero). The expanded length of each alternative is at most 128 units. Whitespace-only patterns are rejected.
- No groups, lookaround, backreferences, wildcard dots, anchors, word boundaries, variable repetition, negated or combined classes, shorthand classes, flags or inline options.

Advanced bundles · v3-compatible apps only
- Require schedules (0–16), rules (0–16), statefulRules (0–8) arrays with at least one item in total. Use distinct refs s1–s16 and link only to schedules inside the document. Omit enabled or use false for every item.
- Preserve rules array order. Optional flowControl is CONTINUE (default) or STOP on a match. A common exclusion is sourcePackage:null, action:"SUPPRESS", flowControl:"STOP". If it wins ordinary precedence, it ends processing without updating counters or waits.
- Each stateful rule requires type, name, sourcePackage (confirmed registered app, never null), conditions, and optional match and exclude. exclude is {conditions,match?} using the same limits. action and flowControl belong only to ordinary rules.
- FIRST_OCCURRENCES requires integer n (0–100), eventKey and scheduleRef. groupKey is optional. It suppresses the first N unique events within the scheduled window. It does not count a repeated event as new.
- RECEPTION_WAIT requires integer seconds (0–86400) and targetKey. scheduleRef is optional. Compare against the last qualifying notification for that target. A qualifying repeat before the boundary is suppressed and restarts the wait. At the boundary, continue to ordinary rules.
- Use a key object {field:"BODY",prefix:"target=",token:"ASCII_TOKEN"} for TITLE or BODY. Split on semicolons and match one prefix at the start of a segment. prefix is 1–32 units without semicolons or controls. ASCII_ALNUM accepts 1–16 ASCII letters or digits. ASCII_TOKEN accepts 1–128 letters, digits, underscores, dots or hyphens. Multiple matching segments or a missing value produce no key. For parsed keys use only {field:"IP"} or {field:"ORIGINAL_EVENT_ID"}, without prefix, token or a custom capture pattern.
- Evaluation order is winning common exclusion → first N → wait by target → ordinary rules. Suppression at first N does not reach the wait stage. Clearing both stages does not guarantee an alarm. Clock reversal or storage failure rolls back uncertain changes and continues ordinary evaluation.

Before answering
Ask about exact scope/package, selected notification fields, conditions and action, schedule dates/time zone and key details as needed. Never guess a package or add unknown fields. Explain requests that cannot be represented, such as changing or deleting existing items, structured ordinary fields, image text or modifying phone settings. Do not omit parts of the request silently. Use synthetic samples. Do not ask for real notifications, internal addresses, account details or private work data.
The Android import preview and save are final. Import is atomic for a v3 bundle. Check duplicates and name conflicts in the app. Free allows five rules in total and three schedules. Adding recurring schedules (including specific dates) requires Pro. Use app backup restore for backup files.

Valid v3 example (wait for the same target and ordinary allow)
{valid}

Rejected v3 example (HALT is not supported)
{invalid}`,
  ja: String.raw`KAEALert ルール・スケジュール生成ガイド · JSON v1・v2・v3

対応する明確な依頼をJSONオブジェクト1つに変換します。前後の説明、Markdownコード枠、コメント、重複キー、末尾のカンマは出力しません。不足する情報だけを確認します。インストール済みアプリの対応形式を先に確認します。韓国のGoogle Playクローズドテスト版Alpha 0.1.5 (8)でv3のインポートを確認しました。Play Alpha 7以前では対応するv1またはv2を使います。v3は対応を確認してから使います。

形式とバージョン
- "format":"kaealert-rule-exchange" と数値のformatVersionを使います。v1の項目はformat、formatVersion、ruleです。v2はformat、formatVersion、schedule、任意のruleです。v2ではschedule.refとrule.scheduleRefに同じ "s1" を使います。v1にscheduleRefはありません。
- UTF-8の上限はv1が8 KiB、v2・v3が64 KiBです。ルートを1とした最大コンテナー深さは順に4・5・8です。整数に小数点や指数表記を使いません。BOM、不正なUnicodeサロゲート、C0/C1制御文字は使用しません。条件値にはTAB・LF・CRをエスケープして指定できます。

通常ルール
- name、sourcePackage、action、conditionsは必須です。nameは空白だけにせず、タブや改行を含まないUTF-16コード単位80以内の文字列にします。共通ルールのsourcePackageはnullです。アプリ別では確認済みのパッケージ名を使います。255 UTF-16コード単位以内で、ドット区切りの部分が2つ以上必要です。各部分はASCII英字で始まり、以降はASCII英数字とアンダースコアだけを使います。
- actionはALERTまたはSUPPRESSです。不一致ならそのルールでは判定しません。enabledは任意で既定値falseです。v1・v2でtrueにするのは明示的に依頼された場合だけです。matchはALL（既定）またはANYです。
- conditionsは1～8件の重複しないオブジェクトで、各項目に文字列のfield、op、valueだけを入れます。fieldはTITLE、BODY、TITLE_OR_BODYです。最後の指定ではタイトルと本文を別々に比較します。値が欠けていれば不一致であり、空文字とは区別します。
- opはEQUALS、CONTAINS、NOT_CONTAINS、REGEXです。TITLE_OR_BODYにはNOT_CONTAINSを使えません。valueは空白だけにせず、通常は256、正規表現は128 UTF-16コード単位以内です。大文字小文字、空白、Unicodeの構成、絵文字、改行はそのまま保持します。正規表現の対応文字以外は文字列比較を使用します。

スケジュール
- ref、name、zoneId、modeとモードに合う詳細項目1つが必須です。UTCまたはAsia/Seoulなど対応するIANAタイムゾーンIDを使います。nameはルール名と同じ制約です。enabledの既定値はfalseです。
- EXPLICITではintervalsに重なりのない {start,end} を1～128件指定します。オフセットなしの現地時刻をYYYY-MM-DDTHH:mmで指定し、終了は開始より後にします。タイムゾーン内に存在しない時刻や2回現れる時刻は使えません。開始を含み、終了は含みません。
- RECURRINGではrecurrenceにtype、startDate、endDate、startTime、endTime、crossesMidnightを指定します。日付はYYYY-MM-DD（0001～9999年）、時刻はHH:mm（00:00～23:59）です。endDateはnullまたは開始日以降です。当日終了はfalseで終了時刻を開始より後にします。翌日終了はtrueで終了時刻を開始以下にします。翌日が対応範囲外になる指定はできません。
- DAILYは共通項目だけを使います。WEEKLY_SELECTED_DAYSではweekdaysにMONDAY、TUESDAY、WEDNESDAY、THURSDAY、FRIDAY、SATURDAY、SUNDAYから重複なしで1件以上指定します。
- EVERY_N_DAYSではintervalDaysに1～365の整数を使い、startDateを基準にします。MONTHLY_DAYSではselectedDaysに1～31の整数を重複なしで入れます。その日が存在しない月ではスキップします。
- SPECIFIC_DATESではselectedDatesに異なる日付を1～1,000件指定します。startDateは最も早い選択日、endDateはnullです。

交換用の正規表現
- 大文字小文字を区別した部分一致です。表示可能なASCII、合成済みハングル（U+AC00～U+D7A3）、n・r・tのエスケープを使えます。予約文字をそのまま探す場合はエスケープします。スラッシュは普通の文字です。バックスラッシュはJSONで二重にし、タブや改行を直接含めません。
- 使用できる文字クラスは[0-9]、[A-Z]、[a-z]、[A-Za-z0-9_]です。最上位の | による選択肢は空を含まず最大4個です。各要素に固定回数 {n} を1つ指定できます。nは先頭0なしの1～16です。展開後の各選択肢は128単位以内で、空白だけを探すパターンは使えません。
- グループ、先読み・後読み、後方参照、ワイルドカード、アンカー、単語境界、可変回数、否定・結合文字クラス、短縮文字クラス、フラグ、インラインオプションは使えません。

高度なまとめ · v3対応アプリ専用
- schedules（0～16件）、rules（0～16件）、statefulRules（0～8件）の配列が必須で、合計1件以上必要です。異なるs1～s16をrefに使い、同じ文書内のスケジュールだけを参照します。各enabledは省略するかfalseです。
- rules配列の順序を維持します。flowControlは任意で、CONTINUE（既定）または一致時にSTOPです。共通除外はsourcePackage:null、action:"SUPPRESS"、flowControl:"STOP"で表します。通常の優先順で最終判定になれば、件数と待機状態を更新しません。
- 状態を持つルールではtype、name、sourcePackage（登録済みの正確なアプリ、null不可）、conditionsが必須です。matchとexcludeは任意です。excludeは同じ条件制約の {conditions,match?} です。actionとflowControlは通常ルール専用です。
- FIRST_OCCURRENCESではn（整数0～100）、eventKey、scheduleRefが必須で、groupKeyは任意です。スケジュールの有効時間内で最初のN個の一意なイベントを抑制します。繰り返し届く同じイベントを新規には数えません。
- RECEPTION_WAITではseconds（整数0～86400）、targetKeyが必須で、scheduleRefは任意です。同じ対象で最後に条件を満たした通知から計測します。境界より前の適格な通知は抑制され、待機基準時刻が更新されます。境界に達したら通常判定に進みます。
- キーには {field:"BODY",prefix:"target=",token:"ASCII_TOKEN"} のようにTITLEまたはBODYを指定できます。セミコロンで区切った各項目の先頭で接頭辞を照合します。prefixはセミコロンと制御文字を除いた1～32単位です。ASCII_ALNUMはASCII英数字1～16文字、ASCII_TOKENはASCII英数字・アンダースコア・ピリオド・ハイフン1～128文字です。複数項目が一致するか値がなければキーを抽出できません。解析済みキーは {field:"IP"} または {field:"ORIGINAL_EVENT_ID"} だけを使い、prefix、token、独自キャプチャは付けません。
- 評価順は最終判定となる共通除外 → 最初のN件 → 対象別待機 → 通常ルールです。最初のN件で抑制した場合は待機を更新しません。両方の段階を通過しても通常ルールが最終判定します。時計の逆行または保存失敗時は今回の状態変更を取り消し、通常判定を続けます。

回答前の確認
必要に応じて範囲、正確なパッケージ、対象項目、条件と動作、日時とタイムゾーン、キーを確認します。パッケージを推測せず、未対応項目を追加しません。既存項目の変更や削除、通常条件での構造化項目、画像内文字、端末設定など表現できない依頼は理由を説明します。依頼の一部を黙って省略しません。架空の例を使用し、実際の通知本文、内部アドレス、アカウント情報や業務の機密情報を求めません。
最終確認はAndroidアプリのプレビューと保存です。v3はまとめ全体を一括で追加します。重複と名前の競合はアプリで確認します。Freeはルール合計5件とスケジュール3件です。特定の日付を含む繰り返しの追加にはProが必要です。バックアップファイルはアプリのバックアップ復元で使用します。

有効なv3の例（対象別待機と通常の許可）
{valid}

拒否するv3の例（HALTは未対応）
{invalid}`,
};
