use tauri::State;

use crate::models::connections::{ConnectionProfileDto, SaveConnectionInput};
use crate::models::error::CommandError;
use crate::services::connections::ConnectionService;

#[tauri::command]
pub async fn list_connections(
    service: State<'_, ConnectionService>,
) -> Result<Vec<ConnectionProfileDto>, CommandError> {
    service
        .list()
        .await
        .map(|profiles| profiles.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}

#[tauri::command]
pub async fn create_connection(
    input: SaveConnectionInput,
    service: State<'_, ConnectionService>,
) -> Result<ConnectionProfileDto, CommandError> {
    let (draft, credential) = input.into_parts().map_err(CommandError::from)?;

    service
        .create(draft, credential)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn update_connection(
    id: String,
    input: SaveConnectionInput,
    service: State<'_, ConnectionService>,
) -> Result<ConnectionProfileDto, CommandError> {
    let (draft, credential) = input.into_parts().map_err(CommandError::from)?;

    service
        .update(id, draft, credential)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn delete_connection(
    id: String,
    service: State<'_, ConnectionService>,
) -> Result<(), CommandError> {
    service.delete(id).await.map_err(Into::into)
}
