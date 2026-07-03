import { chromium } from 'playwright';

const results = [];
function log(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext();
const page = await context.newPage();

const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(String(err)));

try {
  await page.goto('http://localhost:8080/demo.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // 1. 页面加载
  const title = await page.title();
  log('页面加载', title.includes('动物岛'), `title=${title}`);

  const cardCount = await page.locator('.todo-card').count();
  log('初始3条示例待办', cardCount === 3, `count=${cardCount}`);

  // 2. Task 8: 波浪分隔线
  const waveDivider = await page.locator('.wave-divider').count();
  log('波浪分隔线存在', waveDivider === 1, `count=${waveDivider}`);
  const waveSrc = await page.locator('.wave-divider').getAttribute('src');
  log('波浪分隔线URL正确', waveSrc && waveSrc.includes('wave-yellow.svg'), `src=${waveSrc}`);

  // 3. Task 4: 回到今天按钮（今天应隐藏）
  const backBtnDisplay = await page.locator('#backTodayBtn').evaluate(el => getComputedStyle(el).display);
  log('回到今天按钮今天隐藏', backBtnDisplay === 'none', `display=${backBtnDisplay}`);

  // 4. Task 1: 输入不丢焦 — 用 type 模拟真实按键
  const firstTitleInput = page.locator('.todo-title').first();
  await firstTitleInput.click();
  await firstTitleInput.pressSequentially('测试标题输入', { delay: 20 });
  await page.waitForTimeout(200);
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
  const focusedClass = await page.evaluate(() => document.activeElement?.className);
  log('输入标题后仍聚焦', focusedTag === 'INPUT' && focusedClass.includes('todo-title'), `tag=${focusedTag} class=${focusedClass}`);
  const titleVal = await page.locator('.todo-title').first().inputValue();
  log('标题数据已更新', titleVal === '测试标题输入', `value=${titleVal}`);

  // 5. Task 1: textarea 输入不丢焦
  const firstTextarea = page.locator('.todo-note textarea').first();
  await firstTextarea.click();
  await firstTextarea.pressSequentially('这是笔记内容测试', { delay: 20 });
  await page.waitForTimeout(200);
  const focusedTag2 = await page.evaluate(() => document.activeElement?.tagName);
  log('输入笔记后仍聚焦', focusedTag2 === 'TEXTAREA', `tag=${focusedTag2}`);
  const noteVal = await firstTextarea.inputValue();
  log('笔记数据已更新', noteVal === '这是笔记内容测试', `value=${noteVal}`);

  // 6. Task 1 & 6: 勾选完成 — 印章显示
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

  // 8. Task 1: 展开收起 — 点击 expand-hint（不会 stopPropagation）
  const thirdCard = page.locator('.todo-card').nth(2);
  const thirdExpandedBefore = await thirdCard.evaluate(el => el.classList.contains('expanded'));
  // hover 让 expand-hint 可见，然后点击它
  await thirdCard.hover();
  await page.waitForTimeout(200);
  await thirdCard.locator('.expand-hint').click({ force: true });
  await page.waitForTimeout(400);
  const thirdExpandedAfter = await thirdCard.evaluate(el => el.classList.contains('expanded'));
  log('展开收起切换class', thirdExpandedBefore === false && thirdExpandedAfter === true, `before=${thirdExpandedBefore} after=${thirdExpandedAfter}`);

  // 9. Task 3: 删除待办 — 内联确认
  await thirdCard.hover();
  await page.waitForTimeout(200);
  await thirdCard.locator('.delete-icon').click();
  await page.waitForTimeout(300);
  const confirmBar = await thirdCard.locator('.delete-confirm').count();
  log('点击删除显示确认条', confirmBar === 1, `count=${confirmBar}`);

  // 取消删除
  await thirdCard.locator('.confirm-no').click();
  await page.waitForTimeout(300);
  const confirmBarAfterCancel = await thirdCard.locator('.delete-confirm').count();
  log('取消删除移除确认条', confirmBarAfterCancel === 0, `count=${confirmBarAfterCancel}`);
  const cardCountAfterCancel = await page.locator('.todo-card').count();
  log('取消后卡片仍在', cardCountAfterCancel === 3, `count=${cardCountAfterCancel}`);

  // 确认删除
  await thirdCard.hover();
  await page.waitForTimeout(200);
  await thirdCard.locator('.delete-icon').click();
  await page.waitForTimeout(300);
  await thirdCard.locator('.confirm-yes').click();
  await page.waitForTimeout(300);
  const cardCountAfterDelete = await page.locator('.todo-card').count();
  log('确认删除后卡片减少', cardCountAfterDelete === 2, `count=${cardCountAfterDelete}`);

  // 10. Task 5: 空状态 — 删完所有
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

  // 11. 空状态新增按钮
  await page.locator('.empty-add-btn').click();
  await page.waitForTimeout(300);
  const cardCountAfterAdd = await page.locator('.todo-card').count();
  const emptyStateGone = await page.locator('.empty-state').count();
  log('空状态新增后列表恢复', cardCountAfterAdd === 1 && emptyStateGone === 0, `cards=${cardCountAfterAdd} empty=${emptyStateGone}`);

  // 12. Task 4: 翻页后回到今天按钮显示
  await page.locator('button[aria-label="后一天"]').click();
  await page.waitForTimeout(900);
  const backBtnDisplay2 = await page.locator('#backTodayBtn').evaluate(el => getComputedStyle(el).display);
  // flex 容器中 inline-block 会被块化为 block，所以只要不是 none 即可见
  log('翻到明天后回到今天按钮显示', backBtnDisplay2 !== 'none', `display=${backBtnDisplay2}`);

  // 点击回到今天
  await page.locator('#backTodayBtn').click();
  await page.waitForTimeout(900);
  const backBtnDisplay3 = await page.locator('#backTodayBtn').evaluate(el => getComputedStyle(el).display);
  const dateText = await page.locator('#dateText').textContent();
  log('回到今天后按钮隐藏', backBtnDisplay3 === 'none', `display=${backBtnDisplay3} date=${dateText}`);

  // 13. Task 2: localStorage 持久化 — 刷新恢复
  await page.locator('.add-btn').click();
  await page.waitForTimeout(300);
  const lastInput = page.locator('.todo-title').last();
  await lastInput.click();
  await lastInput.pressSequentially('持久化测试数据', { delay: 20 });
  await page.waitForTimeout(300);

  // 打印 localStorage 内容用于调试
  const storageBefore = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('animal-todo:'));
    return keys.map(k => ({ key: k, val: localStorage.getItem(k) }));
  });
  console.log('  [debug] localStorage before reload:', JSON.stringify(storageBefore));
  log('localStorage有数据', storageBefore.length > 0, `keys=${storageBefore.length}`);

  // 验证数据中包含标题
  const hasTitleInStorage = storageBefore.some(s => s.val && s.val.includes('持久化测试数据'));
  log('localStorage包含标题', hasTitleInStorage, hasTitleInStorage ? 'found' : 'NOT found');

  // 刷新
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const restoredTitles = await page.locator('.todo-title').allTextContents();
  const hasPersisted = restoredTitles.some(t => t.includes('持久化测试数据'));
  log('刷新后数据恢复', hasPersisted, `titles=${JSON.stringify(restoredTitles)}`);

  // 14. 翻到明天验证空状态
  await page.locator('button[aria-label="后一天"]').click();
  await page.waitForTimeout(900);
  const tomorrowEmpty = await page.locator('.empty-state').count();
  log('明天默认空状态', tomorrowEmpty === 1, `count=${tomorrowEmpty}`);

  // 15. Task 7: 撕页动画 — 翻页过程中无闪烁
  // 回到今天，验证动画 class 添加和移除
  await page.locator('#backTodayBtn').click();
  await page.waitForTimeout(900);
  const sheetClassAfter = await page.locator('#paperSheet').evaluate(el => el.className);
  log('动画结束后class清理', !sheetClassAfter.includes('flip-'), `class=${sheetClassAfter}`);

  // 16. 控制台无错误
  log('控制台无JS错误', consoleErrors.length === 0, consoleErrors.length > 0 ? JSON.stringify(consoleErrors.slice(0,3)) : '');

} catch (e) {
  log('测试执行', false, String(e));
} finally {
  await browser.close();
}

const passed = results.filter(r => r.pass).length;
const total = results.length;
console.log(`\n========== 结果: ${passed}/${total} 通过 ==========`);
process.exit(passed === total ? 0 : 1);
