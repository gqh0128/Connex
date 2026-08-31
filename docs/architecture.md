# Connex 架构设计

## 1. 设计目标

第一阶段优先保证四件事：SSH 连接安全、终端交互正确、文件传输稳定、桌面界面响应迅速。架构采用单进程模块化设计，不拆分独立服务，也不为了尚未进入范围的功能建立插件系统。

macOS 是首个完整验证平台；Windows 和 Linux 从路径、系统凭据、换行与打包配置上保持兼容，但在对应平台验证前不声明完整支持。

## 2. 运行时边界

```text
┌──────────────────────── WebView ────────────────────────┐
│ React                                                    │
│ ├── connections UI                                      │
│ ├── xterm.js terminal                                   │
│ ├── SFTP browser                                        │
│ └── transfer queue                                      │
└───────────────┬───────────────────────┬─────────────────┘
                │ commands / raw input  │ ordered Channel
                ▼                       ▲
┌──────────────────────── Rust ─────────┴─────────────────┐
│ Tauri commands → services → session / transfer managers │
│                            ├── russh + russh-sftp        │
│                            ├── SQLite                    │
│                            ├── local master key          │
│                            └── local filesystem          │
└──────────────────────────────────────────────────────────┘
```

React 不直接访问网络、数据库、凭据或任意本地路径。Rust 是连接状态和持久化数据的权威来源。

前端布局、明暗主题、语义配色、组件映射和自适应规则以 [ui-design-system.md](./ui-design-system.md) 为准。

## 3. 前端架构

前端按功能垂直切分，同时保留少量真正通用的 UI 和基础设施层。

- `app/`：组合应用、注册全局 provider、处理窗口级快捷键。
- `components/layout/`：侧栏、统一工作区标签、工作区、状态栏等跨功能布局。
- `components/ui/`：来自 shadcn/ui 的无业务语义组件。
- `features/connections/`：连接列表、编辑表单、SSH 配置导入。
- `features/terminal/`：xterm 实例、输入聚合、输出写入、resize、链接处理、终端主题/字体 profile、字体加载和语义高亮。
- `features/sftp/`：目录导航、远程文件操作和拖拽入口。
- `features/transfers/`：上传下载队列、进度、取消和重试。
- `lib/tauri/`：唯一允许导入 `@tauri-apps/api` 命令接口的位置。

全局状态库暂不引入。连接与传输状态最终来自 Rust manager；前端先使用局部 state 和 feature hooks。等多个页面确实需要规范化共享数据时，再评估轻量 store。

SSH 标签由应用层的 `useSshSessions` 统一编排：前端 `localId` 只负责标签和 xterm 实例绑定，Rust 返回的 session ID 才用于后续控制命令。设置等占满中央区域的页面由应用层维护单例页面标签，并与 SSH 标签组合进统一工作区标签栏；页面标签只控制前端可见性，不参与 SSH 生命周期。密码和私钥口令仅在发起连接前暂存于 hook 的内存引用中，首次调用 `start_ssh_session` 前立即移除；不得放入可持久化 state、日志或连接配置。

每个会话标签对应一个长期存活的 xterm 实例。切换会话或页面标签、打开设置和展开或收起文件面板只改变可见性或面板尺寸，不能卸载仍存在的终端。React 开发模式重复挂载时，会话 hook 必须保证同一标签只启动一次 Rust 会话，并让后挂载的终端重新接管输出处理器。

终端外观拆为三个独立层次：`terminalThemeProfiles` 保存稳定 profile ID、终端前景色、ANSI palette 和语义 palette；`terminalSemanticRules` 只负责把普通 buffer 文本识别为 URL、命令选项、路径、环境变量、主机/IP 或 Shell 提示符片段；`TerminalSemanticHighlighter` 把匹配结果适配为 xterm cell decoration。React 组合层只传递 profile ID 和是否启用语义高亮，切换设置或 palette 只刷新现有 xterm 实例，不能重建会话。新增主题只注册新的 profile，不复制识别规则或终端生命周期代码。

终端字体使用独立于主题的 profile 注册表。`terminalFontProfiles` 只描述内置预设的稳定 ID、展示信息和 xterm `fontFamily`；`terminalFontLoader` 负责等待内置 Web Font 或把自定义字体 raw bytes 注册为浏览器 `FontFace`；`useTerminalFonts` 负责编排列表、加载状态和导入/删除操作。字重范围、默认值、步长以及粗体派生规则集中在 `terminalFontWeight`，字号范围、默认值、步长和快捷键识别集中在 `terminalFontSize`，行距范围、默认值、步长与格式化集中在 `terminalLineHeight`，平台主修饰键识别集中在 `lib/platform`。React 只把解析后的字体族、持久化字重、字号和行距传给 xterm，切换这些设置必须刷新现有实例并重新 fit，不得修改应用 UI 字体或重建 SSH 会话。增加新的内置字体只注册 profile 并提供本地字体资源，不复制设置页或 xterm 生命周期代码。

设置页的 `TerminalAppearancePreview` 使用独立、只读的 xterm.js 实例渲染固定终端样例，并复用正式终端的 theme profile、字体族、字重、字号和行距参数。预览不连接 SSH、不注册链接或语义扫描器，样例颜色直接从当前 profile 的语义 palette 生成 ANSI 序列；调整外观设置时只更新预览实例，不把预览状态写回会话。

## 4. Rust 架构

Rust 端采用模块化单体：

- Commands 是传输适配层，只校验参数、调用服务并返回 DTO。
- Domain 保存不依赖框架的连接、会话、远程路径和传输状态。
- Services 负责用例编排，不直接暴露 `russh` 或数据库类型。
- Infrastructure 提供 SSH、SFTP、SQLite 和系统凭据实现。
- Managers 持有运行中的会话与传输任务，并在应用退出时统一回收。

初始代码只创建已经有真实用途的目录。`domain`、`services` 和 `infrastructure` 会在对应模块开始时加入，避免空层和猜测式接口。

## 5. IPC 设计

IPC 分为控制面和数据面。

控制面使用普通 Tauri commands，适合：

- 连接配置 CRUD
- 打开、关闭、重连会话
- resize、keepalive 和终端输入
- SFTP 目录与文件操作
- 开始、取消、重试传输
- 导入、列出、读取和删除终端字体

数据面使用有序 Tauri Channel，适合：

- SSH stdout/stderr 原始字节
- 会话状态变化
- 传输进度和结束事件
- 大目录的分批加载结果

自定义字体读取使用单次 raw IPC response，不编码为 JSON 数组。字体文件上限为 10 MiB，只有用户明确选择并经 Rust 校验后的本机副本才能返回前端；它不是会话数据流，不进入 SSH Channel。

终端输出使用 `Channel<InvokeResponseBody>` 的 raw bytes，前端直接写入 xterm.js。语义高亮只能在 xterm 完成 VT/ANSI 解析后读取 buffer，并通过 decoration 改变显示；禁止在 raw bytes 中正则替换或插入 CSI 色码。只有使用默认属性的 cell 才允许附加语义色，远端 ANSI 始终优先；alternate buffer 完全跳过，避免影响 Vim、top、tmux 等全屏程序。输入在前端按最多约 `8ms` 或 `4 KiB` 聚合为 `Uint8Array`，并通过串行 Promise 链保持提交顺序，不能为每个字符构造业务 JSON。断线、认证失败等状态通过独立结构化事件发送，不能混入终端字节流。

所有 command 名称使用 `snake_case`，JSON 字段使用 `camelCase`。每个前端调用都由 `src/lib/tauri` 中的函数封装，组件不依赖命令字符串。

## 6. SSH 会话模型

每次发起连接创建一个 UUID session ID，并启动独立会话任务。当前状态机：

```text
idle → connecting → verifyingHost → authenticating → connected
  ▲          │              │              │             │
  └──────────┴──────────────┴──────────────┴── error     ├── closing → closed
                                                          └── disconnected
```

会话任务独占 SSH handle，并通过容量为 64 的有界队列接收：

- `Write(Vec<u8>)`
- `Resize { columns, rows, pixel_width, pixel_height }`
- `Keepalive`
- `Close`

SSH 认证和 Shell 请求成功后只进入 `connected`，不预先创建 SFTP channel。文件面板首次发起目录请求时，manager 通过独立有界队列通知同一个会话任务；会话任务才在已经验证的 transport 上打开 SFTP channel，并在最多 15 秒内初始化 `russh-sftp` client。SFTP 初始化 future 与终端 Shell 循环并发轮询，不能阻塞终端输出或关闭信号。初始化后的 client 由对应 `SessionEntry` 持有；目录命令只克隆 client 引用，不跨网络 `.await` 持有会话表或状态锁。服务器未提供 SFTP 时终端仍保持连接，文件面板单独显示结构化错误并允许重试初始化。

打开 Shell 前先请求远程 PTY，默认终端类型为 `xterm-256color`。初始行列数优先来自 xterm FitAddon；如果 WebKit 首帧布局尚未稳定，则先使用 xterm 默认行列启动，首个有效 ResizeObserver 结果立即发送 resize，不能让连接生命周期等待布局事件。后续容器变化继续发送 resize。终端输出背压需要在技术验证中用持续大输出测试，不能采用无界内存队列。

SSH transport 固定使用 `russh 0.63.x` 的 `ring + rsa + flate2` 特性，避免引入系统 OpenSSL 和重量更大的默认 `aws-lc` 构建链；SFTP 使用与 SSH channel stream 解耦的 `russh-sftp 2.4.x`。连接阶段设置 15 秒 TCP 超时；主机确认和认证分别最多等待 120 秒。Rust 到 Tauri Channel 之间还有容量为 64 的统一事件队列，终端输出进入队列时自然施加背压。

窗口销毁会触发 manager 的 `close_all`；单个会话关闭同时发送取消信号和 `Close` 控制消息，使连接、主机确认、认证和已连接 Shell 四个阶段都可以停止。终端页面对应的 Tauri Channel 失效后，内部事件接收端关闭并促使会话回收。

重连会创建新的远程 Shell；UI 不把它描述成恢复原进程。应用关闭、标签关闭或 WebView 销毁时，manager 必须取消会话任务并释放通道。

## 7. 认证与主机验证

第一阶段认证方式：

- 密码
- 私钥文件，可带口令
- SSH Agent

连接配置不包含秘密，只保存认证方式、凭据引用和私钥路径。临时输入的密码通过一次命令交给 Rust；从系统凭据读取的密码不返回前端。

首次连接展示主机、端口、算法和 SHA-256 指纹，由用户选择仅本次信任或保存。已保存指纹发生变化时默认拒绝连接，并明确提示潜在中间人风险。

基础导入 `~/.ssh/config` 只承诺 `Host`、`HostName`、`User`、`Port` 和 `IdentityFile`。`Include` 可逐步支持；`Match`、`ProxyCommand` 和 `ProxyJump` 暂不宣称完整兼容。

## 8. SFTP 与传输模型

已连接会话通过独立 SFTP channel 访问远端文件，共享已经完成主机验证和认证的 SSH transport。终端和传输任务必须异步并发，任何大文件操作都不能占住会话全局锁。

文件面板在每次应用启动时默认关闭。关闭状态下建立或切换 SSH 会话不能调用目录 command，也不能创建 SFTP channel；用户打开面板后，前端才为当前已连接会话调用类型化 `list_remote_directory`。面板保持打开时，切换或新建活动 SSH 会话会自动跟随，在该会话进入 `connected` 后读取其默认目录并按需初始化对应 SFTP client。关闭面板不主动销毁已经初始化的 SFTP channel，它随所属 SSH 会话统一回收。

SFTP 首次初始化时通过 `canonicalize(".")` 取得服务器为当前用户设置的默认目录。目录导航只回传由服务器返回的完整路径，Rust 会限制路径长度、拒绝 NUL 并再次 canonicalize 后再读取。

文件列表只返回当前界面所需元数据：名称、完整远程路径、类型、大小和修改时间，并在 Rust 侧按目录优先、名称排序。远程路径以 SFTP 的服务器语义处理，不拿它拼接或访问本地文件系统。

新建文件夹、新建空文件、重命名和删除均由类型化 Tauri commands 调用当前会话的 SFTP client，成功后只刷新用户仍在查看的当前目录。名称必须是当前目录内的单个条目名，拒绝空值、`.`、`..`、`/`、NUL 和超过 255 字节的输入；新建与重命名默认拒绝覆盖同名条目。删除文件夹使用非递归 `remove_dir`，因此只允许删除空文件夹；删除文件和文件夹都必须先由前端 `AlertDialog` 明确确认。

上传与下载由 Rust 直接分块传输：

```text
local file ↔ Rust buffered I/O ↔ SFTP channel ↔ remote file
```

上传由前端原生文件选择器取得用户明确选择的本地路径，React 只提交路径与当前远程目录。Rust 使用 `64 KiB` 缓冲区直接把本地文件写入同目录下的 Connex 临时文件，通过 Channel 回传字节进度和速度；成功关闭远程句柄后再改名为目标文件。默认拒绝覆盖同名文件，取消、失败或会话关闭时终止任务并清理可识别的临时文件。

传输事件至少包含 transfer ID、方向、已完成字节、总字节、速度、状态和安全错误摘要。默认不静默覆盖已有文件；下载可先写临时文件，成功后再原子重命名，取消或失败时清理可识别的临时文件。

## 9. 持久化

计划使用 SQLite 保存：

- 连接与分组
- 非敏感应用设置
- known host 元数据
- 后续需要时的传输历史

数据库从第一张表开始使用版本化 migration，不在启动代码里散落 `CREATE TABLE`。密码和私钥口令以连接 UUID 作为 AEAD 附加认证数据，经随机 nonce 的 AES-256-GCM 加密后写入独立 `connection_credentials` 表；SQLite 永远不保存秘密明文。本机只生成一把随机 256 位主密钥，由 Rust 侧 `CredentialStore` 通过 `keyring` 写入 macOS Keychain、Windows Credential Manager 或 Linux Secret Service，并在当前进程首次成功读取后缓存于可清零内存。Linux 没有可用 secret service 时保存操作必须明确失败，不能退化为硬编码密钥或明文文件。

创建连接时，密码认证必须同时保存密码；私钥认证保存私钥路径，并按需保存私钥口令。编辑连接时凭据字段留空表示保留原值，切换认证方式时清理不再适用的秘密；删除连接时由服务层显式移除密文。连接元数据和密文虽位于同一数据库，但当前通过独立异步仓库操作，服务层继续采用“先写凭据、再写元数据、失败时恢复”的补偿顺序，不能依赖跨调用事务。旧版本按连接 UUID 保存到系统凭据管理器的条目采用按需迁移：第一次连接、显示或导出时读取旧秘密、写入 SQLite 密文，成功后删除旧条目，避免应用启动时批量触发系统授权。

启动 SSH 会话时，前端只提交连接 ID 和终端尺寸。Rust 侧读取 SQLite 配置和加密凭据，使用进程内本机主密钥解密后直接构造认证请求；普通连接流程中密码和私钥口令不返回 React，也不进入会话 IPC 输入。没有已保存密码的旧连接会返回可操作错误，用户编辑连接补录后即可恢复双击直连。

编辑连接提供唯一例外：用户悬停或用键盘聚焦密码框内的显示按钮时，前端通过专用 `reveal_connection_credential` command 按需读取当前连接的秘密。列表加载和表单打开不能预取；指针离开、按钮失焦、认证方式变化或表单关闭时立即清除前端临时值。该能力只改善本机可见性，不改变凭据的加密存储位置。

连接迁移使用版本化 `.connex-backup` 容器。所有导出都必须设置导出密码；导出表单默认包含密码和私钥口令，用户可以主动切换为仅连接元数据。Rust 使用每个备份独立的随机 salt 和 Argon2id 参数从导出密码派生 256 位临时密钥，再用 AES-256-GCM 加密并认证完整 payload。备份不包含本机主密钥；目标设备输入导出密码解密后，为每条导入凭据使用目标设备主密钥重新加密。错误密码、损坏文件和被篡改文件统一拒绝，不能输出部分明文结果。

v1 备份只迁移私钥路径和可选的私钥口令，不复制私钥文件本身；用户需要通过其他安全方式把私钥放到新设备，并在导入后校正路径。未来若增加“包含私钥文件”，必须作为独立的显式选项且默认关闭，私钥内容只能存在于加密 payload 中，导入后写入目标设备应用数据目录下的受限路径。known host 信任记录默认不导出，新设备首次连接重新确认主机指纹。

持久化使用 Rust 侧共享的 `Database` 基础设施和 `tokio-rusqlite` 独立数据库线程，SQLite 以 bundled 模式随应用构建，避免平台系统库版本差异。数据库文件位于 Tauri 应用数据目录；连接配置、known host 等仓库共享同一条连接与按 `user_version` 顺序执行的 migration。前端只通过类型化 commands 访问持久化数据，不能直接执行 SQL。

known host 按 `host + port + key algorithm` 保存 SHA-256 指纹。同一主机可以保存多种主机密钥算法；已经记录的算法出现不同指纹时必须拒绝连接，不能由普通的“首次信任”流程覆盖。

应用设置使用单例 `app_settings` 表保存，当前包含默认开启的 `confirm_before_exit`、`terminal_semantic_highlighting_enabled`、稳定的 `terminal_font_id`、`terminal_font_size` 和 `terminal_font_size_shortcuts_enabled`。React 启动后由通用应用偏好 hook 通过类型化 commands 一次读取和串行更新，设置页修改、终端快捷键修改和退出确认中的“记住我的选择”都必须写入 SQLite；读取失败时采用安全默认值，仍然显示退出确认、启用语义高亮、使用内置 JetBrains Mono、13 px 字号并开启字号快捷键。字号在前后端统一限制为 9–32 px。终端 theme profile ID 在提供第二套真实主题和选择器时再加入持久化字段。

用户选择的字体由 `TerminalFontService` 校验扩展名、文件签名和 10 MiB 大小限制，再以 UUID 文件名复制到应用数据目录的 `terminal-fonts` 子目录；SQLite 的 `terminal_font_files` 只保存稳定 ID、展示名称、格式、大小和内部文件名，不保留用户原始路径。Commands 保持薄，文件校验与复制在 service 中完成，元数据读写位于 repository。删除字体必须确认且只删除 Connex 的副本；当前选中的自定义字体删除前先切回默认 profile。

主窗口通过 Tauri `onCloseRequested` 拦截系统关闭请求并立即 `preventDefault()`。需要确认时打开前端 `AlertDialog`；用户取消只关闭弹窗，不写入偏好。用户确认退出后调用 `destroy()`，绕过新的 `closeRequested` 事件并进入现有窗口销毁清理流程；偏好关闭时也必须先拦截请求再执行 `destroy()`，避免平台行为分叉。

## 10. 技术验证门槛

在完整连接 UI 之前先完成 SSH 技术验证，至少覆盖：

1. 密码、无口令私钥、带口令私钥和 Agent 认证。
2. 首次主机指纹确认与指纹变化拒绝。
3. Bash/Zsh、Vim、tmux、top、中文输入、复制粘贴、resize、运行中切换字体/字号，以及语义高亮在 alternate buffer 中完全停用。
4. 持续大输出、滚动回看和长 URL 下的高亮 decoration 数量、内存、延迟与背压。
5. 内置字体、系统等宽字体、导入字体和字号在重启后正确恢复；无效格式、超大文件、越界字号和已删除字体安全回退；macOS 的 `Command +/-` 与 Windows/Linux 的 `Ctrl +/-` 只在开关启用且终端获得焦点时调整字号，不发送给远端。
6. 同一连接同时运行终端和 SFTP 上传下载。
7. 主动关闭、网络断开、超时和应用退出后的资源清理。

如果 `russh` 在关键服务器算法或认证方式上无法达到要求，再评估 `ssh2/libssh2`。替换只发生在 Infrastructure 层，不改变前端 IPC 与领域模型。

## 11. 实施顺序

1. 工程脚手架、应用壳、代码规范和文档。
2. SSH/russh 技术验证与会话 manager。
3. 连接配置、主机验证和安全凭据。
4. xterm.js 真实终端会话。
5. SFTP 浏览与文件操作。
6. 传输队列、取消、重试和失败恢复。
7. macOS 打包与基础 Windows/Linux 兼容检查。
