// lib/studio/quick-actions.ts ← "ปุ่มลัดใต้ช่องชื่อ/คำอธิบายของ Studio"; the bars now live in Shadow DOM
export default {
  file: 'lib/studio/quick-actions.ts',
  regions: ['2258-2384', '2386-2402', '2404-2418'],
  subs: [
    ['GM_setClipboard(normText(getTitleBox(host)?.textContent));', 'void navigator.clipboard.writeText(normText(getTitleBox(host)?.textContent)).catch(() => {});', 1],
    ["GM_setClipboard(getDescBox(host)?.innerText || '');", "void navigator.clipboard.writeText(getDescBox(host)?.innerText || '').catch(() => {});", 1],
    ['GM_addStyle(`', 'const QA_CSS = (`', 1],
    ['html[dark] ', ':host-context(html[dark]) ', 8],
    ['tEl.after(qaTitleBar(host));', 'tEl.after(qaHost(qaTitleBar(host)));', 1],
    ['dEl.after(qaDescBar(host));', 'dEl.after(qaHost(qaDescBar(host)));', 1],
  ],
};
