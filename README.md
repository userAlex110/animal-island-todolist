# 🏝️ 动物岛每日手记 · Animal Island Todolist

一个受动物森友会启发的待办事项 Demo——像撕日历一样翻过每一天，在温暖手账风格里记录日常。

## ✨ 功能

- **📅 日历翻页** — 每天的待办独立一页，左右滑动或拖拽翻页，回到今天一键跳转
- **✅ 待办管理** — 新增、编辑标题、编写笔记、勾选完成、删除确认，操作实时保存
- **📊 进度追踪** — 每日完成进度条，完成比例一目了然
- **💾 本地持久化** — 基于 `localStorage`，数据不会丢失，无需后端
- **🎨 动物岛设计** — 温和奶油色系、手账纸质感、撕页动画，搭配动物岛风格插画
- **📱 响应式** — 适配桌面与移动端，支持触摸滑动翻页

## 🧱 技术栈

纯原生前端三件套 + Playwright 端到端测试：

- **HTML / CSS / JavaScript** — 无框架，零依赖运行时
- **Playwright** — 自动翻页、编辑、增删等全流程 E2E 测试
- **GitHub Pages** — 静态站点自动部署

## 📁 项目结构

```
animal-island-todolist/
├── index.html              # 主页面
├── css/
│   └── style.css           # 动物岛设计令牌 & 组件样式
├── js/
│   └── app.js              # 待办逻辑、渲染、翻页、持久化
├── test-demo.mjs           # Playwright E2E 测试脚本
├── .github/
│   └── workflows/
│       └── deploy-pages.yml # GitHub Pages 自动部署
└── .gitignore
```

## 🚀 快速开始

1. **克隆仓库**
   ```bash
   git clone git@github.com:userAlex110/animal-island-todolist.git
   cd animal-island-todolist
   ```

2. **直接打开**
   用浏览器打开 `index.html`，无需安装任何依赖即可体验。

3. **运行测试**（需要 Node.js）
   ```bash
   npm install
   node test-demo.mjs
   ```

## 📦 部署

项目通过 **GitHub Pages** 托管：`https://useralex110.github.io/animal-island-todolist/`

每次 push 到 `main` 分支时，GitHub Actions 自动部署。详见 `.github/workflows/deploy-pages.yml`。

> GitHub Pages 部署的是静态 HTML/CSS/JS 文件，应用使用浏览器 `localStorage` 持久化用户数据，数据留在用户本地浏览器中，不会上传到服务端。

## 🔧 开发流程

1. 从 `main` 分支切出功能分支
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/xxx
   ```
2. 本地开发完毕后提交并推送
3. 创建 PR 到 `main` 分支
4. 合并后自动触发 GitHub Pages 部署

## 🎨 设计参考

本项目的视觉风格、色彩体系和部分插画资源参考了 **[Animal Island UI](https://github.com/guokaigdg/animal-island-ui)**：

- **色板与设计令牌** — 奶油白纸色、温暖棕墨色、青绿主色等配色方案，以及圆角、阴影等视觉参数，均沿袭 Animal Island UI 的柔和手账风格
- **SVG 插画资源** — 页面中的波浪分隔线（`wave-yellow.svg`）和底部海洋插画（`footer-sea.svg`）直接引用了 Animal Island UI 的公共 CDN 资源
- **字体选择** — `Nunito` + `Noto Sans SC` 的字体搭配方案也受其启发

在此向 [guokaigdg](https://github.com/guokaigdg) 的开源贡献表示感谢！🙏

## 📄 License

待定
