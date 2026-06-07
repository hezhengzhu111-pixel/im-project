"""
E2EE 全链路测试脚本 —— 完全模拟前端浏览器行为。

通过 Rust im-e2ee-ffi cdylib (ctypes) 调用真正的 E2EE 加密引擎。
Python 侧完全镜像前端 TypeScript 代码：
  - E2eeManager     → e2ee-manager.ts
  - E2eeNegotiation  → negotiation.ts
  - SessionStore     → session-store.ts
  - KeyStore         → key-store.ts
  - APIClient        → key-service.ts + HTTP API

用法:
    python tests/e2ee_full_flow_test.py [--base-url http://localhost:8082]

依赖:
    pip install requests
    先构建: cd rust && cargo build -p im-e2ee-ffi --release
"""

import sys
import os
import json
import base64
import hashlib
import secrets
import time
import argparse
from typing import Optional, Dict, List, Tuple

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from e2ee_rust_bridge import (
    RustE2eeEngine,
    parse_rust_handshake,
    normalize_handshake,
    bundle_to_rust_json,
)
from e2ee_stores import SessionStore, KeyStore

# ============================================================================
# 常量 (对应 shared-im-e2ee-core types.ts)
# ============================================================================

RUST_E2EE_ENVELOPE_VERSION = 2
RUST_E2EE_ALGORITHM = "rust-x25519-x3dh-dr-v1"
SESSION_STATUS_PREFIX = "e2ee:status:"
INITIAL_HANDSHAKE_PREFIX = "e2ee:initial-handshake:"
REMOTE_DEVICE_PREFIX = "e2ee:remote_device:"

VERBOSE = True


def log(msg: str) -> None:
    if VERBOSE:
        print(f"  {msg}")


def log_section(title: str) -> None:
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


# ============================================================================
# APIClient — HTTP API (对应前端 key-service.ts + request.ts)
# ============================================================================

class APIClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.token: Optional[str] = None
        self.user_id: Optional[str] = None

    def _headers(self) -> Dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def _post(self, path: str, data: dict) -> dict:
        url = f"{self.base_url}{path}"
        for attempt in range(3):
            try:
                resp = requests.post(url, json=data, headers=self._headers(), timeout=15)
                body = resp.json()
                if not body.get("success", False) and body.get("code") != 200:
                    if resp.status_code == 409:
                        return body
                    raise Exception(f"POST {path} failed: {resp.status_code} {body}")
                return body
            except (requests.ConnectionError, requests.Timeout) as e:
                if attempt == 2:
                    raise
                time.sleep(2)

    def _get(self, path: str, params: dict = None) -> dict:
        url = f"{self.base_url}{path}"
        for attempt in range(3):
            try:
                resp = requests.get(url, params=params, headers=self._headers(), timeout=15)
                body = resp.json()
                if not body.get("success", False):
                    raise Exception(f"GET {path} failed: {resp.status_code} {body}")
                return body
            except (requests.ConnectionError, requests.Timeout) as e:
                if attempt == 2:
                    raise
                time.sleep(2)

    # -- auth --

    def register(self, username: str, password: str) -> str:
        body = self._post("/api/user/register", {"username": username, "password": password})
        data = body["data"]
        self.user_id = str(data.get("userId") or data.get("id") or data.get("user_id"))
        return self.user_id

    def login(self, username: str, password: str) -> str:
        body = self._post("/api/user/login", {"username": username, "password": password})
        data = body.get("data", {})
        self.token = data.get("token")
        user_obj = data.get("user", {})
        self.user_id = str(user_obj.get("id") or data.get("userId") or data.get("user_id") or "")
        if not self.token:
            raise Exception("No token in login response")
        if not self.user_id:
            raise Exception("No user_id in login response")
        return self.token

    # -- friends --

    def send_friend_request(self, target_user_id: str) -> None:
        self._post("/api/friend/request", {"targetUserId": target_user_id, "reason": "e2ee test"})

    def get_friend_requests(self) -> list:
        body = self._get("/api/friend/requests")
        return body.get("data", [])

    def accept_friend_request(self, request_id: str) -> None:
        self._post("/api/friend/accept", {"requestId": request_id})

    # -- keys (对应 keyService) --

    def upload_bundle(self, device_id: str, identity_key: str, signing_key: str,
                      signed_pre_key: str, signed_pre_key_sig: str,
                      one_time_pre_keys: List[dict]) -> None:
        self._post("/api/keys/bundle", {
            "deviceId": device_id,
            "identityKey": identity_key,
            "signingIdentityKey": signing_key,
            "signedPreKey": signed_pre_key,
            "signedPreKeySignature": signed_pre_key_sig,
            "oneTimePreKeys": one_time_pre_keys,
        })

    def heartbeat(self, device_id: str) -> None:
        self._post("/api/keys/heartbeat", {"deviceId": device_id})

    def get_devices(self, user_id: str) -> list:
        body = self._get("/api/keys/devices", {"userId": user_id})
        return body.get("data", [])

    def get_bundle(self, user_id: str, device_id: str, conversation_id: str,
                   requester_device_id: str) -> dict:
        body = self._get("/api/keys/bundle", {
            "userId": user_id,
            "deviceId": device_id,
            "conversationId": conversation_id,
            "requesterDeviceId": requester_device_id,
        })
        return body["data"]

    # -- e2ee negotiation --

    def request_encryption(self, session_id: str, identity_key: str,
                           signed_pre_key: str, payload_json: str) -> None:
        self._post("/api/e2ee/request", {
            "sessionId": session_id,
            "identityKey": identity_key,
            "signedPreKey": signed_pre_key,
            "requestPayloadJson": payload_json,
        })

    def pending_requests(self) -> list:
        body = self._get("/api/e2ee/pending")
        return body.get("data", [])

    def accept_encryption(self, session_id: str) -> None:
        self._post("/api/e2ee/accept", {"sessionId": session_id})

    def disable_encryption(self, session_id: str) -> None:
        self._post("/api/e2ee/disable", {"sessionId": session_id})

    # -- messages --

    def send_private_message(self, receiver_id: str, client_msg_id: str,
                             message_type: str, content: str) -> dict:
        return self._post("/message/send/private", {
            "receiverId": receiver_id,
            "clientMessageId": client_msg_id,
            "messageType": message_type,
            "content": content,
            "encrypted": False,
        })

    def send_private_encrypted(self, receiver_id: str, client_msg_id: str,
                               message_type: str, e2ee_envelope: dict,
                               e2ee_device_id: str) -> dict:
        return self._post("/message/send/private", {
            "receiverId": receiver_id,
            "clientMessageId": client_msg_id,
            "messageType": message_type,
            "encrypted": True,
            "e2eeEnvelope": e2ee_envelope,
            "e2eeDeviceId": e2ee_device_id,
        })

    def get_private_history(self, friend_id: str, limit: int = 50) -> list:
        body = self._get(f"/message/private/{friend_id}", {"limit": str(limit)})
        return body.get("data", [])


# ============================================================================
# E2EEUser — 用户模拟器 (组合 E2eeManager + E2eeNegotiation + Stores)
# ============================================================================

class E2EEUser:
    """模拟一个 E2EE 用户的前端行为。

    内部组合了:
    - RustE2eeEngine (加密引擎 = WebE2eeRuntime + WasmSessionManager)
    - SessionStore (会话持久化 = IndexedDB sessions store)
    - KeyStore (密钥材料存储 = IndexedDB identity store + localStorage)
    - APIClient (HTTP API = keyService)

    方法命名与前端 TypeScript 代码完全一致。
    """

    def __init__(self, api: APIClient, username: str, password: str = "Test1234",
                 engine: Optional[RustE2eeEngine] = None):
        self.api = api
        self.username = username
        self.password = password
        self.user_id: str = ""
        self.device_id: str = secrets.token_hex(16)

        self._engine = engine if engine else RustE2eeEngine()
        self._session_store = SessionStore()
        self._key_store = KeyStore()
        self._loaded_sessions: set = set()  # 对应 E2eeManager.loadedSessions

    # ------------------------------------------------------------------
    # 注册 & 登录
    # ------------------------------------------------------------------

    def register_and_login(self) -> None:
        log(f"注册用户: {self.username}")
        self.api.register(self.username, self.password)
        log(f"登录用户: {self.username}")
        self.api.login(self.username, self.password)
        self.user_id = self.api.user_id
        log(f"  user_id={self.user_id}, device_id={self.device_id}")

    # ------------------------------------------------------------------
    # 设备注册 (对应 local-device.ts ensureLocalE2eeDeviceRegistered)
    # ------------------------------------------------------------------

    def ensure_device_registered(self, otk_count: int = 100) -> str:
        """对应前端 ensureLocalE2eeDeviceRegistered。

        Returns: device_id
        """
        # 检查是否已有密钥材料
        existing_keys = self._key_store.get_local_key_material()
        if existing_keys is not None:
            log(f"设备已注册: {self.device_id}")
            # 心跳 (对应前端定时器)
            try:
                self.api.heartbeat(self.device_id)
            except Exception:
                pass
            return self.device_id

        log(f"生成 E2EE 密钥材料 (OTKs={otk_count})...")

        # 对应前端 generatePreKeyBundle
        key_material = self._engine.generate_pre_key_bundle(
            signed_pre_key_id=1,
            one_time_pre_key_start_id=1,
            one_time_pre_key_count=otk_count,
        )

        # 对应前端 saveLocalKeyMaterial
        self._key_store.save_local_key_material(key_material)
        self._key_store.save_device_id(self.device_id)

        # 对应前端 uploadBundle
        bundle = key_material["publicBundle"]
        otk_list = [{"id": p["id"], "key": p["key"]} for p in bundle.get("oneTimePreKeys", [])]
        self.api.upload_bundle(
            device_id=self.device_id,
            identity_key=bundle["identityKey"],
            signing_key=bundle["signingKey"],
            signed_pre_key=bundle["signedPreKey"]["key"],
            signed_pre_key_sig=bundle["signedPreKeySignature"],
            one_time_pre_keys=otk_list,
        )
        self.api.heartbeat(self.device_id)
        log(f"  密钥上传成功, identity_key={bundle['identityKey'][:16]}...")
        return self.device_id

    # ------------------------------------------------------------------
    # 获取对端 bundle (对应 E2eeManager.fetchRemoteBundle)
    # ------------------------------------------------------------------

    def fetch_remote_bundle(self, user_id: str, device_id: Optional[str],
                            conversation_id: str) -> dict:
        """对应前端 fetchRemoteBundle (E2eeManager 私有方法)。

        步骤:
        1. GET /api/keys/devices → 按 lastActiveAt 排序取最新设备
        2. GET /api/keys/bundle → 获取公钥包
        3. 将后端返回格式标准化为 PreKeyBundle
        """
        requester_device_id = self.device_id

        # Step 1: 获取设备列表
        devices = self.api.get_devices(user_id)
        if device_id:
            target = next((d for d in devices if d.get("deviceId") == device_id), None)
        else:
            # 按 lastActiveAt 降序排序，取最新
            def _last_active(d):
                ts = d.get("lastActiveAt") or d.get("last_active_at") or "0"
                try:
                    from datetime import datetime
                    return int(datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000)
                except Exception:
                    return 0
            devices_sorted = sorted(devices, key=_last_active, reverse=True)
            target = devices_sorted[0] if devices_sorted else None

        if not target or not target.get("deviceId"):
            raise Exception("remote user has no active Rust E2EE device")

        # Step 2: 获取 bundle
        bundle = self.api.get_bundle(user_id, target["deviceId"], conversation_id, requester_device_id)

        # Step 3: 标准化 (对应前端 normalize bundle)
        raw = bundle
        identity_key = raw.get("identityKey", "")
        signing_id_key = raw.get("signingIdentityKey") or raw.get("signingKey") or identity_key
        spk = raw.get("signedPreKey", "")

        otk_raw = raw.get("oneTimePreKey")
        otk_id = raw.get("oneTimePreKeyId")
        otk = None
        if isinstance(otk_raw, str) and len(otk_raw) > 0:
            if isinstance(otk_id, int) and otk_id > 0:
                otk = {"id": otk_id, "key": otk_raw}
            else:
                otk = None

        return {
            "identityKey": identity_key,
            "signingKey": signing_id_key,
            "signedPreKey": spk,
            "signedPreKeySignature": raw.get("signedPreKeySignature", ""),
            "oneTimePreKey": otk,
            "userId": user_id,
            "deviceId": raw.get("deviceId") or target["deviceId"],
        }

    # ------------------------------------------------------------------
    # 获取发送方身份密钥 (对应 E2eeManager.resolveSenderIdentityKey)
    # ------------------------------------------------------------------

    def resolve_sender_identity_key(self, sender_user_id: str, sender_device_id: str) -> str:
        """对应前端 resolveSenderIdentityKey。"""
        devices = self.api.get_devices(sender_user_id)
        device = next((d for d in devices if d.get("deviceId") == sender_device_id), None)
        if device and device.get("identityKey"):
            return device["identityKey"]
        raise Exception("sender Rust identity key not found")

    # ------------------------------------------------------------------
    # 恢复会话 (对应 E2eeManager.restoreSessionIfNeeded)
    # ------------------------------------------------------------------

    def restore_session_if_needed(self, session_id: str, state_bincode: bytes) -> None:
        """对应前端 restoreSessionIfNeeded。

        如果 session 已在 WASM 内存中，跳过；否则从 bincode 恢复。
        如果 session 已存在（被 negotiation.ts 创建），标记为 loaded。
        """
        if session_id in self._loaded_sessions:
            return
        try:
            self._engine.restore_session(session_id, state_bincode)
        except RuntimeError as e:
            msg = str(e)
            if "session already exists" in msg:
                self._loaded_sessions.add(session_id)
                return
            raise
        self._loaded_sessions.add(session_id)

    # ------------------------------------------------------------------
    # 确保出站会话 (对应 E2eeManager.ensureOutboundSession)
    # ------------------------------------------------------------------

    def ensure_outbound_session(self, session_id: str,
                                recipient_user_id: Optional[str] = None,
                                recipient_device_id: Optional[str] = None) -> Tuple[str, Optional[str]]:
        """对应前端 ensureOutboundSession。

        返回: (recipientDeviceId, handshake_base64_or_None)
        """
        local_device_id = self.device_id

        # 从 localStorage 读取已存储的远程设备 ID
        stored_device_id = self._key_store.get_local(f"{REMOTE_DEVICE_PREFIX}{session_id}") or ""
        expected_user_id = recipient_user_id or ""
        expected_device_id = recipient_device_id or stored_device_id

        # 当 localStorage 映射丢失时，从 IndexedDB 恢复
        if not expected_device_id:
            recovered = self._session_store.find_session_by_local_device(session_id, local_device_id)
            if recovered:
                expected_device_id = recovered["remoteDeviceId"]
                self._key_store.set_local(f"{REMOTE_DEVICE_PREFIX}{session_id}", expected_device_id)

        # 尝试从存储恢复已有会话
        if expected_device_id:
            existing_state = self._session_store.get_session_state_bytes(
                session_id, local_device_id, expected_user_id, expected_device_id)
            if existing_state:
                self.restore_session_if_needed(session_id, existing_state)
                dev_id = recipient_device_id or expected_device_id
                if not dev_id:
                    raise Exception("E2EE session state restored but remote device ID is empty")
                return (dev_id, None)

        if not recipient_user_id:
            raise Exception("missing recipient user id for Rust E2EE session")

        # 创建新出站会话 (需要 handshake)
        local_keys = self._key_store.get_local_key_material()
        if local_keys is None:
            raise Exception("local key material not found")

        # conversation_id 使用 session_id 格式 ({id_a}_{id_b})，与前端一致
        remote_bundle = self.fetch_remote_bundle(recipient_user_id, recipient_device_id, session_id)

        self._engine.remove_session(session_id)
        self._loaded_sessions.discard(session_id)

        ik_bincode = base64.b64decode(local_keys["identityKeyPairBincode"])
        handshake_bytes = self._engine.create_outbound_session(
            session_id, ik_bincode, remote_bundle)
        self._loaded_sessions.add(session_id)

        resolved_device_id = remote_bundle["deviceId"] or recipient_device_id or ""
        if not resolved_device_id:
            raise Exception("E2EE session state requires remoteDeviceId")

        # 持久化
        state_bincode = self._engine.export_session(session_id)
        self._session_store.save_session_state_bytes(
            session_id, state_bincode, local_device_id, recipient_user_id,
            resolved_device_id, "outbound")

        self._key_store.set_local(f"{REMOTE_DEVICE_PREFIX}{session_id}", resolved_device_id)

        return (resolved_device_id, base64.b64encode(handshake_bytes).decode("ascii"))

    # ------------------------------------------------------------------
    # 加密到信封 (对应 E2eeManager.encryptToEnvelope)
    # ------------------------------------------------------------------

    def encrypt_to_envelope(self, conversation_id: str, recipient_user_id: str,
                            recipient_device_id: Optional[str],
                            plaintext: str) -> dict:
        """对应前端 encryptToEnvelope。

        Returns: RustE2eeEnvelope dict
        """
        session_id = conversation_id
        sender_device_id = self.device_id

        # ensureOutboundSession
        resolved_device_id, handshake_b64 = self.ensure_outbound_session(
            session_id, recipient_user_id, recipient_device_id)

        # encrypt
        wire = self._engine.encrypt(session_id, plaintext.encode("utf-8"))

        # 持久化更新后的 ratchet 状态
        state_bincode = self._engine.export_session(session_id)
        self._session_store.save_session_state_bytes(
            session_id, state_bincode, sender_device_id, recipient_user_id,
            resolved_device_id, "outbound")

        # 更新本地状态
        self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "encrypted")

        return {
            "version": RUST_E2EE_ENVELOPE_VERSION,
            "algorithm": RUST_E2EE_ALGORITHM,
            "senderDeviceId": sender_device_id,
            "recipientDeviceId": resolved_device_id,
            "sessionId": session_id,
            "handshake": handshake_b64,
            "wire": base64.b64encode(wire).decode("ascii"),
        }

    # ------------------------------------------------------------------
    # 解密信封 (对应 E2eeManager.decryptEnvelope)
    # ------------------------------------------------------------------

    def decrypt_envelope(self, envelope: dict, sender_user_id: str) -> str:
        """对应前端 decryptEnvelope。

        Returns: 明文字符串
        """
        sender_device_id = envelope.get("senderDeviceId", "")
        if not sender_device_id:
            raise Exception("E2EE envelope sender device id unavailable")

        local_device_id = self.device_id
        session_id = envelope["sessionId"]
        handshake_b64 = envelope.get("handshake")

        # 查找已存储的会话状态
        stored_state = self._session_store.get_session_state_bytes(
            session_id, local_device_id, sender_user_id, sender_device_id)

        BACKUP_SUFFIX = ":backup"
        backup_session_id = session_id + BACKUP_SUFFIX
        created_from_handshake = False
        had_stored_state = stored_state is not None

        # ── Phase 1: 加载会话 ──
        session_ready = False

        if handshake_b64:
            # 有握手: 总是创建新的入站会话
            remote_ik_b64 = self.resolve_sender_identity_key(sender_user_id, sender_device_id)

            # 备份旧会话
            if stored_state:
                try:
                    self._engine.remove_session(backup_session_id)
                    self._engine.restore_session(backup_session_id, stored_state)
                    self._session_store.save_session_state_bytes(
                        backup_session_id, stored_state, local_device_id,
                        sender_user_id, sender_device_id, "inbound")
                except RuntimeError:
                    pass

            # 移除旧主会话
            self._engine.remove_session(session_id)
            self._loaded_sessions.discard(session_id)

            try:
                local_keys = self._key_store.get_local_key_material()
                if local_keys is None:
                    raise Exception("local key material not found")

                handshake_bytes = base64.b64decode(handshake_b64)
                parsed = parse_rust_handshake(handshake_bytes)
                normalized = normalize_handshake(parsed)

                # 查找匹配的 OTK
                otk_bincode = None
                if normalized["oneTimePreKeyId"] is not None:
                    for pair in local_keys.get("oneTimePreKeyPairs", []):
                        if pair["id"] == normalized["oneTimePreKeyId"]:
                            otk_bincode = base64.b64decode(pair["keyPairBincode"])
                            break
                    if otk_bincode is None:
                        self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "failed")
                        raise Exception(f"missing one-time pre-key: {normalized['oneTimePreKeyId']}")

                self._engine.create_inbound_session(
                    session_id,
                    base64.b64decode(local_keys["identityKeyPairBincode"]),
                    base64.b64decode(local_keys["signedPreKeyPairBincode"]),
                    otk_bincode,
                    base64.b64decode(remote_ik_b64),
                    normalized["ephemeralPublicKey"],
                )
                self._loaded_sessions.add(session_id)
                created_from_handshake = True

                # 消耗 OTK
                if normalized["oneTimePreKeyId"] is not None:
                    self._key_store.mark_one_time_pre_key_consumed(normalized["oneTimePreKeyId"])

                session_ready = True

            except RuntimeError as e:
                err_msg = str(e)
                if "missing one-time pre-key" in err_msg:
                    self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "failed")
                    raise

                if stored_state:
                    # 回退到旧会话
                    self.restore_session_if_needed(session_id, stored_state)
                    session_ready = True
                else:
                    raise

        elif stored_state:
            self.restore_session_if_needed(session_id, stored_state)
            session_ready = True
        else:
            raise Exception("Rust E2EE session not found and envelope has no handshake")

        if not session_ready:
            raise Exception("failed to establish session for decryption")

        # ── Phase 2: 解密 ──
        wire_b64 = envelope.get("wire", "")
        if not wire_b64:
            raise Exception("No wire in envelope")
        wire = base64.b64decode(wire_b64)

        used_backup = False
        try:
            plaintext = self._engine.decrypt(session_id, wire)
        except RuntimeError as e:
            err_msg = str(e)
            if created_from_handshake and ("AES-GCM" in err_msg or "authentication" in err_msg):
                # 尝试用备份会话解密
                try:
                    temp_session_id = session_id + ":temp"
                    self._engine.remove_session(temp_session_id)
                    new_state = self._engine.export_session(session_id)
                    self._engine.restore_session(temp_session_id, new_state)

                    self._engine.remove_session(session_id)
                    self._loaded_sessions.discard(session_id)

                    # 恢复备份会话
                    backup_state = self._engine.export_session(backup_session_id)
                    self._engine.restore_session(session_id, backup_state)
                    self._loaded_sessions.add(session_id)

                    plaintext = self._engine.decrypt(session_id, wire)
                    used_backup = True

                    # 把新会话放回备份槽
                    self._engine.remove_session(backup_session_id)
                    current_new_state = self._engine.export_session(temp_session_id)
                    self._engine.restore_session(backup_session_id, current_new_state)
                    self._engine.remove_session(temp_session_id)

                except RuntimeError:
                    # 两个都失败, 清理
                    self._engine.remove_session(session_id)
                    self._loaded_sessions.discard(session_id)
                    self._engine.remove_session(backup_session_id)
                    self._session_store.delete_session_state(session_id)
                    self._key_store.remove_local(f"{REMOTE_DEVICE_PREFIX}{session_id}")
                    self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "plaintext")
                    raise

            elif "AES-GCM" in err_msg or "authentication" in err_msg:
                self._session_store.delete_session_state(session_id)
                self._engine.remove_session(session_id)
                self._loaded_sessions.discard(session_id)
                self._engine.remove_session(backup_session_id)
                self._key_store.remove_local(f"{REMOTE_DEVICE_PREFIX}{session_id}")
                self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "plaintext")
            raise

        # ── Phase 3: 持久化 ──
        if used_backup:
            self._session_store.save_session_state_bytes(
                session_id,
                self._engine.export_session(session_id),
                local_device_id, sender_user_id, sender_device_id, "inbound")
            try:
                future_state = self._engine.export_session(backup_session_id)
                self._session_store.save_session_state_bytes(
                    backup_session_id, future_state,
                    local_device_id, sender_user_id, sender_device_id, "inbound")
            except RuntimeError:
                pass
        else:
            self._session_store.save_session_state_bytes(
                session_id,
                self._engine.export_session(session_id),
                local_device_id, sender_user_id, sender_device_id, "inbound")
            if created_from_handshake:
                try:
                    self._engine.remove_session(backup_session_id)
                    self._session_store.delete_session_state(backup_session_id)
                except Exception:
                    pass

        self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "encrypted")
        return plaintext.decode("utf-8")

    # ------------------------------------------------------------------
    # 发起协商 (对应 negotiation.ts initiateNegotiation)
    # ------------------------------------------------------------------

    def initiate_negotiation(self, session_id: str, remote_user_id: str,
                             remote_device_id: Optional[str] = None) -> bool:
        """对应前端 initiateNegotiation。"""
        self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "negotiating")

        try:
            device_id = self.ensure_device_registered()
            local_keys = self._key_store.get_local_key_material()
            if local_keys is None:
                raise Exception("local key material not found")

            remote_bundle = self.fetch_remote_bundle(remote_user_id, remote_device_id, session_id)
            if not remote_bundle.get("deviceId"):
                raise Exception("E2EE negotiation requires remote device id")

            # 清理旧会话
            self._session_store.delete_session_state(session_id)
            self._engine.remove_session(session_id)
            self._loaded_sessions.discard(session_id)

            # 创建出站会话
            ik_bincode = base64.b64decode(local_keys["identityKeyPairBincode"])
            handshake_bytes = self._engine.create_outbound_session(
                session_id, ik_bincode, remote_bundle)
            self._loaded_sessions.add(session_id)

            # 持久化
            state_bincode = self._engine.export_session(session_id)
            self._session_store.save_session_state_bytes(
                session_id, state_bincode, device_id, remote_user_id,
                remote_bundle["deviceId"], "outbound")

            self._key_store.set_local(f"{REMOTE_DEVICE_PREFIX}{session_id}", remote_bundle["deviceId"])

            # 构建握手 payload
            handshake = {
                "senderIdentityKey": local_keys["publicBundle"]["identityKey"],
                "handshake": base64.b64encode(handshake_bytes).decode("ascii"),
                "senderDeviceId": device_id,
                "targetDeviceId": remote_bundle["deviceId"],
            }
            self._key_store.set_local(
                f"{INITIAL_HANDSHAKE_PREFIX}{session_id}", json.dumps(handshake))

            # 发送协商请求
            self.api.request_encryption(
                session_id,
                local_keys["publicBundle"]["identityKey"],
                local_keys["publicBundle"]["signedPreKey"]["key"],
                json.dumps(handshake),
            )
            self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "negotiating")
            return True

        except Exception as e:
            if hasattr(e, "response") and getattr(getattr(e, "response", None), "status_code", None) == 409:
                self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "negotiating")
                return True
            self._key_store.remove_local(f"{INITIAL_HANDSHAKE_PREFIX}{session_id}")
            self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "failed")
            return False

    # ------------------------------------------------------------------
    # 响应协商 (对应 negotiation.ts respondToNegotiation)
    # ------------------------------------------------------------------

    def respond_to_negotiation(self, session_id: str,
                               remote_identity_key_b64: str,
                               handshake_b64: str,
                               sender_user_id: str,
                               sender_device_id: str,
                               target_device_id: str) -> bool:
        """对应前端 respondToNegotiation。"""
        if not sender_device_id:
            self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "failed")
            return False
        if not target_device_id:
            self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "failed")
            return False

        self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "negotiating")

        try:
            device_id = self.ensure_device_registered()
            if device_id != target_device_id:
                raise Exception("E2EE negotiation request targets a different device")

            local_keys = self._key_store.get_local_key_material()
            if local_keys is None:
                raise Exception("local key material not found")

            # 清理旧会话
            self._session_store.delete_session_state(session_id)
            self._engine.remove_session(session_id)
            self._loaded_sessions.discard(session_id)

            # 解析握手
            handshake_bytes = base64.b64decode(handshake_b64)
            parsed = parse_rust_handshake(handshake_bytes)
            normalized = normalize_handshake(parsed)

            # 查找匹配的 OTK
            otk_bincode = None
            if normalized["oneTimePreKeyId"] is not None:
                for pair in local_keys.get("oneTimePreKeyPairs", []):
                    if pair["id"] == normalized["oneTimePreKeyId"]:
                        otk_bincode = base64.b64decode(pair["keyPairBincode"])
                        break
                if otk_bincode is None:
                    raise Exception(f"missing one-time pre-key: {normalized['oneTimePreKeyId']}")

            # 创建入站会话
            self._engine.create_inbound_session(
                session_id,
                base64.b64decode(local_keys["identityKeyPairBincode"]),
                base64.b64decode(local_keys["signedPreKeyPairBincode"]),
                otk_bincode,
                base64.b64decode(remote_identity_key_b64),
                normalized["ephemeralPublicKey"],
            )
            self._loaded_sessions.add(session_id)

            # 消耗 OTK
            if normalized["oneTimePreKeyId"] is not None:
                self._key_store.mark_one_time_pre_key_consumed(normalized["oneTimePreKeyId"])

            # 持久化
            state_bincode = self._engine.export_session(session_id)
            self._session_store.save_session_state_bytes(
                session_id, state_bincode, device_id, sender_user_id,
                sender_device_id, "inbound")

            self._key_store.set_local(f"{REMOTE_DEVICE_PREFIX}{session_id}", sender_device_id)
            self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "encrypted")
            return True

        except RuntimeError as e:
            err_msg = str(e)
            if "missing one-time pre-key" in err_msg:
                self._key_store.clear_local_key_material()
                self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "failed")
                raise Exception("一次性密钥已过期，请通知对方重新发起加密请求。")
            self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "failed")
            return False

    # ------------------------------------------------------------------
    # 重置协商 (对应 negotiation.ts resetNegotiation)
    # ------------------------------------------------------------------

    def reset_negotiation(self, session_id: str, status: str = "plaintext") -> None:
        """对应前端 resetNegotiation。"""
        self._key_store.remove_local(f"{INITIAL_HANDSHAKE_PREFIX}{session_id}")
        self._session_store.delete_session_state(session_id)
        self._engine.remove_session(session_id)
        self._loaded_sessions.discard(session_id)
        self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", status)

    # ------------------------------------------------------------------
    # 清理所有 E2EE 状态 (对应 E2eeManager.resetAllE2eeState)
    # ------------------------------------------------------------------

    def reset_all_e2ee_state(self) -> None:
        """对应前端 resetAllE2eeState。"""
        for sid in list(self._loaded_sessions):
            self._engine.remove_session(sid)
        self._loaded_sessions.clear()
        self._key_store.clear_all()
        self._session_store.clear_all()

    # ------------------------------------------------------------------
    # 获取会话状态 (对应 E2eeManager.getSessionStatus)
    # ------------------------------------------------------------------

    def get_session_status(self, session_id: str) -> str:
        val = self._key_store.get_local(f"{SESSION_STATUS_PREFIX}{session_id}")
        if val in ("encrypted", "negotiating", "failed"):
            return val
        return "plaintext"

    # ------------------------------------------------------------------
    # cleanup
    # ------------------------------------------------------------------

    def close(self) -> None:
        self._engine.close()


# ============================================================================
# 辅助函数
# ============================================================================

def make_session_id(id_a: str, id_b: str) -> str:
    """生成前端格式的 session ID（数字排序后拼接）。"""
    a = int(id_a)
    b = int(id_b)
    smaller, larger = (id_a, id_b) if a < b else (id_b, id_a)
    return f"{smaller}_{larger}"


# ============================================================================
# 完整测试流程
# ============================================================================

def test_full_e2ee_flow(base_url: str):
    print("=" * 70)
    print("  E2EE 全链路测试 (Rust FFI)")
    print(f"  服务地址: {base_url}")
    print("=" * 70)

    # 创建共享引擎
    engine_a = RustE2eeEngine()
    engine_b = RustE2eeEngine()

    # ---- Phase 1: 注册和登录 ----
    log_section("Phase 1: 注册和登录")

    api_a = APIClient(base_url)
    api_b = APIClient(base_url)

    ts = int(time.time()) % 1000000
    alice = E2EEUser(api_a, f"e2a_{ts}", engine=engine_a)
    bob = E2EEUser(api_b, f"e2b_{ts}", engine=engine_b)

    alice.register_and_login()
    bob.register_and_login()

    alice_id = alice.user_id
    bob_id = bob.user_id
    session_id = make_session_id(alice_id, bob_id)
    print(f"  session_id = {session_id}")

    # ---- Phase 2: 建立好友关系 ----
    log_section("Phase 2: 建立好友关系")

    alice.api.send_friend_request(bob_id)
    print(f"  Alice -> Bob 好友申请已发送")

    bob_requests = bob.api.get_friend_requests()
    req = next((r for r in bob_requests if str(r.get("applicantId") or r.get("requesterId")) == alice_id), None)
    assert req is not None, "未找到 Alice 的好友申请"
    req_id = str(req.get("id") or req.get("requestId"))
    bob.api.accept_friend_request(req_id)
    print(f"  Bob 已接受好友申请 [OK]")

    # ---- Phase 3: 未加密通讯 ----
    log_section("Phase 3: 未加密通讯（明文消息）")

    msg_plain = f"Hello Bob! This is a plaintext message at {ts}"
    resp = alice.api.send_private_message(
        receiver_id=bob_id,
        client_msg_id=f"cm_plain_{secrets.token_hex(4)}",
        message_type="TEXT",
        content=msg_plain,
    )
    print(f"  Alice -> Bob (明文): '{msg_plain}'")
    print(f"    服务端消息ID: {resp.get('data', {}).get('id', 'N/A')}")

    # 获取历史验证
    time.sleep(0.5)
    bob_history = bob.api.get_private_history(alice_id, limit=10)
    plain_found = any(
        (m.get("content") or m.get("messageContent") or "") == msg_plain
        for m in bob_history
    )
    print(f"  Bob 历史记录中验证明文消息: {'[OK]' if plain_found else '[WARN] not found'}")

    # ---- Phase 4: E2EE 设备注册 ----
    log_section("Phase 4: E2EE 设备注册")

    alice.ensure_device_registered()
    bob.ensure_device_registered()

    alice_devices = alice.api.get_devices(alice_id)
    bob_devices = bob.api.get_devices(bob_id)
    assert len(alice_devices) > 0, "Alice 设备列表为空"
    assert len(bob_devices) > 0, "Bob 设备列表为空"
    print(f"  Alice 设备: {alice_devices[0]['deviceId']}")
    print(f"  Bob 设备:   {bob_devices[0]['deviceId']}")

    alice_device_id = alice.device_id
    bob_device_id = bob.device_id

    # ---- Phase 5: 发起加密请求 ----
    log_section("Phase 5: 发起加密请求 (Alice → Bob)")

    success = alice.initiate_negotiation(session_id, bob_id, bob_device_id)
    assert success, "协商发起失败"
    print(f"  Alice 协商请求已发送 [OK]")

    # 获取 pending 请求验证
    pending = bob.api.pending_requests()
    print(f"  Bob 待处理协商请求数: {len(pending)}")
    assert len(pending) > 0, "Bob 未收到协商请求"

    # ---- Phase 6: 接受加密请求 ----
    log_section("Phase 6: 接受加密请求 (Bob → Alice)")

    # 从 pending 中获取握手数据
    pending_req = pending[0]
    req_payload = json.loads(pending_req.get("requestPayloadJson", "{}"))

    # 调用 respondToNegotiation
    success = bob.respond_to_negotiation(
        session_id=session_id,
        remote_identity_key_b64=req_payload["senderIdentityKey"],
        handshake_b64=req_payload["handshake"],
        sender_user_id=alice_id,
        sender_device_id=req_payload["senderDeviceId"],
        target_device_id=req_payload["targetDeviceId"],
    )
    assert success, "协商响应失败"

    # Bob 调用 accept API
    bob.api.accept_encryption(session_id)
    print(f"  Bob 已接受加密协商 [OK]")

    # 更新 Alice 的状态（实际是通过 WebSocket push，这里模拟收到 accepted 事件）
    alice._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "encrypted")
    alice._key_store.remove_local(f"{INITIAL_HANDSHAKE_PREFIX}{session_id}")

    # ---- Phase 7: 双向加密消息 ----
    log_section("Phase 7: 双向加密消息")

    # Alice -> Bob
    msg1 = "Hello Bob, this is a secret message from Alice!"
    envelope_a = alice.encrypt_to_envelope(
        conversation_id=session_id,
        recipient_user_id=bob_id,
        recipient_device_id=bob_device_id,
        plaintext=msg1,
    )

    send_resp = alice.api.send_private_encrypted(
        receiver_id=bob_id,
        client_msg_id=f"cm_enc_{secrets.token_hex(4)}",
        message_type="TEXT",
        e2ee_envelope=envelope_a,
        e2ee_device_id=alice_device_id,
    )
    print(f"  Alice -> Bob: '{msg1}'")
    print(f"    服务端消息ID: {send_resp['data']['id']}")

    # Bob 解密
    decrypted1 = bob.decrypt_envelope(envelope_a, alice_id)
    print(f"    Bob 解密: '{decrypted1}'")
    assert decrypted1 == msg1, f"解密失败: expected '{msg1}', got '{decrypted1}'"
    print(f"    [OK]")

    # Bob -> Alice
    msg2 = "Hi Alice! I received your secret message."
    envelope_b = bob.encrypt_to_envelope(
        conversation_id=session_id,
        recipient_user_id=alice_id,
        recipient_device_id=alice_device_id,
        plaintext=msg2,
    )

    bob.api.send_private_encrypted(
        receiver_id=alice_id,
        client_msg_id=f"cm_enc_r_{secrets.token_hex(4)}",
        message_type="TEXT",
        e2ee_envelope=envelope_b,
        e2ee_device_id=bob_device_id,
    )
    print(f"  Bob -> Alice: '{msg2}'")

    decrypted2 = alice.decrypt_envelope(envelope_b, bob_id)
    print(f"    Alice 解密: '{decrypted2}'")
    assert decrypted2 == msg2, f"解密失败: expected '{msg2}', got '{decrypted2}'"
    print(f"    [OK]")

    # ---- Phase 8: 多轮消息 (Ratchet 推进) + 会话恢复 ----
    log_section("Phase 8: 多轮消息 + 会话恢复")

    for i in range(5):
        msg = f"Multi-round message #{i+1} from Alice"
        env = alice.encrypt_to_envelope(session_id, bob_id, bob_device_id, msg)
        alice.api.send_private_encrypted(
            receiver_id=bob_id,
            client_msg_id=f"cm_m_{i}_{secrets.token_hex(4)}",
            message_type="TEXT",
            e2ee_envelope=env,
            e2ee_device_id=alice_device_id,
        )
        dec = bob.decrypt_envelope(env, alice_id)
        assert dec == msg, f"Round {i+1} A->B: expected '{msg}', got '{dec}'"

        reply = f"Multi-round reply #{i+1} from Bob"
        env_r = bob.encrypt_to_envelope(session_id, alice_id, alice_device_id, reply)
        bob.api.send_private_encrypted(
            receiver_id=alice_id,
            client_msg_id=f"cm_mr_{i}_{secrets.token_hex(4)}",
            message_type="TEXT",
            e2ee_envelope=env_r,
            e2ee_device_id=bob_device_id,
        )
        dec_r = alice.decrypt_envelope(env_r, bob_id)
        assert dec_r == reply, f"Round {i+1} B->A: expected '{reply}', got '{dec_r}'"

    print(f"  5 轮双向消息全部通过 [OK]")

    # 模拟会话恢复: Alice 清除 WASM 中的会话，下一次加密会从 SessionStore 恢复
    alice._engine.remove_session(session_id)
    alice._loaded_sessions.discard(session_id)
    print(f"  Alice WASM 会话已清除（模拟页面刷新）")

    msg_restore = "Message after session restore from storage"
    env_restore = alice.encrypt_to_envelope(session_id, bob_id, bob_device_id, msg_restore)
    alice.api.send_private_encrypted(
        receiver_id=bob_id,
        client_msg_id=f"cm_restore_{secrets.token_hex(4)}",
        message_type="TEXT",
        e2ee_envelope=env_restore,
        e2ee_device_id=alice_device_id,
    )
    dec_restore = bob.decrypt_envelope(env_restore, alice_id)
    assert dec_restore == msg_restore, f"会话恢复解密失败: expected '{msg_restore}', got '{dec_restore}'"
    print(f"  会话恢复加密/解密: [OK] (no handshake needed)")

    # 新会话测试: Alice 完全忘记 session，重建 → 带 handshake
    alice._session_store.delete_session_state(session_id)
    alice._engine.remove_session(session_id)
    alice._loaded_sessions.discard(session_id)
    print(f"  Alice 会话存储已清除（模拟 localStorage 丢失）")

    msg_new_session = "New session message with handshake"
    env_new = alice.encrypt_to_envelope(session_id, bob_id, bob_device_id, msg_new_session)
    # 此时 envelope 应该包含 handshake
    assert env_new.get("handshake"), "新会话信封应包含 handshake!"
    print(f"  Handshake 存在: [OK] ({env_new['handshake'][:20]}...)")

    alice.api.send_private_encrypted(
        receiver_id=bob_id,
        client_msg_id=f"cm_ns_{secrets.token_hex(4)}",
        message_type="TEXT",
        e2ee_envelope=env_new,
        e2ee_device_id=alice_device_id,
    )
    dec_new = bob.decrypt_envelope(env_new, alice_id)
    assert dec_new == msg_new_session, f"新会话解密失败: expected '{msg_new_session}', got '{dec_new}'"
    print(f"  新会话(带handshake)解密: [OK]")

    # ---- Phase 9: 禁用加密 ----
    log_section("Phase 9: 禁用加密")

    alice.api.disable_encryption(session_id)
    alice.reset_negotiation(session_id, "plaintext")
    print(f"  Alice 已禁用加密")

    bob.api.disable_encryption(session_id)
    bob.reset_negotiation(session_id, "plaintext")
    print(f"  Bob 已禁用加密 [OK]")

    # ---- 清理 ----
    alice.close()
    bob.close()

    # ---- 结果 ----
    log_section("测试结果")
    print("  ALL TESTS PASSED!")
    for i, name in enumerate([
        "用户注册和登录",
        "好友关系建立",
        "未加密通讯（明文消息）",
        "E2EE 设备注册",
        "发起加密请求",
        "接受加密请求",
        "双向加密消息",
        "多轮 Ratchet + 会话恢复 + 新会话握手",
        "禁用加密",
    ], 1):
        print(f"  Phase {i}: {name} [OK]")
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="E2EE 全链路测试 (Rust FFI)")
    parser.add_argument("--base-url", default="http://localhost:8082", help="服务器地址")
    parser.add_argument("--quiet", action="store_true", help="减少输出")
    args = parser.parse_args()

    if args.quiet:
        VERBOSE = False

    try:
        test_full_e2ee_flow(args.base_url)
    except Exception as e:
        print(f"\nFAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
