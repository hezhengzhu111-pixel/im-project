"""Split auth_api.rs into sub-modules."""
import re, os

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "src")
MOD_RS = SRC  # auth_api.rs is directly in src/

with open(os.path.join(SRC, "auth_api.rs"), encoding="utf-8") as f:
    lines = f.readlines()

FN_RE = re.compile(r'^(?:(?:pub(?:\(crate\))?(?:\s+async)?|async)\s+)?fn\s+(\w+)')
STRUCT_RE = re.compile(r'^(?:pub(?:\(crate\))?\s+)?struct\s+(\w+)')
IMPL_RE = re.compile(r'^impl\s+(\w+)')

all_defs = []
for i, line in enumerate(lines):
    m = FN_RE.match(line)
    if m: all_defs.append((i, "fn", m.group(1)))
    m = STRUCT_RE.match(line)
    if m: all_defs.append((i, "struct", m.group(1)))
    m = IMPL_RE.match(line)
    if m: all_defs.append((i, "impl", m.group(1)))
    if line.strip() == '#[cfg(test)]':
        all_defs.append((i, "test_mod", "tests"))

def find_end(start):
    brace_depth = 0; started = False
    for i in range(start, len(lines)):
        brace_depth += lines[i].count('{') - lines[i].count('}')
        if '{' in lines[i]: started = True
        if started and brace_depth == 0:
            while i + 1 < len(lines) and lines[i+1].strip() == '': i += 1
            return i + 1
    return len(lines)

def_ranges = {name: (idx, find_end(idx)) for idx, kind, name in all_defs}

# Map every definition to a target module
TARGETS = {
    # Types
    "TokenPairDto": "types", "RefreshResponseDto": "types", "TokenParseResultDto": "types",
    "TokenParseResultDto": "types", "AuthIntrospectResultDto": "types",
    "AuthUserResourceDto": "types", "IssueTokenRequest": "types",
    "RefreshTokenRequest": "types", "ParseTokenRequest": "types",
    "CheckPermissionRequest": "types", "PermissionCheckResultDto": "types",
    "RevokeTokenRequest": "types", "TokenRevokeResultDto": "types",
    "WsTicketDto": "types", "ConsumeWsTicketRequest": "types",
    "WsTicketConsumeResultDto": "types",

    # Token operations
    "refresh": "token", "parse": "token", "issue_token_pair": "token",
    "refresh_token_pair": "token", "validate_access_token_result": "token",
    "build_token": "token", "parse_token": "token",
    "internal_issue_token": "token", "internal_revoke_token": "token",
    "internal_revoke_user_tokens": "token", "revoke_token": "token",
    "is_token_revoked": "token",

    # Internal APIs
    "internal_user_resource": "internal", "internal_validate_token": "internal",
    "internal_introspect": "internal", "internal_check_permission": "internal",
    "check_permission": "internal", "permission_result": "internal",
    "upsert_user_resource": "internal", "get_user_resource": "internal",

    # WS ticket
    "issue_ws_ticket": "ws", "internal_consume_ws_ticket": "ws",
    "invalid_ws_ticket": "ws", "parse_ws_ticket_payload": "ws",
    "resolve_ws_ticket_cookie_secure": "ws",

    # Helpers
    "internal_signature_headers": "helpers",
    "append_auth_cookies": "helpers", "expire_auth_cookies": "helpers",
    "body_text": "helpers", "optional_json": "helpers", "required_json": "helpers",
    "cookie_value": "helpers", "append_cookie": "helpers", "expire_cookie": "helpers",
    "normalize_cookie_path": "helpers", "normalize_same_site": "helpers",
    "resolve_cookie_secure": "helpers", "normalize_text": "helpers",
    "insert_value": "helpers", "serialize_option_i64_as_string": "helpers",
    "deserialize_option_i64": "helpers", "is_admin": "helpers",
    "header_value": "helpers", "null_to_default": "helpers",
    "TokenParseResultDto": "types",  # impl block
}

MODULE_NAMES = {
    "types": "auth_types", "token": "auth_token",
    "internal": "auth_internal", "ws": "auth_ws", "helpers": "auth_helpers",
}

# Original imports
ORIG_IMPORTS = ''.join(lines[0:42])  # lines 0-41

module_items = {tag: [] for tag in MODULE_NAMES}
test_start = None
for idx, kind, name in all_defs:
    if name == "tests":
        test_start = idx; continue
    target = TARGETS.get(name)
    if target and target in MODULE_NAMES:
        start, end = def_ranges[name]
        module_items[target].append((start, end, name))

# Write module files
for tag, filename in sorted(MODULE_NAMES.items()):
    items = module_items[tag]
    if not items: continue
    items.sort()
    path = os.path.join(SRC, f"{filename}.rs")
    with open(path, "w", encoding="utf-8") as f:
        f.write("use super::*;\n")
        f.write(ORIG_IMPORTS)
        f.write("\n")
        for start, end, name in items:
            actual_start = start
            j = start - 1
            while j >= 0:
                stripped = lines[j].strip()
                if stripped.startswith('///') or stripped.startswith('#['):
                    actual_start = j; j -= 1
                elif stripped == '' and j > 0:
                    prev = lines[j-1].strip()
                    if prev.startswith('///') or prev.startswith('#['):
                        actual_start = j; j -= 1
                    else: break
                else: break
            chunk = ''.join(lines[actual_start:end])
            f.write(chunk.strip() + '\n\n')
    with open(path, encoding="utf-8") as fp:
        print(f'  {filename}.rs: {len(fp.readlines())} lines')

# Write test file
if test_start:
    tests_end = len(lines)
    test_content = ''.join(lines[test_start:tests_end])
    path = os.path.join(SRC, "auth_tests.rs")
    with open(path, "w", encoding="utf-8") as f:
        f.write(test_content)
    with open(path, encoding="utf-8") as fp:
        print(f'  auth_tests.rs: {len(fp.readlines())} lines')

# Backup and remove original
os.rename(os.path.join(SRC, "auth_api.rs"), os.path.join(SRC, "auth_api.rs.bak"))
print("  Backed up auth_api.rs")
print("Done!")
