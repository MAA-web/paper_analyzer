(function () {
  if (window.__PAPER_ANALYZER_PANEL__) return;
  window.__PAPER_ANALYZER_PANEL__ = true;

  let workspace = null;
  let filter = 'all'; // all | pending | failed | done
  let busy = false;

  const STATUS_COLORS = {
    done: '#2e7d32',
    pending: '#756f06',
    failed: '#c62828',
    rate_limited: '#ef6c00',
  };

  function counts(ws) {
    const papers = ws?.papers || [];
    return {
      total: papers.length,
      done: papers.filter((p) => p.status === 'done').length,
      pending: papers.filter((p) => p.status === 'pending').length,
      failed: papers.filter(
        (p) => p.status === 'failed' || p.status === 'rate_limited'
      ).length,
      selected: papers.filter((p) => p.selected).length,
    };
  }

  function ensurePanel() {
    let panel = document.getElementById('paper-analyzer-workspace');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'paper-analyzer-workspace';
    panel.style.cssText = `
      position: fixed; top: 16px; right: 16px; width: 420px; max-height: 90vh;
      background: #fff; border: 2px solid #1b5e20; border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,.25); z-index: 10001;
      font-family: Arial, sans-serif; color: #222; display: flex; flex-direction: column;
      overflow: hidden;
    `;

    panel.innerHTML = `
      <div style="padding:12px 14px 8px; border-bottom:1px solid #e0e0e0; position:relative;">
        <div style="font-weight:700; font-size:16px; padding-right:28px;">Paper Analyzer</div>
        <div id="pa-prof" style="font-size:12px; color:#555; margin-top:4px;"></div>
        <div id="pa-summary" style="font-size:12px; margin-top:6px; color:#333;"></div>
        <div id="pa-delay" style="font-size:11px; margin-top:4px; color:#666;"></div>
        <button id="pa-close" title="Close" style="position:absolute; top:8px; right:8px; border:none; background:transparent; font-size:18px; cursor:pointer; color:#888;">✕</button>
      </div>
      <div style="padding:8px 10px; display:flex; flex-wrap:wrap; gap:6px; border-bottom:1px solid #eee;">
        <button class="pa-btn" data-action="scan">Scan page</button>
        <button class="pa-btn" data-action="import">Load JSON</button>
        <button class="pa-btn" data-action="export">Export JSON</button>
        <button class="pa-btn" data-action="graphs">Graphs</button>
        <input id="pa-file" type="file" accept="application/json,.json" style="display:none" />
      </div>
      <div style="padding:8px 10px; display:flex; flex-wrap:wrap; gap:6px; border-bottom:1px solid #eee;">
        <button class="pa-btn" data-filter="all">All</button>
        <button class="pa-btn" data-filter="pending">Missing</button>
        <button class="pa-btn" data-filter="failed">Failed</button>
        <button class="pa-btn" data-filter="done">Done</button>
      </div>
      <div style="padding:8px 10px; display:flex; flex-wrap:wrap; gap:6px; border-bottom:1px solid #eee;">
        <button class="pa-btn" data-action="select-visible">Select visible</button>
        <button class="pa-btn" data-action="select-missing">Select missing/failed</button>
        <button class="pa-btn" data-action="select-batch">Select next batch</button>
        <button class="pa-btn" data-action="select-none">Clear selection</button>
        <button class="pa-btn pa-primary" data-action="fetch">Fetch selected</button>
        <button class="pa-btn pa-cancel" data-action="cancel">Cancel</button>
        <button class="pa-btn" data-action="clear">Reset workspace</button>
      </div>
      <div id="pa-status" style="padding:6px 12px; font-size:12px; color:#444; min-height:18px;"></div>
      <div id="pa-list" style="overflow:auto; flex:1; padding:0 8px 10px;"></div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #paper-analyzer-workspace .pa-btn {
        border: 1px solid #bbb; background: #f7f7f7; border-radius: 6px;
        padding: 5px 8px; font-size: 12px; cursor: pointer;
      }
      #paper-analyzer-workspace .pa-btn:hover { background: #eee; }
      #paper-analyzer-workspace .pa-primary {
        background: #2e7d32; color: #fff; border-color: #1b5e20; font-weight: 600;
      }
      #paper-analyzer-workspace .pa-primary:hover { background: #256b29; }
      #paper-analyzer-workspace .pa-cancel {
        background: #ffebee; color: #c62828; border-color: #c62828; font-weight: 600;
      }
      #paper-analyzer-workspace .pa-cancel:hover { background: #ffcdd2; }
      #paper-analyzer-workspace .pa-row {
        display: flex; gap: 8px; align-items: flex-start;
        padding: 8px; border: 1px solid #eee; border-radius: 6px; margin-bottom: 6px;
      }
      #paper-analyzer-workspace .pa-badge {
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        padding: 2px 6px; border-radius: 999px; color: #fff; white-space: nowrap;
      }
      #paper-analyzer-workspace .pa-title {
        font-size: 12px; line-height: 1.35; word-break: break-word;
      }
      #paper-analyzer-workspace .pa-meta {
        font-size: 11px; color: #666; margin-top: 3px;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(panel);

    panel.querySelector('#pa-close').onclick = () => panel.remove();
    panel.querySelector('#pa-file').addEventListener('change', onFileChosen);

    panel.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      // Cancel must work even while a fetch is running
      if (btn.dataset.action === 'cancel') {
        if (typeof requestPaperAnalyzerCancel === 'function') {
          requestPaperAnalyzerCancel();
        } else {
          window.__PAPER_ANALYZER_CANCEL__ = true;
        }
        setStatus('Cancel requested — stopping after current paper…');
        return;
      }

      if (busy) return;

      if (btn.dataset.filter) {
        filter = btn.dataset.filter;
        render();
        return;
      }

      const action = btn.dataset.action;
      if (!action) return;

      try {
        busy = true;
        setStatus('Working…');
        if (action === 'scan') await doScan();
        else if (action === 'import') panel.querySelector('#pa-file').click();
        else if (action === 'export') doExport();
        else if (action === 'graphs') await doGraphs();
        else if (action === 'select-visible') selectVisible(true);
        else if (action === 'select-missing') selectMissingFailed();
        else if (action === 'select-batch') selectNextBatch();
        else if (action === 'select-none') selectVisible(false, true);
        else if (action === 'fetch') await doFetch();
        else if (action === 'clear') doClear();
      } catch (err) {
        console.error(err);
        setStatus('Error: ' + (err.message || err));
      } finally {
        busy = false;
        render();
      }
    });

    return panel;
  }

  function setStatus(text) {
    const el = document.getElementById('pa-status');
    if (el) el.textContent = text || '';
  }

  function visiblePapers() {
    const papers = workspace?.papers || [];
    if (filter === 'all') return papers;
    if (filter === 'failed') {
      return papers.filter(
        (p) => p.status === 'failed' || p.status === 'rate_limited'
      );
    }
    return papers.filter((p) => p.status === filter);
  }

  function render() {
    ensurePanel();
    if (!workspace) workspace = loadWorkspace();

    const c = counts(workspace);
    const prof = document.getElementById('pa-prof');
    const summary = document.getElementById('pa-summary');
    const delayEl = document.getElementById('pa-delay');
    const list = document.getElementById('pa-list');

    if (prof) {
      prof.textContent = workspace
        ? `${workspace.professorName || 'Unknown professor'}`
        : 'No workspace loaded — scan the page or import JSON';
    }
    if (summary) {
      summary.textContent = workspace
        ? `Total ${c.total} · Done ${c.done} · Missing ${c.pending} · Failed ${c.failed} · Selected ${c.selected}`
        : '';
    }
    if (delayEl) {
      const s =
        typeof getAnalyzerSettings === 'function'
          ? getAnalyzerSettings()
          : { fetchDelayMs: getFetchDelayMs(), cooldownMs: 0, batchSize: 0 };
      const sec = (s.fetchDelayMs / 1000).toFixed(1).replace(/\.0$/, '');
      const cool = Math.round((s.cooldownMs || 0) / 60000);
      delayEl.textContent = `Delay ${sec}s · cooldown ${cool}m · batch ${s.batchSize} (extension popup)`;
    }

    if (!list) return;
    list.innerHTML = '';

    const papers = visiblePapers();
    if (!workspace || !papers.length) {
      list.innerHTML =
        '<div style="padding:12px;color:#666;font-size:12px;">No papers in this view. Use Scan page or Load JSON.</div>';
      return;
    }

    papers.forEach((paper) => {
      const row = document.createElement('div');
      row.className = 'pa-row';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!paper.selected;
      cb.onchange = () => {
        paper.selected = cb.checked;
        saveWorkspace(workspace);
        render();
      };

      const body = document.createElement('div');
      body.style.flex = '1';

      const badge = document.createElement('span');
      badge.className = 'pa-badge';
      badge.textContent = paper.status || 'pending';
      badge.style.background =
        STATUS_COLORS[paper.status] || STATUS_COLORS.pending;

      const title = document.createElement('div');
      title.className = 'pa-title';
      title.textContent = paper.title || '(untitled)';

      const meta = document.createElement('div');
      meta.className = 'pa-meta';
      const citeCount = Object.keys(citationsToObject(paper.citations) || {}).length;
      const bits = [];
      if (paper.status === 'done') {
        bits.push(citeCount === 0 ? '0 citations (ok)' : `${citeCount} citation years`);
      }
      if (paper.message) bits.push(paper.message);
      if (paper.link) bits.push(paper.link.replace(/^https?:\/\//, '').slice(0, 60));
      meta.textContent = bits.join(' · ');

      body.appendChild(badge);
      body.appendChild(title);
      body.appendChild(meta);

      row.appendChild(cb);
      row.appendChild(body);
      list.appendChild(row);
    });
  }

  async function doScan() {
    setStatus('Scanning Scholar page…');
    workspace = await scanPageIntoWorkspace(workspace || loadWorkspace());
    setStatus(`Scanned ${workspace.papers.length} papers from page`);
    render();
  }

  function onFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        importJsonData(json);
      } catch (err) {
        setStatus('Invalid JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function importJsonData(json) {
    const meta = getProfessorMetaFromPage();
    const imported = workspaceFromImportedJson(json, meta);
    if (!workspace) {
      workspace = imported;
    } else {
      workspace.professorName =
        imported.professorName || workspace.professorName;
      workspace.professorLink =
        imported.professorLink || workspace.professorLink;
      workspace.cleanProfessorName =
        imported.cleanProfessorName || workspace.cleanProfessorName;
      workspace.papers = mergePapersByLink(workspace.papers, imported.papers);
    }
    workspace.status = 'ready';
    saveWorkspace(workspace);
    setStatus(
      `Loaded JSON — ${counts(workspace).done} done / ${counts(workspace).total} total after merge`
    );
    render();
  }

  function doExport() {
    if (!workspace) {
      setStatus('Nothing to export');
      return;
    }
    const points = workspaceToExportPoints(workspace);
    if (!points.length) {
      setStatus('No completed papers to export yet');
      return;
    }
    exportToJSON(
      points,
      workspace.professorName,
      workspace.professorLink,
      workspace.cleanProfessorName
    );
    setStatus(`Exported ${points.length} completed papers`);
  }

  async function doGraphs() {
    if (!workspace) return;
    const points = workspaceToExportPoints(workspace);
    if (!points.length) {
      setStatus('No completed papers to graph');
      return;
    }
    await loadChartJS();
    PlotGraphs(points);
    setStatus(`Rendered graphs for ${points.length} papers`);
  }

  function selectVisible(value, allInWorkspace = false) {
    if (!workspace) return;
    const targets = allInWorkspace ? workspace.papers : visiblePapers();
    targets.forEach((p) => {
      p.selected = !!value;
    });
    saveWorkspace(workspace);
  }

  function selectMissingFailed() {
    if (!workspace) return;
    workspace.papers.forEach((p) => {
      p.selected =
        p.status === 'pending' ||
        p.status === 'failed' ||
        p.status === 'rate_limited';
    });
    saveWorkspace(workspace);
    filter = 'all';
  }

  function selectNextBatch() {
    if (!workspace) return;
    const batchSize =
      typeof getAnalyzerSettings === 'function'
        ? getAnalyzerSettings().batchSize || 5
        : 5;
    const limit = batchSize > 0 ? batchSize : 5;

    workspace.papers.forEach((p) => {
      p.selected = false;
    });

    let picked = 0;
    for (const p of workspace.papers) {
      if (
        p.status === 'pending' ||
        p.status === 'failed' ||
        p.status === 'rate_limited'
      ) {
        p.selected = true;
        picked++;
        if (picked >= limit) break;
      }
    }
    saveWorkspace(workspace);
    filter = 'all';
    setStatus(`Selected next ${picked} missing/failed paper(s)`);
  }

  async function doFetch() {
    if (!workspace) {
      setStatus('Scan or load JSON first');
      return;
    }
    const selected = workspace.papers.filter((p) => p.selected);
    if (!selected.length) {
      setStatus('Select one or more papers first');
      return;
    }
    setStatus(`Fetching ${selected.length} selected papers…`);
    workspace = await fetchSelectedPapers(workspace, {
      onProgress: ({ message }) => setStatus(message),
    });
    render();
  }

  function doClear() {
    if (!confirm('Clear saved workspace for this professor?')) return;
    clearWorkspace(workspace);
    workspace = null;
    setStatus('Workspace cleared');
    render();
  }

  async function openPaperAnalyzerWorkspace(opts = {}) {
    ensurePanel();
    workspace = loadWorkspace();
    render();

    if (opts.importJson) {
      importJsonData(opts.importJson);
    }

    if (opts.autoScan && (!workspace || !(workspace.papers || []).length)) {
      await doScan();
    } else if (!workspace) {
      setStatus('Scan the page or load a professor JSON to begin');
    } else {
      setStatus('Workspace restored — review status and fetch selected papers');
    }

    if (opts.autoFetchMissing) {
      selectMissingFailed();
      await doFetch();
    }
  }

  window.openPaperAnalyzerWorkspace = openPaperAnalyzerWorkspace;
  window.paperAnalyzerImportJson = importJsonData;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== 'FROM_EXTENSION') return;

    if (typeof data.fetchDelayMs === 'number' && typeof setFetchDelayMs === 'function') {
      setFetchDelayMs(data.fetchDelayMs);
      render();
    }
    if (data.settings && typeof applyAnalyzerSettings === 'function') {
      applyAnalyzerSettings(data.settings);
      render();
    }

    // importJson can arrive without going through main()
    if (data.action === 'importJson' && data.importJson) {
      ensurePanel();
      workspace = loadWorkspace();
      importJsonData(data.importJson);
    }
  });
})();
