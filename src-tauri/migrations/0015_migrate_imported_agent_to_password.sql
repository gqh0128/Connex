UPDATE connection_profiles
SET authentication_method = 'password',
    has_stored_credential = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE origin = 'ssh_config'
  AND authentication_method = 'agent';
