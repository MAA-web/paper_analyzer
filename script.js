const DEFAULT_FETCH_DELAY_MS = 8000;
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 5;

const PRESETS = {
  normal: { fetchDelayMs: 8000, cooldownMs: 10 * 60 * 1000, batchSize: 5 },
  safe: { fetchDelayMs: 15000, cooldownMs: 15 * 60 * 1000, batchSize: 3 },
  paranoid: { fetchDelayMs: 30000, cooldownMs: 30 * 60 * 1000, batchSize: 2 },
};

function isScholarCitationsUrl(url) {
  if (!url) return false;
  try {
    const { hostname, pathname } = new URL(url);
    const hostOk = /^scholar\.google(\.[a-z0-9-]+)+$/i.test(hostname);
    const pathOk = pathname === '/citations' || pathname.startsWith('/citations/');
    return hostOk && pathOk;
  } catch {
    return false;
  }
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text || '';
}

function readSettingsFromInputs() {
  const delaySec = Number(document.getElementById('fetchDelaySec').value);
  const cooldownMin = Number(document.getElementById('cooldownMin').value);
  const batchSize = Number(document.getElementById('batchSize').value);

  return {
    fetchDelayMs: Number.isFinite(delaySec) && delaySec >= 0
      ? Math.round(delaySec * 1000)
      : DEFAULT_FETCH_DELAY_MS,
    cooldownMs: Number.isFinite(cooldownMin) && cooldownMin >= 0
      ? Math.round(cooldownMin * 60 * 1000)
      : DEFAULT_COOLDOWN_MS,
    batchSize: Number.isFinite(batchSize) && batchSize >= 0
      ? Math.floor(batchSize)
      : DEFAULT_BATCH_SIZE,
  };
}

function writeSettingsToInputs(settings) {
  document.getElementById('fetchDelaySec').value = String(
    (settings.fetchDelayMs ?? DEFAULT_FETCH_DELAY_MS) / 1000
  );
  document.getElementById('cooldownMin').value = String(
    (settings.cooldownMs ?? DEFAULT_COOLDOWN_MS) / 60000
  );
  document.getElementById('batchSize').value = String(
    settings.batchSize ?? DEFAULT_BATCH_SIZE
  );
}

async function loadSettings() {
  const data = await chrome.storage.local.get({
    fetchDelayMs: DEFAULT_FETCH_DELAY_MS,
    cooldownMs: DEFAULT_COOLDOWN_MS,
    batchSize: DEFAULT_BATCH_SIZE,
  });
  writeSettingsToInputs(data);
  return data;
}

async function saveSettings(settings) {
  const payload = {
    fetchDelayMs: Math.max(0, Number(settings.fetchDelayMs) || 0),
    cooldownMs: Math.max(0, Number(settings.cooldownMs) || 0),
    batchSize: Math.max(0, Math.floor(Number(settings.batchSize) || 0)),
  };
  await chrome.storage.local.set(payload);
  return payload;
}

async function getActiveScholarTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!isScholarCitationsUrl(tab?.url)) {
    throw new Error(
      'Open a Google Scholar citations page first (…/citations?user=…).'
    );
  }
  return tab;
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve({ ok: true, response });
      }
    });
  });
}

async function injectStack(tabId) {
  const probe = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => !!window.__PAPER_ANALYZER_CORE__,
  });
  const alreadyLoaded = !!(probe && probe[0] && probe[0].result);
  if (!alreadyLoaded) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['analyzer.js'],
      world: 'MAIN',
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['panel.js'],
      world: 'MAIN',
    });
  }
}

async function ensureAndMessage(message) {
  const settings = await saveSettings(readSettingsFromInputs());
  const tab = await getActiveScholarTab();
  const payload = { ...message, ...settings, settings };

  let result = await sendTabMessage(tab.id, payload);
  if (!result.ok) {
    await injectStack(tab.id);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: (msg) => {
        if (typeof applyAnalyzerSettings === 'function' && msg.settings) {
          applyAnalyzerSettings(msg.settings);
        } else if (typeof setFetchDelayMs === 'function' && typeof msg.fetchDelayMs === 'number') {
          setFetchDelayMs(msg.fetchDelayMs);
        } else if (msg.settings) {
          localStorage.setItem('paperAnalyzer:settings', JSON.stringify(msg.settings));
        }
        window.postMessage({ type: 'FROM_EXTENSION', ...msg }, '*');
      },
      args: [payload],
    });
    result = { ok: true, response: { status: 'Injected and started' } };
  }
  return result;
}

async function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  writeSettingsToInputs(preset);
  await saveSettings(preset);
  setStatus(
    `${name[0].toUpperCase()}${name.slice(1)}: ${preset.fetchDelayMs / 1000}s delay, ${
      preset.cooldownMs / 60000
    }m cooldown, batch ${preset.batchSize}`
  );
  try {
    const tab = await getActiveScholarTab();
    await sendTabMessage(tab.id, {
      action: 'setFetchDelay',
      settings: preset,
      fetchDelayMs: preset.fetchDelayMs,
    });
  } catch {
    // not on Scholar
  }
}

document.getElementById('presetSafe').addEventListener('click', () => applyPreset('safe'));
document.getElementById('presetParanoid').addEventListener('click', () =>
  applyPreset('paranoid')
);
document.getElementById('presetNormal').addEventListener('click', () =>
  applyPreset('normal')
);

document.getElementById('saveDelayBtn').addEventListener('click', async () => {
  try {
    const settings = await saveSettings(readSettingsFromInputs());
    setStatus(
      `Saved: ${settings.fetchDelayMs / 1000}s delay, ${
        settings.cooldownMs / 60000
      }m cooldown, batch ${settings.batchSize}`
    );
    try {
      const tab = await getActiveScholarTab();
      await sendTabMessage(tab.id, {
        action: 'setFetchDelay',
        settings,
        fetchDelayMs: settings.fetchDelayMs,
      });
    } catch {
      // Not on Scholar — storage save is enough
    }
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById('openBtn').addEventListener('click', async () => {
  try {
    setStatus('Opening workspace…');
    await ensureAndMessage({
      action: 'openWorkspace',
      autoScan: true,
      autoFetchMissing: false,
    });
    setStatus('Workspace opened on the Scholar tab.');
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById('scanFetchBtn').addEventListener('click', async () => {
  try {
    setStatus('Opening workspace…');
    await ensureAndMessage({
      action: 'openWorkspace',
      autoScan: true,
      autoFetchMissing: false,
    });
    setStatus('Select a small batch, then Fetch selected.');
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById('jsonFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;

  try {
    setStatus('Reading JSON…');
    const text = await file.text();
    const importJson = JSON.parse(text);
    await ensureAndMessage({
      action: 'importJson',
      importJson,
      autoScan: false,
    });
    await ensureAndMessage({
      action: 'openWorkspace',
      autoScan: false,
      importJson,
    });
    setStatus('JSON loaded into the on-page workspace.');
  } catch (error) {
    setStatus('JSON load failed: ' + error.message);
  }
});

loadSettings().catch(() => {});
