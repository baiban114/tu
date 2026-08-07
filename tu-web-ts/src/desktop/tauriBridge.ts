/**
 * Tauri 桥接层（桌面端专用）
 *
 * 通过 `window.__TAURI__` 全局对象访问 Tauri API（需在 tauri.conf.json 中
 * 设置 `app.withGlobalTauri: true`）。这样 web 端无需引入 `@tauri-apps/api`
 * npm 依赖，dev 模式（纯浏览器）下也能优雅降级。
 *
 * 仅在桌面端运行时（`isTauri()` 为 true）这些 API 才可用；web 端调用会
 * 得到 null / false，调用方需自行处理。
 */

const OPEN_FILE_EVENT = 'tu://open-local-file';

// --- Minimal type declarations for window.__TAURI__ (Tauri v2 global) -------
interface TauriEventPayload<T> {
  payload: T;
  id: number;
  topic: string;
}

interface TauriGlobalCore {
  invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

interface TauriGlobalEvent {
  listen<T = unknown>(
    event: string,
    handler: (event: TauriEventPayload<T>) => void,
  ): Promise<() => void>;
  emit(event: string, payload?: unknown): Promise<void>;
}

interface TauriGlobal {
  core: TauriGlobalCore;
  event: TauriGlobalEvent;
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
  }
}

/** Returns true when running inside the Tauri desktop shell. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI__);
}

function tauri(): TauriGlobal | null {
  if (typeof window === 'undefined') return null;
  return window.__TAURI__ ?? null;
}

// --- File commands ----------------------------------------------------------

/**
 * Read a UTF-8 text file at the given absolute path.
 * Returns null in non-Tauri environments (e.g. web dev mode).
 */
export async function readLocalTextFile(path: string): Promise<string | null> {
  const t = tauri();
  if (!t) return null;
  return t.core.invoke<string>('read_text_file', { path });
}

/**
 * Write UTF-8 text back to the given absolute path.
 * Returns false in non-Tauri environments or on failure.
 */
export async function writeLocalTextFile(path: string, content: string): Promise<boolean> {
  const t = tauri();
  if (!t) return false;
  try {
    await t.core.invoke<void>('write_text_file', { path, content });
    return true;
  } catch (error) {
    console.error('[tauriBridge] write_text_file failed:', error);
    return false;
  }
}

// --- Initial file & single-instance event -----------------------------------

/**
 * Returns the .md file path passed on the command line when the app was
 * first launched, or null if none / not in Tauri.
 *
 * One-shot: the path is consumed on first call.
 */
export async function getInitialOpenFile(): Promise<string | null> {
  const t = tauri();
  if (!t) return null;
  try {
    return await t.core.invoke<string | null>('get_initial_open_file');
  } catch (error) {
    console.error('[tauriBridge] get_initial_open_file failed:', error);
    return null;
  }
}

/**
 * Subscribe to file-open events. The callback is invoked with an absolute
 * file path whenever a second instance of the app is launched with a .md
 * argument (e.g. user double-clicks another .md while app is already open).
 *
 * Returns an unsubscribe function (no-op in non-Tauri environments).
 */
export function onOpenLocalFile(handler: (filePath: string) => void): () => void {
  const t = tauri();
  if (!t) return () => {};

  let unlisten: (() => void) | null = null;
  let cancelled = false;

  void t.event.listen<string>(OPEN_FILE_EVENT, (event) => {
    if (event.payload) handler(event.payload);
  }).then((fn) => {
    if (cancelled) {
      fn();
    } else {
      unlisten = fn;
    }
  }).catch((error) => {
    console.error('[tauriBridge] listen for open-local-file failed:', error);
  });

  return () => {
    cancelled = true;
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  };
}
