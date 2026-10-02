# Paper Analyzer — Changelog & known issues

## Known problems (Google Scholar)

These are **Scholar-side / browser limits**, not ORIC account bugs:

1. **Rate limiting / CAPTCHA**  
   Fetching many citation pages quickly triggers Google’s “unusual traffic” / too-many-requests block.  
   **What to do:** Stop, wait 30–60+ minutes, use **Safe** or **Paranoid** pacing, fetch small batches (2–5 papers), export JSON often.

2. **Regional Scholar domains (CORS)**  
   Profiles on `scholar.google.com.pk` (and similar) sometimes link to `scholar.google.com`. Cross-host fetches are blocked by the browser.  
   **Status:** Fixed by rewriting links to the current Scholar host (v1.1.2+).

3. **Zero-citation papers look “missing”**  
   Papers with no citations often have no year graph; older builds treated that as failure.  
   **Status:** Treated as successful **done** with 0 citations (v1.1.2+).

4. **Interrupted runs**  
   Navigating away or reloading mid-fetch used to lose progress.  
   **Status:** Progress is checkpointed; incomplete jobs can resume; you can load an existing professor JSON and fetch only what’s left.

5. **Re-injecting the extension script**  
   Reloading the extension without refreshing the tab could throw `Identifier already been declared`.  
   **Status:** Reinjection-safe (v1.1.3+). Refresh the Scholar tab after updating the extension.

---

## Version history

### 1.2.0
- Safer defaults against rate limits (8s delay, 10m cooldown, batch of 5)
- Presets: Normal / Safe / Paranoid
- Auto cooldown + one retry when rate-limited (cancellable countdown)
- **Select next batch** for small fetches

### 1.1.4
- **Cancel** button (panel + progress UI); progress is kept

### 1.1.3
- Fix crash when analyzer script was injected twice

### 1.1.2
- Fix CORS on regional hosts (e.g. `.com.pk` → same-origin fetches)
- Zero-citation papers marked done correctly

### 1.1.1
- Configurable delay between paper fetches (extension popup)

### 1.1.0
- Interactive workspace: per-paper status, select what to fetch
- Load / merge professor JSON; export anytime
- Failures and rate limits don’t wipe completed papers

### 1.0.x
- Initial analyze flow; regional URL detection improvements

---

## Practical tips

- Prefer **Select next batch → Fetch selected** over selecting everything.
- Raise delay / use **Paranoid** if blocks keep happening.
- **Export JSON** after each successful batch.
- After updating the extension: reload it in `chrome://extensions`, then **refresh** the Scholar page.
