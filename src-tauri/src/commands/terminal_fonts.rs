use tauri::State;
use tauri::ipc::Response;

use crate::models::error::CommandError;
use crate::models::terminal_fonts::{
    ImportTerminalFontInput, TerminalFontDto, TerminalFontIdInput,
};
use crate::services::terminal_fonts::TerminalFontService;

#[tauri::command]
pub async fn list_terminal_fonts(
    service: State<'_, TerminalFontService>,
) -> Result<Vec<TerminalFontDto>, CommandError> {
    service
        .list()
        .await
        .map(|fonts| fonts.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}

#[tauri::command]
pub async fn import_terminal_font(
    input: ImportTerminalFontInput,
    service: State<'_, TerminalFontService>,
) -> Result<TerminalFontDto, CommandError> {
    service
        .import(input.path)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn read_terminal_font(
    input: TerminalFontIdInput,
    service: State<'_, TerminalFontService>,
) -> Result<Response, CommandError> {
    service
        .read(&input.id)
        .await
        .map(Response::new)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn delete_terminal_font(
    input: TerminalFontIdInput,
    service: State<'_, TerminalFontService>,
) -> Result<(), CommandError> {
    service.delete(&input.id).await.map_err(Into::into)
}
