use keyring::Entry;

const SERVICE_NAME: &str = "com.myhzz.newim";

#[tauri::command]
pub fn secure_store_get(key: String) -> Result<Option<String>, String> {
    let entry =
        Entry::new(SERVICE_NAME, &key).map_err(|e| format!("failed to create keyring entry: {e}"))?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("failed to read from secure store: {e}")),
    }
}

#[tauri::command]
pub fn secure_store_set(key: String, value: String) -> Result<(), String> {
    let entry =
        Entry::new(SERVICE_NAME, &key).map_err(|e| format!("failed to create keyring entry: {e}"))?;
    entry
        .set_password(&value)
        .map_err(|e| format!("failed to write to secure store: {e}"))
}

#[tauri::command]
pub fn secure_store_remove(key: String) -> Result<(), String> {
    let entry =
        Entry::new(SERVICE_NAME, &key).map_err(|e| format!("failed to create keyring entry: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("failed to delete from secure store: {e}")),
    }
}
