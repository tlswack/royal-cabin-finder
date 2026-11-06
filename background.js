// Opens the app page, and runs searches inside a royalcaribbean.com tab so requests
// carry the browser's real Royal session (their bot protection blocks anything else).

const ROYAL = 'https://www.royalcaribbean.com/cruises';
const APP = chrome.runtime.getURL('app.html');

chrome.action.onClicked.addListener(async () => {
  const [existing] = await chrome.tabs.query({ url: APP });
  if (existing) { await chrome.tabs.update(existing.id, { active: true }); await chrome.windows.update(existing.windowId, { focused: true }); }
  else await chrome.tabs.create({ url: APP });
});

async function royalTab() {
  const { workerTabId } = await chrome.storage.local.get('workerTabId');
  if (workerTabId) {
    try {
      const t = await chrome.tabs.get(workerTabId);
      if (t && t.url && t.url.startsWith('https://www.royalcaribbean.com/')) return t.id;
    } catch (e) { /* tab is gone */ }
  }
  const t = await chrome.tabs.create({ url: ROYAL, active: false, pinned: true });
  await chrome.storage.local.set({ workerTabId: t.id });
  await new Promise((resolve) => {
    const done = (id, info) => { if (id === t.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(done); resolve(); } };
    chrome.tabs.onUpdated.addListener(done);
    setTimeout(resolve, 20000);
  });
  await new Promise((r) => setTimeout(r, 2500)); // let Royal's bot check settle
  return t.id;
}

async function runInRoyal(command, payload) {
  const tabId = await royalTab();
  await chrome.scripting.executeScript({ target: { tabId }, files: ['scanner.js'] });
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (command, payload) => window.__fcf.run(command, payload),
    args: [command, payload],
  });
  return res && res.result;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.fcf) return;
  (async () => {
    try {
      if (msg.fcf === 'filters') sendResponse({ ok: true, data: await runInRoyal('filters') });
      else if (msg.fcf === 'count') sendResponse({ ok: true, data: await runInRoyal('count', msg.search) });
      else if (msg.fcf === 'scan') { runInRoyal('scan', msg.search); sendResponse({ ok: true }); }
      else if (msg.fcf === 'cancel') { await chrome.storage.local.set({ cancel: true }); sendResponse({ ok: true }); }
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message || e) });
    }
  })();
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { workerTabId, scan } = await chrome.storage.local.get(['workerTabId', 'scan']);
  if (tabId === workerTabId) {
    await chrome.storage.local.remove('workerTabId');
    if (scan && scan.phase === 'scan') await chrome.storage.local.set({ scan: { ...scan, phase: 'error', error: 'The Royal Caribbean tab was closed, so the scan stopped. Results so far are kept.' } });
  }
});
