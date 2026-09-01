# Connex 开发约定

本文件适用于整个仓库。修改任何模块前先阅读本文件；架构发生变化时，同步更新本文和 `docs/architecture.md`；布局、主题或组件基线变化时，同步更新 `docs/ui-design-system.md`。

## 产品目标与当前范围

Connex 是桌面 SSH 客户端。第一阶段只围绕以下主流程开发：连接配置、SSH 认证、远程终端、多会话标签、SFTP 文件管理和传输队列。

端口转发、Jump Host、Telnet/RDP、文件夹同步、远程编辑器、命令片段、协作和云同步不在第一阶段。不要为了未来功能提前增加抽象；只有当前功能出现第二个真实实现时，才提取通用接口。

## Git 工作流

- `master` 是受保护分支，由用户维护，Codex 不操作。
- `dev` 是日常开发主线。
- Codex 不得主动创建、切换或迁移到 Git Worktree，也不得为了规避当前工作区中的未提交改动而自行创建；只有用户明确要求，或当前任务已经位于用户创建或指定的 Worktree 中时，才执行以下工作树约定。
- 所有开发工作树只允许基于最新 `dev` 创建，不得基于 `master` 或其他分支创建。
- 在工作树中开始任务前，必须先拉取并同步最新 `dev`，确认工作区干净后再修改和提交。
- 工作树只同步 `dev` 中已经提交的内容，不处理其他工作树的未提交改动。
- 每个提交只完成一个独立任务，使用 Conventional Commits。
- 只有用户明确允许后才能提交。获得提交许可后，必须先确认提交能够安全合入 `dev`，再将工作树提交与合入 `dev` 作为一个连续操作完成，不为合入重复询问；如果无法同时完成，则在提交前停止并报告。
- 未经明确要求，不推送远端。
- 工作树提交合入 `dev` 后，再次同步最新 `dev`，然后开始下一项任务。

## 技术边界

- React 只负责界面、交互状态和终端渲染。
- xterm.js 只负责终端仿真，不实现 SSH 协议，也不持有连接凭据。
- Rust/Tauri 负责 SSH、SFTP、本地文件访问、持久化、系统凭据和连接生命周期。
- 普通控制操作使用类型化 Tauri commands；终端输出和传输进度使用 Tauri Channel。
- 文件内容在 Rust 本地 I/O 与 SFTP 之间直接流动，禁止经过 React 或 JSON。
- 不通过系统 `ssh` 子进程实现核心连接，除非架构决策被明确修改。
- 系统窗口关闭请求由前端 `onCloseRequested` 统一拦截；默认确认后使用 `destroy()` 真正关闭，不能再次调用 `close()` 形成确认循环。退出确认偏好必须存 SQLite，并在设置页提供恢复入口。

## 前端目录与依赖方向

```text
src/
├── app/                  # 应用组合根、全局 provider
├── components/
│   ├── brand/            # 品牌视觉
│   ├── layout/           # 跨功能桌面布局
│   └── ui/               # shadcn/ui 基础组件，仅放通用原语
├── features/
│   ├── connections/      # 连接配置与列表
│   ├── terminal/         # xterm 生命周期与终端交互
│   ├── sftp/             # 远程文件浏览
│   └── transfers/        # 上传/下载统一调度与传输队列
├── lib/
│   ├── tauri/            # invoke/Channel 的唯一前端入口
│   └── utils.ts          # 无业务语义的通用工具
├── styles/               # 全局主题与 Tailwind 入口
└── types/                # 小型跨功能 IPC 类型
```

依赖规则：

- `app` 可以组合所有功能模块。
- `features` 可以依赖 `components/ui`、`lib` 和 `types`，但功能模块之间不要直接读取彼此内部状态。
- React 组件不得直接调用 `invoke`；为每组命令在 `src/lib/tauri` 中提供小型封装。
- `components/ui` 不包含 SSH、SFTP 或会话业务语义。
- 状态默认放在最靠近使用处。只有确实跨多个功能共享时才引入全局状态库。
- 后端数据是连接、会话和传输状态的最终事实来源；不要用 `localStorage` 持久化业务数据。

## Rust 目录与依赖方向

当前目录从最小结构开始，按需要扩展：

```text
src-tauri/src/
├── lib.rs                # Tauri composition root，只注册插件、状态和命令
├── main.rs               # 桌面入口，不放业务逻辑
├── commands/             # IPC 适配层：校验、调用服务、映射结果
├── models/               # IPC DTO，使用 serde camelCase 映射
├── domain/               # 后续加入：与 Tauri 无关的领域类型
├── services/             # 后续加入：连接、会话、SFTP、传输用例
└── infrastructure/       # 后续加入：russh、SQLite、凭据存储实现
```

- `commands` 必须保持薄；SSH 循环、文件传输和数据库操作不能写在命令函数中。
- `domain` 不依赖 Tauri、SQLite 或具体 SSH 库。
- `services` 编排领域行为，通过明确的状态对象管理长生命周期任务。
- `infrastructure` 可以依赖第三方实现，但不能把其类型泄漏给前端。
- 异步代码中不做阻塞文件或网络 I/O，不跨 `.await` 持有同步锁。
- 生产路径返回结构化错误，不使用 `unwrap`、`expect` 或静默忽略错误；应用启动失败除外。

## SSH、终端与 SFTP 规则

- 默认实现为 `russh` + `russh-sftp`，接入前先完成兼容性验证。
- 每个 SSH 连接由 Rust 侧会话任务拥有；界面只持有不可猜测的 session ID。
- 会话任务通过有界消息队列接收输入、resize、关闭和 keepalive 操作。
- SSH 输出保持原始字节，通过 `Channel<InvokeResponseBody>` 发送给 xterm.js。
- 前端输入按极短窗口合并后以原始字节发送，避免每个按键产生大量 JSON。
- PTY 类型默认 `xterm-256color`；首次尺寸和后续 resize 都必须同步到远端。
- SFTP 使用独立 channel，共享已验证的 SSH transport；只有文件面板打开后的首次目录请求才能初始化 SFTP，建立 SSH 时不得预加载；大文件传输和 SFTP 初始化都不能阻塞终端输出。
- 远程文件的新建和重命名默认拒绝覆盖同名条目；删除文件夹必须是非递归操作，只允许删除空文件夹。远程文件删除必须经过明确确认。
- 上传和下载必须支持进度、暂停/继续、取消和明确的失败状态；暂停保留当前 attempt 的临时文件，继续时从 Rust 校验出的真实断点恢复，临时文件与覆盖策略需要显式处理。
- 上传/下载使用同一 FIFO 调度器，前端默认并发上限与 Rust 硬上限都为 `3`；已暂停任务不占并发槽，暂停/继续不能消耗重试次数，普通重试必须使用独立 attempt 临时文件，不能让上次清理失败阻塞后续尝试。
- 取消与最终文件提交必须有明确的原子阶段边界；关闭 session、窗口或应用时先取消传输并限时等待清理，再关闭 SSH transport。

## 安全规则

- 连接元数据与经过 AES-256-GCM 加密的密码/私钥口令存 SQLite；系统凭据管理器只保存一把随机本机主密钥，秘密明文只进入短生命周期内存。
- 数据库只保存私钥路径，不复制私钥内容。导入私钥必须是用户明确选择的独立功能。
- 密码、口令、私钥内容、完整认证请求不得写入日志、前端持久化或错误信息。
- 未知主机指纹必须由用户确认；指纹变化默认拒绝连接，不能自动覆盖。
- 从安全存储取出的秘密应尽量缩短生命周期，并在可行处使用可清零容器。
- 编辑连接时允许通过专用 command 按需显示已保存凭据，但只能由密码框的小眼睛在悬停或键盘聚焦期间触发；列表加载和普通表单打开不能预取。秘密离开显示状态或关闭表单后必须立即从 React 状态清除。
- 连接导出统一使用版本化 `.connex-backup` 加密容器并强制设置导出密码；默认包含密码和私钥口令，用户可以主动关闭。导出密码通过 Argon2id 派生临时密钥，不得写入磁盘或系统凭据；导入后必须使用目标设备本机主密钥重新加密。
- 私钥文件不随连接凭据默认导出；只有用户明确开启“包含私钥文件”时才可进入加密备份，目标设备导入后写入受限的应用数据目录。
- SFTP 本地文件只能由 Rust 原生选择器签发的 transfer capability 访问；renderer 不得向上传/下载执行 command 提交裸 `PathBuf`。未进入队列的授权使用短 TTL 回收，整批任务只有原子 attach 成功后才进入队列，已 attach 的授权由任务终态、显式放弃或 session 关闭回收。授权必须绑定方向、session 和两端目标，并在使用前后校验文件 identity。
- 其他本地文件操作使用 `PathBuf` 和明确选择的路径，不拼接未经校验的远程路径。
- 外部链接只能通过受限的 opener 能力打开；终端链接默认要求修饰键点击。

## TypeScript 与 React 风格

- 使用严格 TypeScript，禁止 `any`；不确定输入先使用 `unknown` 并在边界校验。
- 数据结构优先使用 `type`；需要声明合并或扩展第三方定义时再用 `interface`。
- 应用代码使用命名导出。React 组件及其文件使用 PascalCase，非组件模块使用 camelCase。
- 布尔值使用 `is`、`has`、`can`、`should` 前缀；事件 props 使用 `onXxx`。
- 组件保持展示职责，复杂异步流程放入 feature hook 或 Tauri API 封装。
- 不使用索引作为会变化列表的 key，不在 render 中创建有副作用的对象。
- 图标按钮必须有可访问名称；表单控件必须有 label 或 `aria-label`。
- Tailwind 类优先，主题值必须来自 `src/styles/globals.css` 的语义 token，避免散落硬编码颜色。
- 用户可见布局、主题、配色、密度和状态映射遵循 `docs/ui-design-system.md`；有意改变基线时必须在同一提交更新文档。
- shadcn/ui 组件是仓库自有代码，可以按产品需要修改，但通用原语与业务组件必须分开。

## shadcn/ui Skill 工作流

仓库内置 `.agents/skills/shadcn/SKILL.md`，它是新增、查询、调试、组合或更新 shadcn/ui 组件时的权威操作说明。只要任务涉及 `components.json`、`components/ui`、shadcn registry、preset 或现有 shadcn 组件，就必须先使用该 skill。

- 本项目使用 pnpm，所有 shadcn CLI 命令统一通过仓库脚本 `pnpm shadcn ...` 运行，不混用 npm、bun 或直接的 `pnpm dlx shadcn@latest`。该脚本固定兼容的 shadcn 与 Zod 版本，避免 MCP SDK 被解析到缺少 `zod/v4` 导出的版本；升级这两个版本时必须成对验证。
- 开始组件工作时先运行 `pnpm shadcn info --json`，确认当前 style、base、icon library、Tailwind 版本、aliases 和已安装组件。
- 优先复用现有组件；缺少组件时先使用 `search` 查找 registry，再运行 `docs <component>` 获取当前 API 和示例，不能凭记忆猜测组件接口。
- 安装前确认组件尚未存在。添加 registry 组件后必须阅读生成文件，检查 imports、组合结构、图标库和可访问性。
- 用户未指定 registry 时不要擅自选择；先确认要使用的 registry。
- 更新已有组件时先使用 `add <component> --dry-run` 和 `--diff` 检查影响，保留本地定制；没有用户明确许可不得使用 `--overwrite`。
- 优先使用组件现有 variants 和语义颜色。`className` 主要承担布局，不覆盖组件颜色与字体；条件类使用 `cn()`。
- 表单、Empty、Alert、Badge、Separator、Skeleton、Dialog、Sheet 等场景优先采用对应 shadcn 组件，不重复手写等价结构。
- 图标按钮遵循 skill 中的 `data-icon`、可访问名称和尺寸规则；overlay、form、group 等组件遵循完整组合结构。
- preset 变更属于全局视觉变更，执行前必须让用户选择 overwrite、partial、merge 或 skip。

## Rust 风格

- 遵循 `rustfmt` 和 Clippy，公共边界使用明确类型。
- Tauri command 使用 `snake_case`；序列化字段通过 `#[serde(rename_all = "camelCase")]` 暴露给前端。
- 错误应保留机器可识别 code 与安全的人类可读 message，底层错误只记录非敏感上下文。
- 优先使用所有权清晰的小结构体，不使用全局可变状态。
- 会话、传输等长生命周期资源由集中 manager 注册和回收，窗口关闭时必须终止后台任务。

## 检查与完成标准

当前阶段不新增测试文件、测试框架或测试依赖。每次提交前至少执行：

```bash
pnpm check
pnpm build
```

涉及 Tauri 配置、Rust 依赖或打包能力时，再执行：

```bash
pnpm tauri build --debug
```

完成一个模块意味着：类型检查、Lint、格式检查、Clippy 和前端构建通过；用户可见界面还需要做一次本地渲染检查；文档与实际目录、命令保持一致。
