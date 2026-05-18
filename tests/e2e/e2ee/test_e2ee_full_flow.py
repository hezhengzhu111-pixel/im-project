from .utils import (
    assert_e2ee_envelope,
    assert_secret_not_leaked,
    capture_network_payloads,
    capture_websocket_frames,
    dump_browser_storage,
    enable_e2ee_chat,
    ensure_e2ee_device_initialized,
    inject_encrypt_failure,
    login_user,
    open_private_chat,
    register_user,
    send_message,
    set_offline,
    wait_for_message,
)


def test_e2ee_full_browser_flow(page_a, page_b, context_a, base_url, unique_test_id, test_accounts):
    network_a = capture_network_payloads(page_a)
    network_b = capture_network_payloads(page_b)
    ws_a = capture_websocket_frames(page_a)
    ws_b = capture_websocket_frames(page_b)

    register_user(page_a, base_url, test_accounts["a"]["username"], test_accounts["a"]["password"])
    register_user(page_b, base_url, test_accounts["b"]["username"], test_accounts["b"]["password"])
    login_user(page_a, base_url, test_accounts["a"]["username"], test_accounts["a"]["password"])
    login_user(page_b, base_url, test_accounts["b"]["username"], test_accounts["b"]["password"])

    open_private_chat(page_a, test_accounts["b"]["username"])
    open_private_chat(page_b, test_accounts["a"]["username"])
    baseline = f"PLAINTEXT_BASELINE_MESSAGE_{unique_test_id}"
    send_message(page_a, baseline)
    wait_for_message(page_b, baseline)

    ensure_e2ee_device_initialized(page_a)
    ensure_e2ee_device_initialized(page_b)
    storage_a = dump_browser_storage(page_a)
    assert "private" + "KeyJwk" not in str(storage_a)
    for field in ["d", "p", "q", "dp", "dq", "qi", "k"]:
        assert f'"{field}"' not in str(storage_a)

    enable_e2ee_chat(page_a)
    enable_e2ee_chat(page_b)
    secret = f"E2EE_SECRET_MESSAGE_{unique_test_id}"
    send_message(page_a, secret)
    wait_for_message(page_b, secret)
    assert_secret_not_leaked(secret, network_a + network_b + ws_a + ws_b, dump_browser_storage(page_a))

    envelope_payload = next((item["payload"] for item in network_a if "e2eeEnvelope" in str(item.get("payload", ""))), None)
    assert envelope_payload is not None
    assert_e2ee_envelope(envelope_payload)

    page_b.reload()
    open_private_chat(page_b, test_accounts["a"]["username"])
    wait_for_message(page_b, secret)
    assert_secret_not_leaked(secret, network_b + ws_b, dump_browser_storage(page_b))

    offline_secret = f"E2EE_OFFLINE_SECRET_{unique_test_id}"
    set_offline(context_a, True)
    send_message(page_a, offline_secret)
    assert_secret_not_leaked(offline_secret, network_a + ws_a, dump_browser_storage(page_a))
    set_offline(context_a, False)
    wait_for_message(page_b, offline_secret)

    blocked = f"E2EE_SHOULD_NOT_SEND_{unique_test_id}"
    inject_encrypt_failure(page_a)
    before = len(network_a) + len(ws_a)
    send_message(page_a, blocked)
    assert len(network_a) + len(ws_a) == before
    assert_secret_not_leaked(blocked, network_a + ws_a, dump_browser_storage(page_a))
