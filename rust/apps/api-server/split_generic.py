"""Generic file splitter — handles all remaining files."""
import re, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "src")

def split_file(rel_path, targets, module_names, import_end=None):
    """Split a .rs file into sub-modules.

    rel_path: relative path from SRC, e.g. 'social.rs' or 'e2ee/session_api.rs'
    targets: dict of {definition_name: module_tag}
    module_names: dict of {module_tag: filename_base}
    import_end: optional override for imports boundary
    """
    filepath = os.path.join(SRC, rel_path)
    out_dir = os.path.dirname(filepath)

    with open(filepath, encoding="utf-8") as f:
        lines = f.readlines()

    FN_RE = re.compile(r'^(?:(?:pub(?:\(crate\))?(?:\s+async)?|async)\s+)?fn\s+(\w+)')
    STRUCT_RE = re.compile(r'^(?:pub(?:\(crate\))?\s+)?struct\s+(\w+)')
    ENUM_RE = re.compile(r'^(?:pub(?:\(crate\))?\s+)?enum\s+(\w+)')
    IMPL_RE = re.compile(r'^impl\s+(\w+)')

    # Auto-detect import_end if not provided
    if import_end is None:
        for i, line in enumerate(lines):
            if i > 15 and (line.strip().startswith('///') or line.strip().startswith('#[derive')):
                import_end = i
                break
    if import_end is None:
        import_end = 20  # fallback

    # Find definitions with correct brace depth
    brace_depth = 0
    all_defs = []
    for i, line in enumerate(lines):
        prev_depth = brace_depth
        brace_depth += line.count('{') - line.count('}')
        if prev_depth == 0 and i >= import_end:
            m = FN_RE.match(line)
            if m: all_defs.append((i, 'fn', m.group(1))); continue
            m = STRUCT_RE.match(line)
            if m: all_defs.append((i, 'struct', m.group(1))); continue
            m = ENUM_RE.match(line)
            if m: all_defs.append((i, 'enum', m.group(1))); continue
            m = IMPL_RE.match(line)
            if m: all_defs.append((i, 'impl', m.group(1))); continue

    def find_end(start):
        brace_depth = 0; started = False
        for i in range(start, len(lines)):
            brace_depth += lines[i].count('{') - lines[i].count('}')
            if '{' in lines[i]: started = True
            if started and brace_depth == 0:
                while i + 1 < len(lines) and lines[i+1].strip() == '': i += 1
                return i + 1
        return len(lines)

    # Unique keys: name_lineNumber
    def_ranges = {}
    for idx, kind, name in all_defs:
        key = f'{name}_{idx}'
        def_ranges[key] = (name, kind, idx, find_end(idx))

    # Group by module
    module_items = {tag: [] for tag in module_names}
    for key, (name, kind, idx, end) in def_ranges.items():
        target = targets.get(name)
        if target and target in module_names:
            module_items[target].append((name, kind, idx, end))

    # Write modules
    imps = ''.join(lines[0:import_end])
    for tag, fn in sorted(module_names.items()):
        items = module_items[tag]
        if not items: print(f'  {fn}: SKIP'); continue
        items.sort(key=lambda x: x[2])
        path = os.path.join(out_dir, f'{fn}.rs')
        with open(path, 'w', encoding='utf-8') as f:
            if not tag.startswith('types'): f.write('use super::*;\n')
            f.write(imps)
            f.write('\n')
            for name, kind, idx, end in items:
                actual_start = idx
                j = idx - 1
                while j >= import_end:
                    s = lines[j].strip()
                    if s.startswith('///') or s.startswith('#['):
                        actual_start = j; j -= 1
                    elif s == '' and j > import_end and (lines[j-1].strip().startswith('///') or lines[j-1].strip().startswith('#[')):
                        actual_start = j; j -= 1
                    else: break
                chunk = ''.join(lines[actual_start:end])
                f.write(chunk.strip() + '\n\n')
        with open(path, encoding='utf-8') as fp:
            print(f'  {fn}.rs: {len(fp.readlines())} lines')

    # Backup original
    bak = filepath + '.bak'
    if os.path.exists(bak):
        os.remove(bak)
    os.rename(filepath, bak)
    return module_items

def add_visibility(files):
    """Add pub(crate) to fn/struct/enum/impl definitions."""
    for f in files:
        if not os.path.exists(f): continue
        with open(f, encoding='utf-8') as fp:
            content = fp.read()
        # Only modify top-level items (at start of line)
        content = re.sub(r'^fn ', 'pub(crate) fn ', content, flags=re.MULTILINE)
        content = re.sub(r'^async fn ', 'pub(crate) async fn ', content, flags=re.MULTILINE)
        content = re.sub(r'^pub async fn ', 'pub(crate) async fn ', content, flags=re.MULTILINE)
        content = re.sub(r'^pub fn ', 'pub(crate) fn ', content, flags=re.MULTILINE)
        content = re.sub(r'^struct ', 'pub(crate) struct ', content, flags=re.MULTILINE)
        content = re.sub(r'^pub struct ', 'pub(crate) struct ', content, flags=re.MULTILINE)
        content = re.sub(r'^enum ', 'pub(crate) enum ', content, flags=re.MULTILINE)
        content = re.sub(r'^pub enum ', 'pub(crate) enum ', content, flags=re.MULTILINE)
        content = re.sub(r'^impl ', 'pub(crate) impl ', content, flags=re.MULTILINE)
        content = re.sub(r'^pub impl ', 'pub(crate) impl ', content, flags=re.MULTILINE)
        with open(f, 'w', encoding='utf-8') as fp:
            fp.write(content)

# ── Process social.rs ──
print("=== social.rs ===")
TARGETS = {
    'FriendshipDto': 'types', 'FriendRequestDto': 'types', 'AddFriendRequest': 'types',
    'HandleFriendRequest': 'types', 'GroupDto': 'types', 'GroupMemberDto': 'types',
    'GroupMembersResponse': 'types',
    'friend_list': 'friends', 'friend_requests': 'friends', 'add_friend': 'friends',
    'accept_friend': 'friends', 'reject_friend': 'friends', 'remove_friend': 'friends',
    'update_friend_remark': 'friends',
    'create_group': 'groups', 'user_groups': 'groups', 'search_groups': 'groups',
    'group_members': 'groups', 'join_group': 'groups', 'add_group_members': 'groups',
    'leave_group': 'groups', 'dismiss_group': 'groups', 'update_group': 'groups',
    'internal_group_member_ids': 'groups',
    'group_redis_for_group': 'helpers', 'friendship_from_row': 'helpers',
    'friend_request_from_row': 'helpers', 'group_from_row': 'helpers',
    'group_member_from_row': 'helpers', 'row_i32': 'helpers',
    'normalize_optional': 'helpers', 'query_i64': 'helpers', 'string_field': 'helpers',
    'value_to_i64': 'helpers', 'deserialize_i64': 'helpers', 'distinct': 'helpers',
}
MODULES = {'types': 'social_types', 'friends': 'social_friends', 'groups': 'social_groups', 'helpers': 'social_helpers'}
split_file('social.rs', TARGETS, MODULES)
files = [os.path.join(SRC, f'social_{t}.rs') for t in ['types','friends','groups','helpers']]
add_visibility(files)
