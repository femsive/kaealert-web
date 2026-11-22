export function bindCopy(button, source, report, { version = () => 0 } = {}) {
  let attempt = 0;
  button.addEventListener('click', async () => {
    const text = source.value;
    if (button.disabled || !text) return;
    const ticket = ++attempt;
    const originalVersion = version();
    const current = () => ticket === attempt && !button.disabled && source.value === text && version() === originalVersion;
    try {
      await navigator.clipboard.writeText(text);
      if (current()) report(true);
    } catch {
      if (!current()) return;
      source.focus();
      source.select();
      report(false);
    }
  });
}
