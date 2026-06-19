#!/usr/bin/env python3
"""File domain SIT cases."""

from __future__ import annotations

import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "common"))

from api_client import ImApiClient
from fixtures import register_and_login
from gate_common import StepResult


def run_file_sit(base_url: str) -> list[StepResult]:
    results: list[StepResult] = []
    client = ImApiClient(base_url)
    user = register_and_login(client)
    client = ImApiClient(base_url, user.token)

    # Multipart upload image
    files = {"file": ("test.png", io.BytesIO(b"fake-image-bytes"), "image/png")}
    upload = client.session.post(
        f"{base_url.rstrip('/')}/api/file/upload/image",
        headers={"Authorization": f"Bearer {user.token}"},
        files=files,
        timeout=30,
    )
    data = upload.json().get("data", {}) if upload.status_code == 200 else {}
    results.append(StepResult("file upload image", "PASS" if data.get("fileId") else "FAIL", 0, 0.0, "", ""))

    file_id = data.get("fileId")
    if file_id:
        # Info
        info = client.post("/api/file/info", {"fileId": file_id})
        results.append(StepResult("file info", "PASS" if info.status_code == 200 else "FAIL", 0, 0.0, "", ""))

        # Download
        download = client.post("/api/file/download", {"fileId": file_id})
        results.append(StepResult("file download", "PASS" if download.status_code == 200 else "FAIL", 0, 0.0, "", ""))

        # Delete
        delete = client.post("/api/file/delete", {"fileId": file_id})
        results.append(StepResult("file delete", "PASS" if delete.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    return results
