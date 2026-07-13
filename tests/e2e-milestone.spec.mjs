// Phase 5 — milestone roadmap (基础 0 / 强化 50 / 冲刺 200)
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
  if (sessionStorage.getItem('__p5_cleaned__')) return;
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith('animal-todo:') || k.startsWith('animal-island-todolist:v2:')) {
      localStorage.removeItem(k);
    }
  });
  sessionStorage.setItem('__p5_cleaned__', '1');
});
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push(String(e)));

try {
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // 1. Milestone bar present, 3 cards.
  const cardCount = await page.locator('#milestoneList .milestone-card').count();
  log('renders 3 milestone cards', cardCount === 3, `count=${cardCount}`);

  // 2. With zero sessions, only foundation (idx 0) is reached; the pin
  //    "你在 🟢" appears only on the current stage.
  const reachedAtZero = await page.locator('#milestoneList .milestone-card.reached').count();
  log('zero sessions → only foundation reached', reachedAtZero === 1, `reached=${reachedAtZero}`);
  const pinOnZero = await page.locator('#milestoneList .milestone-card.current').count();
  log('only one current pin at zero', pinOnZero === 1, `pin=${pinOnZero}`);

  // 3. Hint says "再 X 个番茄 → 解锁 强化期".
  const hint0 = (await page.locator('#milestoneHint').textContent()).trim();
  log('hint points to next stage at zero', hint0.includes('强化期') && hint0.includes('50'),
      `hint=${hint0}`);

  // 4. Inject 50 focus sessions to enter reinforce — spread over past 50 days
  //    so getAllPomodoros() picks them up (50 🍅 > single-day means the daily
  //    bucket doesn't matter; we just need 50 keys with one session each).
  await page.evaluate(() => {
    const prefix = 'animal-island-todolist:v2:pomodoros:';
    const t = new Date();
    for (let i = 0; i < 50; i++) {
      const d = new Date(t);
      d.setDate(t.getDate() - i);
      const k = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
      localStorage.setItem(prefix + k, JSON.stringify([{kind:'focus', completed:true}]));
    }
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const reachedAt50 = await page.locator('#milestoneList .milestone-card.reached').count();
  log('50 sessions → foundation + reinforce reached', reachedAt50 === 2, `reached=${reachedAt50}`);
  const currentAt50Id = await page.locator('#milestoneList .milestone-card.current').getAttribute('data-id');
  log('pin lands on reinforce at 50', currentAt50Id === 'reinforce', `id=${currentAt50Id}`);
  const hint50 = (await page.locator('#milestoneHint').textContent()).trim();
  log('hint points to sprint at 50', hint50.includes('冲刺期') && hint50.includes('150'),
      `hint=${hint50}`);

  // 5. Bump to 200 → sprint unlocks.
  await page.evaluate(() => {
    const prefix = 'animal-island-todolist:v2:pomodoros:';
    const t = new Date();
    for (let i = 50; i < 200; i++) {
      const d = new Date(t);
      d.setDate(t.getDate() - i);
      const k = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
      localStorage.setItem(prefix + k, JSON.stringify([{kind:'focus', completed:true}]));
    }
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const reachedAt200 = await page.locator('#milestoneList .milestone-card.reached').count();
  log('200 sessions → all 3 milestones reached', reachedAt200 === 3, `reached=${reachedAt200}`);
  const currentAt200Id = await page.locator('#milestoneList .milestone-card.current').getAttribute('data-id');
  log('pin lands on sprint at 200', currentAt200Id === 'sprint', `id=${currentAt200Id}`);
  const hint200 = (await page.locator('#milestoneHint').textContent()).trim();
  log('hint celebrates max stage at 200', hint200.includes('冲刺期') && hint200.includes('200'),
      `hint=${hint200}`);

  log('no console errors', consoleErrors.length === 0,
      consoleErrors.length > 0 ? consoleErrors.slice(0, 2).join('|') : '');

} catch (e) {
  log('test execution', false, String(e) + '\n' + (e.stack || ''));
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}

const passed = results.filter(r => r.pass).length;
const total = results.length;
console.log(`\n========== Phase 5 结果: ${passed}/${total} 通过 ==========`);
process.exit(passed === total ? 0 : 1);
