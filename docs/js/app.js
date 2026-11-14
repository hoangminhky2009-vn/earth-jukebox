// Written by Ky with help from Claude (SI). See AI_USE.md.
// Generic helpers for an accessible page. Contains no challenge logic.

const live = document.getElementById('live');

/** Read text aloud through screen readers (polite live region). */
export function announce(text) {
  live.textContent = '';
  // Small delay so repeated identical messages are still announced.
  setTimeout(() => { live.textContent = text; }, 50);
}

function loadSetting(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1'; }
  catch { return fallback; }
}
function saveSetting(key, on) {
  try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* storage blocked: ignore */ }
}

function bindToggle(inputId, className, key, fallback) {
  const input = document.getElementById(inputId);
  const apply = (on) => { document.documentElement.classList.toggle(className, on); input.checked = on; };
  apply(loadSetting(key, fallback));
  input.addEventListener('change', () => {
    apply(input.checked);
    saveSetting(key, input.checked);
    announce(`${input.parentElement.textContent.trim()} ${input.checked ? 'on' : 'off'}`);
  });
}

bindToggle('opt-contrast', 'high-contrast', 'opt-contrast', false);
bindToggle('opt-motion', 'reduce-motion', 'opt-motion',
  window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// Browsers only allow audio after a user gesture: start everything from this button.
document.getElementById('start-btn').addEventListener('click', () => {
  announce('Started');
});
