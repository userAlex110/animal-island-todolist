import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Tests live under tests/ but serve files from the project root.
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
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise(r => server.listen(8080, r));

const results = [];
function log(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

// Real wall-clock test: start a real 1-second session so we don't depend on
// Playwright's clock API for visibilitychange timing (which requires the
// `__e2e_cleaned__` flag and is overkill for a 25:00 entry button).
async function run() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('__p1_cleaned__')) return;
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('animal-todo:') || k.startsWith('animal-island-todolist:v2:')) {
        localStorage.removeItem(k);
      }
    });
    sessionStorage.setItem('__p1_cleaned__', '1');
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(String(e)));

  try {
    await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // 1. Migration: legacy animal-todo: keys gone, v2 + migrated marker exist.
    const keysAfterLoad = await page.evaluate(() => Object.keys(localStorage));
    log('migration marker present', keysAfterLoad.includes('animal-island-todolist:v2:migrated'));
    log('legacy animal-todo:* absent', !keysAfterLoad.some(k => k.startsWith('animal-todo:')));

    // 2. Entry button present, shows 25:00.
    const entryText0 = (await page.locator('#pomodoroEntry').textContent()).trim();
    log('entry button shows 25:00', entryText0 === '🍅 25:00', `text=${entryText0}`);

    // 3. Click entry → focus mode activates, paper-sheet gets .is-focus-mode,
    //    pomodoroPanel becomes visible, time ticks below 25:00.
    await page.locator('#pomodoroEntry').click();
    await page.waitForTimeout(150);
    const isFocus = await page.locator('#paperSheet').evaluate(el => el.classList.contains('is-focus-mode'));
    log('focus mode activates', isFocus);
    const panelVisible = await page.locator('#pomodoroPanel').isVisible();
    log('pomodoro panel visible', panelVisible);
    const timeAfterStart = (await page.locator('#pomodoroTime').textContent()).trim();
    const mm = parseInt(timeAfterStart.split(':')[0], 10);
    log('time ticks down (≤25)', mm <= 25 && mm >= 24, `time=${timeAfterStart}`);

    // 4. SVG ring offset grows as time elapses (offset = C * (1 - ratio)).
    const offsetA = await page.locator('.pomodoro-ring circle.fg').getAttribute('stroke-dashoffset');
    await page.waitForTimeout(700);
    const offsetB = await page.locator('.pomodoro-ring circle.fg').getAttribute('stroke-dashoffset');
    log('ring offset grows over time', parseFloat(offsetB) > parseFloat(offsetA),
        `a=${parseFloat(offsetA).toFixed(2)} b=${parseFloat(offsetB).toFixed(2)}`);

    // 5. Per-todo mini button (🍅) launches a session linked to that todo.
    // First reset, then click the first card's mini button.
    await page.locator('#focusGiveupBtn').click();
    await page.waitForTimeout(200);
    const idleAfterReset = await page.locator('#pomodoroEntry').textContent();
    log('reset returns to idle 25:00', idleAfterReset.includes('25:00'), `text=${idleAfterReset.trim()}`);
    // Per-todo mini button is opacity:0 by default — force click.
    await page.locator('.todo-card').first().hover();
    await page.locator('.todo-card').first().locator('.pomo-mini-btn').click({ force: true });
    await page.waitForTimeout(150);
    const subjectText = (await page.locator('#pomodoroSubject').textContent()).trim();
    log('mini button links to todo title', subjectText === '去博物馆看化石展', `subject=${subjectText}`);

    // 6. visibilitychange simulation: endAt already passed → finishPomodoro()
    // We can't realistically wait 25min, so we mutate endAt in the page
    // and dispatch a visibilitychange event to prove the recovery path.
    await page.evaluate(() => {
      // Reach into the closure-backed module via window if exposed; otherwise
      // simulate by dispatching after fast-forwarding via the function below.
      window.__simulatePomodoroEnd?.();
    });
    // Easier: directly fast-forward by manipulating Date.now via injecting
    // an artificial delay. The cleanest way is to fake `Date.now` here.
    await page.evaluate(() => {
      const realNow = Date.now.bind(Date);
      const baseTime = realNow();
      // Pretend 26 minutes have already passed since the session started.
      Date.now = () => baseTime + 26 * 60 * 1000;
    });
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(300);
    // After 26min wall-clock fast-forward + visibilitychange, the focus
    // session should auto-finalize into a short break (kind: shortBreak).
    const subjectAfter = (await page.locator('#pomodoroSubject').textContent()).trim();
    log('auto-transition to short break', subjectAfter.includes('短休息'), `subject=${subjectAfter}`);

    // 7. Final state: at least one pomodoro session persisted for today.
    const pomKeys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('animal-island-todolist:v2:pomodoros:')));
    log('pomodoro sessions persisted', pomKeys.length > 0, `keys=${pomKeys.join(',')}`);

    // 8. Reset brings us back to idle.
    await page.locator('#focusGiveupBtn').click();
    await page.waitForTimeout(200);
    const idleAgain = await page.locator('#pomodoroEntry').textContent();
    log('reset returns to 25:00', idleAgain.includes('25:00'), `text=${idleAgain.trim()}`);

    log('no console errors', consoleErrors.length === 0,
        consoleErrors.length > 0 ? consoleErrors.slice(0,2).join('|') : '');

  } catch (e) {
    log('test execution', false, String(e) + '\n' + (e.stack || ''));
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
}

await run();
const passed = results.filter(r => r.pass).length;
const total = results.length;
console.log(`\n========== Phase 1 结果: ${passed}/${total} 通过 ==========`);
process.exit(passed === total ? 0 : 1);
