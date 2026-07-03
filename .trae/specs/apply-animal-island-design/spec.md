# 动物岛设计语言全面应用 Spec

## Why
用户要求全面采用 animal-island-ui 仓库的设计体系，当前 Demo 仅用了 wave-yellow.svg 和 footer-tree.webp 两个素材，配色、按钮、卡片、字体等仍为自定义方案，未还原动森 UI 风格。需要将配色、3D 台阶按钮、圆点纹理卡片、Nunito 圆体字体、暖棕阴影等设计 token 全面落地。

## What Changes
- 配色系统全面替换为 animal-island-ui 设计 token：奶油底 #f8f8f0、棕字 #794f27、青绿主色 #19c8b9、暖黄 #f5c31c、柔红 #e05a5a
- 字体替换为 Nunito + Noto Sans SC（替代当前 ZCOOL KuaiLe）
- 按钮改为 3D 凸起台阶风格：box-shadow 0 5px 0 实色台阶 + 按下回弹
- 卡片改为圆点波点纹理背景（双层 radial-gradient）
- 阴影统一为暖棕调 rgba(61,52,40,...)
- 圆角统一为 16/18/24px 体系
- 日期徽章、翻页按钮、删除确认按钮等全部采用动森按钮风格
- 引入更多仓库素材：footer-sea.svg 替换底部装饰

## Impact
- Affected specs: enhance-todo-notebook（视觉层重构，功能逻辑不变）
- Affected code: /workspace/demo.html（CSS 变量 + 组件样式全面重写，JS 逻辑不变）

## ADDED Requirements

### Requirement: 动森配色体系
系统 SHALL 使用 animal-island-ui 的设计 token 作为全局配色：奶油背景、温暖棕字、青绿主色、暖黄/柔红辅助色。

#### Scenario: 配色落地
- **WHEN** 页面加载
- **THEN** 背景为奶油白 #f8f8f0，正文为棕 #794f27，主操作色为青绿 #19c8b9，阴影为暖棕调

### Requirement: 3D 台阶按钮
系统 SHALL 将所有主要按钮（新增待办、翻页、回到今天、删除确认）渲染为动森风格的 3D 凸起台阶按钮，底部有实色投影，按下时下沉回弹。

#### Scenario: 按钮交互
- **WHEN** 用户悬停按钮
- **THEN** 按钮微浮起 1px，台阶阴影增高
- **WHEN** 用户按下按钮
- **THEN** 按钮下沉 2px，台阶阴影缩减为 1px

### Requirement: 圆点纹理卡片
系统 SHALL 为待办卡片背景应用双层 radial-gradient 圆点纹理，还原动森图鉴波点质感。

#### Scenario: 卡片渲染
- **WHEN** 待办卡片显示
- **THEN** 卡片背景可见细密圆点纹理，边框为同色系浅色

### Requirement: Nunito 圆体字体
系统 SHALL 使用 Nunito 作为拉丁字符主字体、Noto Sans SC 作为中文字体，替代当前的 ZCOOL KuaiLe。

#### Scenario: 字体加载
- **WHEN** 页面加载
- **THEN** 标题、正文均使用 Nunito + Noto Sans SC 渲染，字形圆润友好

### Requirement: 页脚海岛场景
系统 SHALL 在页面底部使用 animal-island-ui 的 footer-sea.svg 作为海岛场景装饰。

#### Scenario: 页脚展示
- **WHEN** 页面滚动到底部
- **THEN** 可见海浪 SVG 场景图，营造海岛氛围
