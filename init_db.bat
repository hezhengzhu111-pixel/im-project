#!/bin/bash
# 执行初始化SQL

echo "执行数据库初始化..."

# 执行SQL脚本
docker exec -i im-mysql mysql -uappuser -papp123456 < ./backend/sql/mysql8/init_all.sql

echo "数据库初始化完成！"
echo "检查表..."
docker exec im-mysql mysql -uappuser -papp123456 -e "SHOW DATabases;" | grep -E "(service_user|service_group|service_message|im_db)"
