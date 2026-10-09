import { toDateKey } from './domain.js';
import { MANUAL_INPUT_MODES, createManualDurationEntry } from './manual-entry.js';
import { categoryDisplayName } from './goal-domain.js';
import { filterCategoriesActiveOnDate, isCategoryActiveOnDate } from './category-effective-date.js';

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

let model = {
  categories: [],
  activeRecordTab: 'timer',
  manualInputMode: MANUAL_INPUT_MODES.DURATION,
  manualCategoryId: '',
  onSaveEntry: null,
  onUiChange: null,
};

function categoryOptionHtml({ date, selectedId = '' }) {
  return filterCategoriesActiveOnDate(model.categories, date)
    .map((category) => `<option value="${category.id}" ${category.id === selectedId ? 'selected' : ''}>${escapeHtml(categoryDisplayName(category))}</option>`)
    .join('');
}

function timerHost() {
  return '<div data-persistent-timer-host aria-live="polite"></div>';
}

function manualForm() {
  const now = new Date();
  return `<form id="manual-form" class="form-grid" novalidate>
    <label>대분류<select id="manual-category" required><option value="">선택하세요</option>${categoryOptionHtml({ date: toDateKey(now), selectedId: model.manualCategoryId })}</select></label>
    <label>날짜<input id="manual-date" type="date" value="${toDateKey(now)}" required></label>
    <label>기록할 시간(분)<input id="manual-duration" type="number" min="1" max="1440" step="1" inputmode="numeric" autocomplete="off" required></label>
    <label>메모(선택)<textarea id="manual-note" rows="2"></textarea></label>
    <button class="primary-button" type="submit">기록 저장</button>
  </form>`;
}

function updateUi(patch) {
  Object.assign(model, patch);
  model.onUiChange?.({
    activeRecordTab: model.activeRecordTab,
    manualInputMode: model.manualInputMode,
    manualCategoryId: model.manualCategoryId,
  });
}

function refreshManualCategoryOptions() {
  const select = $('#manual-category');
  const date = $('#manual-date')?.value;
  if (!select || !date) return;
  const selectedId = select.value;
  select.innerHTML = `<option value="">선택하세요</option>${categoryOptionHtml({ date, selectedId })}`;
  if (![...select.options].some((option) => option.value === selectedId)) {
    select.value = '';
    updateUi({ manualCategoryId: '' });
  }
}

function bindManual() {
  $('#manual-date')?.addEventListener('change', refreshManualCategoryOptions);

  const form = $('#manual-form');
  if (!form) return;
  form.onsubmit = async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    const categoryId = $('#manual-category').value;
    const date = $('#manual-date').value;
    if (!categoryId) return alert('대분류를 선택하세요.');
    if (!date) return alert('날짜를 선택하세요.');
    const category = model.categories.find((item) => item.id === categoryId);
    if (!category || !isCategoryActiveOnDate(category, date)) {
      alert('이 대분류는 추가일 이전 날짜에 기록할 수 없습니다.');
      refreshManualCategoryOptions();
      return;
    }

    updateUi({ manualCategoryId: categoryId });
    try {
      const entry = createManualDurationEntry({
        categoryId,
        date,
        note: $('#manual-note').value,
        durationMinutes: $('#manual-duration').value,
      });
      submit.disabled = true;
      await model.onSaveEntry?.(entry, { onLocalSaved: () => { if (form.isConnected) renderRecord(); } });
    } catch (error) {
      if (!/오프라인 저장소|기기에 기록/.test(String(error.message || error))) {
        alert(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (submit.isConnected) submit.disabled = false;
    }
  };
}

function renderRecord() {
  const root = $('#record-view');
  if (!root) return;
  root.innerHTML = `<div class="tabs"><button class="tab-button ${model.activeRecordTab === 'timer' ? 'active' : ''}" data-record-tab="timer">타이머</button><button class="tab-button ${model.activeRecordTab === 'manual' ? 'active' : ''}" data-record-tab="manual">수동 입력</button></div><div class="card">${model.activeRecordTab === 'timer' ? timerHost() : manualForm()}</div>`;
  root.querySelectorAll('[data-record-tab]').forEach((button) => {
    button.onclick = () => {
      updateUi({ activeRecordTab: button.dataset.recordTab });
      renderRecord();
    };
  });
  if (model.activeRecordTab === 'manual') bindManual();
}

document.addEventListener('weekly-time-budget:record-state', (event) => {
  model = {
    ...model,
    categories: Array.isArray(event.detail?.categories) ? event.detail.categories : [],
    activeRecordTab: event.detail?.activeRecordTab || 'timer',
    manualInputMode: MANUAL_INPUT_MODES.DURATION,
    manualCategoryId: event.detail?.manualCategoryId || '',
    onSaveEntry: event.detail?.onSaveEntry,
    onUiChange: event.detail?.onUiChange,
  };
  renderRecord();
});
