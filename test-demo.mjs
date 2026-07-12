import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// ------------------------------------------------------------
// Tiny static HTTP server (serves the project root on :8080)
// ------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.json': 'application/json; charset=utf-8',
};

async function serve(req, res) {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let rel = urlPath === '/' ? '/index.html' : urlPath;
    if (rel.includes('..')) { res.writeHead(400); return res.end('bad path'); }

    const filePath = path.join(ROOT, rel);
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found: ' + req.url);
  }
}

const server = http.createServer(serve);
await new Promise(r => server.listen(8080, r));
console.log('✓ test server up at http://localhost:8080');

const results = [];
function log(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
// Use a fresh context with a clean localStorage on every page load.
// addInitScript runs before the page's own scripts, so it can clear storage
// that another tab / previous run may have written under the same origin.
// We use a sessionStorage flag so the cleanup runs once per browser context;
// otherwise reload() would also wipe data the test just persisted.
const context = await browser.newContext();
await context.addInitScript(() => {
  try {
    if (sessionStorage.getItem('__e2e_cleaned__')) return;
    const ns = 'animal-island-todolist:v2:';
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('animal-todo:') || k.startsWith(ns)) {
        localStorage.removeItem(k);
      }
    });
    sessionStorage.setItem('__e2e_cleaned__', '1');
  } catch {}
});

const page = await context.newPage();

const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(String(err)));

let exitCode = 0;
try {
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // 1. 页面加载
  const title = await page.title();
  log('页面加载', title.includes('动物岛'), `title=${title}`);

  const cardCount = await page.locator('.todo-card').count();
  log('初始3条示例待办', cardCount === 3, `count=${cardCount}`);

  // 2. 波浪分隔线
  const waveDivider = await page.locator('.wave-divider').count();
  log('波浪分隔线存在', waveDivider === 1, `count=${waveDivider}`);
  const waveSrc = await page.locator('.wave-divider').getAttribute('src');
  log('波浪分隔线URL正确', waveSrc && waveSrc.includes('wave-yellow.svg'), `src=${waveSrc}`);

  // 3. 回到今天按钮（今天应隐藏）
  const backBtnDisplay = await page.locator('#backTodayBtn').evaluate(el => getComputedStyle(el).display);
  log('回到今天按钮今天隐藏', backBtnDisplay === 'none', `display=${backBtnDisplay}`);

  // 4. 输入不丢焦 — 示例数据自带标题，必须先清空再输入
  const firstTitleInput = page.locator('.todo-title').first();
  await firstTitleInput.click();
  await firstTitleInput.fill('');
  await firstTitleInput.pressSequentially('测试标题输入', { delay: 20 });
  await page.waitForTimeout(200);
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
  const focusedClass = await page.evaluate(() => document.activeElement?.className);
  log('输入标题后仍聚焦', focusedTag === 'INPUT' && (focusedClass || '').includes('todo-title'), `tag=${focusedTag} class=${focusedClass}`);
  const titleVal = await page.locator('.todo-title').first().inputValue();
  log('标题数据已更新', titleVal === '测试标题输入', `value=${titleVal}`);

  // 5. textarea 输入不丢焦
  const firstTextarea = page.locator('.todo-note textarea').first();
  await firstTextarea.click();
  await firstTextarea.fill('');
  await firstTextarea.pressSequentially('这是笔记内容测试', { delay: 20 });
  await page.waitForTimeout(200);
  const focusedTag2 = await page.evaluate(() => document.activeElement?.tagName);
  log('输入笔记后仍聚焦', focusedTag2 === 'TEXTAREA', `tag=${focusedTag2}`);
  const noteVal = await firstTextarea.inputValue();
  log('笔记数据已更新', noteVal === '这是笔记内容测试', `value=${noteVal}`);

  // 6. 勾选完成 — 印章显示
  const firstCheckbox = page.locator('.todo-card').first().locator('.checkbox');
  await firstCheckbox.click();
  await page.waitForTimeout(300);
  const firstCardCompleted = await page.locator('.todo-card').first().evaluate(el => el.classList.contains('completed'));
  log('勾选后card有completed class', firstCardCompleted, `completed=${firstCardCompleted}`);
  const stampOpacity = await page.locator('.todo-card').first().locator('.stamp').evaluate(el => getComputedStyle(el).opacity);
  log('勾选后印章显示', stampOpacity === '1', `opacity=${stampOpacity}`);
  const progressText = await page.locator('#progressText').textContent();
  log('进度条文本更新', progressText.includes('2 / 3'), `text=${progressText}`);

  // 7. 取消勾选
  await firstCheckbox.click();
  await page.waitForTimeout(300);
  const firstCardCompleted2 = await page.locator('.todo-card').first().evaluate(el => el.classList.contains('completed'));
  log('取消勾选后card无completed', !firstCardCompleted2, `completed=${firstCardCompleted2}`);
  const stampOpacity2 = await page.locator('.todo-card').first().locator('.stamp').evaluate(el => getComputedStyle(el).opacity);
  log('取消勾选后印章隐藏', stampOpacity2 === '0', `opacity=${stampOpacity2}`);

  // 8. 展开收起
  const thirdCard = page.locator('.todo-card').nth(2);
  const thirdExpandedBefore = await thirdCard.evaluate(el => el.classList.contains('expanded'));
  await thirdCard.hover();
  await page.waitForTimeout(200);
  await thirdCard.locator('.expand-hint').click({ force: true });
  await page.waitForTimeout(400);
  const thirdExpandedAfter = await thirdCard.evaluate(el => el.classList.contains('expanded'));
  log('展开收起切换class', thirdExpandedBefore === false && thirdExpandedAfter === true, `before=${thirdExpandedBefore} after=${thirdExpandedAfter}`);

  // 9. 删除待办 — 内联确认
  await thirdCard.hover();
  await page.waitForTimeout(200);
  await thirdCard.locator('.delete-icon').click();
  await page.waitForTimeout(300);
  const confirmBar = await thirdCard.locator('.delete-confirm').count();
  log('点击删除显示确认条', confirmBar === 1, `count=${confirmBar}`);

  await thirdCard.locator('.confirm-no').click();
  await page.waitForTimeout(300);
  const confirmBarAfterCancel = await thirdCard.locator('.delete-confirm').count();
  log('取消删除移除确认条', confirmBarAfterCancel === 0, `count=${confirmBarAfterCancel}`);
  const cardCountAfterCancel = await page.locator('.todo-card').count();
  log('取消后卡片仍在', cardCountAfterCancel === 3, `count=${cardCountAfterCancel}`);

  await thirdCard.hover();
  await page.waitForTimeout(200);
  await thirdCard.locator('.delete-icon').click();
  await page.waitForTimeout(300);
  await thirdCard.locator('.confirm-yes').click();
  await page.waitForTimeout(300);
  const cardCountAfterDelete = await page.locator('.todo-card').count();
  log('确认删除后卡片减少', cardCountAfterDelete === 2, `count=${cardCountAfterDelete}`);

  // 10. 空状态
  const remaining = await page.locator('.todo-card').count();
  for (let i = 0; i < remaining; i++) {
    const card = page.locator('.todo-card').first();
    await card.hover();
    await page.waitForTimeout(100);
    await card.locator('.delete-icon').click();
    await page.waitForTimeout(200);
    await card.locator('.confirm-yes').click();
    await page.waitForTimeout(300);
  }
  const emptyState = await page.locator('.empty-state').count();
  log('删完显示空状态', emptyState === 1, `count=${emptyState}`);
  const emptyText = await page.locator('.empty-text').textContent();
  log('空状态文案正确', emptyText && emptyText.includes('今天还没有待办'), `text=${emptyText}`);
  const emptyProgress = await page.locator('#progressText').textContent();
  log('空状态进度0/0', emptyProgress && emptyProgress.includes('0 / 0'), `text=${emptyProgress}`);

  // 11. 空状态新增
  await page.locator('.empty-add-btn').click();
  await page.waitForTimeout(300);
  const cardCountAfterAdd = await page.locator('.todo-card').count();
  const emptyStateGone = await page.locator('.empty-state').count();
  log('空状态新增后列表恢复', cardCountAfterAdd === 1 && emptyStateGone === 0, `cards=${cardCountAfterAdd} empty=${emptyStateGone}`);

  // 12. 翻页后回到今天按钮显示
  await page.locator('button[aria-label="后一天"]').click();
  await page.waitForTimeout(900);
  const backBtnDisplay2 = await page.locator('#backTodayBtn').evaluate(el => getComputedStyle(el).display);
  log('翻到明天后回到今天按钮显示', backBtnDisplay2 !== 'none', `display=${backBtnDisplay2}`);

  await page.locator('#backTodayBtn').click();
  await page.waitForTimeout(900);
  const backBtnDisplay3 = await page.locator('#backTodayBtn').evaluate(el => getComputedStyle(el).display);
  const dateText = await page.locator('#dateText').textContent();
  log('回到今天后按钮隐藏', backBtnDisplay3 === 'none', `display=${backBtnDisplay3} date=${dateText}`);

  // 13. localStorage 持久化 — 刷新恢复
  // 旧 selector .add-btn 不存在 → 用 .floating-action（右下角 ＋）
  await page.locator('.floating-action').click();
  await page.waitForTimeout(300);
  const lastInput = page.locator('.todo-title').last();
  await lastInput.click();
  await lastInput.fill('');
  await lastInput.pressSequentially('持久化测试数据', { delay: 20 });
  await page.waitForTimeout(300);

  const storageBefore = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(
      k => k.startsWith('animal-todo:') || k.startsWith('animal-island-todolist:v2:')
    );
    return keys.map(k => ({ key: k, val: localStorage.getItem(k) }));
  });
  log('localStorage有数据', storageBefore.length > 0, `keys=${storageBefore.length}`);
  const hasTitleInStorage = storageBefore.some(s => s.val && s.val.includes('持久化测试数据'));
  log('localStorage包含标题', hasTitleInStorage, hasTitleInStorage ? 'found' : 'NOT found');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  // input 元素要用 inputValue()，不能用 textContent
  const restoredInputs = page.locator('.todo-title');
  const restoredCount = await restoredInputs.count();
  const restoredValues = [];
  for (let i = 0; i < restoredCount; i++) {
    restoredValues.push(await restoredInputs.nth(i).inputValue());
  }
  const hasPersisted = restoredValues.some(t => t && t.includes('持久化测试数据'));
  log('刷新后数据恢复', hasPersisted, `values=${JSON.stringify(restoredValues)}`);

  // 14. 翻到明天验证空状态
  await page.locator('button[aria-label="后一天"]').click();
  await page.waitForTimeout(900);
  const tomorrowEmpty = await page.locator('.empty-state').count();
  log('明天默认空状态', tomorrowEmpty === 1, `count=${tomorrowEmpty}`);

  // 15. 撕页动画结束后 class 清理
  await page.locator('#backTodayBtn').click();
  await page.waitForTimeout(900);
  const sheetClassAfter = await page.locator('#paperSheet').evaluate(el => el.className);
  log('动画结束后class清理', !sheetClassAfter.includes('flip-'), `class=${sheetClassAfter}`);

  // 16. 控制台无错误
  log('控制台无JS错误', consoleErrors.length === 0, consoleErrors.length > 0 ? JSON.stringify(consoleErrors.slice(0,3)) : '');

} catch (e) {
  log('测试执行', false, String(e) + '\n' + (e.stack || ''));
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}

const passed = results.filter(r => r.pass).length;
const total = results.length;
console.log(`\n========== 结果: ${passed}/${total} 通过 ==========`);
exitCode = passed === total ? 0 : 1;
process.exit(exitCode);
