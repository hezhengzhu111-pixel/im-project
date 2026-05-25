"""
E2EE 存储层 — 对应前端 session-store.ts + key-store.ts

使用内存 dict 模拟 IndexedDB（v3 envelope 格式）。
使用 dict 模拟 localStorage。
"""
import hashlib
import time
import base64
from typing import Optional, Dict


class SessionStore:
    """模拟 IndexedDB sessions 对象存储（v3 envelope 格式）。
    对应前端 session-store.ts。
    """

    def __init__(self):
        self._sessions: Dict[str, dict] = {}

    def get_session_state_bytes(
        self,
        session_id: str,
        local_device_id: str,
        remote_user_id: str,
        remote_device_id: str,
    ) -> Optional[bytes]:
        """对应 getSessionStateBytes。验证 v3 envelope 上下文。"""
        env = self._sessions.get(session_id)
        if env is None:
            return None

        if env.get("version") != 3:
            return None
        if env.get("localDeviceId") != local_device_id:
            return None

        expected_hash = hashlib.sha256(str(remote_user_id).encode()).hexdigest()[:16]
        if env.get("remoteUserIdHash") != expected_hash:
            return None
        if env.get("remoteDeviceId") != remote_device_id:
            return None

        state_b64 = env.get("state")
        if not state_b64:
            return None

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
        remote_user_id_hash = hashlib.sha256(str(remote_user_id).encode()).hexdigest()[:16]
        now = int(time.time() * 1000)

        self._sessions[session_id] = {
            "version": 3,
            "algorithm": "rust-x25519-x3dh-dr-v1",
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

    def find_session_by_local_device(
        self, session_id: str, local_device_id: str
    ) -> Optional[dict]:
        """对应 findSessionByLocalDevice。"""
        env = self._sessions.get(session_id)
        if env is None:
            return None
        if env.get("version") != 3:
            return None
        if env.get("localDeviceId") != local_device_id:
            return None
        return {"remoteDeviceId": env.get("remoteDeviceId", "")}

    def clear_all(self) -> None:
        """对应 clearAllSessionState。"""
        self._sessions.clear()


class KeyStore:
    """模拟 IndexedDB identity + meta 对象存储 + localStorage。
    对应前端 key-store.ts。
    """

    def __init__(self):
        self._key_material: Optional[dict] = None
        self._device_id: Optional[str] = None
        self._local_storage: Dict[str, str] = {}

    # -- key material (identity store) --

    def get_local_key_material(self) -> Optional[dict]:
        """对应 getLocalKeyMaterial。"""
        material = self._key_material
        if material is None:
            return None
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
        pairs = keys.get("oneTimePreKeyPairs", [])
        keys["oneTimePreKeyPairs"] = [p for p in pairs if p.get("id") != otk_id]
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
        keys_to_remove = [
            k for k in self._local_storage
            if k.startswith("e2ee:status:") or
               k.startswith("e2ee:remote_device:") or
               k.startswith("e2ee:initial-handshake:")
        ]
        for k in keys_to_remove:
            self._local_storage.pop(k, None)
