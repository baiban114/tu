#!/usr/bin/env node
/**
 * tu 桌面端开发脚本（Tauri v2 dev）
 *
 * 启动 Tauri 开发窗口，同时通过 tauri.conf.json 的 beforeDevCommand
 * 拉起 tu-web-ts 的 vite dev server（端口 5173）。
 *
 * 用法：
 *   node scripts/dev-desktop.mjs
 *   node scripts/dev-desktop.mjs --api-base-url=https://your-server.com
 *
 * 参数：
 *   --api-base-url=<url>   远程后端地址，注入 VITE_API_BASE_URL
 *                          不传则走 vite proxy（适合本地后端开发）
 *
 * 环境变量：
 *   TU_API_BASE_URL / VITE_API_BASE_URL  同 --api-base-url
 */
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(__dirname, '..');

const rawArgs = process.argv.slice(2);
function getArg(name) {
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === name) return rawArgs[i + 1];
    if (a.startsWith(name + '=')) return a.slice(name.length + 1);
  }
  return undefined;
}

const apiBaseUrl =
  getArg('--api-base-url') ||
  process.env.TU_API_BASE_URL ||
  process.env.VITE_API_BASE_URL ||
  '';

console.log('[desktop] dev 模式启动');
console.log('[desktop] API base URL:', apiBaseUrl || '(空，走 vite proxy → localhost:18080)');

const env = {
  ...process.env,
  VITE_API_BASE_URL: apiBaseUrl,
  VITE_DEFAULT_DATA_SOURCE: 'backend',
};

// tauri dev 会自动执行 beforeDevCommand（npm run dev，cwd=项目根）
// 拉起 vite dev server，然后打开 Tauri 窗口加载 http://localhost:5173
execSync('npx tauri dev', { stdio: 'inherit', cwd: desktopDir, env });
