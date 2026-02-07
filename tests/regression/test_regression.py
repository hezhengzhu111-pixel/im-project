#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import yaml
import requests


def load_config():
    path = os.environ.get("TEST_CONFIG", "test_config.yaml")
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def test_regression_message_config_fields():
    cfg = load_config()
    url = cfg["base_url"].rstrip("/") + "/api/message/config"
    r = requests.get(url, timeout=cfg.get("timeout_ms", 3000) / 1000.0)
    assert r.status_code == 200
    data = r.json().get("data") or {}
    assert "textEnforce" in data
    assert "textMaxLength" in data
