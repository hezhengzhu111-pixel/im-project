import 'package:flutter/material.dart';

class ContactsPage extends StatelessWidget {
  const ContactsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Column(
        children: [
          const TabBar(tabs: [Tab(text: '好友'), Tab(text: '请求')]),
          Expanded(
            child: TabBarView(
              children: [
                ListView.builder(
                  itemCount: 0,
                  itemBuilder: (context, index) => const ListTile(title: Text('好友')),
                ),
                ListView.builder(
                  itemCount: 0,
                  itemBuilder: (context, index) => const ListTile(title: Text('请求')),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
