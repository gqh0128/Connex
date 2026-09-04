use tauri::State;

use crate::models::connection_testing::{
    SshConnectionTestResultDto, TestSshConnectionInput, TestSshConnectionParts,
};
use crate::models::error::CommandError;
use crate::services::connection_testing::ConnectionTestService;

#[tauri::command]
pub async fn test_ssh_connection(
    input: TestSshConnectionInput,
    service: State<'_, ConnectionTestService>,
) -> Result<SshConnectionTestResultDto, CommandError> {
    let TestSshConnectionParts {
        draft,
        credential,
        connection_id,
        accepted_host_key,
        should_remember_host_key,
    } = input.into_parts().map_err(CommandError::from)?;

    service
        .test(
            draft,
            credential,
            connection_id,
            accepted_host_key,
            should_remember_host_key,
        )
        .await
        .map(Into::into)
        .map_err(Into::into)
}
