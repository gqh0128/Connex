mod commands;
mod domain;
mod infrastructure;
mod models;
mod services;

use tauri::Manager;

use services::connections::ConnectionService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;

            let connection_service = tauri::async_runtime::block_on(ConnectionService::open(
                app_data_dir.join("connex.sqlite3"),
            ))?;
            app.manage(connection_service);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_app_info,
            commands::connections::list_connections,
            commands::connections::create_connection,
            commands::connections::update_connection,
            commands::connections::delete_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
