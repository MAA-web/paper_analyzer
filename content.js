function injectScript(file) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(file);
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load ' + file));
    document.head.appendChild(script);
  });
}

const DEFAULT_SETTINGS = {
  fetchDelayMs: 8000,
  cooldownMs: 10 * 60 * 1000,
  batchSize: 5,
};
const PAGE_SETTINGS_KEY = 'paperAnalyzer:settings';

async function getStoredSettings() {
  const data = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return {
    fetchDelayMs: Math.max(0, Number(data.fetchDelayMs) || DEFAULT_SETTINGS.fetchDelayMs),
    cooldownMs: Math.max(0, Number(data.cooldownMs) || DEFAULT_SETTINGS.cooldownMs),
    batchSize: Math.max(0, Math.floor(Number(data.batchSize) || DEFAULT_SETTINGS.batchSize)),
  };
}

function syncSettingsToPage(settings) {
  const next = {
    fetchDelayMs: Math.max(
      0,
      Number(settings?.fetchDelayMs) || DEFAULT_SETTINGS.fetchDelayMs
    ),
    cooldownMs: Math.max(
      0,
      Number(settings?.cooldownMs) || DEFAULT_SETTINGS.cooldownMs
    ),
    batchSize: Math.max(
      0,
      Math.floor(Number(settings?.batchSize) || DEFAULT_SETTINGS.batchSize)
    ),
  };
  let existing = {};
  try {
    existing = JSON.parse(localStorage.getItem(PAGE_SETTINGS_KEY) || '{}') || {};
  } catch {
    existing = {};
  }
  localStorage.setItem(
    PAGE_SETTINGS_KEY,
    JSON.stringify({ ...existing, ...next })
  );
  return next;
}

async function injectAnalyzerStack() {
  const alreadyLoaded = await new Promise((resolve) => {
    const id = 'pa-probe-' + Math.random().toString(36).slice(2);
    const onMsg = (event) => {
      if (event.source !== window) return;
      if (event.data && event.data.type === 'PA_CORE_PROBE' && event.data.id === id) {
        window.removeEventListener('message', onMsg);
        resolve(!!event.data.loaded);
      }
    };
    window.addEventListener('message', onMsg);
    const script = document.createElement('script');
    script.textContent =
      'window.postMessage({type:"PA_CORE_PROBE",id:"' +
      id +
      '",loaded:!!window.__PAPER_ANALYZER_CORE__},"*");';
    document.documentElement.appendChild(script);
    script.remove();
    setTimeout(() => {
      window.removeEventListener('message', onMsg);
      resolve(false);
    }, 400);
  });

  if (alreadyLoaded) return;

  if (!window.__PAPER_ANALYZER_STACK_LOADING__) {
    window.__PAPER_ANALYZER_STACK_LOADING__ = true;
    try {
      await injectScript('analyzer.js');
      await injectScript('panel.js');
    } finally {
      window.__PAPER_ANALYZER_STACK_LOADING__ = false;
    }
  }
}

function postToPage(payload) {
  window.postMessage({ type: 'FROM_EXTENSION', ...payload }, '*');
}

function hasPendingJobInPageStorage() {
  try {
    const userId = new URLSearchParams(location.search).get('user') || '';
    const key = userId
      ? 'paperAnalyzer:job:' + userId
      : 'paperAnalyzer:job:anon:' + location.origin + location.pathname;
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const job = JSON.parse(raw);
    const papers = job.papers || [];
    if (papers.length) {
      return papers.some(
        (p) =>
          p.status === 'pending' ||
          p.status === 'failed' ||
          p.status === 'rate_limited'
      );
    }
    return (
      job &&
      job.status === 'in_progress' &&
      Array.isArray(job.queue) &&
      Array.isArray(job.completed)
    );
  } catch {
    return false;
  }
}

async function resolveSettings(options = {}) {
  if (options.settings) return syncSettingsToPage(options.settings);
  if (
    options.fetchDelayMs != null ||
    options.cooldownMs != null ||
    options.batchSize != null
  ) {
    const stored = await getStoredSettings();
    return syncSettingsToPage({ ...stored, ...options });
  }
  return syncSettingsToPage(await getStoredSettings());
}

async function startWorkspace(options = {}) {
  const settings = await resolveSettings(options);
  await injectAnalyzerStack();
  postToPage({
    action: 'openWorkspace',
    autoScan: options.autoScan !== false,
    autoFetchMissing: !!options.autoFetchMissing,
    importJson: options.importJson || null,
    settings,
    fetchDelayMs: settings.fetchDelayMs,
  });
  return { status: 'Workspace opened', ...settings };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const run = async () => {
    if (request.action === 'setFetchDelay') {
      const settings = await resolveSettings(request);
      postToPage({
        action: 'setFetchDelay',
        settings,
        fetchDelayMs: settings.fetchDelayMs,
      });
      return { status: 'Settings updated', ...settings };
    }
    if (
      request.action === 'analyzePapers' ||
      request.action === 'openWorkspace'
    ) {
      return startWorkspace({
        autoScan: request.autoScan !== false,
        autoFetchMissing: !!request.autoFetchMissing,
        importJson: request.importJson || null,
        settings: request.settings,
        fetchDelayMs: request.fetchDelayMs,
        cooldownMs: request.cooldownMs,
        batchSize: request.batchSize,
      });
    }
    if (request.action === 'importJson' && request.importJson) {
      await resolveSettings(request);
      await injectAnalyzerStack();
      postToPage({ action: 'importJson', importJson: request.importJson });
      return { status: 'JSON imported' };
    }
    return { status: 'Unknown action' };
  };

  run()
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ status: err.message || String(err) }));
  return true;
});

if (hasPendingJobInPageStorage()) {
  const resume = () => {
    startWorkspace({ autoScan: false }).catch((err) =>
      console.error('Paper Analyzer auto-resume failed:', err)
    );
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(resume, 1500));
  } else {
    setTimeout(resume, 1500);
  }
}
