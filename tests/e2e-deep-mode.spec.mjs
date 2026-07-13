// Phase 2 — 45/10 deep mode + WebAudio bell.
// Headless Chromium has no audio output but the unlockAudio/playBell paths
// still need to be reachable without throwing. We only assert on observable
// DOM/JS state, not on actual sound reproduction.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.svg':  'image/svg+xml',
};
const server = http.createServer(async (req, res) => {
  const rel = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  if (rel.includes('..')) { res.writeHead(400); return res.end(); }
  try {
    const data = await fs.readFile(path.join(ROOT, rel));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(8080, r));

const results = [];
function log(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext();
await ctx.addInitScript(() => {
  if (sessionStorage.getItem('__p2_cleaned__')) return;
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith('animal-todo:') || k.startsWith('animal-island-todolist:v2:')) {
      localStorage.removeItem(k);
    }
  });
  sessionStorage.setItem('__p2_cleaned__', '1');
});
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push(String(e)));

try {
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // 1. Mode toggle present with two segments.
  const segCount = await page.locator('.mode-toggle .mode-segment').count();
  log('mode toggle has 2 segments', segCount === 2, `count=${segCount}`);

  // 2. Default mode = classic → entry button shows 25:00.
  const entry0 = (await page.locator('#pomodoroEntry').textContent()).trim();
  log('default mode classic → 25:00', entry0 === '🍅 25:00', `text=${entry0}`);

  // 3. classic segment is .active on first paint.
  const classicActive0 = await page.locator('.mode-segment[data-mode="classic"]').evaluate(el => el.classList.contains('active'));
  log('classic segment active by default', classicActive0);

  // 4. Click deep segment → entry button flips to 45:00, deep becomes .active.
  // The mode-toggle lives inside the pomodoro panel which is hidden in idle,
  // so we drive setPomodoroMode through page.evaluate (the actual UI path
  // is also covered below in step 6 once the panel is open).
  await page.evaluate(() => setPomodoroMode('deep'));
  await page.waitForTimeout(100);
  const entry1 = (await page.locator('#pomodoroEntry').textContent()).trim();
  log('deep mode → 45:00', entry1 === '🍅 45:00', `text=${entry1}`);
  const deepActive = await page.locator('.mode-segment[data-mode="deep"]').evaluate(el => el.classList.contains('active'));
  log('deep segment becomes active', deepActive);
  const classicInactive = await page.locator('.mode-segment[data-mode="classic"]').evaluate(el => !el.classList.contains('active'));
  log('classic segment becomes inactive', classicInactive);

  // 5. Starting in deep mode uses 45min window. We don't actually wait 45
  // minutes — instead inspect that focusMs in POMODORO_MODES.deep is 45*60*1000.
  const deepFocusMs = await page.evaluate(() => POMODORO_MODES.deep.focusMs);
  log('POMODORO_MODES.deep.focusMs = 45min', deepFocusMs === 45 * 60 * 1000, `ms=${deepFocusMs}`);
  const deepBreakMs = await page.evaluate(() => POMODORO_MODES.deep.breakMs);
  log('POMODORO_MODES.deep.breakMs = 10min', deepBreakMs === 10 * 60 * 1000, `ms=${deepBreakMs}`);

  // 6. Visually clicking the deep segment inside the open panel also works.
  await page.locator('#pomodoroEntry').click();
  await page.waitForTimeout(150);
  const panelVisible = await page.locator('#pomodoroPanel').isVisible();
  log('panel opens via entry', panelVisible);
  // Switch back to classic via the real toggle button click.
  await page.locator('.mode-segment[data-mode="classic"]').click();
  await page.waitForTimeout(150);
  const entry2 = (await page.locator('#pomodoroEntry').textContent()).trim();
  log('click classic → back to 25:00', entry2 === '🍅 25:00', `text=${entry2}`);
  const classicActive1 = await page.locator('.mode-segment[data-mode="classic"]').evaluate(el => el.classList.contains('active'));
  log('classic segment active after click', classicActive1);

  // Reset and verify reset does not change mode (mode is independent of session state).
  // Step 6's mode click reset the in-flight session, closing the panel; reopen it.
  if (!(await page.locator('#pomodoroPanel').isVisible())) {
    await page.locator('#pomodoroEntry').click();
    await page.waitForTimeout(150);
  }
  await page.locator('#focusGiveupBtn').click();
  await page.waitForTimeout(200);
  const entry3 = (await page.locator('#pomodoroEntry').textContent()).trim();
  log('reset preserves current mode (25:00)', entry3 === '🍅 25:00', `text=${entry3}`);

  // 7. Bell button reachable, playBell does not throw in headless.
  // Headless chromium has --mute-audio by default but WebAudio nodes still
  // build. We invoke through page.evaluate to bypass visibility checks
  // (the button only exists inside the focus panel); the unlockAudio +
  // playBell paths must run without producing console errors.
  const bellOk = await page.evaluate(() => {
    try { unlockAudio(); playBell('focusEnd'); playBell('breakEnd'); return true; }
    catch (e) { return String(e); }
  });
  log('playBell / unlockAudio do not throw', bellOk === true, `result=${bellOk}`);

  // 8. Auto-transition into the long break after fast-forwarding past a
  // 45-minute (or 25-minute — same code path) focus window. Reuse the
  // Date.now monkey-patch trick: pretend 26 minutes passed.
  await page.evaluate(() => setPomodoroMode('deep'));
  await page.waitForTimeout(100);
  await page.locator('#pomodoroEntry').click();
  await page.waitForTimeout(150);
  // Deep mode focusMs = 45min. Jump Date.now past that window so the
  // visibilitychange handler finalizes the focus session, which should
  // auto-transition us into a 10-minute long break labeled
  // "☕ 10 分钟休息".
  await page.evaluate(() => {
    const realNow = Date.now.bind(Date);
    const baseTime = realNow();
    Date.now = () => baseTime + 46 * 60 * 1000;
  });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(300);
  const subjectAfter = (await page.locator('#pomodoroSubject').textContent()).trim();
  // deep → 10-minute break labels as "☕ 10 分钟休息"
  log('deep mode break auto-transition shows 10 min rest', /10\s*分钟\s*休息/.test(subjectAfter),
      `subject=${subjectAfter}`);
  // deep → 10-minute break labels as "☕ 10 分钟休息"
  log('deep mode break auto-transition shows 10 min rest', /10\s*分钟\s*休息/.test(subjectAfter),
      `subject=${subjectAfter}`);

  log('no console errors (final)', consoleErrors.length === 0,
      consoleErrors.length > 0 ? consoleErrors.slice(0, 2).join('|') : '');

} catch (e) {
  log('test execution', false, String(e) + '\n' + (e.stack || ''));
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}

const passed = results.filter(r => r.pass).length;
const total = results.length;
console.log(`\n========== Phase 2 结果: ${passed}/${total} 通过 ==========`);
process.exit(passed === total ? 0 : 1);
