export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export function duration(value = 0) {
  const n = Math.round(value * 100) / 100;
  if (n === 0) return '0분';
  if (n < 1) return `${Math.round(n * 60)}초`;
  const h = Math.floor(n / 60), m = Math.round(n % 60 * 10) / 10;
  return [h ? `${h}시간` : '', m ? `${m}분` : ''].filter(Boolean).join(' ');
}
export const number = n => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(n);
export const empty = (title, body = '') => `<div class="empty"><strong>${esc(title)}</strong>${body ? `<p>${esc(body)}</p>` : ''}</div>`;
export const button = (label, action, id = '', cls = 'secondary') => `<button class="${cls}" data-action="${esc(action)}" data-id="${esc(id)}">${esc(label)}</button>`;
export const progress = (value, label) => `<progress max="100" value="${Math.min(100,Math.max(0,value))}" aria-label="${esc(label)}"></progress>`;
export const option = (value, label, selected) => `<option value="${esc(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`;
export const input = (label, name, value = '', type = 'text', attributes = '') => `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${attributes}></label>`;
export const textarea = (label, name, value = '', attrs = '') => `<label>${esc(label)}<textarea name="${name}" rows="2" maxlength="3000" ${attrs}>${esc(value)}</textarea></label>`;
export const checkbox = (label, name, checked = false, value = 'yes') => `<label class="check"><input type="checkbox" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}>${esc(label)}</label>`;
