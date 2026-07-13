// Phase 4 — settings drawer (subjects + daily goal + JSON import/export)
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
const ctx = await browser.newContext({ acceptDownloads: true });
await ctx.addInitScript(() => {
  if (sessionStorage.getItem('__p4_cleaned__')) return;
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith('animal-todo:') || k.startsWith('animal-island-todolist:v2:')) {
      localStorage.removeItem(k);
    }
  });
  sessionStorage.setItem('__p4_cleaned__', '1');
});
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push(String(e)));

try {
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // 1. Gear button opens the drawer.
  log('gear button present', await page.locator('#openSettingsBtn').count() === 1);
  await page.locator('#openSettingsBtn').click();
  await page.waitForTimeout(400);
  log('drawer opens', await page.locator('#settingsDrawer').isVisible());
  log('backdrop opens', await page.locator('#settingsBackdrop').isVisible());

  // 2. Add a subject via the form.
  await page.locator('#newSubjectInput').fill('数据结构');
  await page.locator('.subjects-add-row button[type="submit"]').click();
  await page.waitForTimeout(150);
  const subjectsCount = await page.locator('#subjectsList .subject-chip-row').count();
  log('subject added to list', subjectsCount === 1, `count=${subjectsCount}`);
  const subjectText = (await page.locator('.subject-chip').first().textContent()).trim();
  log('subject text correct', subjectText.includes('数据结构'), `text=${subjectText}`);

  // 3. Add a second subject, then remove the first.
  await page.locator('#newSubjectInput').fill('英语阅读');
  await page.locator('.subjects-add-row button[type="submit"]').click();
  await page.waitForTimeout(150);
  log('two subjects total', (await page.locator('#subjectsList .subject-chip-row').count()) === 2);
  await page.locator('.subject-remove-btn').first().click();
  await page.waitForTimeout(150);
  const remaining = await page.locator('#subjectsList .subject-chip-row').count();
  log('remove subject works', remaining === 1, `count=${remaining}`);

  // 4. Daily goal: invalid input rejected, valid one persisted.
  await page.locator('#dailyGoalInput').fill('0');
  await page.locator('.goal-row button').click();
  await page.waitForTimeout(150);
  const goalStored0 = await page.evaluate(() => getSettings().dailyGoal);
  // 0 is not > 0, so saveDailyGoal should leave it alone.
  log('daily goal rejects 0', !goalStored0, `stored=${goalStored0}`);

  await page.locator('#dailyGoalInput').fill('8');
  await page.locator('.goal-row button').click();
  await page.waitForTimeout(200);
  const goalStored1 = await page.evaluate(() => getSettings().dailyGoal);
  log('daily goal accepts 8', goalStored1 === 8, `stored=${goalStored1}`);

  // Inject 10 focus sessions for today via localStorage, then re-open
  // drawer → goal should show "10 / 8" with hit highlight.
  await page.evaluate(() => {
    const k = `animal-island-todolist:v2:pomodoros:${dateKey(new Date())}`;
    localStorage.setItem(k, JSON.stringify(Array.from({length: 10}, () => ({kind: 'focus', completed: true}))));
  });
  await page.locator('.goal-row button').click(); // re-save → triggers renderGoalProgress
  await page.waitForTimeout(150);
  // Goal progress re-renders on its own only when save is hit. Use explicit
  // openSettings call to refresh.
  await page.locator('#openSettingsBtn').click({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
  // Force a re-open via openSettings() through evaluate because clicking the
  // gear a second time would close instead of re-render.
  await page.evaluate(() => { document.getElementById('settingsDrawer').hidden = true; document.getElementById('settingsBackdrop').hidden = true; });
  await page.locator('#openSettingsBtn').click();
  await page.waitForTimeout(400);
  const progressText = (await page.locator('#goalProgress').textContent()).trim();
  log('goal progress shows 10 / 8', progressText.includes('10') && progressText.includes('目标 8'),
      `text=${progressText}`);
  const hitClass = await page.locator('#goalProgress .goal-progress-text').evaluate(el => el.classList.contains('goal-hit'));
  log('goal hit highlight applied', hitClass);

  // 5. Export → triggers download. We listen to the download event and read
  // the bytes; parse them and confirm structure + presence of subjects/dailyGoal.
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    page.locator('button.drawer-btn:has-text("导出")').click(),
  ]);
  const exportPath = await download.path();
  const exportText = await fs.readFile(exportPath, 'utf8');
  const exportObj = JSON.parse(exportText);
  log('export has __app header', exportObj.__app === 'animal-island-todolist:v2');
  log('export has subjects key', Array.isArray(exportObj.keys['animal-island-todolist:v2:settings']?.subjects)
      && exportObj.keys['animal-island-todolist:v2:settings'].subjects.includes('英语阅读'));
  log('export has dailyGoal=8', exportObj.keys['animal-island-todolist:v2:settings']?.dailyGoal === 8);

  // 6. Import round-trip: wipe localStorage (except migration marker is
  // recreated on next load by runMigration; we just delete the v2 settings
  // key) then re-import the downloaded JSON and confirm data is restored.
  await page.evaluate(() => {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('animal-island-todolist:v2:')) localStorage.removeItem(k);
    });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  // After full reload, drawer is hidden. The "import" file input lives
  // inside the drawer → open drawer first.
  await page.locator('#openSettingsBtn').click();
  await page.waitForTimeout(400);
  // Use setInputFiles on the <input type="file"> directly.
  await page.locator('#importFileInput').setInputFiles(exportPath);
  await page.waitForTimeout(500);
  const restored = await page.evaluate(() => {
    const s = getSettings();
    return { subjects: s.subjects, goal: s.dailyGoal };
  });
  log('import restores subjects', Array.isArray(restored.subjects) && restored.subjects.includes('英语阅读'),
      `subjects=${JSON.stringify(restored.subjects)}`);
  log('import restores dailyGoal=8', restored.goal === 8, `goal=${restored.goal}`);

  // 7. Drawer closes on ESC.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  log('ESC closes drawer', !(await page.locator('#settingsDrawer').isVisible()));

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
console.log(`\n========== Phase 4 结果: ${passed}/${total} 通过 ==========`);
process.exit(passed === total ? 0 : 1);
