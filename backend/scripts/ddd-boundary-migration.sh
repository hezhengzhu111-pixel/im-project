#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(pwd)}"
BACKEND="$ROOT/backend"

USER_SRC="$BACKEND/user-service/src/main/java/com/im/user/entity"
USER_DST="$BACKEND/user-service/src/main/java/com/im/entity"
MSG_SRC="$BACKEND/message-service/src/main/java/com/im/message/entity"
MSG_DST="$BACKEND/message-service/src/main/java/com/im/entity"
GROUP_SRC="$BACKEND/group-service/src/main/java/com/im/group/entity"
GROUP_DST="$BACKEND/group-service/src/main/java/com/im/entity"

COMMON_ENTITY_DIR="$BACKEND/common/src/main/java/com/im/entity"
COMMON_CONFIG_FILE="$BACKEND/common/src/main/java/com/im/config/MybatisPlusConfig.java"

mkdir -p "$USER_DST" "$MSG_DST" "$GROUP_DST"

move_if_exists() {
  local src="$1"
  local dst="$2"
  if [[ -f "$src" ]]; then
    mv "$src" "$dst"
    echo "moved: $src -> $dst"
  else
    echo "skip missing: $src"
  fi
}

remove_if_exists() {
  local path="$1"
  if [[ -e "$path" ]]; then
    rm -rf "$path"
    echo "removed: $path"
  else
    echo "skip missing: $path"
  fi
}

replace_imports() {
  local old_import="$1"
  local new_import="$2"
  find "$BACKEND" -type f -name "*.java" -print0 | while IFS= read -r -d '' file; do
    if grep -q "$old_import" "$file"; then
      sed -i "s#${old_import}#${new_import}#g" "$file"
      echo "updated import in: $file"
    fi
  done
}

echo "== 1. 用户域实体归位 =="
move_if_exists "$USER_SRC/User.java" "$USER_DST/User.java"
move_if_exists "$USER_SRC/Friend.java" "$USER_DST/Friend.java"
move_if_exists "$USER_SRC/FriendRequest.java" "$USER_DST/FriendRequest.java"

echo "== 2. 消息域实体归位 =="
move_if_exists "$MSG_SRC/Message.java" "$MSG_DST/Message.java"
move_if_exists "$MSG_SRC/MessageReadStatus.java" "$MSG_DST/MessageReadStatus.java"

echo "== 3. 群组域实体归位 =="
move_if_exists "$GROUP_SRC/Group.java" "$GROUP_DST/Group.java"
move_if_exists "$GROUP_SRC/GroupMember.java" "$GROUP_DST/GroupMember.java"

echo "== 4. 可选：一并处理仓库中同域重复实体 =="
move_if_exists "$USER_SRC/UserSettings.java" "$USER_DST/UserSettings.java"
move_if_exists "$MSG_SRC/GroupReadCursor.java" "$MSG_DST/GroupReadCursor.java"
move_if_exists "$MSG_SRC/MessageOutboxEvent.java" "$MSG_DST/MessageOutboxEvent.java"

echo "== 5. import 批量替换 =="
replace_imports "com.im.user.entity.User" "com.im.entity.User"
replace_imports "com.im.user.entity.Friend" "com.im.entity.Friend"
replace_imports "com.im.user.entity.FriendRequest" "com.im.entity.FriendRequest"
replace_imports "com.im.user.entity.UserSettings" "com.im.entity.UserSettings"

replace_imports "com.im.message.entity.MessageReadStatus" "com.im.entity.MessageReadStatus"
replace_imports "com.im.message.entity.MessageOutboxEvent" "com.im.entity.MessageOutboxEvent"
replace_imports "com.im.message.entity.GroupReadCursor" "com.im.entity.GroupReadCursor"
replace_imports "com.im.message.entity.Message" "com.im.entity.Message"

replace_imports "com.im.group.entity.GroupMember" "com.im.entity.GroupMember"
replace_imports "com.im.group.entity.Group" "com.im.entity.Group"

replace_imports "com.im.entity.BaseEntity" "com.im.persistence.entity.BaseEntity"

echo "== 6. 删除旧包目录（仅当已迁空） =="
remove_if_exists "$USER_SRC"
remove_if_exists "$MSG_SRC"
remove_if_exists "$GROUP_SRC"

echo "== 7. 删除 common 残留持久化类/配置 =="
remove_if_exists "$COMMON_ENTITY_DIR/BaseEntity.java"
remove_if_exists "$COMMON_CONFIG_FILE"

cat <<'EOF'
完成：
1. 已将服务前缀实体包归位到各服务的 com.im.entity 包。
2. 已批量替换旧 import 到新包路径。
3. 已清理 common 中残留的 BaseEntity / MybatisPlusConfig（若存在）。

建议后续执行：
- 运行 IDE optimize imports / reformat
- 编译并验证 user-service / message-service / group-service
- 再次搜索是否残留 com.im.user.entity / com.im.message.entity / com.im.group.entity
EOF
