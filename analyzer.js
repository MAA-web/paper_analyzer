if (window.__PAPER_ANALYZER_CORE__) { /* reinjection OK: vars/functions may redefine */ }
window.__PAPER_ANALYZER_CORE__ = true;
async function getPaperLinks_data(key, paper_link) {
  let year_ciation_counts = {};
  let paperTitle = key;
  // Always fetch same-origin (e.g. .com.pk page must not hit .com links — CORS)
  const fetchUrl = rewriteScholarLinkToCurrentHost(paper_link);
  console.log('Fetching paper link:', fetchUrl);

  try {
    const response = await fetch(fetchUrl, { credentials: 'include' });

    if (response.status === 429 || response.status === 503) {
      return {
        title: key,
        key,
        link: fetchUrl,
        citations: {},
        ok: false,
        error: 'rate_limited',
        statusCode: response.status,
      };
    }

    if (!response.ok) {
      return {
        title: key,
        key,
        link: fetchUrl,
        citations: {},
        ok: false,
        error: 'fetch_failed',
        statusCode: response.status,
        message: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();

    if (
      /unusual traffic|detected unusual|not a robot|captcha|sorry[\s\S]{0,80}google scholar/i.test(
        html
      )
    ) {
      return {
        title: key,
        key,
        link: fetchUrl,
        citations: {},
        ok: false,
        error: 'rate_limited',
        message: 'Google Scholar rate limit / captcha page',
      };
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    let titleElement = doc.querySelector(
      '#gsc_oci_title a, .gsc_oci_title a, #gsc_oci_title, h1.gsc_oci_title, h1'
    );
    if (!titleElement) {
      const pageTitle = doc.querySelector('title');
      if (pageTitle) {
        let titleText = pageTitle.innerText;
        titleText = titleText.replace(/\s*-\s*Google Scholar.*$/i, '').trim();
        if (titleText && titleText !== 'View article') {
          paperTitle = titleText;
        }
      }
    } else {
      paperTitle = titleElement.innerText.trim();
    }

    if (!paperTitle || paperTitle === 'View article' || paperTitle.length < 3) {
      paperTitle = key;
    }

    // Zero-citation papers often have no graph bars — still a valid detail page
    const looksLikePaperPage = !!(
      doc.querySelector(
        '#gsc_oci_title, .gsc_oci_title, #gsc_oci_table, #gsc_oci_graph_bars, #gsc_oci_cby, .gsc_oci_value, #gsc_vcd'
      )
    );
    if (!looksLikePaperPage) {
      return {
        title: paperTitle,
        key,
        link: fetchUrl,
        citations: {},
        ok: false,
        error: 'fetch_failed',
        message: 'Unexpected page content (not a citation detail page)',
      };
    }

    const bars = doc.getElementById('gsc_oci_graph_bars');
    if (bars) {
      const spans = bars.querySelectorAll('span');
      const spans_length = spans.length;
      const middle_index = Math.floor(spans_length / 2);
      const years = Array.from(spans)
        .slice(0, middle_index)
        .map((span) => span.innerText);
      const citationCounts = Array.from(spans)
        .slice(middle_index)
        .map((span) => span.innerText);

      for (let index = 0; index < middle_index; index++) {
        year_ciation_counts[years[index]] = citationCounts[index];
      }
    }

    // Empty citations object = zero citations (valid success)
    return {
      title: paperTitle,
      key,
      link: fetchUrl,
      citations: year_ciation_counts,
      ok: true,
      zeroCitations: Object.keys(year_ciation_counts).length === 0,
    };
  } catch (error) {
    console.log(error);
    console.log(fetchUrl);
    const msg = String(error && error.message ? error.message : error);
    const isCors =
      /Failed to fetch|NetworkError|CORS|Access-Control-Allow-Origin/i.test(msg);
    return {
      title: key,
      key,
      link: fetchUrl,
      citations: {},
      ok: false,
      error: 'fetch_failed',
      message: isCors
        ? 'Cross-origin blocked (not rate limit). Links must use this Scholar domain.'
        : msg,
    };
  }
}


function sleep(ms) {
  const total = Math.max(0, Number(ms) || 0);
  if (total === 0) return Promise.resolve('done');
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (isPaperAnalyzerCancelled()) {
        resolve('cancelled');
        return;
      }
      if (Date.now() - start >= total) {
        resolve('done');
        return;
      }
      setTimeout(tick, Math.min(200, total));
    };
    tick();
  });
}

function requestPaperAnalyzerCancel() {
  window.__PAPER_ANALYZER_CANCEL__ = true;
}

function clearPaperAnalyzerCancel() {
  window.__PAPER_ANALYZER_CANCEL__ = false;
}

function isPaperAnalyzerCancelled() {
  return !!window.__PAPER_ANALYZER_CANCEL__;
}

var PAPER_ANALYZER_STORAGE_PREFIX = 'paperAnalyzer:job:';
var PAPER_ANALYZER_SETTINGS_KEY = 'paperAnalyzer:settings';
var DEFAULT_FETCH_DELAY_MS = 8000;
var DEFAULT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes after rate limit
var DEFAULT_BATCH_SIZE = 5; // pause after N fetches in one run (0 = unlimited)

function getScholarUserId() {
  try {
    return new URLSearchParams(window.location.search).get('user') || '';
  } catch {
    return '';
  }
}

function readAnalyzerSettings() {
  try {
    const raw = localStorage.getItem(PAPER_ANALYZER_SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function writeAnalyzerSettings(partial) {
  const settings = { ...readAnalyzerSettings(), ...(partial || {}) };
  localStorage.setItem(PAPER_ANALYZER_SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

function getAnalyzerSettings() {
  const s = readAnalyzerSettings();
  const fetchDelayMs = Number(s.fetchDelayMs);
  const cooldownMs = Number(s.cooldownMs);
  const batchSize = Number(s.batchSize);
  return {
    fetchDelayMs:
      Number.isFinite(fetchDelayMs) && fetchDelayMs >= 0
        ? fetchDelayMs
        : DEFAULT_FETCH_DELAY_MS,
    cooldownMs:
      Number.isFinite(cooldownMs) && cooldownMs >= 0
        ? cooldownMs
        : DEFAULT_COOLDOWN_MS,
    batchSize:
      Number.isFinite(batchSize) && batchSize >= 0
        ? Math.floor(batchSize)
        : DEFAULT_BATCH_SIZE,
  };
}

function getFetchDelayMs() {
  return getAnalyzerSettings().fetchDelayMs;
}

function setFetchDelayMs(ms) {
  writeAnalyzerSettings({ fetchDelayMs: Math.max(0, Number(ms) || 0) });
  return getFetchDelayMs();
}

function applyAnalyzerSettings(partial) {
  if (!partial || typeof partial !== 'object') return getAnalyzerSettings();
  const next = {};
  if (partial.fetchDelayMs != null) {
    next.fetchDelayMs = Math.max(0, Number(partial.fetchDelayMs) || 0);
  }
  if (partial.cooldownMs != null) {
    next.cooldownMs = Math.max(0, Number(partial.cooldownMs) || 0);
  }
  if (partial.batchSize != null) {
    next.batchSize = Math.max(0, Math.floor(Number(partial.batchSize) || 0));
  }
  writeAnalyzerSettings(next);
  return getAnalyzerSettings();
}

function jitterDelay(ms) {
  const base = Math.max(0, Number(ms) || 0);
  if (base === 0) return 0;
  // 80%–140% of configured delay
  return Math.round(base * (0.8 + Math.random() * 0.6));
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** Long wait with live countdown; honour Cancel. */
async function sleepWithCountdown(ms, label, onTick) {
  const total = Math.max(0, Number(ms) || 0);
  if (total === 0) return 'done';
  const start = Date.now();
  while (true) {
    if (isPaperAnalyzerCancelled()) return 'cancelled';
    const elapsed = Date.now() - start;
    const left = Math.max(0, total - elapsed);
    const msg = `${label} — ${formatDuration(left)} left`;
    if (typeof onTick === 'function') onTick(msg, left);
    if (left <= 0) return 'done';
    const slice = Math.min(1000, left);
    const wait = await sleep(slice);
    if (wait === 'cancelled') return 'cancelled';
  }
}

function getJobStorageKey() {
  const userId = getScholarUserId();
  if (userId) return PAPER_ANALYZER_STORAGE_PREFIX + userId;
  return PAPER_ANALYZER_STORAGE_PREFIX + 'anon:' + location.origin + location.pathname;
}

function rewriteScholarLinkToCurrentHost(link) {
  if (!link) return '';
  try {
    const u = new URL(link, location.href);
    u.hash = '';
    // Profile pages on scholar.google.com.pk embed .com citation links — rewrite to this host
    if (/^scholar\.google(\.[a-z0-9-]+)+$/i.test(u.hostname)) {
      u.protocol = location.protocol;
      u.host = location.host;
    }
    return u.href;
  } catch {
    return String(link).trim();
  }
}

function normalizePaperLink(link) {
  return rewriteScholarLinkToCurrentHost(link);
}

function paperIdentityKey(link) {
  try {
    const u = new URL(normalizePaperLink(link), location.href);
    const cite = u.searchParams.get('citation_for_view');
    if (cite) return 'cite:' + cite;
    return u.origin + u.pathname + u.search;
  } catch {
    return normalizePaperLink(link) || '';
  }
}

function citationsToObject(citations) {
  if (!citations) return {};
  if (Array.isArray(citations)) {
    const out = {};
    citations.forEach((c) => {
      if (c == null) return;
      const year = String(c.year ?? c[0] ?? '');
      const count = parseInt(c.count ?? c[1] ?? 0, 10) || 0;
      if (year) out[year] = count;
    });
    return out;
  }
  if (typeof citations === 'object') {
    const out = {};
    Object.keys(citations).forEach((year) => {
      out[String(year)] = parseInt(citations[year], 10) || 0;
    });
    return out;
  }
  return {};
}

function paperHasCitationData(paper) {
  const citations = citationsToObject(paper?.citations);
  return Object.keys(citations).length > 0 || paper?.status === 'done';
}

function migrateWorkspace(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // New format
  if (Array.isArray(raw.papers)) {
    return {
      ...raw,
      status: raw.status || 'ready',
      papers: raw.papers.map((p) => ({
        title: p.title || p.key || 'Unknown',
        link: normalizePaperLink(p.link) || p.link || '',
        status: p.status || (paperHasCitationData(p) ? 'done' : 'pending'),
        error: p.error || null,
        message: p.message || null,
        citations: citationsToObject(p.citations),
        selected: !!p.selected,
      })),
    };
  }

  // Old resume format: queue + completed
  if (Array.isArray(raw.queue)) {
    const doneByLink = new Map();
    (raw.completed || []).forEach((p) => {
      const link = normalizePaperLink(p.link);
      if (link) doneByLink.set(link, p);
    });
    return {
      userId: raw.userId || getScholarUserId() || null,
      status: 'ready',
      professorName: raw.professorName || '',
      professorLink: raw.professorLink || location.href,
      cleanProfessorName: raw.cleanProfessorName || 'scholar',
      papers: raw.queue.map((item) => {
        const link = item.link || '';
        const done = doneByLink.get(normalizePaperLink(link));
        if (done) {
          return {
            title: done.title || done.key || item.title || 'Unknown',
            link,
            status: 'done',
            error: null,
            message: null,
            citations: citationsToObject(done.citations),
            selected: false,
          };
        }
        return {
          title: item.title || 'Unknown',
          link,
          status: 'pending',
          error: null,
          message: null,
          citations: {},
          selected: true,
        };
      }),
    };
  }

  return null;
}

function loadWorkspace() {
  try {
    const raw = localStorage.getItem(getJobStorageKey());
    if (!raw) return null;
    return migrateWorkspace(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveWorkspace(workspace) {
  if (!workspace) return;
  workspace.storageKey = getJobStorageKey();
  workspace.updatedAt = new Date().toISOString();
  localStorage.setItem(workspace.storageKey, JSON.stringify(workspace));
}

function clearWorkspace(workspaceOrKey) {
  const key =
    typeof workspaceOrKey === 'string'
      ? workspaceOrKey
      : workspaceOrKey?.storageKey || getJobStorageKey();
  if (!key) return;
  localStorage.removeItem(key);
}

// Back-compat aliases used by older resume paths
function loadJob() {
  return loadWorkspace();
}
function saveJob(job) {
  saveWorkspace(job);
}
function clearJob(jobOrKey) {
  clearWorkspace(jobOrKey);
}
function hasPendingJob() {
  const ws = loadWorkspace();
  if (!ws || !Array.isArray(ws.papers)) return false;
  return ws.papers.some(
    (p) => p.status === 'pending' || p.status === 'failed' || p.status === 'rate_limited'
  );
}

function createProgressIndicator() {
  // Remove existing indicator if any
  const existing = document.getElementById('paper-analyzer-progress');
  if (existing) {
    existing.remove();
  }

  // Create progress container
  const progressContainer = document.createElement('div');
  progressContainer.id = 'paper-analyzer-progress';
  progressContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border: 2px solid #4CAF50;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    min-width: 300px;
    font-family: Arial, sans-serif;
  `;

  // Title
  const title = document.createElement('div');
  title.textContent = '📊 Paper Analyzer';
  title.style.cssText = 'font-weight: bold; font-size: 18px; margin-bottom: 10px; color: #333;';

  // Status text
  const statusText = document.createElement('div');
  statusText.id = 'progress-status';
  statusText.textContent = 'Initializing...';
  statusText.style.cssText = 'margin-bottom: 10px; color: #666; font-size: 14px;';

  // Progress bar container
  const progressBarContainer = document.createElement('div');
  progressBarContainer.style.cssText = `
    background: #e0e0e0; 
    border-radius: 10px; 
    height: 20px; 
    margin-bottom: 10px; 
    overflow: hidden;
    position: relative;
    width: 100%;
    min-width: 200px;
  `;

  // Progress bar
  const progressBar = document.createElement('div');
  progressBar.id = 'progress-bar';
  progressBar.style.cssText = `
    background: linear-gradient(90deg, #4CAF50, #45a049);
    height: 100%;
    width: 0%;
    transition: width 0.3s ease;
    border-radius: 10px;
    position: absolute;
    top: 0;
    left: 0;
    min-width: 0;
    box-sizing: border-box;
  `;

  // Percentage text overlay (positioned absolutely to not affect bar width)
  const progressBarText = document.createElement('div');
  progressBarText.id = 'progress-bar-text';
  progressBarText.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-size: 12px;
    font-weight: bold;
    z-index: 1;
    pointer-events: none;
    white-space: nowrap;
  `;

  progressBarContainer.appendChild(progressBar);
  progressBarContainer.appendChild(progressBarText);
  
  // Progress text
  const progressText = document.createElement('div');
  progressText.id = 'progress-text';
  progressText.textContent = '0 / 0';
  progressText.style.cssText = 'text-align: center; font-size: 12px; color: #666;';

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    position: absolute;
    top: 5px;
    right: 5px;
    background: transparent;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: #999;
    padding: 5px 10px;
  `;
  closeBtn.onmouseover = () => closeBtn.style.color = '#333';
  closeBtn.onmouseout = () => closeBtn.style.color = '#999';
  closeBtn.onclick = () => progressContainer.remove();

  progressContainer.appendChild(title);
  progressContainer.appendChild(statusText);
  progressContainer.appendChild(progressBarContainer);
  progressContainer.appendChild(progressText);

  const cancelBtn = document.createElement('button');
  cancelBtn.id = 'progress-cancel-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    display: block;
    width: 100%;
    margin-top: 10px;
    padding: 8px 10px;
    border: 1px solid #c62828;
    background: #ffebee;
    color: #c62828;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  `;
  cancelBtn.onclick = () => {
    requestPaperAnalyzerCancel();
    cancelBtn.textContent = 'Cancelling…';
    cancelBtn.disabled = true;
    if (statusText) statusText.textContent = 'Cancel requested — stopping after current paper…';
  };
  progressContainer.appendChild(cancelBtn);
  progressContainer.appendChild(closeBtn);

  document.body.appendChild(progressContainer);
  return progressContainer;
}

function updateProgress(current, total, status, isComplete = false) {
  const progressBar = document.getElementById('progress-bar');
  const progressBarText = document.getElementById('progress-bar-text');
  const progressText = document.getElementById('progress-text');
  const statusText = document.getElementById('progress-status');
  const progressContainer = document.getElementById('paper-analyzer-progress');

  if (!progressContainer) return;

  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  if (progressBar) {
    progressBar.style.width = `${percentage}%`;
  }

  // Update text overlay (separate from bar to prevent resizing)
  if (progressBarText) {
    progressBarText.textContent = isComplete ? '✓' : `${percentage}%`;
    // Only show text if bar is wide enough
    if (percentage < 15) {
      progressBarText.style.display = 'none';
    } else {
      progressBarText.style.display = 'block';
    }
  }

  if (progressText) {
    progressText.textContent = `${current} / ${total} papers`;
  }

  if (statusText) {
    statusText.textContent = status;
  }

  // Update styling when complete
  if (isComplete) {
    progressContainer.style.borderColor = '#4CAF50';
    if (statusText) {
      statusText.style.color = '#4CAF50';
      statusText.style.fontWeight = 'bold';
    }
    if (progressBarText) {
      progressBarText.style.display = 'block';
    }
  }
}

function hideProgressIndicator(delay = 5000) {
  setTimeout(() => {
    const progressContainer = document.getElementById('paper-analyzer-progress');
    if (progressContainer) {
      progressContainer.style.transition = 'opacity 0.5s';
      progressContainer.style.opacity = '0';
      setTimeout(() => progressContainer.remove(), 500);
    }
  }, delay);
}

async function clickAllShowMoreButtons() {
  console.log("Looking for 'Show more' buttons...");
  let clickedCount = 0;
  let maxIterations = 100; // Safety limit to prevent infinite loops
  let iteration = 0;
  
  while (iteration < maxIterations) {
    // Find the button by ID (most reliable)
    let button = document.querySelector('#gsc_bpf_more');
    
    // If button not found, try to find it by class and text
    if (!button) {
      const buttons = document.querySelectorAll('button.gs_btnPD');
      for (let btn of buttons) {
        const labelSpan = btn.querySelector('span.gs_lbl');
        if (labelSpan && (labelSpan.innerText || labelSpan.textContent || '').trim().toLowerCase() === 'show more') {
          button = btn;
          break;
        }
      }
    }
    
    // If still no button found, wait a bit longer and check again
    if (!button) {
      console.log("Button not found, waiting a bit longer...");
      await sleep(2000);
      button = document.querySelector('#gsc_bpf_more');
      
      // If still not found after waiting, we're done
      if (!button) {
        console.log(`No "Show more" button found. Clicked ${clickedCount} buttons total.`);
        break;
      }
    }
    
    // Check if button is visible
    if (button && button.offsetParent === null) {
      console.log("Button exists but is not visible. Waiting...");
      await sleep(2000);
      continue;
    }
    
    // Check if button is disabled
    if (button && button.hasAttribute('disabled')) {
      console.log(`"Show more" button is disabled. Clicked ${clickedCount} buttons total. All papers expanded!`);
      break;
    }
    
    // Button is found and enabled, click it
    if (button) {
      console.log(`Found enabled "Show more" button, clicking... (iteration ${iteration + 1})`);
      button.click();
      clickedCount++;
      iteration++;
      
      // Wait 2 seconds for content to load
      await sleep(2000);
      
      // Check if button reappeared (it should after clicking)
      const newButton = document.querySelector('#gsc_bpf_more');
      if (newButton) {
        // Button reappeared, check if it's disabled
        if (newButton.hasAttribute('disabled')) {
          console.log(`Button reappeared but is disabled. Clicked ${clickedCount} buttons total. All papers expanded!`);
          break;
        }
        // Button reappeared and is still enabled, continue loop
        console.log("Button reappeared and is still enabled, continuing...");
      } else {
        // Button didn't reappear immediately, wait a bit longer
        console.log("Button didn't reappear immediately, waiting longer...");
        await sleep(2000);
        
        const checkButton = document.querySelector('#gsc_bpf_more');
        if (checkButton) {
          if (checkButton.hasAttribute('disabled')) {
            console.log(`Button appeared after wait and is disabled. Clicked ${clickedCount} buttons total.`);
            break;
          }
          // Button appeared and is enabled, continue
        } else {
          // Button still not found, might be done
          console.log("Button still not found after waiting. Assuming all papers are expanded.");
          break;
        }
      }
    } else {
      // No button found at all
      console.log(`No "Show more" button found. Clicked ${clickedCount} buttons total.`);
      break;
    }
  }
  
  // Final wait to ensure all content is loaded
  await sleep(1000);
  return clickedCount;
}




function collectPapersFromPage() {
  const tbodies = document.querySelectorAll('tbody');
  const paper_objects = {};

  tbodies.forEach((tbody, index) => {
    console.log(`--- tbody #${index + 1} ---`);

    tbody.querySelectorAll('tr').forEach((row) => {
      const cells = row.querySelectorAll('td');
      const cellData = [];
      let paperTitle = '';
      let href = '';

      cells.forEach((td, i) => {
        const text = td.innerText.trim();

        if (i === 0) {
          const link = td.querySelector('a');
          if (link) {
            href = link.href;
            paperTitle = link.innerText.trim();
            if (!paperTitle || paperTitle === 'View article' || paperTitle.length < 3) {
              const titleElement = td.querySelector('span, div, strong');
              if (titleElement && titleElement.innerText.trim()) {
                paperTitle = titleElement.innerText.trim();
              } else {
                paperTitle = text.replace(/View article/gi, '').trim();
              }
            }
          } else {
            paperTitle = text;
          }
        }

        cellData.push(text);
      });

      if (href && href !== 'javascript:void(0)' && paperTitle && paperTitle.length > 0) {
        paper_objects[paperTitle] = rewriteScholarLinkToCurrentHost(href);
        console.log('Paper found:', paperTitle, '| Link:', paper_objects[paperTitle]);
      }

      console.log('Row:', cellData);
    });
  });

  return paper_objects;
}

function getProfessorMetaFromPage() {
  const pageTitle = document.title || '';
  let professorName = pageTitle;
  if (pageTitle.includes(' - Google Scholar')) {
    professorName = pageTitle.split(' - Google Scholar')[0].trim();
  } else if (pageTitle.includes(' | Google Scholar')) {
    professorName = pageTitle.split(' | Google Scholar')[0].trim();
  }

  const nameElement = document.querySelector('#gsc_prf_in, .gsc_prf_in, h1');
  if (nameElement) {
    const extractedName = nameElement.innerText.trim();
    if (extractedName) professorName = extractedName;
  }

  const originalProfessorName = professorName;
  const cleanProfessorName =
    professorName.replace(/[<>:"/\\|?*]/g, '_').trim() || 'scholar';

  return {
    professorName: originalProfessorName,
    professorLink: window.location.href,
    cleanProfessorName,
    userId: getScholarUserId() || null,
  };
}

function mergePapersByLink(existingPapers, incomingPapers) {
  const map = new Map();
  (existingPapers || []).forEach((p) => {
    const key =
      paperIdentityKey(p.link) || `title:${(p.title || '').toLowerCase()}`;
    map.set(key, {
      ...p,
      link: normalizePaperLink(p.link) || p.link,
      citations: citationsToObject(p.citations),
    });
  });

  (incomingPapers || []).forEach((p) => {
    const key =
      paperIdentityKey(p.link) || `title:${(p.title || '').toLowerCase()}`;
    const prev = map.get(key);
    const incomingDone =
      p.status === 'done' ||
      paperHasCitationData(p) ||
      (Array.isArray(p.citations) && p.citations.length > 0);

    if (!prev) {
      map.set(key, {
        title: p.title || 'Unknown',
        link: normalizePaperLink(p.link) || p.link || '',
        status: incomingDone ? 'done' : p.status || 'pending',
        error: p.error || null,
        message: p.message || null,
        citations: citationsToObject(p.citations),
        selected: p.selected != null ? !!p.selected : !incomingDone,
      });
      return;
    }

    const merged = { ...prev };
    if (p.title) merged.title = p.title;
    if (p.link) merged.link = normalizePaperLink(p.link) || p.link;

    const incomingCitations = citationsToObject(p.citations);
    const prevCitations = citationsToObject(prev.citations);
    const incomingCount = Object.keys(incomingCitations).length;
    const prevCount = Object.keys(prevCitations).length;

    if (incomingDone || incomingCount >= prevCount) {
      if (incomingCount > 0 || incomingDone) {
        merged.citations = incomingCount > 0 ? incomingCitations : prevCitations;
        merged.status = 'done';
        merged.error = null;
        merged.message = null;
        merged.selected = false;
      }
    } else if (prev.status === 'done') {
      // keep previous done data
    } else if (p.status) {
      merged.status = p.status;
      merged.error = p.error || merged.error;
      merged.message = p.message || merged.message;
    }

    map.set(key, merged);
  });

  return Array.from(map.values());
}

function workspaceFromImportedJson(jsonData, pageMeta) {
  const professor = jsonData.professor || {};
  const papers = (jsonData.papers || []).map((p) => ({
    title: p.title || 'Unknown',
    link: p.link || '',
    status: 'done',
    error: null,
    message: null,
    citations: citationsToObject(p.citations),
    selected: false,
  }));

  return {
    userId: pageMeta.userId,
    status: 'ready',
    professorName: professor.name || pageMeta.professorName,
    professorLink: professor.googleScholarLink || pageMeta.professorLink,
    cleanProfessorName:
      (professor.name || pageMeta.cleanProfessorName || 'scholar')
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim() || 'scholar',
    papers,
  };
}

function workspaceToExportPoints(workspace) {
  return (workspace.papers || [])
    .filter((p) => p.status === 'done')
    .map((p) => ({
      title: p.title,
      key: p.title,
      link: p.link,
      citations: citationsToObject(p.citations),
    }));
}

async function scanPageIntoWorkspace(existingWorkspace) {
  const meta = getProfessorMetaFromPage();
  createProgressIndicator();
  updateProgress(0, 100, 'Expanding hidden papers...', false);
  const clickedCount = await clickAllShowMoreButtons();
  updateProgress(100, 100, `Expanded ${clickedCount} sections. Extracting papers...`, false);

  const paper_objects = collectPapersFromPage();
  const scanned = Object.entries(paper_objects).map(([title, link]) => ({
    title,
    link,
    status: 'pending',
    error: null,
    message: null,
    citations: {},
    selected: true,
  }));

  let workspace = existingWorkspace || loadWorkspace();
  if (!workspace) {
    workspace = {
      userId: meta.userId,
      status: 'ready',
      professorName: meta.professorName,
      professorLink: meta.professorLink,
      cleanProfessorName: meta.cleanProfessorName,
      papers: [],
    };
  } else {
    workspace.professorName = workspace.professorName || meta.professorName;
    workspace.professorLink = workspace.professorLink || meta.professorLink;
    workspace.cleanProfessorName =
      workspace.cleanProfessorName || meta.cleanProfessorName;
  }

  // Newly scanned pending papers should be selected by default only if not already done
  const merged = mergePapersByLink(workspace.papers, scanned).map((p) => {
    if (p.status === 'done') return { ...p, selected: false };
    if (p.status === 'failed' || p.status === 'rate_limited') {
      return { ...p, selected: true };
    }
    return { ...p, selected: p.selected !== false };
  });

  workspace.papers = merged;
  workspace.status = 'ready';
  saveWorkspace(workspace);
  hideProgressIndicator(800);
  return workspace;
}

async function fetchSelectedPapers(workspace, options = {}) {
  const onProgress = options.onProgress || (() => {});
  const stopOnRateLimit = options.stopOnRateLimit !== false;
  const autoCooldown = options.autoCooldown !== false;

  const selected = (workspace.papers || []).filter((p) => p.selected);
  if (!selected.length) {
    onProgress({ message: 'No papers selected', current: 0, total: 0 });
    return workspace;
  }

  clearPaperAnalyzerCancel();
  workspace.status = 'fetching';
  saveWorkspace(workspace);
  createProgressIndicator();

  const settings = getAnalyzerSettings();
  let delayMs = Math.max(
    0,
    Number(options.delayMs != null ? options.delayMs : settings.fetchDelayMs) || 0
  );
  const cooldownMs = Math.max(
    0,
    Number(options.cooldownMs != null ? options.cooldownMs : settings.cooldownMs) || 0
  );
  const batchSize = Math.max(
    0,
    Math.floor(
      Number(options.batchSize != null ? options.batchSize : settings.batchSize) || 0
    )
  );

  let doneCount = 0;
  let successInBatch = 0;
  const total = selected.length;

  const stopCancelled = () => {
    workspace.status = 'paused';
    saveWorkspace(workspace);
    updateProgress(
      doneCount,
      total,
      'Cancelled — progress saved. You can resume later.',
      false
    );
    const cancelBtn = document.getElementById('progress-cancel-btn');
    if (cancelBtn) {
      cancelBtn.textContent = 'Cancelled';
      cancelBtn.disabled = true;
    }
    onProgress({
      message: 'Cancelled — progress saved.',
      current: doneCount,
      total,
      cancelled: true,
    });
    return workspace;
  };

  const pauseRateLimited = (extraMsg) => {
    workspace.status = 'paused';
    saveWorkspace(workspace);
    const msg =
      extraMsg ||
      'Rate limited — paused. Progress saved. Wait, then fetch selected again.';
    updateProgress(doneCount, total, msg, false);
    onProgress({
      message: msg,
      current: doneCount,
      total,
      paused: true,
      error: 'rate_limited',
    });
    return workspace;
  };

  for (let i = 0; i < selected.length; i++) {
    if (isPaperAnalyzerCancelled()) {
      return stopCancelled();
    }

    // Soft batching: after N successes, force a cooldown before more fetches
    if (batchSize > 0 && successInBatch >= batchSize && i < selected.length) {
      successInBatch = 0;
      // bump delay a bit after each batch
      delayMs = Math.min(delayMs * 1.25, 60000);
      if (cooldownMs > 0) {
        const wait = await sleepWithCountdown(
          cooldownMs,
          `Batch limit (${batchSize}) — cooling down`,
          (msg) => {
            updateProgress(doneCount, total, msg, false);
            onProgress({ message: msg, current: doneCount, total });
          }
        );
        if (wait === 'cancelled' || isPaperAnalyzerCancelled()) {
          return stopCancelled();
        }
      }
    }

    const paper = selected[i];
    const idx = workspace.papers.findIndex(
      (p) => paperIdentityKey(p.link) === paperIdentityKey(paper.link)
    );
    if (idx < 0) continue;

    onProgress({
      message: `Fetching: ${(paper.title || '').substring(0, 50)}...`,
      current: doneCount,
      total,
    });
    updateProgress(
      doneCount,
      total,
      `Fetching: ${(paper.title || '').substring(0, 50)}...`,
      false
    );

    let result = await getPaperLinks_data(paper.title, paper.link);

    if (isPaperAnalyzerCancelled()) {
      if (result.ok) {
        workspace.papers[idx] = {
          ...workspace.papers[idx],
          title: result.title || workspace.papers[idx].title,
          link: result.link || workspace.papers[idx].link,
          citations: citationsToObject(result.citations),
          status: 'done',
          error: null,
          message: null,
          selected: false,
        };
        doneCount++;
        saveWorkspace(workspace);
      }
      return stopCancelled();
    }

    // Rate limit: cool down, then retry this paper once
    if (!result.ok && result.error === 'rate_limited') {
      workspace.papers[idx] = {
        ...workspace.papers[idx],
        status: 'rate_limited',
        error: 'rate_limited',
        message: result.message || 'Rate limited',
        selected: true,
      };
      saveWorkspace(workspace);

      if (!autoCooldown || cooldownMs <= 0) {
        return pauseRateLimited();
      }

      const wait = await sleepWithCountdown(
        cooldownMs,
        'Rate limited — cooling down before retry',
        (msg) => {
          updateProgress(doneCount, total, msg, false);
          onProgress({ message: msg, current: doneCount, total, error: 'rate_limited' });
        }
      );
      if (wait === 'cancelled' || isPaperAnalyzerCancelled()) {
        return stopCancelled();
      }

      // Slow down subsequent requests after a block
      delayMs = Math.max(delayMs * 1.5, 15000);

      result = await getPaperLinks_data(paper.title, paper.link);
      if (isPaperAnalyzerCancelled()) {
        return stopCancelled();
      }

      if (!result.ok && result.error === 'rate_limited') {
        workspace.papers[idx] = {
          ...workspace.papers[idx],
          status: 'rate_limited',
          error: 'rate_limited',
          message: 'Still rate limited after cooldown',
          selected: true,
        };
        saveWorkspace(workspace);
        if (stopOnRateLimit) {
          return pauseRateLimited(
            'Still rate limited after cooldown — stopped. Wait longer (30–60 min), raise delay, fetch smaller batches.'
          );
        }
      }
    }

    if (result.ok) {
      workspace.papers[idx] = {
        ...workspace.papers[idx],
        title: result.title || workspace.papers[idx].title,
        link: result.link || workspace.papers[idx].link,
        citations: citationsToObject(result.citations),
        status: 'done',
        error: null,
        message: null,
        selected: false,
      };
      successInBatch++;
    } else if (result.error !== 'rate_limited') {
      workspace.papers[idx] = {
        ...workspace.papers[idx],
        status: 'failed',
        error: 'failed',
        message: result.message || result.error || 'Fetch failed',
        selected: true,
      };
    } else {
      // already marked rate_limited above when not stopping
      doneCount++;
      saveWorkspace(workspace);
      continue;
    }

    saveWorkspace(workspace);
    doneCount++;
    updateProgress(doneCount, total, `Processed ${doneCount} of ${total} selected`, false);
    onProgress({ message: `Processed ${doneCount} of ${total}`, current: doneCount, total });

    if (doneCount < total && delayMs > 0) {
      const pause = jitterDelay(delayMs);
      const wait = await sleepWithCountdown(
        pause,
        `Waiting ${formatDuration(pause)} before next paper`,
        (msg) => {
          updateProgress(doneCount, total, msg, false);
        }
      );
      if (wait === 'cancelled' || isPaperAnalyzerCancelled()) {
        return stopCancelled();
      }
    }
  }

  workspace.status = 'ready';
  saveWorkspace(workspace);
  updateProgress(total, total, '✓ Selected papers finished', true);
  const cancelBtn = document.getElementById('progress-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';
  hideProgressIndicator(4000);
  onProgress({ message: 'Finished selected papers', current: total, total, done: true });
  return workspace;
}

/** Legacy entry: open interactive workspace instead of blind full fetch */
async function ProcessPapersandPlotGraphs() {
  if (typeof window.openPaperAnalyzerWorkspace === 'function') {
    await window.openPaperAnalyzerWorkspace({ autoScan: true });
    return;
  }
  // Fallback if panel not loaded yet
  const ws = await scanPageIntoWorkspace(loadWorkspace());
  await fetchSelectedPapers(ws);
  const points = workspaceToExportPoints(ws);
  if (points.length) {
    await loadChartJS();
    PlotGraphs(points);
    exportToJSON(
      points,
      ws.professorName,
      ws.professorLink,
      ws.cleanProfessorName
    );
  }
}

// function PlotGraphs(paper_graph_points) {
  
//    // Check if the container already exists (avoid duplicates)
//   let chartsContainer = document.getElementById('charts-container-extension');

//   if (!chartsContainer) {
//     // Inject the container into the page's DOM
//     chartsContainer = document.createElement('div');
//     chartsContainer.id = 'charts-container-extension';
//     chartsContainer.style.position = 'fixed';
//     chartsContainer.style.top = '20px';
//     chartsContainer.style.right = '20px';
//     chartsContainer.style.width = '400px';
//     chartsContainer.style.maxHeight = '80vh';
//     chartsContainer.style.overflowY = 'auto';
//     chartsContainer.style.backgroundColor = 'white';
//     chartsContainer.style.padding = '10px';
//     chartsContainer.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
//     chartsContainer.style.zIndex = '9999';
//     document.body.appendChild(chartsContainer);
//   }

//   // Clear previous charts (optional)
//   chartsContainer.innerHTML = '';

//   let combinedYearsSet = new Set();
//   let combinedDatasets = [];

//   // Generate charts
//   paper_graph_points.forEach((paperObj, idx) => {

//     let paperTitle = Object.keys(paperObj)[0];
//     let citationData = paperObj[paperTitle];
//     let years = Object.keys(citationData);
//     let citations = Object.values(citationData).map(Number);
//     console.log("Graphing: " + paperTitle)


//     // Merge all years for the combined chart
//     years.forEach(y => combinedYearsSet.add(y));

//     // Add dataset for combined chart
//     combinedDatasets.push({
//       label: paperTitle.split('\n')[0].substring(0, 50),
//       data: citations,
//       borderColor: getColor(idx),
//       fill: false
//     });

//     // Container for each chart + controls
//     let chartWrapper = document.createElement('div');
//     chartWrapper.style.marginBottom = '15px';
//     chartWrapper.style.border = '1px solid #ccc';
//     chartWrapper.style.padding = '5px';
//     chartWrapper.style.borderRadius = '5px';

//     // Controls bar
//     let controlsBar = document.createElement('div');
//     controlsBar.style.display = 'flex';
//     controlsBar.style.justifyContent = 'space-between';
//     controlsBar.style.marginBottom = '5px';
//     controlsBar.style.alignItems = 'center';

//     let hideBtn = document.createElement('button');
//     hideBtn.textContent = 'Hide';
//     hideBtn.style.marginRight = '5px';

//     let widthInput = document.createElement('input');
//     widthInput.type = 'number';
//     widthInput.value = 400;
//     widthInput.style.width = '60px';

//     let heightInput = document.createElement('input');
//     heightInput.type = 'number';
//     heightInput.value = 200;
//     heightInput.style.width = '60px';

//     controlsBar.appendChild(hideBtn);
//     controlsBar.appendChild(document.createTextNode('W:'));
//     controlsBar.appendChild(widthInput);
//     controlsBar.appendChild(document.createTextNode(' H:'));
//     controlsBar.appendChild(heightInput);

//     chartWrapper.appendChild(controlsBar);


//     let canvas = document.createElement('canvas');
//     canvas.id = paperTitle

//     chartsContainer.appendChild(canvas);

//     new Chart(canvas, {
//       type: 'line',
//       data: {
//         labels: years,
//         datasets: [{
//           label: `Citations: ${paperTitle.split('\n')[0]}`,
//           data: citations,
//           borderColor: '#3e95cd',
//           fill: false
//         }]
//       },
//       options: {
//         responsive: true,
//         plugins: {
//           title: {
//             display: true,
//             text: paperTitle.split('\n')[0].substring(0, 50) + (paperTitle.length > 50 ? '...' : ''),
//           }
//         }
//       }
//     });


//     // Interactivity
//     hideBtn.addEventListener('click', () => {
//       canvas.style.display = canvas.style.display === 'none' ? 'block' : 'none';
//       hideBtn.textContent = canvas.style.display === 'none' ? 'Show' : 'Hide';
//     });

//     widthInput.addEventListener('input', () => {
//       canvas.width = widthInput.value;
//       chartInstance.resize();
//     });

//     heightInput.addEventListener('input', () => {
//       canvas.height = heightInput.value;
//       chartInstance.resize();
//     });


//   });

  
//   // Create combined chart at the end
//   let combinedCanvas = document.createElement('canvas');
//   chartsContainer.appendChild(combinedCanvas);

//   let sortedYears = Array.from(combinedYearsSet).sort();

//   new Chart(combinedCanvas, {
//     type: 'line',
//     data: {
//       labels: sortedYears,
//       datasets: combinedDatasets
//     },
//     options: {
//       responsive: true,
//       plugins: {
//         title: {
//           display: true,
//           text: 'All Papers Combined Citations'
//         }
//       }
//     }
//   });

// }


function exportToJSON(paper_graph_points, professorName = "scholar", professorLink = "", cleanNameForFile = null) {
  // Create normalized JSON structure
  const jsonData = {
    professor: {
      name: professorName,
      googleScholarLink: professorLink
    },
    exportDate: new Date().toISOString(),
    papers: paper_graph_points.map(paperObj => {
      const title = paperObj.title || paperObj.key || "Unknown";
      const cleanedTitle = title.replace(/\n/g, ' ').trim();
      
      // Convert citations object to normalized array format
      const citations = [];
      if (paperObj.citations && Object.keys(paperObj.citations).length > 0) {
        // Sort years for consistent ordering
        const sortedYears = Object.keys(paperObj.citations).sort();
        sortedYears.forEach(year => {
          citations.push({
            year: parseInt(year) || year,
            count: parseInt(paperObj.citations[year]) || 0
          });
        });
      }
      
      return {
        title: cleanedTitle,
        link: paperObj.link || "",
        citations: citations,
        totalCitations: citations.reduce((sum, c) => sum + c.count, 0)
      };
    })
  };
  
  // Convert to JSON string with pretty formatting
  const jsonContent = JSON.stringify(jsonData, null, 2);
  
  // Use cleaned name for filename if provided, otherwise clean the professor name
  const safeName = cleanNameForFile || professorName.replace(/[<>:"/\\|?*]/g, '_').trim() || "scholar";
  
  // Create download link
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${safeName}_citations.json`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  console.log(`JSON file downloaded successfully as: ${safeName}_citations.json`);
}

function PlotGraphs(paper_graph_points) {

  let chartsContainer = document.getElementById('charts-container-extension');

  if (!chartsContainer) {
    chartsContainer = document.createElement('div');
    chartsContainer.id = 'charts-container-extension';
    // chartsContainer.style.position = 'relative';
    // chartsContainer.style.top = '20px';
    // chartsContainer.style.right = '20px';
    // chartsContainer.style.width = '450px'; // bigger default
    // chartsContainer.style.maxHeight = '85vh';
    // chartsContainer.style.overflowY = 'auto';
    // chartsContainer.style.backgroundColor = 'white';
    // chartsContainer.style.padding = '10px';
    // chartsContainer.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
    // chartsContainer.style.zIndex = '9999';
    chartsContainer.style.display = "flex";
    chartsContainer.style.flexDirection = "row"; // horizontal layout
    chartsContainer.style.width = "auto"; // or any px, %, rem value
    chartsContainer.style.height = "auto"; // example height
    chartsContainer.style.flexWrap = "wrap"


    document.body.appendChild(chartsContainer);
  }

  chartsContainer.innerHTML = '';

  let combinedYearsSet = new Set();
  let combinedDatasets = [];

  paper_graph_points.forEach((paperObj, idx) => {
    let paperTitle = paperObj.title || paperObj.key || Object.keys(paperObj)[0];
    let citationData = paperObj.citations || paperObj[paperTitle] || {};
    let years = Object.keys(citationData);
    let citations = Object.values(citationData).map(Number);

    years.forEach(y => combinedYearsSet.add(y));
    combinedDatasets.push({
      label: (paperTitle.split('\n')[0] || paperTitle).substring(0, 10),
      data: citations,
      borderColor: getColor(idx),
      fill: false
    });

    // Container for each chart + controls
    let chartWrapper = document.createElement('div');
    chartWrapper.style.marginBottom = '15px';
    chartWrapper.style.border = '1px solid #ccc';
    chartWrapper.style.padding = '5px';
    chartWrapper.style.borderRadius = '5px';

    // Controls bar
    let controlsBar = document.createElement('div');
    controlsBar.style.display = 'flex';
    controlsBar.style.justifyContent = 'space-between';
    controlsBar.style.marginBottom = '5px';
    controlsBar.style.alignItems = 'center';

    let hideBtn = document.createElement('button');
    hideBtn.textContent = 'Hide';
    hideBtn.style.marginRight = '5px';

    let widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.value = 400;
    widthInput.style.width = '60px';

    let heightInput = document.createElement('input');
    heightInput.type = 'number';
    heightInput.value = 400;
    heightInput.style.width = '60px';

    controlsBar.appendChild(hideBtn);
    controlsBar.appendChild(document.createTextNode('W:'));
    controlsBar.appendChild(widthInput);
    controlsBar.appendChild(document.createTextNode(' H:'));
    controlsBar.appendChild(heightInput);

    // chartWrapper.appendChild(controlsBar);

    // Canvas for chart
    let canvas = document.createElement('canvas');
    canvas.width = widthInput.value;
    canvas.height = heightInput.value;
    chartWrapper.appendChild(canvas);
    chartsContainer.appendChild(chartWrapper);

    // Create chart
    let chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: `Citations`,
          data: citations,
          borderColor: '#3e95cd',
          fill: false
        }]
      },
      options: {
        responsive: false,
        scales: {
            y: {
                beginAtZero: true // Ensures the y-axis starts at 0
            }
        },
        plugins: {
          title: {
            display: true,
            text: (paperTitle.split('\n')[0] || paperTitle).substring(0, 50) + (paperTitle.length > 50 ? '...' : '')
          }
        }
      }
    });

    // Interactivity
    hideBtn.addEventListener('click', () => {
      canvas.style.display = canvas.style.display === 'none' ? 'block' : 'none';
      hideBtn.textContent = canvas.style.display === 'none' ? 'Show' : 'Hide';
    });

    widthInput.addEventListener('input', () => {
      canvas.width = widthInput.value;
      chartInstance.resize();
    });

    heightInput.addEventListener('input', () => {
      canvas.height = heightInput.value;
      chartInstance.resize();
    });
  });

  // Combined chart
  let combineddiv = document.getElementById('combinedContainer');
  if (!combineddiv) {
    combineddiv = document.createElement('div');
    combineddiv.id = 'combinedContainer';
  }
  combineddiv.innerHTML = ''

  let combinedCanvas = document.createElement('canvas');
  document.body.appendChild(combineddiv);
  // combinedCanvas.width = "full"
  combineddiv.appendChild(combinedCanvas);

  let sortedYears = Array.from(combinedYearsSet).sort();

  new Chart(combinedCanvas, {
    type: 'line',
    data: {
      labels: sortedYears,
      datasets: combinedDatasets
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'All Papers Combined Citations'
        }
      }
    }
  });
}


// Helper function to get distinct colors
function getColor(index) {
  const colors = [
    '#3e95cd', '#8e5ea2', '#3cba9f', '#e8c3b9', '#c45850',
    '#ff6384', '#36a2eb', '#cc65fe', '#ffce56', '#4bc0c0'
  ];
  return colors[index % colors.length];
}


// for (let index = 0; index < paper_objects.length; index++) {
  
//   let key_paper_name = Object.keys(paper_objects)[index];
//   let value_link = paper_objects[key_paper_name];
  
//   let response = getPaperLinks_data(key_paper_name, value_link);
//   console.log("Response:", response);
  
//   await sleep(20); // Pause for 2 seconds
  
// }

async function loadChartJS() {
  return new Promise((resolve) => {
    if (window.Chart) {
      resolve(); // Already loaded
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = resolve;
    document.head.appendChild(script);
  });
}


if (!window.__PAPER_ANALYZER_LOADED__) {
  window.__PAPER_ANALYZER_LOADED__ = true;

  let isRunning = 0;

  function startMain(opts) {
    if (isRunning) {
      console.log('Paper Analyzer already running; ignoring duplicate start');
      return;
    }
    isRunning = 1;
    main(opts)
      .then(() => console.log('Workspace ready'))
      .catch((error) => console.error('Analysis error:', error))
      .finally(() => {
        isRunning = 0;
      });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'FROM_EXTENSION') return;

    if (
      typeof event.data.fetchDelayMs === 'number' &&
      typeof setFetchDelayMs === 'function'
    ) {
      setFetchDelayMs(event.data.fetchDelayMs);
    }
    if (event.data.settings && typeof applyAnalyzerSettings === 'function') {
      applyAnalyzerSettings(event.data.settings);
    }

    if (event.data.action === 'setFetchDelay') {
      return;
    }

    if (
      event.data.action === 'analyzePapers' ||
      event.data.action === 'openWorkspace'
    ) {
      console.log('Received command from extension:', event.data.action);
      startMain({
        autoScan: event.data.autoScan !== false,
        autoFetchMissing: !!event.data.autoFetchMissing,
        importJson: event.data.importJson || null,
      });
    }
  });

  // Auto-open workspace after reload if incomplete papers remain
  if (hasPendingJob()) {
    console.log('Pending Paper Analyzer papers found — opening workspace');
    setTimeout(() => startMain({ autoScan: false }), 1200);
  }
}

async function main(opts = {}) {
  try {
    await loadChartJS();
    if (typeof window.openPaperAnalyzerWorkspace === 'function') {
      await window.openPaperAnalyzerWorkspace({
        autoScan: opts.autoScan !== false,
        autoFetchMissing: !!opts.autoFetchMissing,
        importJson: opts.importJson || null,
      });
    } else {
      await ProcessPapersandPlotGraphs();
    }
  } catch (error) {
    console.error('Error in main():', error);
    throw error;
  }
}
