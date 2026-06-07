import 'package:flutter/material.dart';
import 'package:im_ui/ui.dart';

class ComponentGalleryPage extends StatefulWidget {
  const ComponentGalleryPage({super.key});

  @override
  State<ComponentGalleryPage> createState() => _ComponentGalleryPageState();
}

class _ComponentGalleryPageState extends State<ComponentGalleryPage> {
  int _selectedIndex = 0;

  static const _sections = [
    'Button',
    'TextField',
    'Card',
    'Empty',
    'Avatar',
    'Badge',
    'Dialog',
    'NavItem',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Component Gallery')),
      body: Row(
        children: [
          NavigationRail(
            selectedIndex: _selectedIndex,
            onDestinationSelected: (i) => setState(() => _selectedIndex = i),
            labelType: NavigationRailLabelType.all,
            destinations: _sections
                .map((s) => NavigationRailDestination(
                      icon: const Icon(Icons.widgets),
                      label: Text(s),
                    ))
                .toList(),
          ),
          const VerticalDivider(width: 1),
          Expanded(child: _buildContent()),
        ],
      ),
    );
  }

  Widget _buildContent() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: _sectionWidgets[_selectedIndex],
    );
  }

  List<Widget> get _sectionWidgets => [
        _buttonSection(),
        _textFieldSection(),
        _cardSection(),
        _emptySection(),
        _avatarSection(),
        _badgeSection(),
        _dialogSection(),
        _navItemSection(),
      ];

  Widget _buttonSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImButton',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        const Text('Variants'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: ImButtonVariant.values.map((v) {
            return ImButton(variant: v, label: v.name);
          }).toList(),
        ),
        const SizedBox(height: 24),
        const Text('Sizes'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: ImButtonSize.values.map((s) {
            return ImButton(size: s, label: s.name);
          }).toList(),
        ),
        const SizedBox(height: 24),
        const Text('Loading'),
        const SizedBox(height: 8),
        const ImButton(label: 'Saving...', loading: true),
        const SizedBox(height: 24),
        const Text('Disabled'),
        const SizedBox(height: 8),
        const ImButton(label: 'Disabled'),
        const SizedBox(height: 24),
        const Text('Full Width'),
        const SizedBox(height: 8),
        const ImButton(label: 'Full Width', fullWidth: true),
      ],
    );
  }

  Widget _textFieldSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImTextField',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        const ImTextField(label: 'Username', hintText: 'Enter username'),
        const SizedBox(height: 16),
        const ImTextField(
          label: 'Password',
          hintText: 'Enter password',
          obscure: true,
        ),
        const SizedBox(height: 16),
        const ImTextField(
          label: 'Email',
          hintText: 'user@example.com',
          prefix: Icon(Icons.email),
        ),
        const SizedBox(height: 16),
        const ImTextField(
          label: 'With Error',
          hintText: 'Invalid input',
          errorText: 'This field is required',
        ),
        const SizedBox(height: 16),
        const ImTextField(
            label: 'Disabled', hintText: 'Cannot edit', enabled: false),
      ],
    );
  }

  Widget _cardSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImCard',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        const ImCard(child: Text('Default Card')),
        const SizedBox(height: 16),
        const ImCard(elevated: true, child: Text('Elevated Card')),
        const SizedBox(height: 16),
        ImCard(
          onTap: () => ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Card tapped!')),
          ),
          child: const Text('Tappable Card (click me)'),
        ),
      ],
    );
  }

  Widget _emptySection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImEmpty',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        const ImEmpty(icon: Icons.inbox, title: 'No messages'),
        const SizedBox(height: 16),
        const ImEmpty(
          icon: Icons.search_off,
          title: 'No results',
          subtitle: 'Try a different search term',
        ),
        const SizedBox(height: 16),
        ImEmpty(
          icon: Icons.folder_open,
          title: 'No files',
          action: ImButton(label: 'Upload', onPressed: () {}),
        ),
      ],
    );
  }

  Widget _avatarSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImAvatar',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        const Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            ImAvatar(name: 'Alice'),
            ImAvatar(name: 'Bob', size: 56),
            ImAvatar(name: 'Charlie', size: 72),
          ],
        ),
        const SizedBox(height: 24),
        const Text('With Status'),
        const SizedBox(height: 8),
        const Wrap(
          spacing: 16,
          children: [
            ImAvatar(name: 'Online User', showStatus: true, isOnline: true),
            ImAvatar(name: 'Offline User', showStatus: true, isOnline: false),
          ],
        ),
      ],
    );
  }

  Widget _badgeSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImBadge',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        const Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            ImBadge(count: 5),
            ImBadge(count: 150),
            ImBadge(count: 0),
            ImBadge(
              count: 3,
              child: Icon(Icons.mail, size: 32),
            ),
          ],
        ),
      ],
    );
  }

  Widget _dialogSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImDialog',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        Wrap(
          spacing: 8,
          children: [
            ImButton(
              label: 'Confirm Dialog',
              onPressed: () => ImDialog.show(
                context,
                title: 'Confirm Action',
                content: const Text('Are you sure you want to proceed?'),
                actions: [
                  ImDialogAction(label: 'Cancel', onPressed: () {}),
                  ImDialogAction(label: 'Confirm', onPressed: () {}),
                ],
              ),
            ),
            ImButton(
              label: 'Destructive Dialog',
              variant: ImButtonVariant.danger,
              onPressed: () => ImDialog.show(
                context,
                title: 'Delete Item',
                content: const Text('This action cannot be undone.'),
                actions: [
                  ImDialogAction(label: 'Cancel', onPressed: () {}),
                  ImDialogAction(
                    label: 'Delete',
                    isDestructive: true,
                    onPressed: () {},
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _navItemSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImNavItem',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        Row(
          children: [
            ImNavItem(
              icon: Icons.chat,
              label: 'Chat',
              isSelected: true,
              onTap: () {},
            ),
            ImNavItem(
              icon: Icons.people,
              label: 'Contacts',
              badge: 5,
              onTap: () {},
            ),
            ImNavItem(
              icon: Icons.settings,
              label: 'Settings',
              onTap: () {},
            ),
          ],
        ),
      ],
    );
  }
}
