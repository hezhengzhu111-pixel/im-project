#!/usr/bin/env python3
"""Lightweight API client for IM domain tests."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import requests


@dataclass
class ApiResponse:
    status_code: int
    json: dict[str, Any]
    text: str


class ImApiClient:
    def __init__(self, base_url: str, token: str | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.session = requests.Session()

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def get(self, path: str, params: dict[str, Any] | None = None) -> ApiResponse:
        resp = self.session.get(self._url(path), headers=self._headers(), params=params, timeout=30)
        return self._wrap(resp)

    def post(self, path: str, json: dict[str, Any] | None = None) -> ApiResponse:
        resp = self.session.post(self._url(path), headers=self._headers(), json=json, timeout=30)
        return self._wrap(resp)

    def put(self, path: str, json: dict[str, Any] | None = None) -> ApiResponse:
        resp = self.session.put(self._url(path), headers=self._headers(), json=json, timeout=30)
        return self._wrap(resp)

    def delete(self, path: str, json: dict[str, Any] | None = None) -> ApiResponse:
        resp = self.session.delete(self._url(path), headers=self._headers(), json=json, timeout=30)
        return self._wrap(resp)

    def _wrap(self, resp: requests.Response) -> ApiResponse:
        try:
            data = resp.json()
        except ValueError:
            data = {}
        return ApiResponse(status_code=resp.status_code, json=data, text=resp.text)

    def is_success(self, response: ApiResponse) -> bool:
        return response.status_code == 200 and response.json.get("code", 200) == 200

    def set_token(self, token: str) -> None:
        self.token = token
