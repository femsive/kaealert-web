import { messages } from './messages.mjs';
import { pageStrings } from './page-strings.mjs';
import { chooseLanguage, storageKey, translate, translateError } from './locale.mjs';

const originals = new WeakMap();
const live = new WeakMap();
const selector = document.querySelector('#site-language');
let saved;
try { saved = localStorage.getItem(storageKey); } catch { /* Storage may be unavailable. */ }
let language = chooseLanguage(saved, navigator.languages?.length ? navigator.languages : [navigator.language]);
export const t = (key, values) => translate(language, key, values);
export const errorText = message => translateError(language, message);
export const currentLanguage = () => language;

function localizedSource(source) {
  const key = source.trim();
  if (!Object.hasOwn(pageStrings, key) && !Object.hasOwn(messages, key)) return source;
  const text = t(key);
  const leading = source.match(/^\s*/u)[0];
  const trailing = source.match(/\s*$/u)[0];
  return leading + text + trailing;
}

/** Translate the page and cloned form templates in place, preserving control values and focus. */
export function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (!originals.has(root)) originals.set(root, root.data);
    const text = localizedSource(originals.get(root));
    if (text !== root.data) root.data = text;
    return;
  }
  if (root.nodeType === Node.ELEMENT_NODE) {
    if (root.matches('textarea, pre, script, style, [data-user-text]')) {
      if (!root.matches('textarea')) return;
    }
    if (!originals.has(root)) {
      const names = ['aria-label', 'placeholder', 'title'];
      if (root.matches('meta[name=description]')) names.push('content');
      originals.set(root, names.filter(name => root.hasAttribute(name)).map(name => [name, root.getAttribute(name)]));
    }
    for (const [name, source] of originals.get(root)) {
      if (!live.get(root)?.has(name)) root.setAttribute(name, localizedSource(source));
    }
    if (root.matches('textarea') || live.get(root)?.has('')) return;
    if (root.matches('template')) return;
  }
  for (const node of root.childNodes) translateTree(node);
}

export function localize(element, render, attribute = '') {
  const fields = live.get(element) ?? new Map();
  fields.set(attribute, render);
  live.set(element, fields);
  element.dataset.liveI18n = '';
  renderValue(element, attribute, render);
}

function renderValue(element, attribute, render) {
  if (attribute) element.setAttribute(attribute, render());
  else element.textContent = render();
}

function apply() {
  document.documentElement.lang = language;
  selector.value = language;
  translateTree(document.documentElement);
  for (const element of document.querySelectorAll('[data-live-i18n]')) {
    for (const [attribute, render] of live.get(element) ?? []) renderValue(element, attribute, render);
  }
  document.dispatchEvent(new Event('kaealert-language-change'));
}

selector.addEventListener('change', () => {
  language = chooseLanguage(selector.value, []);
  try { localStorage.setItem(storageKey, language); } catch { /* This page still uses the choice. */ }
  apply();
});
apply();
