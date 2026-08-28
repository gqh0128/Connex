mod commands;
mod domain;
mod infrastructure;
mod managers;
mod models;
mod services;

use tauri::{Manager, WindowEvent};

use infrastructure::connections::ConnectionRepository;
use infrastructure::credentials::CredentialStore;
use infrastructure::database::Database;
use infrastructure::known_hosts::KnownHostRepository;
use infrastructure::ssh::SshConnector;
use managers::sessions::SshSessionManager;
use services::connections::ConnectionService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;

            let database = tauri::async_runtime::block_on(Database::open(
                app_data_dir.join("connex.sqlite3"),
            ))?;
            let connection_service = ConnectionService::new(
                ConnectionRepository::new(database.clone()),
                CredentialStore::new(),
            );
            let session_manager = SshSessionManager::new(SshConnector::new(
                KnownHostRepository::new(database.clone()),
            ));
            app.manage(database);
            app.manage(connection_service);
            app.manage(session_manager);

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                let session_manager = window.state::<SshSessionManager>().inner().clone();
                tauri::async_runtime::spawn(async move {
                    session_manager.close_all().await;
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_app_info,
            commands::connections::list_connections,
            commands::connections::create_connection,
            commands::connections::update_connection,
            commands::connections::delete_connection,
            commands::sessions::start_ssh_session,
            commands::sessions::get_ssh_session,
            commands::sessions::decide_ssh_host_key,
            commands::sessions::send_ssh_input,
            commands::sessions::resize_ssh_session,
            commands::sessions::keepalive_ssh_session,
            commands::sessions::close_ssh_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
