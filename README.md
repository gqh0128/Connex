# Connex

Connex 是一款轻量桌面 SSH 客户端。第一阶段以可靠的远程终端为核心，并在同一工作区中提供 SFTP 文件浏览和传输。

项目当前处于基础架构阶段，已经完成 React/Tauri 工程初始化、桌面应用壳、UI 主题和基本质量检查。SSH 与 SFTP 连接能力将在后续小模块中逐步实现。

## 技术栈

- React 19 + TypeScript + Vite
- Tauri 2 + Rust
- Tailwind CSS 4 + shadcn/ui
- xterm.js
- 计划采用 `russh` + `russh-sftp`

## 第一阶段范围

- 保存、搜索、分组和快速打开 SSH 连接
- 密码、私钥、私钥口令和 SSH Agent 认证
- 主机指纹确认、Keepalive、超时和手动重连
- 多会话标签、终端复制粘贴、搜索和窗口尺寸同步
- SFTP 目录浏览、上传、下载、重命名、删除和传输队列
- 基础导入 `~/.ssh/config`

端口转发、Jump Host、文件夹同步、远程编辑器、命令片段和云同步暂不属于第一阶段。

## 本地开发

环境要求：

- Node.js 20.19 或更高版本
- pnpm 11
- Rust stable
- 对应平台的 Tauri 2 系统依赖

安装并启动桌面开发模式：

```bash
pnpm install
pnpm tauri dev
```

仅启动浏览器中的前端预览：

```bash
pnpm dev
```

## 基础检查

项目按约定不引入测试框架或测试文件。提交前运行现有的静态检查和构建：

```bash
pnpm check
pnpm build
```

`pnpm check` 包含 TypeScript 类型检查、ESLint、Prettier、Rustfmt 和 Clippy。

## 分支约定

- `master`：稳定主分支，由项目维护者手动合并。
- `dev`：唯一日常开发分支，所有功能直接在这里按小模块提交。
- 不创建功能分支，也不自动合并到 `master`。

更详细的开发约束见 [AGENTS.md](./AGENTS.md)，运行时与模块设计见 [docs/architecture.md](./docs/architecture.md)。
