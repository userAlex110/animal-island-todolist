# Tasks

- [x] Task 1: 替换全局 CSS 变量与字体
  - [x] SubTask 1.1: 将 :root 变量替换为 animal-island-ui 设计 token（配色、圆角、阴影、间距）
  - [x] SubTask 1.2: Google Fonts 引入 Nunito（500/700/900）+ Noto Sans SC，替换 ZCOOL KuaiLe
  - [x] SubTask 1.3: body 背景改为奶油白 #f8f8f0，正文棕色 #794f27

- [x] Task 2: 按钮全面改为 3D 台阶风格
  - [x] SubTask 2.1: 日期导航按钮改为动森台阶风格（box-shadow 实色台阶 + hover/active 回弹）
  - [x] SubTask 2.2: 新增待办按钮改为青绿主色台阶按钮
  - [x] SubTask 2.3: 回到今天按钮改为青绿浅底台阶风格
  - [x] SubTask 2.4: 删除确认/取消按钮改为台阶风格
  - [x] SubTask 2.5: 悬浮加号按钮改为青绿台阶风格

- [x] Task 3: 卡片改为圆点波点纹理
  - [x] SubTask 3.1: 待办卡片背景应用双层 radial-gradient 圆点纹理
  - [x] SubTask 3.2: 卡片边框改为 2px 同色系浅色
  - [x] SubTask 3.3: 展开笔记区域背景也用浅色圆点纹理
  - [x] SubTask 3.4: 验证纹理在移动端正常显示

- [x] Task 4: 阴影与圆角统一
  - [x] SubTask 4.1: 所有阴影改为暖棕调 rgba(61,52,40,...) 三级体系
  - [x] SubTask 4.2: 圆角统一为 sm 16px / base 18px / lg 24px / pill 50px
  - [x] SubTask 4.3: 纸张、卡片、按钮、输入框圆角协调一致

- [x] Task 5: 页脚与装饰素材更新
  - [x] SubTask 5.1: 底部装饰图替换为 footer-sea.svg
  - [x] SubTask 5.2: 波浪分隔线保留 wave-yellow.svg
  - [x] SubTask 5.3: 验证素材在桌面端和移动端正常显示

# Task Dependencies
- [Task 2] 依赖 [Task 1]（按钮配色依赖全局变量）
- [Task 3] 依赖 [Task 1]（卡片纹理配色依赖全局变量）
- [Task 4] 依赖 [Task 1]
- [Task 5] 无强依赖，可并行
