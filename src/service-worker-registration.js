const APP_BUILD = '2026.10.10-life-v32';
const BUILD_KEY = 'life-manager:active-build';
const RESET_KEY = `life-manager:reset:${APP_BUILD}`;

async function clearLegacyRuntime() {
  if (sessionStorage.getItem(RESET_KEY) === 'done') return;
  sessionStorage.setItem(RESET_KEY, 'done');

  const previousBuild = localStorage.getItem(BUILD_KEY);
  if (previousBuild === APP_BUILD) return;

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const scope = new URL('./', window.location.href).href;
    await Promise.all(registrations.filter((registration) => registration.scope === scope).map((registration) => registration.unregister()));
  }
  if ('caches' in globalThis) {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('life-manager-'))
      .map((name) => caches.delete(name)));
  }
  localStorage.setItem(BUILD_KEY, APP_BUILD);

  const url = new URL(window.location.href);
  if (url.searchParams.get('app-build') !== APP_BUILD) {
    url.searchParams.set('app-build', APP_BUILD);
    window.location.replace(url.href);
    await new Promise(() => {});
  }
}

async function registerCurrentWorker() {
  if (!('serviceWorker' in navigator)) return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const registration = await navigator.serviceWorker.register(
    `./service-worker.js?app-build=${encodeURIComponent(APP_BUILD)}`,
    { type: 'module', scope: './', updateViaCache: 'none' },
  );
  await registration.update();
}

window.addEventListener('load', async () => {
  try {
    await clearLegacyRuntime();
    await registerCurrentWorker();
  } catch (error) {
    console.error('서비스 워커 갱신 실패', error);
  }
});
