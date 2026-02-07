import io
import sys
import time

import requests

from pytestsuite import ANY, ApiClient, Reporter, RunContext, TypeIs


if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


def main() -> int:
    ctx = RunContext.from_env("file")
    reporter = Reporter(module="file", base_url=ctx.base_url, run_id=ctx.run_id, root_dir=ctx.output_dir)

    bootstrap = requests.Session()
    bootstrap.headers.update({"Authorization": "Bearer bootstrap"})
    c0 = ApiClient(reporter, bootstrap)

    suffix = str(int(time.time()))
    username = f"test_file_{suffix}"
    password = "password123"

    ok_all = True

    c0.call(
        f"user.register {username}",
        "POST",
        "/api/user/register",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": {"username": username}},
        json_body={"username": username, "password": password, "nickname": username},
    )
    ok_login, _, login_payload = c0.call(
        f"user.login {username}",
        "POST",
        "/api/user/login",
        expected_http=(200,),
        expected_json_subset={"success": True, "token": TypeIs(str), "user": {"id": ANY}},
        json_body={"username": username, "password": password},
    )
    ok_all &= ok_login

    token = (login_payload or {}).get("token") if isinstance(login_payload, dict) else None
    if not token:
        ok_all = False

    c_noauth = ApiClient(reporter, requests.Session())
    ok_all &= c_noauth.call(
        "file.info.unauthorized",
        "POST",
        "/api/file/info",
        expected_http=(401,),
        json_body={"category": "x", "date": "2026-01-01", "filename": "a"},
    )[0]

    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}"})
    c = ApiClient(reporter, s)

    sample_png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 1024
    sample_txt = ("hello " + suffix).encode("utf-8")
    sample_mp3 = b"ID3" + b"\x00" * 1024
    sample_mp4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 1024

    def upload_case(case_name: str, path: str, filename: str, content: bytes, content_type: str):
        return c.call(
            case_name,
            "POST",
            path,
            expected_http=(200,),
            expected_json_subset={"code": 200, "data": {"category": TypeIs(str), "uploadDate": TypeIs(str), "filename": TypeIs(str)}},
            files={"file": (filename, content, content_type)},
            timeout=120,
        )

    ok_img, _, up_img = upload_case("file.upload.image", "/api/file/upload/image", "t.png", sample_png, "image/png")
    ok_avatar, _, up_avatar = upload_case("file.upload.avatar", "/api/file/upload/avatar", "avatar.png", sample_png[:1024], "image/png")
    ok_file, _, up_file = upload_case("file.upload.file", "/api/file/upload/file", "t.txt", sample_txt, "text/plain")
    ok_audio, _, up_audio = upload_case("file.upload.audio", "/api/file/upload/audio", "t.mp3", sample_mp3, "audio/mpeg")
    ok_video, _, up_video = upload_case("file.upload.video", "/api/file/upload/video", "t.mp4", sample_mp4, "video/mp4")

    ok_all &= ok_img and ok_avatar and ok_file and ok_audio and ok_video

    meta = None
    for p in (up_img, up_avatar, up_file, up_audio, up_video):
        if isinstance(p, dict) and isinstance(p.get("data"), dict):
            meta = p["data"]
            break
    if not isinstance(meta, dict):
        ok_all = False
        reporter.finalize()
        return 1

    ok_all &= c.call(
        "file.info",
        "POST",
        "/api/file/info",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": TypeIs(dict)},
        json_body={"category": meta["category"], "date": meta["uploadDate"], "filename": meta["filename"]},
    )[0]

    ok_all &= c.call(
        "file.download",
        "POST",
        "/api/file/download",
        expected_http=(200, 404, 500),
        json_body={"category": meta["category"], "date": meta["uploadDate"], "filename": meta["filename"]},
        timeout=120,
        response_mode="bytes",
        expected_binary_min_size=1,
    )[0]

    reporter.finalize()
    return 0 if ok_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
