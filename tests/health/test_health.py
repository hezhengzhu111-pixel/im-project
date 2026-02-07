#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import time
import yaml
import requests


def load_config():
    path = os.environ.get("TEST_CONFIG", "test_config.yaml")
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def test_health_message_config():
    cfg = load_config()
    url = cfg["base_url"].rstrip("/") + "/api/message/config"
    t0 = time.time()
    r = requests.get(url, timeout=cfg.get("timeout_ms", 3000) / 1000.0)
    latency = int((time.time() - t0) * 1000)
    assert r.status_code == 200
    assert latency < 500
