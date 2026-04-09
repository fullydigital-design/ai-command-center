use std::sync::Mutex;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

type FastApiSidecar = Mutex<Option<CommandChild>>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // -- Spawn FastAPI sidecar ----------------------------------------
            let shell = app.shell();

            // The sidecar binary name must match tauri.conf.json -> bundle.externalBin
            // Tauri resolves "fastapi-backend" to "binaries/fastapi-backend-{target-triple}.exe"
            let sidecar_cmd = shell
                .sidecar("fastapi-backend")
                .expect("failed to create sidecar command")
                .args(["--host", "127.0.0.1", "--port", "8000"]);

            let (mut rx, child) = sidecar_cmd
                .spawn()
                .expect("failed to spawn fastapi-backend sidecar");

            // Store child process handle so app lifecycle can access it.
            app.manage::<FastApiSidecar>(Mutex::new(Some(child)));

            // Log sidecar stdout/stderr to Tauri's terminal.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let s = String::from_utf8_lossy(&line);
                            println!("[FastAPI] {}", s);
                        }
                        CommandEvent::Stderr(line) => {
                            let s = String::from_utf8_lossy(&line);
                            eprintln!("[FastAPI:ERR] {}", s);
                        }
                        CommandEvent::Terminated(payload) => {
                            eprintln!(
                                "[FastAPI] Process terminated with code: {:?}, signal: {:?}",
                                payload.code, payload.signal
                            );
                        }
                        _ => {}
                    }
                }
            });

            println!("[Tauri] FastAPI sidecar launched on 127.0.0.1:8000");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
            if let Some(sidecar) = app_handle.try_state::<FastApiSidecar>() {
                if let Ok(mut guard) = sidecar.lock() {
                    if let Some(child) = guard.take() {
                        let _ = child.kill();
                        println!("[Tauri] FastAPI sidecar terminated");
                    }
                }
            }
        }
    });
}