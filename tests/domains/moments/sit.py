#!/usr/bin/env python3
"""Moments domain SIT cases."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "common"))

from api_client import ImApiClient
from fixtures import register_and_login
from gate_common import StepResult


def run_moments_sit(base_url: str) -> list[StepResult]:
    results: list[StepResult] = []
    client = ImApiClient(base_url)
    author = register_and_login(client)
    liker = register_and_login(client)
    c_author = ImApiClient(base_url, author.token)
    c_liker = ImApiClient(base_url, liker.token)

    # Create post
    post = c_author.post("/api/moments", {"content": "Hello moments", "visibility": 0})
    post_id = post.json.get("data", {}).get("id")
    results.append(StepResult("moments create post", "PASS" if post_id else "FAIL", 0, 0.0, "", ""))

    # Get feed
    feed = c_author.get("/api/moments/feed").json.get("data", [])
    results.append(StepResult("moments feed", "PASS" if any(p.get("post", {}).get("id") == post_id for p in feed) else "FAIL", 0, 0.0, "", ""))

    # Like
    like = c_liker.post(f"/api/moments/{post_id}/like", {})
    results.append(StepResult("moments like", "PASS" if like.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    # Comment
    comment = c_liker.post(f"/api/moments/{post_id}/comments", {"content": "Nice!"})
    comment_id = comment.json.get("data", {}).get("id")
    results.append(StepResult("moments comment", "PASS" if comment_id else "FAIL", 0, 0.0, "", ""))

    # Delete post
    delete_post = c_author.delete(f"/api/moments/{post_id}")
    results.append(StepResult("moments delete post", "PASS" if delete_post.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    # Mark notifications read
    mark = c_author.put("/api/moments/notifications/read", None)
    results.append(StepResult("moments mark notifications read", "PASS" if mark.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    return results
