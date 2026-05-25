//! extern "C" FFI layer — callable from Python ctypes.
//!
//! All functions wrap `crate::session::SessionManager`.
//! Memory allocated by Rust MUST be freed by calling the corresponding
//! `free_*` function from the caller side.

use std::ffi::{c_char, CStr, CString};
use std::slice;

use crate::session::SessionManager;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn to_c_string(s: String) -> *mut c_char {
    CString::new(s)
        .unwrap_or_else(|_| CString::new("string encoding error").unwrap())
        .into_raw()
}

/// # Safety
/// ptr must be a valid, null-terminated C string.
unsafe fn cstr_to_str<'a>(ptr: *const c_char) -> &'a str {
    if ptr.is_null() {
        return "";
    }
    unsafe { CStr::from_ptr(ptr) }.to_str().unwrap_or("invalid utf-8")
}

/// # Safety
/// ptr must point to at least `len` valid T values, or be null with len==0.
unsafe fn slice_from_ptr<'a, T>(ptr: *const T, len: u32) -> &'a [T] {
    if ptr.is_null() || len == 0 {
        &[]
    } else {
        unsafe { slice::from_raw_parts(ptr, len as usize) }
    }
}

// ---------------------------------------------------------------------------
// Thread-local error storage
// ---------------------------------------------------------------------------

thread_local! {
    static LAST_ERROR: std::cell::RefCell<Option<String>> = std::cell::RefCell::new(None);
}

fn store_error(msg: String) {
    LAST_ERROR.with(|cell| {
        cell.replace(Some(msg));
    });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn session_manager_new() -> *mut SessionManager {
    Box::into_raw(Box::new(SessionManager::new()))
}

#[no_mangle]
pub extern "C" fn session_manager_free(ptr: *mut SessionManager) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        drop(Box::from_raw(ptr));
    }
}

// ---------------------------------------------------------------------------
// generate_pre_key_bundle
// ---------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn session_manager_generate_pre_key_bundle(
    ptr: *const SessionManager,
    signed_pre_key_id: u32,
    one_time_pre_key_start_id: u32,
    one_time_pre_key_count: u32,
) -> *mut c_char {
    let mgr = unsafe { &*ptr };
    match mgr.generate_pre_key_bundle(signed_pre_key_id, one_time_pre_key_start_id, one_time_pre_key_count) {
        Ok(json) => to_c_string(json),
        Err(e) => to_c_string(format!("__ERROR__:{}", e)),
    }
}

// ---------------------------------------------------------------------------
// create_outbound_session
// ---------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn session_manager_create_outbound_session(
    ptr: *const SessionManager,
    session_id: *const c_char,
    identity_key_pair_bincode: *const u8,
    ik_len: u32,
    remote_bundle_json: *const c_char,
    out_len: *mut u32,
) -> *mut u8 {
    let mgr = unsafe { &*ptr };
    let sid = unsafe { cstr_to_str(session_id) };
    let ik = unsafe { slice_from_ptr(identity_key_pair_bincode, ik_len) };
    let json = unsafe { cstr_to_str(remote_bundle_json) };

    let result = mgr.create_outbound_session(
        sid.to_string(),
        ik.to_vec(),
        json.to_string(),
    );

    match result {
        Ok(handshake) => {
            let len = handshake.len() as u32;
            unsafe { *out_len = len; }
            let buf = handshake.into_boxed_slice();
            Box::into_raw(buf) as *mut u8
        }
        Err(e) => {
            unsafe { *out_len = 0; }
            store_error(e.to_string());
            std::ptr::null_mut()
        }
    }
}

// ---------------------------------------------------------------------------
// create_inbound_session
// ---------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn session_manager_create_inbound_session(
    ptr: *const SessionManager,
    session_id: *const c_char,
    identity_key_pair_bincode: *const u8,
    ik_len: u32,
    signed_pre_key_pair_bincode: *const u8,
    spk_len: u32,
    one_time_pre_key_pair_bincode: *const u8,
    otk_len: u32,
    remote_identity_key_bytes: *const u8,
    rik_len: u32,
    remote_ephemeral_key_bytes: *const u8,
    rek_len: u32,
) -> i32 {
    let mgr = unsafe { &*ptr };
    let sid = unsafe { cstr_to_str(session_id) };
    let ik = unsafe { slice_from_ptr(identity_key_pair_bincode, ik_len) };
    let spk = unsafe { slice_from_ptr(signed_pre_key_pair_bincode, spk_len) };
    let otk = if otk_len > 0 {
        Some(unsafe { slice_from_ptr(one_time_pre_key_pair_bincode, otk_len) }.to_vec())
    } else {
        None
    };
    let rik = unsafe { slice_from_ptr(remote_identity_key_bytes, rik_len) };
    let rek = unsafe { slice_from_ptr(remote_ephemeral_key_bytes, rek_len) };

    match mgr.create_inbound_session(
        sid.to_string(),
        ik.to_vec(),
        spk.to_vec(),
        otk,
        rik.to_vec(),
        rek.to_vec(),
    ) {
        Ok(()) => 0,
        Err(e) => {
            store_error(e.to_string());
            -1
        }
    }
}

// ---------------------------------------------------------------------------
// encrypt
// ---------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn session_manager_encrypt(
    ptr: *const SessionManager,
    session_id: *const c_char,
    plaintext: *const u8,
    pt_len: u32,
    out_len: *mut u32,
) -> *mut u8 {
    let mgr = unsafe { &*ptr };
    let sid = unsafe { cstr_to_str(session_id) };
    let pt = unsafe { slice_from_ptr(plaintext, pt_len) };

    let result = mgr.encrypt(sid.to_string(), pt.to_vec());

    match result {
        Ok(wire) => {
            let len = wire.len() as u32;
            unsafe { *out_len = len; }
            let buf = wire.into_boxed_slice();
            Box::into_raw(buf) as *mut u8
        }
        Err(e) => {
            unsafe { *out_len = 0; }
            store_error(e.to_string());
            std::ptr::null_mut()
        }
    }
}

// ---------------------------------------------------------------------------
// decrypt
// ---------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn session_manager_decrypt(
    ptr: *const SessionManager,
    session_id: *const c_char,
    wire: *const u8,
    wire_len: u32,
    out_len: *mut u32,
) -> *mut u8 {
    let mgr = unsafe { &*ptr };
    let sid = unsafe { cstr_to_str(session_id) };
    let w = unsafe { slice_from_ptr(wire, wire_len) };

    let result = mgr.decrypt(sid.to_string(), w.to_vec());

    match result {
        Ok(plaintext) => {
            let len = plaintext.len() as u32;
            unsafe { *out_len = len; }
            let buf = plaintext.into_boxed_slice();
            Box::into_raw(buf) as *mut u8
        }
        Err(e) => {
            unsafe { *out_len = 0; }
            store_error(e.to_string());
            std::ptr::null_mut()
        }
    }
}

// ---------------------------------------------------------------------------
// export_session
// ---------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn session_manager_export_session(
    ptr: *const SessionManager,
    session_id: *const c_char,
    out_len: *mut u32,
) -> *mut u8 {
    let mgr = unsafe { &*ptr };
    let sid = unsafe { cstr_to_str(session_id) };

    let result = mgr.export_session(sid.to_string());

    match result {
        Ok(bincode) => {
            let len = bincode.len() as u32;
            unsafe { *out_len = len; }
            let buf = bincode.into_boxed_slice();
            Box::into_raw(buf) as *mut u8
        }
        Err(e) => {
            unsafe { *out_len = 0; }
            store_error(e.to_string());
            std::ptr::null_mut()
        }
    }
}

// ---------------------------------------------------------------------------
// restore_session
// ---------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn session_manager_restore_session(
    ptr: *const SessionManager,
    session_id: *const c_char,
    state_bincode: *const u8,
    state_len: u32,
) -> i32 {
    let mgr = unsafe { &*ptr };
    let sid = unsafe { cstr_to_str(session_id) };
    let state = unsafe { slice_from_ptr(state_bincode, state_len) };

    match mgr.restore_session(sid.to_string(), state.to_vec()) {
        Ok(()) => 0,
        Err(e) => {
            store_error(e.to_string());
            -1
        }
    }
}

// ---------------------------------------------------------------------------
// remove_session
// ---------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn session_manager_remove_session(
    ptr: *const SessionManager,
    session_id: *const c_char,
) {
    let mgr = unsafe { &*ptr };
    let sid = unsafe { cstr_to_str(session_id) };
    mgr.remove_session(sid.to_string());
}

// ---------------------------------------------------------------------------
// Error retrieval
// ---------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn session_manager_last_error(
    _ptr: *const SessionManager,
) -> *mut c_char {
    LAST_ERROR.with(|cell| {
        let err = cell.borrow_mut().take();
        match err {
            Some(msg) => to_c_string(msg),
            None => std::ptr::null_mut(),
        }
    })
}

// ---------------------------------------------------------------------------
// Memory management
// ---------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn free_rust_string(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        drop(CString::from_raw(ptr));
    }
}

#[no_mangle]
pub extern "C" fn free_rust_buffer(ptr: *mut u8, len: u32) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        drop(Vec::from_raw_parts(ptr, len as usize, len as usize));
    }
}
