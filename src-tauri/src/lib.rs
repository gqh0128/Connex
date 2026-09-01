mod commands;
mod domain;
mod infrastructure;
mod managers;
mod models;
mod services;

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Manager, WindowEvent};

use infrastructure::app_settings::AppSettingsRepository;
use infrastructure::connections::ConnectionRepository;
use infrastructure::credentials::CredentialStore;
use infrastructure::database::Database;
use infrastructure::known_hosts::KnownHostRepository;
use infrastructure::ssh::SshConnector;
use infrastructure::terminal_fonts::TerminalFontRepository;
use managers::sessions::SshSessionManager;
use services::backups::ConnectionBackupService;
use services::connections::ConnectionService;
use services::terminal_fonts::TerminalFontService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;

            let database = tauri::async_runtime::block_on(Database::open(
                app_data_dir.join("connex.sqlite3"),
            ))?;
            let connection_service = ConnectionService::new(
                ConnectionRepository::new(database.clone()),
                CredentialStore::new(database.clone()),
            );
            let session_manager = SshSessionManager::new(SshConnector::new(
                KnownHostRepository::new(database.clone()),
            ));
            let backup_service = ConnectionBackupService::new(connection_service.clone());
            let app_settings_repository = AppSettingsRepository::new(database.clone());
            let terminal_font_service = TerminalFontService::new(
                TerminalFontRepository::new(database.clone()),
                app_data_dir.join("terminal-fonts"),
            );
            app.manage(database);
            app.manage(app_settings_repository);
            app.manage(terminal_font_service);
            app.manage(connection_service);
            app.manage(backup_service);
            app.manage(session_manager);

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                let session_manager = window.state::<SshSessionManager>().inner().clone();
                tauri::async_runtime::block_on(async move {
                    session_manager.close_all().await;
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_app_info,
            commands::app::get_app_preferences,
            commands::app::update_app_preferences,
            commands::terminal_fonts::list_terminal_fonts,
            commands::terminal_fonts::list_system_terminal_fonts,
            commands::terminal_fonts::import_terminal_font,
            commands::terminal_fonts::read_terminal_font,
            commands::terminal_fonts::delete_terminal_font,
            commands::backups::export_connection_backup,
            commands::backups::inspect_connection_backup,
            commands::backups::import_connection_backup,
            commands::connections::list_connections,
            commands::connections::create_connection,
            commands::connections::update_connection,
            commands::connections::delete_connection,
            commands::connections::reveal_connection_credential,
            commands::sessions::start_ssh_session,
            commands::sessions::get_ssh_session,
            commands::sessions::decide_ssh_host_key,
            commands::sessions::send_ssh_input,
            commands::sessions::resize_ssh_session,
            commands::sessions::keepalive_ssh_session,
            commands::sessions::close_ssh_session,
            commands::sftp::list_remote_directory,
            commands::sftp::create_remote_directory,
            commands::sftp::create_remote_file,
            commands::sftp::rename_remote_entry,
            commands::sftp::delete_remote_entry,
            commands::sftp::select_local_upload_files,
            commands::sftp::select_local_upload_folder,
            commands::sftp::select_local_download_target,
            commands::sftp::select_local_download_folder,
            commands::sftp::attach_remote_file_transfers,
            commands::sftp::upload_remote_file,
            commands::sftp::download_remote_file,
            commands::sftp::pause_remote_file_transfer,
            commands::sftp::cancel_remote_file_transfer,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    let is_exit_cleanup_started = Arc::new(AtomicBool::new(false));
    let is_exit_cleanup_complete = Arc::new(AtomicBool::new(false));
    app.run(move |app_handle, event| {
        let tauri::RunEvent::ExitRequested { code, api, .. } = event else {
            return;
        };
        if is_exit_cleanup_complete.load(Ordering::Acquire) {
            return;
        }
        api.prevent_exit();
        if is_exit_cleanup_started.swap(true, Ordering::AcqRel) {
            return;
        }

        let app_handle = app_handle.clone();
        let session_manager = app_handle.state::<SshSessionManager>().inner().clone();
        let is_exit_cleanup_complete = is_exit_cleanup_complete.clone();
        tauri::async_runtime::spawn(async move {
            session_manager.close_all().await;
            is_exit_cleanup_complete.store(true, Ordering::Release);
            app_handle.exit(code.unwrap_or(0));
        });
    });
}
