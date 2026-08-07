#!/usr/bin/env node
/**
 * tu 桌面端打包脚本（Tauri v2）
 *
 * 与 web 端开发完全隔离：本脚本只读 tu-web-ts 的 src/ 并产出 dist/，
 * 不会修改任何 web 端配置文件。
 *
 * 用法：
 *   node scripts/build-desktop.mjs --api-base-url=https://your-server.com
 *   node scripts/build-desktop.mjs --api-base-url=https://your-server.com -- --target nsis
 *   node scripts/build-desktop.mjs -- --target nsis --bundles nsis
 *
 * 参数：
 *   --api-base-url=<url>   远程后端地址，注入 VITE_API_BASE_URL（http.ts 读取）
 *                          不传则前端走相对 /api（仅适合 dev proxy 场景）
 *   -- 之后的所有参数      透传给 `tauri build`
 *
 * 环境变量（优先级低于命令行参数）：
 *   TU_API_BASE_URL        同 --api-base-url
 *   VITE_API_BASE_URL      同上
 *
 * 前置条件：
 *   1. 已安装 Rust 工具链（https://rustup.rs）
 *   2. 已在 desktop/ 目录执行 `npm install`
 *   3. 已生成图标：`npm run icon -- path/to/your-icon.png`
 *
 * 产物：
 *   desktop/src-tauri/target/release/bundle/nsis/*.exe
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(__dirname, '..');
const projectRoot = resolve(desktopDir, '..');
const srcTauriDir = resolve(desktopDir, 'src-tauri');

// 解析参数：--api-base-url 归本脚本；-- 之后的透传给 tauri build
const rawArgs = process.argv.slice(2);
const dashIdx = rawArgs.indexOf('--');
const ownArgs = dashIdx === -1 ? rawArgs : rawArgs.slice(0, dashIdx);
const tauriExtra = dashIdx === -1 ? [] : rawArgs.slice(dashIdx + 1);

function getOwnArg(name) {
  for (let i = 0; i < ownArgs.length; i++) {
    const a = ownArgs[i];
    if (a === name) return ownArgs[i + 1];
    if (a.startsWith(name + '=')) return a.slice(name.length + 1);
  }
  return undefined;
}

const apiBaseUrl =
  getOwnArg('--api-base-url') ||
  process.env.TU_API_BASE_URL ||
  process.env.VITE_API_BASE_URL ||
  '';

// 检查图标（缺失则给出明确指引，避免 tauri build 报晦涩错误）
const iconIco = resolve(srcTauriDir, 'icons', 'icon.ico');
const iconPng = resolve(srcTauriDir, 'icons', 'icon.png');
if (!existsSync(iconIco) && !existsSync(iconPng)) {
  console.error('[desktop] 缺少图标文件，Tauri 无法打包。请先运行：');
  console.error('  cd desktop');
  console.error('  npm run icon -- path/to/your-icon.png');
  console.error('  （会自动在 desktop/src-tauri/icons/ 生成全套图标）');
  process.exit(1);
}

console.log('────────────────────────────────────────');
console.log('[desktop] 项目根目录 :', projectRoot);
console.log('[desktop] API base URL:', apiBaseUrl || '(空，前端走相对 /api)');
if (tauriExtra.length) {
  console.log('[desktop] tauri build 透传参数:', tauriExtra.join(' '));
}
console.log('────────────────────────────────────────');

// 注入环境变量：VITE_API_BASE_URL 被 http.ts 读取决定后端地址；
// VITE_DEFAULT_DATA_SOURCE=backend 确保走真实后端而非 mock。
const env = {
  ...process.env,
  VITE_API_BASE_URL: apiBaseUrl,
  VITE_DEFAULT_DATA_SOURCE: 'backend',
};

// 1. 构建前端产物到 tu-web-ts/dist（beforeBuildCommand 也会执行一次，
//    但 vite build 是幂等的，重复执行只是多花一次构建时间，确保产物最新）
console.log('\n[1/2] 构建前端 (vite build)...');
execSync('npm run build-only', { stdio: 'inherit', cwd: projectRoot, env });

// 2. 构建 Tauri 应用（Rust 编译 + NSIS 打包）
console.log('\n[2/2] 构建 Tauri 应用 (tauri build)...');
const tauriCmd = ['npx', 'tauri', 'build', ...tauriExtra].join(' ');
execSync(tauriCmd, { stdio: 'inherit', cwd: desktopDir, env });

console.log('\n────────────────────────────────────────');
console.log('[desktop] 打包完成。产物位于：');
console.log('  ' + resolve(srcTauriDir, 'target/release/bundle/nsis/'));
console.log('────────────────────────────────────────');
