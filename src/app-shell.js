const views = ['dashboard', 'record', 'budget', 'goals', 'history', 'statistics', 'categories'];
const titles = {
  dashboard: '대시보드',
  record: '시간기록',
  budget: '시간예산',
  goals: '목표설정',
  history: '기록 내역',
  statistics: '통계',
  categories: '앱 설정',
};

let activeView = 'dashboard';
let statisticsMode = 'weekly';

function syncGoalStatistics() {
  const panel = document.querySelector('#life-statistics');
  if (!panel) return;
  const visible = activeView === 'statistics' && statisticsMode === 'goals';
  panel.hidden = !visible;
  panel.classList.toggle('hidden', !visible);
}

function setSidebarOpen(open) {
  const sidebar = document.querySelector('.sidebar');
  const menu = document.querySelector('#mobile-menu');
  sidebar?.classList.toggle('open', Boolean(open));
  menu?.setAttribute('aria-expanded', String(Boolean(open)));
}

function ensureViewFeedback(name) {
  const root = document.querySelector(`#${name}-view`);
  if (!root || root.childElementCount > 0 || root.textContent.trim()) return;
  root.innerHTML = '<div class="view-loading" role="status" aria-live="polite">불러오는 중…</div>';
}

function switchView(name, { save = true, force = false, closeSidebar = true } = {}) {
  const safe = name === 'history' ? 'record' : views.includes(name) ? name : 'dashboard';
  const alreadyVisible = activeView === safe
    && !document.querySelector(`#${safe}-view`)?.classList.contains('hidden');
  if (alreadyVisible && !force) {
    if (closeSidebar) setSidebarOpen(false);
    return false;
  }

  ensureViewFeedback(safe);
  views.forEach((view) => document.querySelector(`#${view}-view`)?.classList.toggle('hidden', (view === 'history' ? 'record' : view) !== safe));
  document.querySelectorAll('[data-life-view]').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.lifeView !== safe));
  document.querySelectorAll('.nav-button').forEach((button) => {
    const selected = button.dataset.view === safe;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-current', selected ? 'page' : 'false');
  });
  const title = document.querySelector('#page-title');
  if (title) title.textContent = titles[safe] || '대시보드';
  if (closeSidebar) setSidebarOpen(false);
  activeView = safe;
  syncGoalStatistics();
  if (save) {
    document.dispatchEvent(new CustomEvent('weekly-time-budget:save-ui-state', {
      detail: { activeView: safe },
    }));
  }
  document.dispatchEvent(new CustomEvent('weekly-time-budget:view-changed', {
    detail: { view: safe },
  }));
  return true;
}

document.addEventListener('click', (event) => {
  const menuButton = event.target.closest?.('#mobile-menu');
  if (menuButton) {
    event.preventDefault();
    const sidebar = document.querySelector('.sidebar');
    setSidebarOpen(!sidebar?.classList.contains('open'));
    return;
  }

  const button = event.target.closest?.('.nav-button[data-view]');
  if (!button) {
    if (!event.target.closest?.('.sidebar')) setSidebarOpen(false);
    return;
  }
  event.preventDefault();
  switchView(button.dataset.view);
});

document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest?.('.sidebar, #mobile-menu')) setSidebarOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setSidebarOpen(false);
});

document.addEventListener('weekly-time-budget:statistics-mode-changed', (event) => {
  statisticsMode = event.detail?.mode || 'weekly';
  syncGoalStatistics();
});

document.addEventListener('weekly-time-budget:ui-state-restored', (event) => {
  statisticsMode = event.detail?.statistics?.mode || 'weekly';
  syncGoalStatistics();
});

document.addEventListener('weekly-time-budget:shell-state', (event) => {
  switchView(event.detail?.activeView || activeView, { save: false, closeSidebar: false });
});

export { switchView };
