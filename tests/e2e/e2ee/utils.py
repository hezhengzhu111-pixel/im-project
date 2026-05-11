import json
import os
import re
from typing import Any
from urllib import request

from playwright.sync_api import Page, BrowserContext, expect

SECRET_FIELDS = ["plain" + "text", "raw" + "Content", "body", "text", "decrypted" + "Text"]
PRIVATE_JWK_FIELDS = ["private" + "KeyJwk", "d", "p", "q", "dp", "dq", "qi", "k"]


def _short(value: str) -> str:
    return value[:200]


def register_user(page: Page, base_url: str, username: str, password: str):
    page.goto(f"{base_url}/register")
    page.get_by_label(re.compile("email|username|账号|邮箱", re.I)).fill(username)
    page.get_by_label(re.compile("password|密码", re.I)).fill(password)
    confirm = page.get_by_label(re.compile("confirm|确认", re.I))
    if confirm.count():
        confirm.fill(password)
    page.get_by_role("button", name=re.compile("register|注册", re.I)).click()
    expect(page.locator("body")).not_to_contain_text(re.compile("error|失败|异常", re.I), timeout=10_000)


def login_user(page: Page, base_url: str, username: str, password: str):
    page.goto(f"{base_url}/login")
    page.get_by_label(re.compile("email|username|账号|邮箱", re.I)).fill(username)
    page.get_by_label(re.compile("password|密码", re.I)).fill(password)
    page.get_by_role("button", name=re.compile("login|登录", re.I)).click()
    expect(page.locator("body")).not_to_contain_text(re.compile("登录失败|login failed", re.I), timeout=10_000)


def ensure_e2ee_device_initialized(page: Page):
    page.get_by_role("button", name=re.compile("E2EE|端到端|安全|密钥", re.I)).click()
    init = page.get_by_role("button", name=re.compile("初始化|init|enable", re.I))
    if init.count():
        init.click()
    expect(page.locator("body")).to_contain_text(re.compile("成功|initialized|ready|已启用", re.I), timeout=30_000)


def open_private_chat(page: Page, target_username: str):
    page.get_by_placeholder(re.compile("search|搜索", re.I)).fill(target_username)
    page.get_by_text(target_username).click()


def send_message(page: Page, text: str):
    editor = page.get_by_role("textbox").last
    editor.fill(text)
    page.get_by_role("button", name=re.compile("send|发送", re.I)).click()


def enable_e2ee_chat(page: Page):
    page.get_by_role("button", name=re.compile("端到端|E2EE|加密", re.I)).click()
    expect(page.locator("body")).to_contain_text(re.compile("加密|encrypted|E2EE", re.I), timeout=30_000)


def wait_for_message(page: Page, text: str):
    expect(page.locator("body")).to_contain_text(text, timeout=int(os.getenv("TEST_TIMEOUT", "30000")))


def capture_network_payloads(page: Page):
    payloads: list[dict[str, Any]] = []

    def on_request(req):
        payloads.append({"type": "http_request", "url": req.url, "payload": req.post_data or ""})

    def on_response(resp):
        try:
            body = resp.text()
        except Exception:
            body = ""
        payloads.append({"type": "http_response", "url": resp.url, "payload": body})

    page.on("request", on_request)
    page.on("response", on_response)
    return payloads


def capture_websocket_frames(page: Page):
    frames: list[dict[str, str]] = []

    def on_ws(ws):
        ws.on("framesent", lambda frame: frames.append({"type": "ws_send", "url": ws.url, "payload": frame.payload}))
        ws.on("framereceived", lambda frame: frames.append({"type": "ws_recv", "url": ws.url, "payload": frame.payload}))

    page.on("websocket", on_ws)
    return frames


def dump_browser_storage(page: Page):
    return page.evaluate(
        """
        async () => {
          const out = { localStorage: {}, sessionStorage: {}, indexedDB: {}, caches: {} };
          for (const [k, v] of Object.entries(localStorage)) out.localStorage[k] = v;
          for (const [k, v] of Object.entries(sessionStorage)) out.sessionStorage[k] = v;
          if (indexedDB.databases) {
            for (const dbInfo of await indexedDB.databases()) {
              if (!dbInfo.name) continue;
              out.indexedDB[dbInfo.name] = await new Promise((resolve) => {
                const req = indexedDB.open(dbInfo.name);
                req.onerror = () => resolve({ error: String(req.error) });
                req.onsuccess = () => {
                  const db = req.result;
                  const dump = {};
                  const names = Array.from(db.objectStoreNames);
                  if (!names.length) { resolve(dump); return; }
                  const tx = db.transaction(names, 'readonly');
                  tx.oncomplete = () => resolve(dump);
                  for (const name of names) {
                    const get = tx.objectStore(name).getAll();
                    get.onsuccess = () => dump[name] = get.result;
                  }
                };
              });
            }
          }
          if ('caches' in window) {
            for (const key of await caches.keys()) out.caches[key] = await (await caches.open(key)).keys().then(r => r.map(x => x.url));
          }
          return out;
        }
        """
    )


def assert_secret_not_leaked(secret: str, network_payloads, storage_dump):
    haystacks = list(network_payloads) + [{"type": "storage", "url": "browser", "payload": json.dumps(storage_dump, default=str)}]
    for item in haystacks:
        payload = str(item.get("payload", ""))
        if secret in payload:
            raise AssertionError(f"secret leaked in {item.get('type')} {item.get('url')}: {_short(payload)}")


def assert_e2ee_envelope(payload):
    body = payload if isinstance(payload, dict) else json.loads(payload)
    env = body.get("e2eeEnvelope") or body.get("e2ee_envelope") or body
    required = ["version", "alg", "conversationId", "clientMsgId", "senderUserId", "senderDeviceId", "recipientDeviceIds", "sessionId", "keyId", "keyVersion", "iv", "aad", "ciphertext", "createdAt"]
    missing = [key for key in required if key not in env]
    assert not missing, f"missing envelope fields: {missing}"
    assert env["version"] == 1
    assert env["alg"] == "AES-256-GCM"
    assert re.fullmatch(r"[A-Za-z0-9_-]{16}", env["iv"])
    for field in SECRET_FIELDS:
        assert field not in env


def set_offline(context: BrowserContext, offline: bool):
    context.set_offline(offline)


def inject_encrypt_failure(page: Page):
    page.add_init_script(
        """
        (() => {
          const orig = crypto.subtle.encrypt.bind(crypto.subtle);
          crypto.subtle.encrypt = async () => { throw new Error('crypto_failed'); };
          window.__restoreEncrypt = () => { crypto.subtle.encrypt = orig; };
        })();
        """
    )


def cleanup_test_users(base_url: str, usernames: list[str]):
    data = json.dumps({"usernames": usernames}).encode()
    req = request.Request(f"{base_url}/api/test/cleanup-users", data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        request.urlopen(req, timeout=5).read()
    except Exception:
        return
