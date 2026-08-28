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
│                            ├── system credentials        │
│                            └── local filesystem          │
└──────────────────────────────────────────────────────────┘
```

React 不直接访问网络、数据库、凭据或任意本地路径。Rust 是连接状态和持久化数据的权威来源。

## 3. 前端架构

前端按功能垂直切分，同时保留少量真正通用的 UI 和基础设施层。

- `app/`：组合应用、注册全局 provider、处理窗口级快捷键。
- `components/layout/`：侧栏、会话标签、工作区、状态栏等跨功能布局。
- `components/ui/`：来自 shadcn/ui 的无业务语义组件。
- `features/connections/`：连接列表、编辑表单、SSH 配置导入。
- `features/terminal/`：xterm 实例、输入聚合、输出写入、resize 和快捷键。
- `features/sftp/`：目录导航、远程文件操作和拖拽入口。
- `features/transfers/`：上传下载队列、进度、取消和重试。
- `lib/tauri/`：唯一允许导入 `@tauri-apps/api` 命令接口的位置。

全局状态库暂不引入。连接与传输状态最终来自 Rust manager；前端先使用局部 state 和 feature hooks。等多个页面确实需要规范化共享数据时，再评估轻量 store。

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

数据面使用有序 Tauri Channel，适合：

- SSH stdout/stderr 原始字节
- 会话状态变化
- 传输进度和结束事件
- 大目录的分批加载结果

终端输出使用 `Channel<InvokeResponseBody>` 的 raw bytes，前端直接写入 xterm.js。输入在前端按极短时间窗口聚合为 `Uint8Array` 后提交，不能为每个字符构造业务 JSON。断线、认证失败等状态通过独立结构化事件发送，不能混入终端字节流。

所有 command 名称使用 `snake_case`，JSON 字段使用 `camelCase`。每个前端调用都由 `src/lib/tauri` 中的函数封装，组件不依赖命令字符串。

## 6. SSH 会话模型

每次成功连接创建一个不可猜测的 session ID，并启动独立会话任务。建议状态机：

```text
idle → connecting → verifyingHost → authenticating → connected
  ▲          │              │              │             │
  └──────────┴──────────────┴──────────────┴── error     ├── closing → closed
                                                          └── disconnected
```

会话任务独占 SSH handle，并通过有界队列接收：

- `Write(Vec<u8>)`
- `Resize { columns, rows, pixel_width, pixel_height }`
- `OpenSftp`
- `Keepalive`
- `Close`

打开 Shell 前先请求远程 PTY，默认终端类型为 `xterm-256color`。初始行列数来自 xterm FitAddon，容器变化后发送 resize。终端输出背压需要在技术验证中用持续大输出测试，不能采用无界内存队列。

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

文件列表只返回显示所需元数据：名称、类型、大小、修改时间、权限和符号链接信息。远程路径以原始服务器语义处理，不假设本地路径分隔符。

上传与下载由 Rust 直接分块传输：

```text
local file ↔ Rust buffered I/O ↔ SFTP channel ↔ remote file
```

传输事件至少包含 transfer ID、方向、已完成字节、总字节、速度、状态和安全错误摘要。默认不静默覆盖已有文件；下载可先写临时文件，成功后再原子重命名，取消或失败时清理可识别的临时文件。

## 9. 持久化

计划使用 SQLite 保存：

- 连接与分组
- 非敏感应用设置
- known host 元数据
- 后续需要时的传输历史

数据库从第一张表开始使用版本化 migration，不在启动代码里散落 `CREATE TABLE`。密码和私钥口令不进入数据库；它们存入系统凭据管理器，SQLite 只保存稳定引用。Linux 没有可用 secret service 时，禁用“记住密码”，不能退化为明文文件。

## 10. 技术验证门槛

在完整连接 UI 之前先完成 SSH 技术验证，至少覆盖：

1. 密码、无口令私钥、带口令私钥和 Agent 认证。
2. 首次主机指纹确认与指纹变化拒绝。
3. Bash/Zsh、Vim、tmux、top、中文输入、复制粘贴和 resize。
4. 持续大输出下的内存、延迟与背压。
5. 同一连接同时运行终端和 SFTP 上传下载。
6. 主动关闭、网络断开、超时和应用退出后的资源清理。

如果 `russh` 在关键服务器算法或认证方式上无法达到要求，再评估 `ssh2/libssh2`。替换只发生在 Infrastructure 层，不改变前端 IPC 与领域模型。

## 11. 实施顺序

1. 工程脚手架、应用壳、代码规范和文档。
2. SSH/russh 技术验证与会话 manager。
3. 连接配置、主机验证和安全凭据。
4. xterm.js 真实终端会话。
5. SFTP 浏览与文件操作。
6. 传输队列、取消、重试和失败恢复。
7. macOS 打包与基础 Windows/Linux 兼容检查。
