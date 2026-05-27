import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_core/core.dart';

class AddFriendPage extends ConsumerStatefulWidget {
  const AddFriendPage({super.key});

  @override
  ConsumerState<AddFriendPage> createState() => _AddFriendPageState();
}

class _AddFriendPageState extends ConsumerState<AddFriendPage> {
  final _searchController = TextEditingController();
  Timer? _debounce;
  List<User> _results = [];
  bool _isSearching = false;
  String? _error;

  @override
  void dispose() {
    _searchController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String keyword) {
    _debounce?.cancel();
    if (keyword.trim().isEmpty) {
      setState(() {
        _results = [];
        _error = null;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 500), () {
      _performSearch(keyword.trim());
    });
  }

  Future<void> _performSearch(String keyword) async {
    setState(() {
      _isSearching = true;
      _error = null;
    });
    try {
      final api = ref.read(contactsApiProvider);
      final results = await api.searchUsers(keyword);
      if (mounted) {
        setState(() {
          _results = results;
          _isSearching = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isSearching = false;
          _error = '搜索失败，请重试';
        });
      }
    }
  }

  Future<void> _sendRequest(User user) async {
    try {
      final api = ref.read(contactsApiProvider);
      await api.sendFriendRequest(user.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('已向 ${user.nickname ?? user.username} 发送好友请求')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('发送请求失败，请重试')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('添加好友'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              onChanged: _onSearchChanged,
              decoration: InputDecoration(
                hintText: '搜索用户名或昵称',
                prefixIcon: const Icon(Icons.search),
                border: const OutlineInputBorder(),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchController.clear();
                          setState(() {
                            _results = [];
                            _error = null;
                          });
                        },
                      )
                    : null,
              ),
            ),
          ),
          if (_isSearching)
            const Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          if (!_isSearching &&
              _error == null &&
              _results.isEmpty &&
              _searchController.text.isNotEmpty)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Text('未找到匹配的用户', style: TextStyle(color: Colors.grey)),
            ),
          if (!_isSearching && _error == null && _results.isEmpty && _searchController.text.isEmpty)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Text('输入关键词搜索用户', style: TextStyle(color: Colors.grey)),
            ),
          Expanded(
            child: ListView.builder(
              itemCount: _results.length,
              itemBuilder: (context, index) {
                final user = _results[index];
                return ListTile(
                  leading: CircleAvatar(
                    backgroundImage: user.avatar != null
                        ? NetworkImage(user.avatar!)
                        : null,
                    child: user.avatar == null
                        ? Text(
                            (user.nickname ?? user.username)
                                .substring(0, 1)
                                .toUpperCase(),
                            style: const TextStyle(fontSize: 16),
                          )
                        : null,
                  ),
                  title: Text(
                    user.nickname ?? user.username,
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                  subtitle: Text('@${user.username}'),
                  trailing: FilledButton.tonal(
                    onPressed: () => _sendRequest(user),
                    child: const Text('添加'),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
