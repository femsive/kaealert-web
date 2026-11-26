// A bounded substring matcher shared in meaning with Android's TextPattern.
const SPACE = -1, LINE = -2, ANY = -3, DIGIT = -4, DIGITS = -5, OPTIONAL_DIGIT = -6;
const fold = code => code >= 65 && code <= 90 ? code + 32 : code;
function requirePattern(ok) {
  if (!ok) throw new RangeError('TEXT_PATTERN');
}

export function compileTextPattern(value) {
  requirePattern(typeof value === 'string' && value.length > 0 && value.length <= 1536);
  const alternatives = [];
  let terms = [], tokens = [];
  function endTerm() {
    requirePattern(tokens.length <= 256 && terms.length < 4 && tokens.some(t => t >= 0 || t === DIGIT));
    terms.push(tokens);
    tokens = [];
  }
  function endBranch() {
    endTerm();
    requirePattern(alternatives.length < 32);
    alternatives.push(terms);
    terms = [];
  }
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '\\') {
      requirePattern(i + 1 < value.length && '\\|&~*#'.includes(value[++i]));
      tokens.push(fold(value.charCodeAt(i)));
    } else if (c === '|') endBranch();
    else if (c === '&') endTerm();
    else if (c === '~') tokens.push(SPACE);
    else if (c === '*') {
      if (value[i + 1] === '*') { tokens.push(ANY); i++; }
      else tokens.push(LINE);
    } else if (c === '#') {
      tokens.push(DIGIT);
      if (value[i + 1] === '+') { tokens.push(DIGITS); i++; }
      else if (value[i + 1] === '3') { tokens.push(OPTIONAL_DIGIT, OPTIONAL_DIGIT); i++; }
    } else {
      const code = value.charCodeAt(i);
      requirePattern(code >= 32 && !(code >= 127 && code <= 159));
      tokens.push(fold(code));
    }
  }
  endBranch();
  return input => input.length <= 65_536 && alternatives.some(branch => branch.every(term => find(term, input)));
}

function positions(length) {
  return { active: [], seen: new Uint8Array(length + 1) };
}
function add(state, i, tokens) {
  while (!state.seen[i]) {
    state.seen[i] = 1;
    state.active.push(i);
    if (i === tokens.length || tokens[i] >= 0 || tokens[i] === DIGIT) break;
    i++;
  }
}
function find(tokens, input) {
  let active = positions(tokens.length), next = positions(tokens.length);
  for (let n = 0; n < input.length; n++) {
    add(active, 0, tokens);
    const code = input.charCodeAt(n);
    const digit = code >= 48 && code <= 57;
    for (const i of active.active) {
      const t = tokens[i];
      let dest = i;
      if (t === SPACE) { if (code !== 32 && !(code >= 9 && code <= 13)) continue; }
      else if (t === LINE) { if ([10, 13, 133, 8232, 8233].includes(code)) continue; }
      else if (t === DIGITS) { if (!digit) continue; }
      else if (t !== ANY) {
        if ((t === DIGIT || t === OPTIONAL_DIGIT) ? !digit : t !== fold(code)) continue;
        dest++;
      }
      add(next, dest, tokens);
      if (next.seen[tokens.length]) return true;
    }
    for (const i of active.active) active.seen[i] = 0;
    active.active.length = 0;
    [active, next] = [next, active];
  }
  return false;
}
