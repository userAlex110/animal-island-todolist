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
  if (sessionStorage.getItem('__p3_cleaned__')) return;
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith('animal-todo:') || k.startsWith('animal-island-todolist:v2:')) {
      localStorage.removeItem(k);
    }
  });
  sessionStorage.setItem('__p3_cleaned__', '1');
});
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push(String(e)));

try {
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // 1. stats bar present
  log('stats bar present', await page.locator('#statsBar').count() === 1);
  log('heatmap present', await page.locator('#heatmap').count() === 1);
  log('countdown present', await page.locator('#countdownCard').count() === 1);

  // 2. heatmap renders 371 cells
  const cellCount = await page.locator('.heatmap-cell').count();
  log('heatmap renders 371 cells', cellCount === 371, `count=${cellCount}`);

  // 3. all cells start at level 0 (no data)
  const level0 = await page.locator('.heatmap-cell.heat-0').count();
  log('all cells start heat-0', level0 === 371, `heat-0=${level0}`);

  // 4. inject historical pomodoros for one specific day
  const targetKey = await page.evaluate(() => {
    const t = new Date();
    const k = `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`;
    // 5 focus sessions for today → bucket to level 1 (≥ 1)
    localStorage.setItem(
      `animal-island-todolist:v2:pomodoros:${k}`,
      JSON.stringify(Array.from({length: 5}, () => ({kind: 'focus', completed: true})))
    );
    // 10 focus sessions for 30 days ago → bucket to level 3 (≥ 4)
    const d2 = new Date(t); d2.setDate(t.getDate() - 30);
    const k2 = `${d2.getFullYear()}-${d2.getMonth() + 1}-${d2.getDate()}`;
    localStorage.setItem(
      `animal-island-todolist:v2:pomodoros:${k2}`,
      JSON.stringify(Array.from({length: 12}, () => ({kind: 'focus', completed: true})))
    );
    return k;
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const todayCellLevel = await page.locator(`.heatmap-cell[data-date="${targetKey}"]`).getAttribute('data-level');
  log('today cell promoted to level ≥ 1', parseInt(todayCellLevel, 10) >= 1, `level=${todayCellLevel}`);

  // 5. countdown without examDate shows em-dash
  const cd0 = (await page.locator('#countdownValue').textContent()).trim();
  log('countdown shows em-dash without examDate', cd0 === '—', `text=${cd0}`);

  // 6. open modal via set button
  await page.locator('#countdownSetBtn').click();
  await page.waitForTimeout(200);
  log('exam modal opens', await page.locator('#examModalBackdrop').isVisible());

  // 7. set exam date 30 days out
  const future = new Date(); future.setDate(future.getDate() + 30);
  const iso = `${future.getFullYear()}-${String(future.getMonth()+1).padStart(2,'0')}-${String(future.getDate()).padStart(2,'0')}`;
  await page.locator('#examDateInput').fill(iso);
  await page.locator('.exam-modal-save').click();
  await page.waitForTimeout(200);
  const cd1 = (await page.locator('#countdownValue').textContent()).trim();
  log('countdown shows ~30 after save', cd1 === '30' || cd1 === '29' || cd1 === '31', `text=${cd1}`);
  log('modal closes after save', !(await page.locator('#examModalBackdrop').isVisible()));

  // 8. clear exam date
  await page.locator('#countdownSetBtn').click();
  await page.waitForTimeout(200);
  await page.locator('#examModalClear').click();
  await page.waitForTimeout(200);
  const cd2 = (await page.locator('#countdownValue').textContent()).trim();
  log('countdown resets to em-dash after clear', cd2 === '—', `text=${cd2}`);

  // 9. star stamp: complete all todos + 1 pomodoro today → star appears.
  // The default 3 todos have mixed `done` state. Click each checkbox as
  // needed to bring everything to `done: true`, then trigger one
  // applyStarStamp via the render() path. We tolerate click failures on
  // already-done cards by checking the final state.
  await page.evaluate(() => {
    document.querySelectorAll('.todo-card .checkbox').forEach(cb => {
      // Click once if card is not yet completed; twice if it's already
      // completed (so we end up at the same state either way).
      const card = cb.closest('.todo-card');
      if (card.classList.contains('completed')) cb.click();
      cb.click();
    });
  });
  await page.waitForTimeout(300);
  // Final safety: if anything is still not completed, force-flip via
  // localStorage + reload, then re-render.
  const allDone = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.todo-card')).every(c => c.classList.contains('completed'));
  });
  if (!allDone) {
    await page.evaluate(() => {
      const k = document.querySelector('.todo-card')?.dataset.id;
      // Walk the live data via the only stable surface: the inputs.
      // Simpler: dispatch toggleDone through every checkbox until all are
      // completed.
      let attempts = 0;
      while (attempts++ < 10 && !Array.from(document.querySelectorAll('.todo-card')).every(c => c.classList.contains('completed'))) {
        document.querySelectorAll('.todo-card .checkbox').forEach(cb => {
          const card = cb.closest('.todo-card');
          if (!card.classList.contains('completed')) cb.click();
        });
      }
    });
    await page.waitForTimeout(200);
  }
  // After completing all, star should appear (we already have 5 focus sessions in storage).
  const starVisible = await page.locator('#starStamp').isVisible();
  log('star stamp appears when all done + pomodoros', starVisible);

  // 10. star stamp hidden on non-today view
  await page.locator('button[aria-label="后一天"]').click();
  await page.waitForTimeout(900);
  const starOnTomorrow = await page.locator('#starStamp').isVisible();
  log('star stamp hidden on non-today view', !starOnTomorrow);

  log('no console errors', consoleErrors.length === 0,
      consoleErrors.length > 0 ? consoleErrors.slice(0,2).join('|') : '');

} catch (e) {
  log('test execution', false, String(e) + '\n' + (e.stack || ''));
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}

const passed = results.filter(r => r.pass).length;
const total = results.length;
console.log(`\n========== Phase 3 结果: ${passed}/${total} 通过 ==========`);
process.exit(passed === total ? 0 : 1);
