#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IM项目完整测试脚本
测试流程：登录 → 获取Token → 运行所有接口测试

使用方法:
    python test_im_complete.py [--mode direct|gateway] [--service user|auth|group|message|im|all]
"""

import sys
import io
import argparse
import json
import time
import requests
from datetime import datetime

# Windows UTF-8 输出支持
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 服务端口配置
SERVICES = {
    "gateway": {"url": "http://localhost:8080", "prefix": ""},
    "user": {"url": "http://localhost:8085", "prefix": ""},
    "auth": {"url": "http://localhost:8084", "prefix": ""},
    "group": {"url": "http://localhost:8086", "prefix": ""},
    "message": {"url": "http://localhost:8087", "prefix": ""},
    "im": {"url": "http://localhost:8083", "prefix": ""},
}

GATEWAY_PREFIXES = {
    "user": "/api/user",
    "friend": "/api/friend",
    "group": "/api/group",
    "message": "/api/message",
    "im": "/api/im",
    "auth": "/api/auth",
    "auth_internal": "/api/auth/internal",
    "user_internal": "/api/user/internal",
    "group_internal": "/api/group/internal",
    "test": "/api/user"
}


class IMTestRunner:
    def __init__(self, mode="gateway"):
        self.session = requests.Session()
        self.results = []
        self.token = None
        self.user_id = None
        self.username = None
        self.password = None
        self.refresh_token = None
        self.group_id = None
        self.friend_id = None
        self.friend_request_id = None
        self.other_user_id = None
        self.other_username = None
        self.other_token = None
        self.primary_auth = None
        self.other_auth = None
        self.private_message_id = None
        self.group_message_id = None
        self.conversation_id = None
        self.internal_secret = "im-internal-secret"
        self.mode = mode
        
        # 根据模式设置基础 URL
        if mode == "gateway":
            self.base_url = SERVICES["gateway"]["url"]
        else:
            self.base_url = None  # 直接调用模式
        
    def get_url(self, service, path):
        """获取完整 URL"""
        if self.mode == "gateway":
            prefix = GATEWAY_PREFIXES.get(service, "")
            return f"{self.base_url}{prefix}{path}"
        else:
            # 直接调用模式
            service_info = SERVICES.get(service, SERVICES["user"])
            return f"{service_info['url']}{path}"

    def safe_json(self, response):
        try:
            return response.json()
        except Exception:
            return {"raw": response.text}

    def use_auth(self, auth):
        if not auth:
            return
        self.token = auth.get("token")
        self.user_id = auth.get("user_id")
        self.refresh_token = auth.get("refresh_token")
        if self.token:
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            self.session.headers.pop("Authorization", None)
    
    def log_result(self, test_name, status, method, endpoint, data=None, response=None, error=None):
        """记录测试结果"""
        result = {
            "test": test_name,
            "status": status,
            "method": method,
            "endpoint": endpoint,
            "request_data": data,
            "response": response,
            "error": error,
            "timestamp": datetime.now().isoformat()
        }
        self.results.append(result)
        
        status_symbol = {"PASS": "PASS", "FAIL": "FAIL", "SKIP": "SKIP"}.get(status, status)
        print(f"[{status_symbol}] {test_name}")
        if error:
            print(f"       Error: {error}")
        return status == "PASS"
    
    # ==================== 认证模块 ====================
    def register(self, username, password, nickname=None):
        """用户注册"""
        url = self.get_url("user", "/register")
        data = {
            "username": username,
            "password": password,
            "nickname": nickname or username
        }
        try:
            r = requests.post(url, json=data, timeout=10)
            resp = self.safe_json(r)
            status = "PASS" if r.status_code == 200 and resp.get("code") == 200 else "FAIL"
            if resp.get("message") and "已存在" in resp.get("message"):
                status = "PASS"
            return self.log_result(f"用户注册-{username}", status, "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result(f"用户注册-{username}", "FAIL", "POST", url, data=data, error=str(e))
    
    def login(self, username="testuser", password="password123", set_current=True):
        url = self.get_url("user", "/login")
        data = {"username": username, "password": password}
        
        print(f"\n{'='*60}")
        print(f"登录: {username}")
        print(f"{'='*60}")
        print(f"URL: {url}")
        
        try:
            r = requests.post(url, json=data, timeout=10)
            resp = self.safe_json(r)
            if r.status_code == 200 and resp.get("success") is True and resp.get("token"):
                auth = {
                    "token": resp.get("token"),
                    "refresh_token": resp.get("refreshToken"),
                    "user_id": str(resp.get("user", {}).get("id")) if resp.get("user") else None
                }
                if set_current:
                    self.use_auth(auth)
                    self.username = username
                print(f"登录成功! UserId: {auth.get('user_id')}")
                return auth
            print(f"登录失败: {resp}")
            return None
        except Exception as e:
            print(f"登录异常: {e}")
            return None
    
    def test_health(self):
        """健康检查"""
        try:
            r = requests.get(f"{self.base_url}/actuator/health", timeout=5)
            return self.log_result("健康检查", "PASS" if r.status_code == 200 else "FAIL", "GET", "/actuator/health", response={"status": r.status_code})
        except Exception as e:
            return self.log_result("健康检查", "FAIL", "GET", "/actuator/health", error=str(e))
    
    # ==================== 用户模块 ====================
    def test_user_info(self):
        url = self.get_url("user_internal", f"/{self.user_id}")
        headers = {"X-Internal-Secret": self.internal_secret}
        try:
            r = self.session.get(url, headers=headers)
            resp = self.safe_json(r)
            return self.log_result("用户信息(内部)", "PASS" if r.status_code == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("用户信息(内部)", "FAIL", "GET", url, error=str(e))
    
    def test_user_profile(self):
        """修改用户资料"""
        url = self.get_url("user", "/profile")
        data = {"nickname": f"测试用户_{int(time.time())}", "email": f"{self.username}@example.com"}
        try:
            r = self.session.put(url, json=data)
            resp = self.safe_json(r)
            return self.log_result("修改资料", "PASS" if resp.get("code") == 200 else "FAIL", "PUT", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("修改资料", "FAIL", "PUT", url, error=str(e))
    
    def test_user_online(self):
        url = self.get_url("user", "/online")
        try:
            r = self.session.post(url)
            resp = self.safe_json(r)
            return self.log_result("用户上线", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, response=resp)
        except Exception as e:
            return self.log_result("用户上线", "FAIL", "POST", url, error=str(e))

    def test_user_offline(self):
        url = self.get_url("user", "/offline")
        try:
            r = self.session.post(url)
            resp = self.safe_json(r)
            return self.log_result("用户下线", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, response=resp)
        except Exception as e:
            return self.log_result("用户下线", "FAIL", "POST", url, error=str(e))

    def test_user_heartbeat(self):
        url = self.get_url("user", "/heartbeat")
        data = [self.user_id] if not self.other_user_id else [self.user_id, self.other_user_id]
        try:
            r = self.session.post(url, json=data)
            resp = self.safe_json(r)
            return self.log_result("心跳检测", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("心跳检测", "FAIL", "POST", url, error=str(e))

    def test_user_online_status(self):
        """检查在线状态"""
        url = self.get_url("user", "/online-status")
        data = [self.user_id] if not self.other_user_id else [self.user_id, self.other_user_id]
        try:
            r = self.session.post(url, json=data)
            resp = self.safe_json(r)
            return self.log_result("在线状态", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("在线状态", "FAIL", "POST", url, error=str(e))
    
    def test_search_user(self):
        """搜索用户"""
        url = self.get_url("user", f"/search?type=username&keyword={self.username}")
        try:
            r = self.session.get(url)
            resp = self.safe_json(r)
            return self.log_result("搜索用户", "PASS" if resp.get("code") == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("搜索用户", "FAIL", "GET", url, error=str(e))

    def test_user_internal_exists(self):
        url = self.get_url("user_internal", f"/exists/{self.user_id}")
        headers = {"X-Internal-Secret": self.internal_secret}
        try:
            r = self.session.get(url, headers=headers)
            resp = self.safe_json(r)
            return self.log_result("用户存在(内部)", "PASS" if r.status_code == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("用户存在(内部)", "FAIL", "GET", url, error=str(e))

    def test_user_internal_is_friend(self):
        if not self.other_user_id:
            return self.log_result("好友关系(内部)", "SKIP", "GET", "/api/user/internal/friend/isFriend", error="无好友ID")
        url = self.get_url("user_internal", f"/friend/isFriend/{self.user_id}/{self.other_user_id}")
        headers = {"X-Internal-Secret": self.internal_secret}
        try:
            r = self.session.get(url, headers=headers)
            resp = self.safe_json(r)
            return self.log_result("好友关系(内部)", "PASS" if r.status_code == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("好友关系(内部)", "FAIL", "GET", url, error=str(e))

    def test_user_internal_friend_list(self):
        url = self.get_url("user_internal", f"/friend/list/{self.user_id}")
        headers = {"X-Internal-Secret": self.internal_secret}
        try:
            r = self.session.get(url, headers=headers)
            resp = self.safe_json(r)
            return self.log_result("好友列表(内部)", "PASS" if r.status_code == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("好友列表(内部)", "FAIL", "GET", url, error=str(e))

    def test_test_hello(self):
        url = self.get_url("test", "/test/hello")
        try:
            r = self.session.get(url)
            resp = self.safe_json(r)
            return self.log_result("测试接口-hello", "PASS" if r.status_code == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("测试接口-hello", "FAIL", "GET", url, error=str(e))

    def test_test_login(self):
        url = self.get_url("test", "/test/login")
        try:
            r = self.session.post(url)
            resp = self.safe_json(r)
            return self.log_result("测试接口-login", "PASS" if r.status_code == 200 else "FAIL", "POST", url, response=resp)
        except Exception as e:
            return self.log_result("测试接口-login", "FAIL", "POST", url, error=str(e))
    
    # ==================== 好友模块 ====================
    def test_friend_list(self):
        """好友列表"""
        url = self.get_url("friend", "/list")
        try:
            r = self.session.get(url)
            resp = self.safe_json(r)
            if resp.get("code") == 200:
                friends = resp.get("data", [])
                if friends:
                    self.friend_id = str(friends[0].get("friendUserId") or friends[0].get("userId") or friends[0].get("id"))
                return self.log_result("好友列表", "PASS", "GET", url, response={"count": len(friends)})
            return self.log_result("好友列表", "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("好友列表", "FAIL", "GET", url, error=str(e))
    
    def test_friend_request(self):
        if not self.other_user_id:
            return self.log_result("好友请求", "SKIP", "POST", "/api/friend/request", error="无目标用户")
        url = self.get_url("friend", "/request")
        data = {"targetUserId": str(self.other_user_id), "reason": "自动化测试"}
        try:
            r = self.session.post(url, json=data)
            resp = self.safe_json(r)
            if resp.get("code") == 200:
                self.friend_request_id = resp.get("data", {}).get("requestId")
                return self.log_result("好友请求", "PASS", "POST", url, data=data, response=resp)
            return self.log_result("好友请求", "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("好友请求", "FAIL", "POST", url, error=str(e))
    
    def test_friend_accept(self):
        if not self.friend_request_id or not self.other_auth:
            return self.log_result("同意好友", "SKIP", "POST", "/api/friend/accept", error="无请求ID或登录信息")
        self.use_auth(self.other_auth)
        url = self.get_url("friend", "/accept")
        data = {"requestId": self.friend_request_id}
        try:
            r = self.session.post(url, json=data)
            resp = self.safe_json(r)
            result = self.log_result("同意好友", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, data=data, response=resp)
            self.use_auth(self.primary_auth)
            return result
        except Exception as e:
            self.use_auth(self.primary_auth)
            return self.log_result("同意好友", "FAIL", "POST", url, error=str(e))
    
    def test_friend_reject(self):
        if not self.other_user_id or not self.other_auth:
            return self.log_result("拒绝好友", "SKIP", "POST", "/api/friend/reject", error="无目标用户或登录信息")
        self.use_auth(self.primary_auth)
        url = self.get_url("friend", "/request")
        data = {"targetUserId": str(self.other_user_id), "reason": "自动化测试拒绝"}
        try:
            r = self.session.post(url, json=data)
            resp = self.safe_json(r)
            request_id = resp.get("data", {}).get("requestId")
            if not request_id:
                return self.log_result("拒绝好友", "FAIL", "POST", url, data=data, response=resp)
            self.use_auth(self.other_auth)
            reject_url = self.get_url("friend", "/reject")
            reject_data = {"requestId": request_id, "reason": "自动化测试"}
            r2 = self.session.post(reject_url, json=reject_data)
            resp2 = self.safe_json(r2)
            result = self.log_result("拒绝好友", "PASS" if resp2.get("code") == 200 else "FAIL", "POST", reject_url, data=reject_data, response=resp2)
            self.use_auth(self.primary_auth)
            return result
        except Exception as e:
            self.use_auth(self.primary_auth)
            return self.log_result("拒绝好友", "FAIL", "POST", url, error=str(e))
    
    def test_friend_requests(self):
        url = self.get_url("friend", "/requests?limit=10")
        try:
            r = self.session.get(url)
            resp = self.safe_json(r)
            return self.log_result("请求列表", "PASS" if resp.get("code") == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("请求列表", "FAIL", "GET", url, error=str(e))
    
    def test_friend_relation(self):
        if not self.other_user_id:
            return self.log_result("关系检查", "SKIP", "GET", "/api/friend/relation", error="无好友ID")
        url = self.get_url("friend", f"/relation?targetUserId={self.other_user_id}")
        try:
            r = self.session.get(url)
            resp = self.safe_json(r)
            return self.log_result("关系检查", "PASS" if resp.get("code") == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("关系检查", "FAIL", "GET", url, error=str(e))
    
    def test_friend_block(self):
        if not self.other_user_id:
            return self.log_result("拉黑好友", "SKIP", "POST", "/api/friend/block", error="无目标用户")
        url = self.get_url("friend", f"/block?targetUserId={self.other_user_id}")
        try:
            r = self.session.post(url)
            resp = self.safe_json(r)
            return self.log_result("拉黑好友", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, response=resp)
        except Exception as e:
            return self.log_result("拉黑好友", "FAIL", "POST", url, error=str(e))
    
    def test_friend_blocked(self):
        url = self.get_url("friend", "/blocked")
        try:
            r = self.session.get(url)
            resp = self.safe_json(r)
            return self.log_result("已拉黑列表", "PASS" if resp.get("code") == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("已拉黑列表", "FAIL", "GET", url, error=str(e))

    def test_friend_remark(self):
        if not self.other_user_id:
            return self.log_result("好友备注", "SKIP", "PUT", "/api/friend/remark", error="无目标用户")
        url = self.get_url("friend", f"/remark?friendUserId={self.other_user_id}&remark=自动化测试")
        try:
            r = self.session.put(url)
            resp = self.safe_json(r)
            return self.log_result("好友备注", "PASS" if resp.get("code") == 200 else "FAIL", "PUT", url, response=resp)
        except Exception as e:
            return self.log_result("好友备注", "FAIL", "PUT", url, error=str(e))

    def test_friend_remove(self):
        if not self.other_user_id:
            return self.log_result("删除好友", "SKIP", "DELETE", "/api/friend/remove", error="无目标用户")
        url = self.get_url("friend", f"/remove?friendUserId={self.other_user_id}")
        try:
            r = self.session.delete(url)
            resp = self.safe_json(r)
            return self.log_result("删除好友", "PASS" if resp.get("code") == 200 else "FAIL", "DELETE", url, response=resp)
        except Exception as e:
            return self.log_result("删除好友", "FAIL", "DELETE", url, error=str(e))
    
    # ==================== 群组模块 ====================
    def test_group_create(self):
        """创建群组"""
        url = self.get_url("group", "/s/create")
        data = {
            "name": f"测试群组_{int(time.time())}",
            "type": 1,
            "announcement": "自动化测试创建的群组"
        }
        try:
            r = self.session.post(url, json=data)
            resp = self.safe_json(r)
            if resp.get("code") == 200:
                self.group_id = str(resp.get("data", {}).get("id") or resp.get("data", {}).get("groupId"))
                return self.log_result("创建群组", "PASS", "POST", url, data=data, response={"groupId": self.group_id})
            return self.log_result("创建群组", "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("创建群组", "FAIL", "POST", url, error=str(e))
    
    def test_group_list(self):
        """群组列表"""
        url = self.get_url("group", f"/s/user/{self.user_id}")
        try:
            r = self.session.get(url)
            resp = self.safe_json(r)
            if resp.get("code") == 200:
                groups = resp.get("data", [])
                if groups and not self.group_id:
                    self.group_id = str(groups[0].get("id"))
                return self.log_result("群组列表", "PASS", "GET", url, response={"count": len(groups)})
            return self.log_result("群组列表", "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("群组列表", "FAIL", "GET", url, error=str(e))
    
    def test_group_info(self):
        """群组信息"""
        if not self.group_id:
            return self.log_result("群组信息", "SKIP", "GET", "/group/info", error="无群组ID")
        url = self.get_url("group", f"/s/{self.group_id}/info")
        try:
            r = self.session.get(url)
            resp = self.safe_json(r)
            return self.log_result("群组信息", "PASS" if resp.get("code") == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("群组信息", "FAIL", "GET", url, error=str(e))
    
    def test_group_members(self):
        """群成员列表"""
        if not self.group_id:
            return self.log_result("群成员", "SKIP", "GET", "/group/members", error="无群组ID")
        url = self.get_url("group", "/s/members/list")
        data = {"groupId": int(self.group_id), "cursor": None, "limit": 20}
        try:
            r = self.session.post(url, json=data)
            resp = self.safe_json(r)
            return self.log_result("群成员", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("群成员", "FAIL", "POST", url, error=str(e))
    
    def test_group_add_members(self):
        """添加群成员"""
        if not self.group_id:
            return self.log_result("添加成员", "SKIP", "POST", "/group/add-member", error="无群组ID")
        if not self.other_user_id:
            return self.log_result("添加成员", "SKIP", "POST", "/s/{groupId}/members", error="无其他用户")
        url = self.get_url("group", f"/s/{self.group_id}/members")
        data = {"groupId": int(self.group_id), "operatorId": int(self.user_id), "memberIds": [int(self.other_user_id)]}
        try:
            r = self.session.post(url, json=data)
            resp = self.safe_json(r)
            return self.log_result("添加成员", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("添加成员", "FAIL", "POST", url, error=str(e))
    
    def test_group_quit(self):
        """退出群组"""
        if not self.group_id:
            return self.log_result("退出群组", "SKIP", "POST", "/group/quit", error="无群组ID")
        url = self.get_url("group", f"/s/{self.group_id}/leave")
        try:
            r = self.session.post(url)
            resp = self.safe_json(r)
            return self.log_result("退出群组", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, response=resp)
        except Exception as e:
            return self.log_result("退出群组", "FAIL", "POST", url, error=str(e))

    def test_group_join(self):
        if not self.group_id or not self.other_auth:
            return self.log_result("加入群组", "SKIP", "POST", "/s/{groupId}/join", error="无群组或登录信息")
        self.use_auth(self.other_auth)
        url = self.get_url("group", f"/s/{self.group_id}/join")
        try:
            r = self.session.post(url)
            resp = self.safe_json(r)
            result = self.log_result("加入群组", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, response=resp)
            self.use_auth(self.primary_auth)
            return result
        except Exception as e:
            self.use_auth(self.primary_auth)
            return self.log_result("加入群组", "FAIL", "POST", url, error=str(e))
    
    def test_group_dismiss(self):
        """解散群组"""
        if not self.group_id:
            return self.log_result("解散群组", "SKIP", "POST", "/group/dismiss", error="无群组ID")
        url = self.get_url("group", f"/s/{self.group_id}")
        try:
            r = self.session.delete(url)
            resp = self.safe_json(r)
            if resp.get("code") == 200:
                self.group_id = None
            return self.log_result("解散群组", "PASS" if resp.get("code") == 200 else "FAIL", "DELETE", url, response=resp)
        except Exception as e:
            return self.log_result("解散群组", "FAIL", "DELETE", url, error=str(e))

    def test_group_update_info(self):
        if not self.group_id:
            return self.log_result("更新群组", "SKIP", "PUT", "/s/{groupId}", error="无群组ID")
        url = self.get_url("group", f"/s/{self.group_id}")
        data = {"groupId": int(self.group_id), "operatorId": int(self.user_id), "groupName": f"群组_{int(time.time())}", "description": "自动化更新"}
        try:
            r = self.session.put(url, json=data)
            resp = self.safe_json(r)
            return self.log_result("更新群组", "PASS" if resp.get("code") == 200 else "FAIL", "PUT", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("更新群组", "FAIL", "PUT", url, error=str(e))

    def test_group_set_admin(self):
        if not self.group_id or not self.other_user_id:
            return self.log_result("设置管理员", "SKIP", "PUT", "/s/{groupId}/admin", error="无群组或成员")
        url = self.get_url("group", f"/s/{self.group_id}/admin")
        data = {"groupId": int(self.group_id), "operatorId": int(self.user_id), "userId": int(self.other_user_id), "isAdmin": True}
        try:
            r = self.session.put(url, json=data)
            resp = self.safe_json(r)
            return self.log_result("设置管理员", "PASS" if resp.get("code") == 200 else "FAIL", "PUT", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("设置管理员", "FAIL", "PUT", url, error=str(e))

    def test_group_get_user_role(self):
        if not self.group_id:
            return self.log_result("群角色查询", "SKIP", "POST", "/s/role/get", error="无群组ID")
        url = self.get_url("group", "/s/role/get")
        data = {"groupId": int(self.group_id), "userId": int(self.user_id)}
        try:
            r = self.session.post(url, json=data)
            resp = self.safe_json(r)
            return self.log_result("群角色查询", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("群角色查询", "FAIL", "POST", url, error=str(e))
    
    # ==================== 消息模块 ====================
    def test_message_send_private(self):
        """发送私聊消息"""
        if not self.other_user_id:
            return self.log_result("发送私聊", "SKIP", "POST", "/s/send/private", error="无好友用户")
        url = self.get_url("message", "/s/send/private")
        data = {
            "receiverId": str(self.other_user_id),
            "messageType": "TEXT",
            "content": f"私聊消息测试 {int(time.time())}"
        }
        try:
            r = self.session.post(url, json=data)
            resp = self.safe_json(r)
            self.private_message_id = resp.get("data")
            return self.log_result("发送私聊", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("发送私聊", "FAIL", "POST", url, error=str(e))

    def test_message_send_group(self):
        if not self.group_id:
            return self.log_result("发送群聊", "SKIP", "POST", "/s/send/group", error="无群组ID")
        url = self.get_url("message", "/s/send/group")
        data = {"groupId": str(self.group_id), "messageType": "TEXT", "content": f"群聊消息测试 {int(time.time())}"}
        try:
            r = self.session.post(url, json=data)
            resp = self.safe_json(r)
            self.group_message_id = resp.get("data")
            return self.log_result("发送群聊", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("发送群聊", "FAIL", "POST", url, error=str(e))
    
    def test_message_private_history(self):
        """私聊历史"""
        if not self.other_user_id:
            return self.log_result("私聊历史", "SKIP", "GET", "/s/private/{friendId}", error="无好友用户")
        url = self.get_url("message", f"/s/private/{self.other_user_id}?page=0&size=20")
        try:
            r = self.session.get(url)
            resp = self.safe_json(r)
            return self.log_result("私聊历史", "PASS" if resp.get("code") == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("私聊历史", "FAIL", "GET", url, error=str(e))

    def test_message_group_history(self):
        if not self.group_id:
            return self.log_result("群聊历史", "SKIP", "GET", "/s/group/{groupId}", error="无群组ID")
        url = self.get_url("message", f"/s/group/{self.group_id}?page=0&size=20")
        try:
            r = self.session.get(url)
            resp = self.safe_json(r)
            return self.log_result("群聊历史", "PASS" if resp.get("code") == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("群聊历史", "FAIL", "GET", url, error=str(e))
    
    def test_message_conversations(self):
        """会话列表"""
        url = self.get_url("message", "/s/conversations")
        try:
            r = self.session.get(url)
            resp = self.safe_json(r)
            if resp.get("code") == 200 and resp.get("data"):
                self.conversation_id = resp.get("data")[0].get("conversationId")
            return self.log_result("会话列表", "PASS" if resp.get("code") == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("会话列表", "FAIL", "GET", url, error=str(e))

    def test_message_mark_read(self):
        if not self.conversation_id:
            return self.log_result("标记已读", "SKIP", "POST", "/s/read/{conversationId}", error="无会话ID")
        url = self.get_url("message", f"/s/read/{self.conversation_id}")
        try:
            r = self.session.post(url)
            resp = self.safe_json(r)
            return self.log_result("标记已读", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, response=resp)
        except Exception as e:
            return self.log_result("标记已读", "FAIL", "POST", url, error=str(e))

    def test_message_retry_private(self):
        message_id = self.private_message_id or 0
        url = self.get_url("message", f"/s/retry/private/{message_id}")
        try:
            r = self.session.post(url)
            resp = self.safe_json(r)
            status = "PASS" if resp.get("code") in (200, 400, 404) else "FAIL"
            return self.log_result("私聊重投", status, "POST", url, response=resp)
        except Exception as e:
            return self.log_result("私聊重投", "FAIL", "POST", url, error=str(e))

    def test_message_retry_group(self):
        message_id = self.group_message_id or 0
        url = self.get_url("message", f"/s/retry/group/{message_id}")
        try:
            r = self.session.post(url)
            resp = self.safe_json(r)
            status = "PASS" if resp.get("code") in (200, 400, 404) else "FAIL"
            return self.log_result("群聊重投", status, "POST", url, response=resp)
        except Exception as e:
            return self.log_result("群聊重投", "FAIL", "POST", url, error=str(e))
    
    # ==================== IM模块 ====================
    def test_im_heartbeat(self):
        """IM心跳"""
        url = self.get_url("im", "/heartbeat")
        data = [self.user_id] if not self.other_user_id else [self.user_id, self.other_user_id]
        try:
            r = self.session.post(url, json=data)
            resp = self.safe_json(r)
            return self.log_result("IM心跳", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("IM心跳", "FAIL", "POST", url, error=str(e))
    
    def test_im_online_status(self):
        """IM在线状态"""
        url = self.get_url("im", f"/online/{self.user_id}")
        try:
            r = self.session.post(url)
            resp = self.safe_json(r)
            return self.log_result("IM上线", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, response=resp)
        except Exception as e:
            return self.log_result("IM上线", "FAIL", "POST", url, error=str(e))

    def test_im_offline(self):
        url = self.get_url("im", f"/offline/{self.user_id}")
        try:
            r = self.session.post(url)
            resp = self.safe_json(r)
            return self.log_result("IM下线", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, response=resp)
        except Exception as e:
            return self.log_result("IM下线", "FAIL", "POST", url, error=str(e))
    
    def test_im_send_message(self):
        """IM发送消息"""
        if not self.other_user_id:
            return self.log_result("IM发送消息", "SKIP", "POST", "/sendMessage", error="无目标用户")
        url = self.get_url("im", "/sendMessage")
        data = {
            "senderId": int(self.user_id),
            "receiverId": int(self.other_user_id),
            "messageType": "TEXT",
            "content": f"IM消息 {int(time.time())}",
            "isGroup": False
        }
        try:
            r = self.session.post(url, json=data)
            resp = self.safe_json(r)
            return self.log_result("IM发送消息", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("IM发送消息", "FAIL", "POST", url, error=str(e))

    def test_auth_parse(self):
        if not self.token:
            return self.log_result("解析Token", "SKIP", "POST", "/parse", error="无Token")
        url = self.get_url("auth", "/parse")
        data = {"token": self.token, "allowExpired": False}
        try:
            r = self.session.post(url, json=data)
            resp = self.safe_json(r)
            return self.log_result("解析Token", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("解析Token", "FAIL", "POST", url, error=str(e))

    def test_auth_refresh(self):
        if not self.refresh_token:
            return self.log_result("刷新Token", "SKIP", "POST", "/refresh", error="无刷新Token")
        url = self.get_url("auth", "/refresh")
        data = {"refreshToken": self.refresh_token}
        try:
            r = self.session.post(url, json=data)
            resp = self.safe_json(r)
            return self.log_result("刷新Token", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("刷新Token", "FAIL", "POST", url, error=str(e))

    def test_auth_internal_issue_token(self):
        url = self.get_url("auth_internal", "/token")
        headers = {"X-Internal-Secret": self.internal_secret}
        data = {"userId": int(self.user_id), "username": self.username, "nickname": self.username}
        try:
            r = self.session.post(url, json=data, headers=headers)
            resp = self.safe_json(r)
            if r.status_code == 200:
                self.issued_token = resp.get("accessToken")
            return self.log_result("内部颁发Token", "PASS" if r.status_code == 200 else "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("内部颁发Token", "FAIL", "POST", url, error=str(e))

    def test_auth_internal_user_resource(self):
        url = self.get_url("auth_internal", f"/user-resource/{self.user_id}")
        headers = {"X-Internal-Secret": self.internal_secret}
        try:
            r = self.session.get(url, headers=headers)
            resp = self.safe_json(r)
            return self.log_result("内部用户资源", "PASS" if r.status_code == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("内部用户资源", "FAIL", "GET", url, error=str(e))

    def test_auth_internal_validate_token(self):
        token = self.token or ""
        url = self.get_url("auth_internal", "/validate-token")
        headers = {"X-Internal-Secret": self.internal_secret}
        try:
            r = self.session.post(url, json=token, headers=headers)
            resp = self.safe_json(r)
            return self.log_result("内部验证Token", "PASS" if r.status_code == 200 else "FAIL", "POST", url, response=resp)
        except Exception as e:
            return self.log_result("内部验证Token", "FAIL", "POST", url, error=str(e))

    def test_auth_internal_check_permission(self):
        url = self.get_url("auth_internal", "/check-permission")
        headers = {"X-Internal-Secret": self.internal_secret}
        data = {"userId": int(self.user_id), "permission": "user:read", "resource": "profile", "action": "read"}
        try:
            r = self.session.post(url, json=data, headers=headers)
            resp = self.safe_json(r)
            return self.log_result("内部权限检查", "PASS" if r.status_code == 200 else "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("内部权限检查", "FAIL", "POST", url, error=str(e))

    def test_auth_internal_revoke_token(self):
        token = getattr(self, "issued_token", None)
        if not token:
            return self.log_result("内部吊销Token", "SKIP", "POST", "/revoke-token", error="无颁发Token")
        url = self.get_url("auth_internal", "/revoke-token")
        headers = {"X-Internal-Secret": self.internal_secret}
        data = {"token": token, "reason": "自动化测试"}
        try:
            r = self.session.post(url, json=data, headers=headers)
            resp = self.safe_json(r)
            return self.log_result("内部吊销Token", "PASS" if r.status_code == 200 else "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("内部吊销Token", "FAIL", "POST", url, error=str(e))

    def test_auth_internal_revoke_user_tokens(self):
        url = self.get_url("auth_internal", f"/revoke-user-tokens/{self.user_id}")
        headers = {"X-Internal-Secret": self.internal_secret}
        try:
            r = self.session.post(url, headers=headers)
            status = "PASS" if r.status_code == 200 else "FAIL"
            return self.log_result("内部吊销用户Token", status, "POST", url, response={"status": r.status_code})
        except Exception as e:
            return self.log_result("内部吊销用户Token", "FAIL", "POST", url, error=str(e))

    def test_group_internal_exists(self):
        if not self.group_id:
            return self.log_result("群组存在(内部)", "SKIP", "GET", "/api/group/internal/exists", error="无群组ID")
        url = self.get_url("group_internal", f"/exists/{self.group_id}")
        headers = {"X-Internal-Secret": self.internal_secret}
        try:
            r = self.session.get(url, headers=headers)
            resp = self.safe_json(r)
            return self.log_result("群组存在(内部)", "PASS" if r.status_code == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("群组存在(内部)", "FAIL", "GET", url, error=str(e))

    def test_group_internal_list(self):
        url = self.get_url("group_internal", f"/list/{self.user_id}")
        headers = {"X-Internal-Secret": self.internal_secret}
        try:
            r = self.session.get(url, headers=headers)
            resp = self.safe_json(r)
            return self.log_result("群组列表(内部)", "PASS" if r.status_code == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("群组列表(内部)", "FAIL", "GET", url, error=str(e))

    def test_group_internal_is_member(self):
        if not self.group_id:
            return self.log_result("群成员检查(内部)", "SKIP", "GET", "/api/group/internal/isMember", error="无群组ID")
        url = self.get_url("group_internal", f"/isMember/{self.group_id}/{self.user_id}")
        headers = {"X-Internal-Secret": self.internal_secret}
        try:
            r = self.session.get(url, headers=headers)
            resp = self.safe_json(r)
            return self.log_result("群成员检查(内部)", "PASS" if r.status_code == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("群成员检查(内部)", "FAIL", "GET", url, error=str(e))

    def test_group_internal_member_ids(self):
        if not self.group_id:
            return self.log_result("群成员ID(内部)", "SKIP", "GET", "/api/group/internal/memberIds", error="无群组ID")
        url = self.get_url("group_internal", f"/memberIds/{self.group_id}")
        headers = {"X-Internal-Secret": self.internal_secret}
        try:
            r = self.session.get(url, headers=headers)
            resp = self.safe_json(r)
            return self.log_result("群成员ID(内部)", "PASS" if r.status_code == 200 else "FAIL", "GET", url, response=resp)
        except Exception as e:
            return self.log_result("群成员ID(内部)", "FAIL", "GET", url, error=str(e))

            return self.log_result("上传图片", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, response=resp)
        except Exception as e:
            return self.log_result("上传图片", "FAIL", "POST", url, error=str(e))

        except Exception as e:
            return self.log_result("上传文件", "FAIL", "POST", url, error=str(e))

        except Exception as e:
            return self.log_result("上传音频", "FAIL", "POST", url, error=str(e))

        except Exception as e:
            return self.log_result("上传视频", "FAIL", "POST", url, error=str(e))

        except Exception as e:
            return self.log_result("上传头像", "FAIL", "POST", url, error=str(e))

            resp = self.safe_json(r)
            return self.log_result("获取文件信息", "PASS" if resp.get("code") == 200 else "FAIL", "POST", url, data=data, response=resp)
        except Exception as e:
            return self.log_result("获取文件信息", "FAIL", "POST", url, error=str(e))

            r = self.session.post(url, json=data)
            status = "PASS" if r.status_code == 200 else "FAIL"
            return self.log_result("下载文件", status, "POST", url, data=data, response={"status": r.status_code})
        except Exception as e:
            return self.log_result("下载文件", "FAIL", "POST", url, error=str(e))
    
    # ==================== 测试套件 ====================
    def run_tests(self, test_suite="all"):
        """运行测试套件"""
        print("="*70)
        print("IM项目完整测试脚本")
        print(f"模式: {'Gateway' if self.mode == 'gateway' else '直接调用'}")
        print(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*70)
        
        # 健康检查
        if self.mode == "gateway":
            self.test_health()
        
        base_username = self.username or "testuser"
        base_password = self.password or "password123"
        suffix = int(time.time())
        primary_username = f"{base_username}_{suffix}" if base_username == "testuser" else base_username
        other_username = f"{primary_username}_other"
        self.username = primary_username
        self.password = base_password
        self.other_username = other_username

        self.register(primary_username, base_password, nickname=primary_username)
        self.register(other_username, base_password, nickname=other_username)

        auth = self.login(primary_username, base_password, set_current=True)
        if not auth:
            print("\n无法登录，终止测试")
            self.log_result("用户登录", "FAIL", "POST", self.get_url("user", "/login"), data={"username": primary_username})
            self.print_summary()
            return False
        self.primary_auth = auth

        other_auth = self.login(other_username, base_password, set_current=False)
        if other_auth:
            self.other_auth = other_auth
            self.other_user_id = other_auth.get("user_id")
        self.use_auth(self.primary_auth)
        
        test_suites = {
            "auth": [
                self.test_auth_parse, self.test_auth_refresh,
                self.test_auth_internal_issue_token, self.test_auth_internal_user_resource,
                self.test_auth_internal_validate_token, self.test_auth_internal_check_permission,
                self.test_auth_internal_revoke_token, self.test_auth_internal_revoke_user_tokens
            ],
            "user": [
                self.test_user_info, self.test_user_internal_exists, self.test_user_internal_friend_list,
                self.test_user_profile, self.test_user_online, self.test_user_offline,
                self.test_user_heartbeat, self.test_user_online_status, self.test_search_user,
                self.test_test_hello, self.test_test_login
            ],
            "friend": [
                self.test_friend_list, self.test_friend_request, self.test_friend_accept,
                self.test_friend_requests, self.test_friend_relation, self.test_friend_block,
                self.test_friend_blocked, self.test_friend_remark, self.test_friend_remove,
                self.test_friend_reject, self.test_user_internal_is_friend
            ],
            "group": [
                self.test_group_create, self.test_group_info, self.test_group_join,
                self.test_group_add_members, self.test_group_members, self.test_group_update_info,
                self.test_group_set_admin, self.test_group_get_user_role,
                self.test_group_internal_exists, self.test_group_internal_list,
                self.test_group_internal_is_member, self.test_group_internal_member_ids,
                self.test_group_quit, self.test_group_dismiss
            ],
            "message": [
                self.test_message_send_private, self.test_message_send_group,
                self.test_message_private_history, self.test_message_group_history,
                self.test_message_conversations, self.test_message_mark_read,
                self.test_message_retry_private, self.test_message_retry_group
            ],
            "im": [
                self.test_im_heartbeat, self.test_im_online_status, self.test_im_send_message, self.test_im_offline
            ],
            "all": [
                self.test_user_info, self.test_user_internal_exists, self.test_user_profile,
                self.test_user_online, self.test_user_heartbeat, self.test_user_online_status,
                self.test_search_user, self.test_test_hello, self.test_test_login,
                self.test_friend_request, self.test_friend_accept, self.test_friend_requests,
                self.test_friend_relation, self.test_friend_block, self.test_friend_blocked,
                self.test_friend_remark, self.test_friend_list, self.test_user_internal_friend_list,
                self.test_user_internal_is_friend,
                self.test_group_create, self.test_group_info, self.test_group_join,
                self.test_group_add_members, self.test_group_members, self.test_group_update_info,
                self.test_group_set_admin, self.test_group_get_user_role,
                self.test_group_internal_exists, self.test_group_internal_list,
                self.test_group_internal_is_member, self.test_group_internal_member_ids,
                self.test_message_send_private, self.test_message_send_group,
                self.test_message_private_history, self.test_message_group_history,
                self.test_message_conversations, self.test_message_mark_read,
                self.test_message_retry_private, self.test_message_retry_group,
                self.test_im_heartbeat, self.test_im_online_status, self.test_im_send_message,
                self.test_auth_parse, self.test_auth_refresh,
                self.test_auth_internal_issue_token, self.test_auth_internal_user_resource,
                self.test_auth_internal_validate_token, self.test_auth_internal_check_permission,
                self.test_auth_internal_revoke_token,
                self.test_im_offline, self.test_user_offline, self.test_group_quit, self.test_group_dismiss,
                self.test_friend_remove, self.test_friend_reject, self.test_auth_internal_revoke_user_tokens
            ]
        }
        
        tests = test_suites.get(test_suite, test_suites["all"])
        
        for test in tests:
            try:
                test()
            except Exception as e:
                print(f"测试执行异常: {e}")
        
        # 汇总结果
        self.print_summary()
        return True
    
    def print_summary(self):
        """打印测试汇总"""
        print(f"\n{'='*70}")
        print("测试结果汇总")
        print(f"{'='*70}")
        
        passed = sum(1 for r in self.results if r["status"] == "PASS")
        failed = sum(1 for r in self.results if r["status"] == "FAIL")
        skipped = sum(1 for r in self.results if r["status"] == "SKIP")
        total = len(self.results)
        
        print(f"总计: {total}")
        print(f"通过: {passed}")
        print(f"失败: {failed}")
        print(f"跳过: {skipped}")
        
        if total > 0:
            pass_rate = passed / total * 100
            print(f"通过率: {pass_rate:.1f}%")
            
            if pass_rate >= 80:
                print("\n测试评估: 优秀")
            elif pass_rate >= 60:
                print("\n测试评估: 良好")
            elif pass_rate >= 40:
                print("\n测试评估: 一般")
            else:
                print("\n测试评估: 需改进")
        
        # 保存报告
        report_file = f"test_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_file, "w", encoding="utf-8") as f:
            json.dump({
                "summary": {
                    "total": total,
                    "passed": passed,
                    "failed": failed,
                    "skipped": skipped,
                    "pass_rate": f"{passed/total*100:.1f}%" if total > 0 else "N/A"
                },
                "tests": self.results
            }, f, ensure_ascii=False, indent=2)
        print(f"\n报告已保存: {report_file}")


def main():
    parser = argparse.ArgumentParser(description="IM项目测试脚本")
    parser.add_argument("--mode", "-m", choices=["gateway", "direct"], default="gateway",
                       help="测试模式: gateway(通过网关) 或 direct(直接调用)")
    parser.add_argument("--service", "-s", choices=["auth", "user", "friend", "group", "message", "im", "file", "all"],
                       default="all", help="测试服务类型")
    parser.add_argument("--username", "-u", default="testuser", help="测试用户名")
    parser.add_argument("--password", "-p", default="password123", help="测试密码")
    
    args = parser.parse_args()
    
    runner = IMTestRunner(mode=args.mode)
    runner.username = args.username
    runner.password = args.password
    
    success = runner.run_tests(test_suite=args.service)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
