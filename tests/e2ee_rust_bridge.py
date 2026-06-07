"""
Python ctypes bridge to Rust im-e2ee-ffi cdylib.

完全对应前端 WebE2eeRuntime + WasmSessionManager 的接口。
"""
import ctypes
import json
import base64
import struct
import platform
import os
from typing import Optional, List


def _bytes_to_json_array(data: bytes) -> List[int]:
    """将 bytes 转换为 JSON 整数数组，与前端 bytesToJsonArray 一致。"""
    return list(data)


def _find_lib_path() -> str:
    """自动查找 e2ee_ffi 共享库路径。"""
    system = platform.system()
    lib_name = "e2ee_ffi.dll" if system == "Windows" else "libe2ee_ffi.so"

    candidates = [
        os.path.join(os.path.dirname(__file__), "..", "rust", "target", "release", lib_name),
        os.path.join(os.path.dirname(__file__), "..", "rust", "target", "debug", lib_name),
    ]
    for path in candidates:
        if os.path.exists(os.path.normpath(path)):
            return path

    local = os.path.join(os.path.dirname(__file__), lib_name)
    if os.path.exists(local):
        return local

    raise FileNotFoundError(
        f"Cannot find {lib_name}. Build with: cd rust && cargo build -p im-e2ee-ffi --release"
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
    def b64(s: str) -> bytes:
        return base64.b64decode(s)

    identity_key = b64(bundle["identityKey"])
    signing_key = b64(bundle.get("signingIdentityKey") or bundle.get("signingKey") or bundle["identityKey"])
    spk = b64(bundle["signedPreKey"])
    spk_sig = b64(bundle["signedPreKeySignature"])

    result = {
        "identity_key": _bytes_to_json_array(identity_key),
        "signing_key": _bytes_to_json_array(signing_key),
        "signed_pre_key": {
            "id": 1,
            "key": _bytes_to_json_array(spk),
        },
        "signed_pre_key_signature": _bytes_to_json_array(spk_sig),
    }

    otk = bundle.get("oneTimePreKey")
    if isinstance(otk, str) and len(otk) > 0:
        otk_id = bundle.get("oneTimePreKeyId", 0)
        result["one_time_pre_key"] = {
            "id": otk_id,
            "key": _bytes_to_json_array(b64(otk)),
        }
    else:
        result["one_time_pre_key"] = None

    return result


class RustE2eeEngine:
    """Wrapper around the Rust im-e2ee-ffi cdylib.

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
        lib.session_manager_generate_pre_key_bundle.restype = ctypes.c_void_p

        # session_manager_create_outbound_session
        lib.session_manager_create_outbound_session.argtypes = [
            ctypes.c_void_p,
            ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_uint8), ctypes.c_uint32,
            ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_uint32),
        ]
        lib.session_manager_create_outbound_session.restype = ctypes.c_void_p

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

    def _last_error(self) -> str:
        err_ptr = self._lib.session_manager_last_error(self._handle)
        if err_ptr:
            err_bytes = ctypes.cast(err_ptr, ctypes.c_char_p).value
            msg = err_bytes.decode("utf-8") if err_bytes else "unknown error"
            self._lib.free_rust_string(err_ptr)
            return msg
        return "unknown error"

    def _read_buffer(self, ptr, out_len) -> bytes:
        if not ptr:
            raise RuntimeError(self._last_error())
        length = out_len.value
        buf = (ctypes.c_uint8 * length).from_address(ptr)
        data = bytes(buf)
        self._lib.free_rust_buffer(ptr, length)
        return data

    @staticmethod
    def _to_uint8_ptr(data: bytes):
        if not data:
            return ctypes.POINTER(ctypes.c_uint8)(), 0
        buf = (ctypes.c_uint8 * len(data))(*data)
        return buf, len(data)

    def _enc(self, s: str) -> bytes:
        return s.encode("utf-8")

    # ------------------------------------------------------------------
    # Public API (mirrors WebE2eeRuntime)
    # ------------------------------------------------------------------

    def generate_pre_key_bundle(
        self,
        signed_pre_key_id: int = 1,
        one_time_pre_key_start_id: int = 1,
        one_time_pre_key_count: int = 100,
    ) -> dict:
        """对应前端 generatePreKeyBundle。返回 RustLocalE2eeKeyMaterial dict。"""
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

        if key_material.get("version") != 2:
            raise ValueError(f"Invalid key material version: {key_material.get('version')}")
        if not key_material.get("identityKeyPairBincode") or not key_material.get("signedPreKeyPairBincode"):
            raise ValueError("Invalid key material: missing required fields")

        return key_material

    def create_outbound_session(
        self,
        session_id: str,
        identity_key_pair_bincode: bytes,
        remote_bundle: dict,
    ) -> bytes:
        """对应前端 createOutboundSession。返回 40 字节握手数据。"""
        rust_json = bundle_to_rust_json(remote_bundle)
        rust_json_str = json.dumps(rust_json)

        ik_ptr, ik_len = self._to_uint8_ptr(identity_key_pair_bincode)
        out_len = ctypes.c_uint32()

        result = self._lib.session_manager_create_outbound_session(
            self._handle,
            self._enc(session_id),
            ik_ptr, ik_len,
            self._enc(rust_json_str),
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
        """对应前端 createInboundSession。"""
        ik_ptr, ik_len = self._to_uint8_ptr(identity_key_pair_bincode)
        spk_ptr, spk_len = self._to_uint8_ptr(signed_pre_key_pair_bincode)
        otk_ptr, otk_len = self._to_uint8_ptr(one_time_pre_key_pair_bincode or b"")
        rik_ptr, rik_len = self._to_uint8_ptr(remote_identity_key_bytes)
        rek_ptr, rek_len = self._to_uint8_ptr(remote_ephemeral_key_bytes)

        result = self._lib.session_manager_create_inbound_session(
            self._handle,
            self._enc(session_id),
            ik_ptr, ik_len,
            spk_ptr, spk_len,
            otk_ptr, otk_len if one_time_pre_key_pair_bincode else 0,
            rik_ptr, rik_len,
            rek_ptr, rek_len,
        )

        if result != 0:
            raise RuntimeError(self._last_error())

    def encrypt(self, session_id: str, plaintext: bytes) -> bytes:
        """对应前端 encrypt。返回 wire format bytes。"""
        pt_ptr, pt_len = self._to_uint8_ptr(plaintext)
        out_len = ctypes.c_uint32()

        result = self._lib.session_manager_encrypt(
            self._handle,
            self._enc(session_id),
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
        """对应前端 decrypt。"""
        w_ptr, w_len = self._to_uint8_ptr(wire)
        out_len = ctypes.c_uint32()

        result = self._lib.session_manager_decrypt(
            self._handle,
            self._enc(session_id),
            w_ptr, w_len,
            ctypes.byref(out_len),
        )

        return self._read_buffer(result, out_len)

    def export_session(self, session_id: str) -> bytes:
        """对应前端 exportSession。返回 bincode 编码的会话状态。"""
        out_len = ctypes.c_uint32()

        result = self._lib.session_manager_export_session(
            self._handle,
            self._enc(session_id),
            ctypes.byref(out_len),
        )

        return self._read_buffer(result, out_len)

    def restore_session(self, session_id: str, state_bincode: bytes) -> None:
        """对应前端 restoreSession。如果 session 已存在会抛出异常。"""
        s_ptr, s_len = self._to_uint8_ptr(state_bincode)

        result = self._lib.session_manager_restore_session(
            self._handle,
            self._enc(session_id),
            s_ptr, s_len,
        )

        if result != 0:
            msg = self._last_error()
            raise RuntimeError(msg)

    def remove_session(self, session_id: str) -> None:
        """对应前端 removeSession。"""
        self._lib.session_manager_remove_session(
            self._handle,
            self._enc(session_id),
        )

    def close(self) -> None:
        """释放底层 SessionManager。"""
        if self._handle:
            self._lib.session_manager_free(self._handle)
            self._handle = None

    def __del__(self):
        self.close()
