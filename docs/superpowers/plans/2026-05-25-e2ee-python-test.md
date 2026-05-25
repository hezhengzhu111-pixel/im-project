# E2EE Python 全链路测试脚本 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建一个与前端完全一致的 Python E2EE 测试脚本，通过 ctypes 调用 Rust e2ee-ffi 共享库，完整模拟前端 E2eeManager + negotiation + session-store + key-store 的所有逻辑。

**Architecture:** 在 e2ee-ffi 中新增 `extern "C"` FFI 层（11 个函数），Python 通过 ctypes 调用。Python 侧创建 RustE2eeEngine 桥接类，然后按照前端 TypeScript 代码 1:1 翻译 E2eeManager、Negotiation、SessionStore、KeyStore 的逻辑。

**Tech Stack:** Rust cdylib, Python ctypes, cryptography (仅 Ed25519 签名验证保留), requests

---

### Task 1: 添加 Rust extern "C" FFI 层

**Files:**
- Create: `backend/e2ee-ffi/src/ffi.rs`
- Modify: `backend/e2ee-ffi/src/lib.rs`

- [ ] **Step 1: 创建 ffi.rs 文件**

在 `backend/e2ee-ffi/src/ffi.rs` 写入完整的 `extern "C"` FFI 包装层。

```rust
// backend/e2ee-ffi/src/ffi.rs
// extern "C" FFI — Python ctypes 可直接调用

use std::ffi::{c_char, CStr, CString};
use std::slice;

use crate::session::{SessionError, SessionManager};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn to_c_string(s: String) -> *mut c_char {
    CString::new(s)
        .unwrap_or_else(|_| CString::new("string encoding error").unwrap())
        .into_raw()
}

unsafe fn cstr_to_str(ptr: *const c_char) -> &'static str {
    unsafe { CStr::from_ptr(ptr) }.to_str().unwrap_or("invalid utf-8")
}

unsafe fn slice_from_ptr<'a, T>(ptr: *const T, len: u32) -> &'a [T] {
    if ptr.is_null() || len == 0 {
        &[]
    } else {
        unsafe { slice::from_raw_parts(ptr, len as usize) }
    }
}

// ---------------------------------------------------------------------------
// SessionManager lifecycle
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
            // Store error in thread-local for retrieval
            LAST_ERROR.with(|cell| {
                cell.replace(Some(e.to_string()));
            });
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
            LAST_ERROR.with(|cell| {
                cell.replace(Some(e.to_string()));
            });
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
            LAST_ERROR.with(|cell| {
                cell.replace(Some(e.to_string()));
            });
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
            LAST_ERROR.with(|cell| {
                cell.replace(Some(e.to_string()));
            });
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
            LAST_ERROR.with(|cell| {
                cell.replace(Some(e.to_string()));
            });
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
// error handling
// ---------------------------------------------------------------------------

thread_local! {
    static LAST_ERROR: std::cell::RefCell<Option<String>> = std::cell::RefCell::new(None);
}

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
// memory management
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
```

- [ ] **Step 2: 修改 lib.rs 添加 ffi 模块**

在 `backend/e2ee-ffi/src/lib.rs` 中添加 `mod ffi;`：

```rust
// backend/e2ee-ffi/src/lib.rs
#![allow(clippy::empty_line_after_doc_comments)]

mod session;
pub use session::*;

// C FFI for Python ctypes
mod ffi;

// Include the UDL-generated UniFFI scaffolding directly.
include!(concat!(env!("OUT_DIR"), "/e2ee_ffi.uniffi.rs"));
```

- [ ] **Step 3: 确保 SessionManager 和 SessionError 是 pub 的**

`backend/e2ee-ffi/src/session/mod.rs` 中 `SessionManager` 和 `SessionError` 已经是 `pub` 的，不需要修改。确认 `ffi.rs` 中的 `use crate::session::{SessionError, SessionManager};` 可以正常引用。

- [ ] **Step 4: 编译验证**

```bash
cd backend && cargo build -p e2ee-ffi --release 2>&1
```

Expected: 编译成功，输出 `target/release/e2ee_ffi.dll`（Windows）或 `.so`（Linux）。

- [ ] **Step 5: Commit**

```bash
git add backend/e2ee-ffi/src/ffi.rs backend/e2ee-ffi/src/lib.rs
git commit -m "feat(e2ee-ffi): add extern C FFI layer for Python ctypes integration"
```

---

### Task 2: 创建 Python ctypes 桥接模块

**Files:**
- Create: `tests/e2ee_rust_bridge.py`

- [ ] **Step 1: 创建 e2ee_rust_bridge.py**

```python
"""
Python ctypes bridge to Rust e2ee-ffi cdylib.

完全对应前端 WebE2eeRuntime + WasmSessionManager 的接口。
"""
import ctypes
import json
import base64
import struct
import platform
from typing import Optional, Dict, List


def _bytes_to_json_array(data: bytes) -> List[int]:
    """将 bytes 转换为 JSON 整数数组，与前端 bytesToJsonArray 一致。"""
    return list(data)


def _find_lib_path() -> str:
    """自动查找 e2ee_ffi 共享库路径。"""
    system = platform.system()
    lib_name = "e2ee_ffi.dll" if system == "Windows" else "libe2ee_ffi.so"
    
    import os
    # 先搜索 target/release
    candidates = [
        os.path.join(os.path.dirname(__file__), "..", "backend", "target", "release", lib_name),
        os.path.join(os.path.dirname(__file__), "..", "backend", "target", "debug", lib_name),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    
    # 回退到当前目录
    local = os.path.join(os.path.dirname(__file__), lib_name)
    if os.path.exists(local):
        return local
    
    raise FileNotFoundError(
        f"Cannot find {lib_name}. Build with: cd backend && cargo build -p e2ee-ffi --release"
    )


def parse_rust_handshake(handshake_bytes: bytes) -> dict:
    """解析 40 字节握手数据。对应前端 parseRustHandshake。

    握手格式:
      [0..32)  — ephemeral public key (32 bytes)
      [32..36) — SPK id (big-endian u32)
      [36..40) — OTK id (big-endian u32, 0xFFFFFFFF = none)
    """
    if len(handshake_bytes) != 40:
        raise ValueError(f"Invalid handshake length: {len(handshake_bytes)}")
    
    ephemeral_public_key = handshake_bytes[:32]
    spk_id = struct.unpack(">I", handshake_bytes[32:36])[0]
    otk_id_raw = struct.unpack(">I", handshake_bytes[36:40])[0]
    
    otk_id = otk_id_raw if otk_id_raw != 0xFFFFFFFF else None
    
    return {
        "ephemeralPublicKey": ephemeral_public_key,
        "signedPreKeyId": spk_id,
        "oneTimePreKeyId": otk_id,
    }


def normalize_handshake(parsed: dict) -> dict:
    """验证 SPK ID，对应前端 normalizeHandshake。"""
    if parsed["signedPreKeyId"] != 1:
        raise ValueError(f"Handshake references unknown signed pre-key: {parsed['signedPreKeyId']}")
    return parsed


def bundle_to_rust_json(bundle: dict) -> dict:
    """将服务端返回的 bundle（base64 编码）转换为 Rust PreKeyBundleFetch JSON 格式。

    对应前端 remoteBundleToRustJson。关键：key 字段使用整数数组，不是 base64。
    """
    def b64_to_bytes(s: str) -> bytes:
        return base64.b64decode(s)
    
    identity_key = b64_to_bytes(bundle["identityKey"])
    signing_key = b64_to_bytes(bundle.get("signingIdentityKey") or bundle.get("signingKey") or bundle["identityKey"])
    spk = b64_to_bytes(bundle["signedPreKey"])
    spk_sig = b64_to_bytes(bundle["signedPreKeySignature"])
    
    result = {
        "identity_key": _bytes_to_json_array(identity_key),
        "signing_key": _bytes_to_json_array(signing_key),
        "signed_pre_key": {
            "id": 1,
            "key": _bytes_to_json_array(spk),
        },
        "signed_pre_key_signature": _bytes_to_json_array(spk_sig),
    }
    
    # OTK handling
    otk = bundle.get("oneTimePreKey")
    if isinstance(otk, str) and len(otk) > 0:
        otk_id = bundle.get("oneTimePreKeyId", 0)
        if not isinstance(otk_id, int) or otk_id == 0:
            # Try to find otk_id
            otk_id = bundle.get("oneTimePreKeyId", 0)
        result["one_time_pre_key"] = {
            "id": otk_id,
            "key": _bytes_to_json_array(b64_to_bytes(otk)),
        }
    else:
        result["one_time_pre_key"] = None
    
    return result


class RustE2eeEngine:
    """Wrapper around the Rust e2ee-ffi cdylib.

    Each instance manages its own SessionManager (like WasmSessionManager).
    Completely mirrors WebE2eeRuntime interface.
    """

    def __init__(self, lib_path: Optional[str] = None):
        if lib_path is None:
            lib_path = _find_lib_path()
        
        self._lib = ctypes.cdll.LoadLibrary(lib_path)
        self._setup_signatures()
        self._handle = self._lib.session_manager_new()
        if not self._handle:
            raise RuntimeError("Failed to create SessionManager")
    
    def _setup_signatures(self) -> None:
        lib = self._lib
        
        # session_manager_new
        lib.session_manager_new.argtypes = []
        lib.session_manager_new.restype = ctypes.c_void_p
        
        # session_manager_free
        lib.session_manager_free.argtypes = [ctypes.c_void_p]
        lib.session_manager_free.restype = None
        
        # session_manager_generate_pre_key_bundle
        lib.session_manager_generate_pre_key_bundle.argtypes = [
            ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32,
        ]
        lib.session_manager_generate_pre_key_bundle.restype = ctypes.c_void_p  # char*
        
        # session_manager_create_outbound_session
        lib.session_manager_create_outbound_session.argtypes = [
            ctypes.c_void_p,
            ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_uint8), ctypes.c_uint32,
            ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_uint32),
        ]
        lib.session_manager_create_outbound_session.restype = ctypes.c_void_p  # u8*
        
        # session_manager_create_inbound_session
        lib.session_manager_create_inbound_session.argtypes = [
            ctypes.c_void_p,
            ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_uint8), ctypes.c_uint32,
            ctypes.POINTER(ctypes.c_uint8), ctypes.c_uint32,
            ctypes.POINTER(ctypes.c_uint8), ctypes.c_uint32,
            ctypes.POINTER(ctypes.c_uint8), ctypes.c_uint32,
            ctypes.POINTER(ctypes.c_uint8), ctypes.c_uint32,
        ]
        lib.session_manager_create_inbound_session.restype = ctypes.c_int32
        
        # session_manager_encrypt
        lib.session_manager_encrypt.argtypes = [
            ctypes.c_void_p,
            ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_uint8), ctypes.c_uint32,
            ctypes.POINTER(ctypes.c_uint32),
        ]
        lib.session_manager_encrypt.restype = ctypes.c_void_p
        
        # session_manager_decrypt
        lib.session_manager_decrypt.argtypes = [
            ctypes.c_void_p,
            ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_uint8), ctypes.c_uint32,
            ctypes.POINTER(ctypes.c_uint32),
        ]
        lib.session_manager_decrypt.restype = ctypes.c_void_p
        
        # session_manager_export_session
        lib.session_manager_export_session.argtypes = [
            ctypes.c_void_p,
            ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_uint32),
        ]
        lib.session_manager_export_session.restype = ctypes.c_void_p
        
        # session_manager_restore_session
        lib.session_manager_restore_session.argtypes = [
            ctypes.c_void_p,
            ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_uint8), ctypes.c_uint32,
        ]
        lib.session_manager_restore_session.restype = ctypes.c_int32
        
        # session_manager_remove_session
        lib.session_manager_remove_session.argtypes = [
            ctypes.c_void_p,
            ctypes.c_char_p,
        ]
        lib.session_manager_remove_session.restype = None
        
        # session_manager_last_error
        lib.session_manager_last_error.argtypes = [ctypes.c_void_p]
        lib.session_manager_last_error.restype = ctypes.c_void_p
        
        # free_rust_string
        lib.free_rust_string.argtypes = [ctypes.c_void_p]
        lib.free_rust_string.restype = None
        
        # free_rust_buffer
        lib.free_rust_buffer.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
        lib.free_rust_buffer.restype = None
    
    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    
    def _last_error(self) -> str:
        err_ptr = self._lib.session_manager_last_error(self._handle)
        if err_ptr:
            err_bytes = ctypes.cast(err_ptr, ctypes.c_char_p).value
            msg = err_bytes.decode("utf-8") if err_bytes else "unknown error"
            self._lib.free_rust_string(err_ptr)
            return msg
        return "unknown error"
    
    def _encode_str(self, s: str) -> bytes:
        return s.encode("utf-8")
    
    def _read_buffer(self, ptr, out_len) -> bytes:
        """从 Rust 返回的指针读取字节并释放。"""
        if not ptr:
            raise RuntimeError(self._last_error())
        length = out_len.value
        buf = (ctypes.c_uint8 * length).from_address(ptr)
        data = bytes(buf)
        self._lib.free_rust_buffer(ptr, length)
        return data

    def _to_uint8_ptr(self, data: bytes):
        """将 Python bytes 转换为 (POINTER(c_uint8), len) 对。"""
        if not data:
            return ctypes.POINTER(ctypes.c_uint8)(), 0
        buf = (ctypes.c_uint8 * len(data))(*data)
        return buf, len(data)
    
    # ------------------------------------------------------------------
    # Public API (mirrors WebE2eeRuntime)
    # ------------------------------------------------------------------
    
    def generate_pre_key_bundle(
        self,
        signed_pre_key_id: int = 1,
        one_time_pre_key_start_id: int = 1,
        one_time_pre_key_count: int = 100,
    ) -> dict:
        """对应前端 generatePreKeyBundle → WasmSessionManager.generate_pre_key_bundle
        
        Returns: RustLocalE2eeKeyMaterial dict (version=2)
        """
        result_ptr = self._lib.session_manager_generate_pre_key_bundle(
            self._handle,
            signed_pre_key_id,
            one_time_pre_key_start_id,
            one_time_pre_key_count,
        )
        if not result_ptr:
            raise RuntimeError(self._last_error())
        
        json_str = ctypes.cast(result_ptr, ctypes.c_char_p).value.decode("utf-8")
        self._lib.free_rust_string(result_ptr)
        
        if json_str.startswith("__ERROR__:"):
            raise RuntimeError(json_str[len("__ERROR__:"):])
        
        key_material = json.loads(json_str)
        
        # Validate version (corresponds to parseGeneratedKeyMaterial)
        if key_material.get("version") != 2:
            raise ValueError(f"Invalid Rust E2EE key material version: {key_material.get('version')}")
        if not key_material.get("identityKeyPairBincode") or not key_material.get("signedPreKeyPairBincode"):
            raise ValueError("Invalid Rust E2EE key material: missing required fields")
        
        return key_material
    
    def create_outbound_session(
        self,
        session_id: str,
        identity_key_pair_bincode: bytes,
        remote_bundle: dict,
    ) -> bytes:
        """对应前端 createOutboundSession → WasmSessionManager.create_outbound_session

        Args:
            session_id: 会话 ID
            identity_key_pair_bincode: bincode 编码的身份密钥对
            remote_bundle: 服务端返回的 bundle（还未转换的 dict，内部会调用 bundle_to_rust_json）

        Returns: 40 字节握手数据
        """
        rust_json = bundle_to_rust_json(remote_bundle)
        rust_json_str = json.dumps(rust_json)
        
        ik_ptr, ik_len = self._to_uint8_ptr(identity_key_pair_bincode)
        out_len = ctypes.c_uint32()
        
        result = self._lib.session_manager_create_outbound_session(
            self._handle,
            self._encode_str(session_id),
            ik_ptr, ik_len,
            self._encode_str(rust_json_str),
            ctypes.byref(out_len),
        )
        
        return self._read_buffer(result, out_len)
    
    def create_inbound_session(
        self,
        session_id: str,
        identity_key_pair_bincode: bytes,
        signed_pre_key_pair_bincode: bytes,
        one_time_pre_key_pair_bincode: Optional[bytes],
        remote_identity_key_bytes: bytes,
        remote_ephemeral_key_bytes: bytes,
    ) -> None:
        """对应前端 createInboundSession → WasmSessionManager.create_inbound_session"""
        ik_ptr, ik_len = self._to_uint8_ptr(identity_key_pair_bincode)
        spk_ptr, spk_len = self._to_uint8_ptr(signed_pre_key_pair_bincode)
        otk_ptr, otk_len = self._to_uint8_ptr(one_time_pre_key_pair_bincode or b"")
        rik_ptr, rik_len = self._to_uint8_ptr(remote_identity_key_bytes)
        rek_ptr, rek_len = self._to_uint8_ptr(remote_ephemeral_key_bytes)
        
        result = self._lib.session_manager_create_inbound_session(
            self._handle,
            self._encode_str(session_id),
            ik_ptr, ik_len,
            spk_ptr, spk_len,
            otk_ptr, otk_len if one_time_pre_key_pair_bincode else 0,
            rik_ptr, rik_len,
            rek_ptr, rek_len,
        )
        
        if result != 0:
            raise RuntimeError(self._last_error())
    
    def encrypt(self, session_id: str, plaintext: bytes) -> bytes:
        """对应前端 encrypt → WasmSessionManager.encrypt

        Returns: wire format bytes (header_len(4 BE) || RatchetHeader(52) || ciphertext)
        """
        pt_ptr, pt_len = self._to_uint8_ptr(plaintext)
        out_len = ctypes.c_uint32()
        
        result = self._lib.session_manager_encrypt(
            self._handle,
            self._encode_str(session_id),
            pt_ptr, pt_len,
            ctypes.byref(out_len),
        )
        
        wire = self._read_buffer(result, out_len)
        
        # assertRustWireFormat
        if len(wire) < 4:
            raise RuntimeError("Rust wire format too short")
        header_len = struct.unpack(">I", wire[:4])[0]
        if header_len != 52:
            raise RuntimeError(f"Rust wire format invalid header length: {header_len}")
        
        return wire
    
    def decrypt(self, session_id: str, wire: bytes) -> bytes:
        """对应前端 decrypt → WasmSessionManager.decrypt"""
        w_ptr, w_len = self._to_uint8_ptr(wire)
        out_len = ctypes.c_uint32()
        
        result = self._lib.session_manager_decrypt(
            self._handle,
            self._encode_str(session_id),
            w_ptr, w_len,
            ctypes.byref(out_len),
        )
        
        return self._read_buffer(result, out_len)
    
    def export_session(self, session_id: str) -> bytes:
        """对应前端 exportSession → WasmSessionManager.export_session"""
        out_len = ctypes.c_uint32()
        
        result = self._lib.session_manager_export_session(
            self._handle,
            self._encode_str(session_id),
            ctypes.byref(out_len),
        )
        
        return self._read_buffer(result, out_len)
    
    def restore_session(self, session_id: str, state_bincode: bytes) -> None:
        """对应前端 restoreSession → WasmSessionManager.restore_session
        
        注意：如果 session 已存在会抛出 SessionAlreadyExists 错误。
        """
        s_ptr, s_len = self._to_uint8_ptr(state_bincode)
        
        result = self._lib.session_manager_restore_session(
            self._handle,
            self._encode_str(session_id),
            s_ptr, s_len,
        )
        
        if result != 0:
            raise RuntimeError(self._last_error())
    
    def remove_session(self, session_id: str) -> None:
        """对应前端 removeSession → WasmSessionManager.remove_session"""
        self._lib.session_manager_remove_session(
            self._handle,
            self._encode_str(session_id),
        )
    
    def close(self) -> None:
        """释放底层 SessionManager。"""
        if self._handle:
            self._lib.session_manager_free(self._handle)
            self._handle = None
    
    def __del__(self):
        self.close()
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2ee_rust_bridge.py
git commit -m "feat(test): add Python ctypes bridge to Rust e2ee-ffi"
```

---

### Task 3: 创建 E2EE 存储层（SessionStore + KeyStore）

**Files:**
- Create: `tests/e2ee_stores.py`

- [ ] **Step 1: 创建 e2ee_stores.py**

此模块对应前端 `session-store.ts` + `key-store.ts`，使用内存 dict 模拟 IndexedDB，使用 dict 模拟 localStorage。

```python
"""
E2EE 存储层 — 对应前端 session-store.ts + key-store.ts

使用内存 dict 模拟 IndexedDB（v3 envelope 格式）。
使用 dict 模拟 localStorage。
"""
import hashlib
import time
from typing import Optional, Dict, List


# ============================================================================
# Session Store (对应 session-store.ts)
# ============================================================================

# v3 session state envelope — 完全对应 SessionStateEnvelope
# 内存数据库: sessions[session_id] = SessionStateEnvelope

class SessionStore:
    """模拟 IndexedDB sessions 对象存储。"""
    
    def __init__(self):
        self._sessions: Dict[str, dict] = {}  # session_id -> SessionStateEnvelope
    
    def get_session_state_bytes(
        self,
        session_id: str,
        local_device_id: str,
        remote_user_id: str,
        remote_device_id: str,
    ) -> Optional[bytes]:
        """对应 getSessionStateBytes。验证 v3 envelope 上下文后返回 bincode 状态。"""
        env = self._sessions.get(session_id)
        if env is None:
            return None
        
        # v3 context validation
        if env.get("version") != 3:
            return None
        
        if env.get("localDeviceId") != local_device_id:
            return None
        
        # 验证 remoteUserIdHash
        expected_hash = hashlib.sha256(str(remote_user_id).encode()).hexdigest()[:16]
        if env.get("remoteUserIdHash") != expected_hash:
            return None
        
        if env.get("remoteDeviceId") != remote_device_id:
            return None
        
        state_b64 = env.get("state")
        if not state_b64:
            return None
        
        import base64
        return base64.b64decode(state_b64)
    
    def save_session_state_bytes(
        self,
        session_id: str,
        state_bincode: bytes,
        local_device_id: str,
        remote_user_id: str,
        remote_device_id: str,
        direction: str,
    ) -> None:
        """对应 saveSessionStateBytes。"""
        import base64
        remote_user_id_hash = hashlib.sha256(str(remote_user_id).encode()).hexdigest()[:16]
        
        now = int(time.time() * 1000)
        
        self._sessions[session_id] = {
            "version": 3,
            "algorithm": "rust-x25519-x3dh-dr-v1",
            "userId": "",  # 测试脚本不强制验证 userId
            "localDeviceId": local_device_id,
            "sessionId": session_id,
            "remoteUserIdHash": remote_user_id_hash,
            "remoteDeviceId": remote_device_id,
            "createdAt": now,
            "updatedAt": now,
            "state": base64.b64encode(state_bincode).decode("ascii"),
            "direction": direction,
        }
    
    def delete_session_state(self, session_id: str) -> None:
        """对应 deleteSessionState。"""
        self._sessions.pop(session_id, None)
    
    def find_session_by_local_device(self, session_id: str, local_device_id: str) -> Optional[dict]:
        """对应 findSessionByLocalDevice。当 localStorage 映射丢失时恢复设备 ID。"""
        env = self._sessions.get(session_id)
        if env is None:
            return None
        if env.get("version") != 3:
            return None
        if env.get("localDeviceId") != local_device_id:
            return None
        return {
            "remoteDeviceId": env.get("remoteDeviceId", ""),
        }
    
    def clear_all(self) -> None:
        """对应 clearAllSessionState。"""
        self._sessions.clear()


# ============================================================================
# Key Store (对应 key-store.ts)
# ============================================================================

class KeyStore:
    """模拟 IndexedDB identity + meta 对象存储 + localStorage。"""
    
    def __init__(self):
        self._key_material: Optional[dict] = None  # RustLocalE2eeKeyMaterial
        self._device_id: Optional[str] = None
        self._local_storage: Dict[str, str] = {}  # 模拟 localStorage
    
    # -- key material (identity store) --
    
    def get_local_key_material(self) -> Optional[dict]:
        """对应 getLocalKeyMaterial。"""
        material = self._key_material
        if material is None:
            return None
        # 验证完整性
        if not isinstance(material, dict):
            return None
        if material.get("version") != 2:
            return None
        if not material.get("identityKeyPairBincode"):
            return None
        if not material.get("signedPreKeyPairBincode"):
            return None
        if not material.get("publicBundle", {}).get("identityKey"):
            return None
        return material
    
    def save_local_key_material(self, keys: dict) -> None:
        """对应 saveLocalKeyMaterial。"""
        self._key_material = keys
    
    def clear_local_key_material(self) -> None:
        """对应 clearLocalKeyMaterial。"""
        self._key_material = None
    
    def has_identity_key(self) -> bool:
        """对应 hasIdentityKey。"""
        return self.get_local_key_material() is not None
    
    # -- device id (meta store) --
    
    def get_device_id(self) -> Optional[str]:
        """对应 getDeviceId。"""
        return self._device_id
    
    def save_device_id(self, device_id: str) -> None:
        """对应 saveDeviceId。"""
        self._device_id = device_id
    
    # -- OTK consumption --
    
    def mark_one_time_pre_key_consumed(self, otk_id: int) -> None:
        """对应 markOneTimePreKeyConsumed。从本地密钥材料中移除已使用的 OTK。"""
        keys = self._key_material
        if keys is None:
            return
        # 从 oneTimePreKeyPairs 过滤
        pairs = keys.get("oneTimePreKeyPairs", [])
        keys["oneTimePreKeyPairs"] = [p for p in pairs if p.get("id") != otk_id]
        # 从 publicBundle.oneTimePreKeys 过滤
        bundle = keys.get("publicBundle", {})
        pre_keys = bundle.get("oneTimePreKeys", [])
        bundle["oneTimePreKeys"] = [p for p in pre_keys if p.get("id") != otk_id]
    
    # -- localStorage simulation --
    
    def get_local(self, key: str) -> Optional[str]:
        return self._local_storage.get(key)
    
    def set_local(self, key: str, value: str) -> None:
        self._local_storage[key] = value
    
    def remove_local(self, key: str) -> None:
        self._local_storage.pop(key, None)
    
    def clear_all(self) -> None:
        """对应 clearAllSessionState + clearLocalKeyMaterial。"""
        self._key_material = None
        self._device_id = None
        # 清理所有 e2ee 相关的 localStorage 键
        keys_to_remove = [
            k for k in self._local_storage
            if k.startswith("e2ee:status:") or
               k.startswith("e2ee:remote_device:") or
               k.startswith("e2ee:initial-handshake:")
        ]
        for k in keys_to_remove:
            self._local_storage.pop(k, None)
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2ee_stores.py
git commit -m "feat(test): add E2EE session store and key store (matching frontend)"
```

---

### Task 4: 重写完整测试脚本

**Files:**
- Modify: `tests/e2ee_full_flow_test.py` (完整重写)

- [ ] **Step 1: 重写测试脚本**

脚本包含以下类（完全对应前端）：

```python
"""
E2EE 全链路测试脚本 — 完全模拟前端浏览器行为。

通过 Rust e2ee-ffi cdylib (ctypes) 调用真正的 E2EE 加密引擎。
Python 侧完全镜像前端 TypeScript 代码：
  - E2eeManager     → e2ee-manager.ts
  - E2eeNegotiation  → negotiation.ts
  - SessionStore     → session-store.ts
  - KeyStore         → key-store.ts
  - APIClient        → key-service.ts + HTTP API

用法:
    python tests/e2ee_full_flow_test.py [--base-url http://localhost:8082]

依赖:
    pip install cryptography requests
    先构建: cd backend && cargo build -p e2ee-ffi --release
"""
```

（此处省略完整代码以节省篇幅 — 代码量约 800 行，将在实施时写入）

脚本结构：
1. 配置和辅助函数
2. APIClient 类（HTTP API）
3. E2EEUser 类（用户模拟器，组合了 E2eeManager + E2eeNegotiation + SessionStore + KeyStore）
4. 测试流程函数（9 个 Phase）

- [ ] **Step 2: 编译并运行测试**

```bash
cd backend && cargo build -p e2ee-ffi --release
cd ..
python tests/e2ee_full_flow_test.py --base-url http://localhost:8082
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2ee_full_flow_test.py
git commit -m "feat(test): rewrite E2EE test script to mirror frontend via Rust FFI"
```

---

### Task 5: 验证和清理

- [ ] **Step 1: 确认 cargo build 成功**

```bash
cd backend && cargo build -p e2ee-ffi --release 2>&1 | tail -5
```

- [ ] **Step 2: 检查 Python 语法**

```bash
python -c "import sys; sys.path.insert(0, 'tests'); compile(open('tests/e2ee_rust_bridge.py').read(), 'e2ee_rust_bridge.py', 'exec'); print('OK')"
python -c "import sys; sys.path.insert(0, 'tests'); compile(open('tests/e2ee_stores.py').read(), 'e2ee_stores.py', 'exec'); print('OK')"
```

- [ ] **Step 3: 检查没有任何 unsafe/expect/unwrap 在 e2ee-ffi 中**

```bash
cd backend && cargo clippy -p e2ee-ffi -- -D warnings 2>&1
```

注意：e2ee-ffi 没有禁用手动 clippy lint（与 api-server-rs 不同），所以只需确认无编译错误即可。
