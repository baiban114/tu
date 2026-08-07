# tu 桌面端打包运维指南

将 `tu-web-ts` 前端打包为 Windows exe 桌面应用，基于 **Tauri v2**，后端采用**远程服务**模式。

---

## 1. 技术方案

| 维度 | 选型 |
|---|---|
| 桌面壳 | Tauri v2（Rust + 系统 WebView2） |
| 后端模式 | 远程服务，通过 `VITE_API_BASE_URL` 注入地址 |
| 隔离策略 | 桌面端全部文件位于 `desktop/`，不修改 web 端任何配置 |
| 打包目标 | Windows NSIS 安装包（`.exe`） |

### 与 web 端的隔离

- `desktop/package.json` 独立，只装 `@tauri-apps/cli`，不污染根 `package.json`
- 不修改 `vite.config.ts` / `src/` 任何文件
- 远程后端地址通过环境变量 `VITE_API_BASE_URL` 注入（[http.ts#L7](file:///d:/project/tu/tu-web-ts/src/api/http.ts#L7) 已支持）
- Rust 编译产物在 `desktop/src-tauri/target/`，已 gitignore

---

## 2. 目录结构

```
tu-web-ts/
├── src/                          # web 端代码（不动）
├── vite.config.ts                # web 端配置（不动）
├── package.json                  # web 端配置（不动）
└── desktop/                      # 桌面端隔离目录
    ├── package.json              # 独立依赖
    ├── .gitignore                # 忽略 target/ node_modules/ icons/
    ├── scripts/
    │   ├── build-desktop.mjs     # 打包脚本
    │   └── dev-desktop.mjs       # 开发脚本
    └── src-tauri/
        ├── Cargo.toml            # Rust 项目配置
        ├── build.rs              # Tauri 构建钩子
        ├── tauri.conf.json       # Tauri 配置（frontendDist → ../../dist）
        └── src/
            └── main.rs           # Rust 入口
```

---

## 3. 一次性准备

### 3.1 安装 Rust 工具链

下载并安装 [rustup](https://rustup.rs/)，确认：

```powershell
rustc --version
cargo --version
```

### 3.2 安装 desktop 依赖

```powershell
cd d:\project\tu\tu-web-ts\desktop
npm install
```

### 3.3 生成应用图标

准备一张 **1024×1024** 的 PNG 图标源图，执行：

```powershell
cd d:\project\tu\tu-web-ts\desktop
npm run icon -- path\to\your-icon.png
```

会在 `desktop/src-tauri/icons/` 自动生成全套图标（`.ico` / `.icns` / 各尺寸 `.png`）。

> 图标目录已 gitignore，每台构建机器需各自生成，或把 `icons/` 加入版本控制后提交一次。

---

## 4. 打包流程

### 4.1 基本打包

```powershell
cd d:\project\tu\tu-web-ts\desktop

# 指定远程后端地址
npm run build -- --api-base-url=https://your-server.com
```

**产物路径**：

```
desktop/src-tauri/target/release/bundle/nsis/tu_0.1.0_x64-setup.exe
```

### 4.2 脚本参数

| 参数 | 说明 |
|---|---|
| `--api-base-url=<url>` | 远程后端地址，注入 `VITE_API_BASE_URL`。不传则前端走相对 `/api`（仅适合 dev proxy 场景，打包时**必须传**） |
| `-- <args>` | `--` 之后的所有参数透传给 `tauri build` |

示例：

```powershell
# 只生成 NSIS 包
npm run build -- --api-base-url=https://your-server.com -- --bundles nsis

# 指定目标架构
npm run build -- --api-base-url=https://your-server.com -- --target x86_64-pc-windows-msvc
```

### 4.3 环境变量（CICD 友好）

脚本支持以下环境变量，优先级**低于**命令行参数：

| 变量 | 说明 |
|---|---|
| `TU_API_BASE_URL` | 同 `--api-base-url` |
| `VITE_API_BASE_URL` | 同上 |

### 4.4 构建过程说明

脚本执行两步：

1. **构建前端**：`npm run build-only`（cwd=项目根），产出 `tu-web-ts/dist/`
2. **构建 Tauri**：`npx tauri build`（cwd=desktop），Rust 编译 + NSIS 打包

> `tauri.conf.json` 的 `beforeBuildCommand` 也会执行一次 `npm run build-only`，vite build 幂等，确保产物最新。

---

## 5. 开发调试

### 5.1 走本地后端（vite proxy → localhost:18080）

```powershell
cd d:\project\tu\tu-web-ts\desktop
npm run dev
```

Tauri 会通过 `beforeDevCommand` 拉起 `tu-web-ts` 的 vite dev server（端口 5173），然后打开桌面窗口加载 `http://localhost:5173`。

### 5.2 走远程后端

```powershell
npm run dev -- --api-base-url=https://your-server.com
```

### 5.3 端口冲突注意

vite 默认监听 5173。若被占用会自动切换端口，但 Tauri 的 `devUrl` 固定为 `http://localhost:5173`，会导致连接失败。开发前请确保 5173 可用，或临时关闭占用进程。

---

## 6. CICD 集成

### 6.1 PowerShell（Azure DevOps / 自建 Windows Runner）

```powershell
# 注入后端地址
$env:TU_API_BASE_URL = "https://prod.example.com"

# 安装 desktop 依赖
Set-Location d:\project\tu\tu-web-ts\desktop
npm ci

# 打包
npm run build

# 产物路径
$artifact = "src-tauri\target\release\bundle\nsis\tu_0.1.0_x64-setup.exe"
# 上传 $artifact 到制品库
```

### 6.2 GitHub Actions 示例

```yaml
name: build-desktop

on:
  workflow_dispatch:
    inputs:
      api_base_url:
        description: '远程后端地址'
        required: true

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - uses: dtolnay/rust-toolchain@stable

      - name: Install web deps
        working-directory: tu-web-ts
        run: npm ci

      - name: Install desktop deps
        working-directory: tu-web-ts/desktop
        run: npm ci

      - name: Generate icons
        working-directory: tu-web-ts/desktop
        run: npm run icon -- icons-source.png
        # 需把图标源文件放入仓库或用 artifact 下载

      - name: Build
        working-directory: tu-web-ts/desktop
        env:
          TU_API_BASE_URL: ${{ inputs.api_base_url }}
        run: npm run build

      - uses: actions/upload-artifact@v4
        with:
          name: tu-desktop-setup
          path: tu-web-ts/desktop/src-tauri/target/release/bundle/nsis/*.exe
```

---

## 7. 远程后端配置说明

### 7.1 地址注入链路

```
--api-base-url / TU_API_BASE_URL
        ↓
VITE_API_BASE_URL（环境变量）
        ↓
vite build 时静态替换
        ↓
http.ts 中的 API_BASE_URL 常量
        ↓
buildUrl() 拼接所有 /api/* 请求
```

### 7.2 后端 CORS 要求

桌面端运行时来源是 `tauri://localhost` 或 `https://tauri.localhost`，后端需放行：

- `Access-Control-Allow-Origin: *` 或 `tauri://localhost`
- `Access-Control-Allow-Headers: Content-Type, Authorization`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`

参考 tu-backend 的 [WebCorsConfig.java](file:///d:/project/tu/tu-backend/tu-backend-app/src/main/java/com/tu/backend/config/WebCorsConfig.java)。

### 7.3 文件上传/下载

桌面端通过 `fetch` 访问远程后端的 `/api/file/*`，需确保：

- 后端 MinIO / 文件存储对外可访问
- 大文件分片上传（`FileMultipartUploadService`）的预签名 URL 域名可达

---

## 8. 注意事项

### 8.1 WebView2 依赖

Tauri v2 在 Windows 上依赖 **WebView2 Runtime**：

- Win11 默认预装
- Win10 部分版本预装，部分需补装

NSIS 安装包默认配置为 `downloadBootstrapper`：用户首次安装 exe 时若检测到无 WebView2，会自动下载安装。

如需改为**离线内嵌** WebView2 安装器（增大包体约 100MB+），在 `tauri.conf.json` 的 `bundle.windows.webviewInstallMode` 中配置为 `embedBootstrapper`。

### 8.2 图标缺失会报错

打包前脚本会检查 `desktop/src-tauri/icons/icon.ico` 是否存在，缺失会给出明确提示并退出。请先完成 [3.3 生成应用图标](#33-生成应用图标)。

### 8.3 Tauri 版本

当前 `package.json` 锁定 `@tauri-apps/cli ^2`，Rust 侧 `Cargo.toml` 锁定 `tauri = "2"`。升级时两侧需同步。

### 8.4 包体优化

`Cargo.toml` 的 `[profile.release]` 已配置：

```toml
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

首次编译较慢（LTO 单单元），后续增量编译会快很多。最终 exe 安装包通常 5–15MB（不含 WebView2）。

### 8.5 CSP 安全策略

`tauri.conf.json` 当前设置 `"csp": null`（关闭），原因是前端有大量内联样式和动态脚本（tiptap、x6、pdfjs）。如需加强安全，可配置具体 CSP 策略，但需充分测试富文本/画板渲染。

---

## 9. 常见问题

### Q: 打包后白屏？

检查 `VITE_API_BASE_URL` 是否正确指向可访问的后端；打开 devtools（开发包按 F12）看网络请求是否 CORS 被拒。

### Q: `tauri build` 报 "icon not found"？

未生成图标，执行 `npm run icon -- 你的图.png`。

### Q: Rust 编译失败 `link.exe not found`？

未安装 MSVC 构建工具。运行 `rustup default stable-x86_64-pc-windows-msvc` 并安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)。

### Q: 端口 5173 被占用导致 dev 失败？

关闭占用进程，或在 `tu-web-ts/vite.config.ts` 中固定端口（但会改 web 端配置，不推荐）。

### Q: `tauri build` 卡在 "Verifying NSIS package" / "Recreating it" / "Redownloading them"？

Tauri 首次打包需要从 GitHub 下载 NSIS 3.11 和 `nsis_tauri_utils.dll`（v0.5.3）。在国内网络下经常超时或 TLS 校验失败。手动离线安装步骤（一次性，安装后会被缓存）：

```powershell
# 1. NSIS 主体（标准 NSIS 3.11，含 Bin/makensiso.exe 等 Tauri 修改版）
$nsis = "$env:LOCALAPPDATA\tauri\NSIS"
$tmp   = "$env:TEMP\tauri-nsis-3.11.zip"
$url1  = "https://ghproxy.net/https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip"
Invoke-WebRequest -Uri $url1 -OutFile $tmp -UseBasicParsing -TimeoutSec 300
Expand-Archive -Path $tmp -DestinationPath "$env:TEMP\tauri-nsis-extract" -Force
# 若已有部分 NSIS 文件，仅合并缺失项；干净机器可直接整目录覆盖
Copy-Item "$env:TEMP\tauri-nsis-extract\nsis-3.11\*" $nsis -Recurse -Force

# 2. nsis_tauri_utils.dll v0.5.3（Tauri 校验 hash，必须用官方版本）
$dll   = "$env:TEMP\nsis_tauri_utils-v0.5.3.dll"
$url2  = "https://ghproxy.net/https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll"
Invoke-WebRequest -Uri $url2 -OutFile $dll -UseBasicParsing -TimeoutSec 120
# Tauri v2.11+ 要求 additional 子目录；同时保留根目录一份兼容旧版
$addDir = "$nsis\Plugins\x86-unicode\additional"
New-Item -ItemType Directory -Path $addDir -Force | Out-Null
Copy-Item $dll "$addDir\nsis_tauri_utils.dll" -Force
Copy-Item $dll "$nsis\Plugins\x86-unicode\nsis_tauri_utils.dll" -Force
```

Tauri v2.11 校验的关键文件清单（缺失任一项都会触发 "Recreating" 整目录）：

| 路径 | 来源 |
|---|---|
| `makensis.exe` | nsis-3.11.zip |
| `Bin/makensis.exe` | nsis-3.11.zip |
| `Stubs/lzma-x86-unicode` | nsis-3.11.zip |
| `Stubs/lzma_solid-x86-unicode` | nsis-3.11.zip |
| `Plugins/x86-unicode/additional/nsis_tauri_utils.dll` | nsis_tauri_utils-v0.5.3.dll（**hash 校验**） |
| `Include/MUI2.nsh` / `FileFunc.nsh` / `x64.nsh` / `nsDialogs.nsh` / `WinMessages.nsh` | nsis-3.11.zip |
| `Include/Win/COM.nsh` / `Win/Propkey.nsh` / `Win/RestartManager.nsh` | nsis-3.11.zip |

> 镜像备选：`ghproxy.net`（实测可用）、`github.moeyy.xyz`、`mirror.ghproxy.com`。`ghproxy.com` 已失效。

### Q: `tauri build` 报 "__TAURI_BUNDLE_TYPE variable not found in binary"？

Tauri CLI 与 `tauri` Rust crate 版本不匹配。检查 `desktop/src-tauri/Cargo.toml` 中的 `tauri = "2"` 与 `desktop/package.json` 中的 `@tauri-apps/cli: "^2"`，运行 `cargo update -p tauri` 同步。

---

## 10. 版本管理

- 桌面端版本独立于 web 端，在 `desktop/package.json` 和 `desktop/src-tauri/tauri.conf.json` 的 `version` 字段维护
- 升级版本时同步修改这两处
- NSIS 安装包文件名会自动带版本号：`tu_0.1.0_x64-setup.exe`
