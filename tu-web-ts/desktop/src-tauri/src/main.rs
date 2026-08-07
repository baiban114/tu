// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{Emitter, State};

/// Event name emitted to the frontend whenever a .md file should be opened.
/// Payload is the absolute file path as a string.
const OPEN_FILE_EVENT: &str = "tu://open-local-file";

/// Read a UTF-8 text file at the given absolute path.
///
/// Used by the frontend to load a .md file when Windows launches the app
/// with the file as a command-line argument (file association).
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }
    fs::read_to_string(&p).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Write UTF-8 text back to the given absolute path.
///
/// Used to persist edits back to the original local .md file.
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

/// Returns the .md file path that was passed on the command line when the
/// app was first launched, then clears it (one-shot).
///
/// The frontend calls this on mount to pick up the initial file. Subsequent
/// file-open requests arrive via the `OPEN_FILE_EVENT` event (single-instance
/// plugin forwards argv from second launches).
#[tauri::command]
fn get_initial_open_file(state: State<InitialFile>) -> Option<String> {
    state.0.lock().ok().and_then(|mut opt| opt.take())
}

struct InitialFile(Mutex<Option<String>>);

/// Scan command-line args for the first .md / .markdown file path.
/// Returns the absolute path if found, resolving relative paths against CWD.
fn extract_file_arg(args: &[String]) -> Option<String> {
    // Skip the first arg (the executable path itself).
    for arg in args.iter().skip(1) {
        let lower = arg.to_lowercase();
        if lower.ends_with(".md") || lower.ends_with(".markdown") {
            let path = PathBuf::from(arg);
            if path.is_absolute() {
                return Some(path.to_string_lossy().into_owned());
            }
            if let Ok(cwd) = std::env::current_dir() {
                let abs = cwd.join(&path);
                if abs.exists() {
                    return Some(abs.to_string_lossy().into_owned());
                }
            }
        }
    }
    None
}

fn main() {
    let initial_file = extract_file_arg(&std::env::args().collect::<Vec<_>>());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // A second instance was launched (e.g. user double-clicked another .md
            // while the app was already running). Forward the file path to the
            // already-running frontend via an event.
            if let Some(file_path) = extract_file_arg(&argv) {
                let _ = app.emit(OPEN_FILE_EVENT, file_path);
            }
        }))
        .manage(InitialFile(Mutex::new(initial_file)))
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            get_initial_open_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
