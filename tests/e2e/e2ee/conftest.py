import os
import secrets
import time
import warnings

import pytest
from playwright.sync_api import sync_playwright

from .utils import cleanup_test_users


@pytest.fixture(scope="session")
def base_url():
    return os.getenv("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")


@pytest.fixture(scope="session")
def unique_test_id():
    return f"{int(time.time())}_{secrets.token_hex(4)}"


@pytest.fixture(scope="session")
def test_accounts(unique_test_id):
    password = os.getenv("TEST_PASSWORD", "TestPassword123!")
    return {
        "a": {"username": f"e2ee_test_a_{unique_test_id}@test.local", "password": password},
        "b": {"username": f"e2ee_test_b_{unique_test_id}@test.local", "password": password},
        "c": {"username": f"e2ee_test_c_{unique_test_id}@test.local", "password": password},
    }


@pytest.fixture(scope="session")
def browser():
    headless = os.getenv("HEADLESS", "true").lower() != "false"
    timeout = int(os.getenv("TEST_TIMEOUT", "30000"))
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=headless)
        browser.set_default_timeout(timeout)
        yield browser
        browser.close()


@pytest.fixture
def context_a(browser):
    ctx = browser.new_context()
    yield ctx
    ctx.close()


@pytest.fixture
def context_b(browser):
    ctx = browser.new_context()
    yield ctx
    ctx.close()


@pytest.fixture
def page_a(context_a):
    return context_a.new_page()


@pytest.fixture
def page_b(context_b):
    return context_b.new_page()


@pytest.fixture(autouse=True)
def cleanup_accounts(base_url, test_accounts):
    yield
    if os.getenv("E2E_CLEANUP", "true").lower() == "true":
        try:
            cleanup_test_users(base_url, [v["username"] for v in test_accounts.values()])
        except Exception as exc:  # noqa: BLE001 - cleanup must not hide main failure
            warnings.warn(f"E2E cleanup warning: {exc}")
