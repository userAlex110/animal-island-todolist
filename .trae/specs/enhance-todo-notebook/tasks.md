# Tasks

- [x] Task 1: 重构渲染机制，消除输入失焦
  - [x] SubTask 1.1: 把整体 innerHTML 重建改为增量更新：新增/删除才重建对应卡片，输入只更新数据
  - [x] SubTask 1.2: 展开/收起改为切换 card 元素的 expanded class，不调用 render()
  - [x] SubTask 1.3: 勾选完成改为切换 completed class + 更新进度，不重建列表
  - [x] SubTask 1.4: 验证标题连续输入不丢焦、光标不跳动

- [x] Task 2: 实现 localStorage 持久化
  - [x] SubTask 2.1: 封装 save(dateKey, todos) / load(dateKey) 读写 localStorage（key 前缀 animal-todo:）
  - [x] SubTask 2.2: getTodos 优先从 localStorage 读取，没有时才用默认示例数据（仅今天注入示例）
  - [x] SubTask 2.3: 在新增/编辑/删除/勾选后自动 save
  - [x] SubTask 2.4: 验证刷新后当天数据完整恢复，多日数据互不干扰

- [x] Task 3: 实现删除待办（内联确认）
  - [x] SubTask 3.1: 卡片 hover 时显示删除小图标入口
  - [x] SubTask 3.2: 点击删除后，卡片底部展开「确认删除？[确认] [取消]」内联条
  - [x] SubTask 3.3: 确认 → 从数据移除 + 重建该卡片位置 + save；取消 → 收起确认条
  - [x] SubTask 3.4: 验证删除后进度条更新、数据持久化、空列表正确进入空状态

- [x] Task 4: 实现「回到今天」按钮
  - [x] SubTask 4.1: 日期栏新增「回到今天」按钮，默认隐藏
  - [x] SubTask 4.2: 当 currentDate ≠ 今天时显示按钮，等于今天时隐藏
  - [x] SubTask 4.3: 点击后计算天数差，调用 changeDay 跳回今天并播放翻页动画
  - [x] SubTask 4.4: 验证翻到任意非今日后按钮出现，点击后正确回到今天

- [x] Task 5: 实现空状态视图
  - [x] SubTask 5.1: 渲染时若当天 todos 为空，列表区域显示空状态（卡通 emoji/插画 + 文案 + 新建按钮）
  - [x] SubTask 5.2: 空状态不影响日期栏和进度条（进度显示 0/0）
  - [x] SubTask 5.3: 验证新建第一条后空状态消失，列表正常显示

- [x] Task 6: 完成印章效果
  - [x] SubTask 6.1: 卡片右上角添加印章元素，默认隐藏
  - [x] SubTask 6.2: 勾选完成时显示印章，带 rotate + scale 弹出动画
  - [x] SubTask 6.3: 取消勾选时印章消失
  - [x] SubTask 6.4: 验证印章样式与动物岛手账风格一致（红色圆章、倾斜）

- [x] Task 7: 撕页动画优化
  - [x] SubTask 7.1: 把当前 rotateX 翻页改为带卷曲阴影的撕页效果（顶部撕痕 + 纸张翻转 + 动态阴影）
  - [x] SubTask 7.2: 确保翻页过程中新内容在动画结束后才显示，避免闪烁
  - [x] SubTask 7.3: 验证前翻/后翻动画方向正确，滑动与按钮触发一致

- [x] Task 8: 引入仓库 divider 素材
  - [x] SubTask 8.1: 在日期栏与待办列表之间加入 animal-island-ui 的 wave-yellow.svg 波浪分隔线
  - [x] SubTask 8.2: 验证分隔线在移动端和桌面端都正常显示

# Task Dependencies
- [Task 2] 依赖 [Task 1]（持久化要在增量渲染基础上才不会因重建丢数据）
- [Task 3] 依赖 [Task 2]（删除后要 save）
- [Task 4] 无强依赖，可与 Task 3/5/6 并行
- [Task 5] 依赖 [Task 1]（空状态判断要在增量渲染逻辑里）
- [Task 6] 依赖 [Task 1]（印章显隐靠 class 切换）
- [Task 7] 无强依赖，可独立
- [Task 8] 无强依赖，可独立
