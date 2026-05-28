import 'package:test/test.dart';
import 'package:im_core/core.dart';

void main() {
  group('UserSettings', () {
    test('fromJson creates UserSettings with nested objects', () {
      final json = {
        'general': {
          'language': 'zh-CN',
          'theme': 'dark',
          'fontSize': '14',
          'autoLogin': true,
          'minimizeOnStart': false,
        },
        'privacy': {
          'allowStrangerAdd': true,
          'showOnlineStatus': false,
          'allowViewMoments': true,
          'messageReadReceipt': true,
        },
        'message': {
          'enableNotification': true,
          'enableSound': false,
          'enableVibration': true,
          'muteGroupMessages': false,
          'autoDownloadImages': true,
        },
        'notifications': {
          'sound': true,
          'desktop': true,
          'preview': false,
        },
      };
      final settings = UserSettings.fromJson(json);

      expect(settings.general.language, 'zh-CN');
      expect(settings.general.theme, 'dark');
      expect(settings.general.fontSize, '14');
      expect(settings.general.autoLogin, isTrue);
      expect(settings.general.minimizeOnStart, isFalse);

      expect(settings.privacy.allowStrangerAdd, isTrue);
      expect(settings.privacy.showOnlineStatus, isFalse);
      expect(settings.privacy.allowViewMoments, isTrue);
      expect(settings.privacy.messageReadReceipt, isTrue);

      expect(settings.message.enableNotification, isTrue);
      expect(settings.message.enableSound, isFalse);
      expect(settings.message.enableVibration, isTrue);
      expect(settings.message.muteGroupMessages, isFalse);
      expect(settings.message.autoDownloadImages, isTrue);

      expect(settings.notifications.sound, isTrue);
      expect(settings.notifications.desktop, isTrue);
      expect(settings.notifications.preview, isFalse);
    });

    test('equality works correctly', () {
      const s1 = UserSettings(
        general: GeneralSettings(
          language: 'en',
          theme: 'light',
          fontSize: '14',
          autoLogin: true,
          minimizeOnStart: false,
        ),
        privacy: PrivacySettings(
          allowStrangerAdd: true,
          showOnlineStatus: true,
          allowViewMoments: true,
          messageReadReceipt: true,
        ),
        message: MessagePreferenceSettings(
          enableNotification: true,
          enableSound: true,
          enableVibration: true,
          muteGroupMessages: false,
          autoDownloadImages: true,
        ),
        notifications: NotificationSettings(
          sound: true,
          desktop: true,
          preview: true,
        ),
      );
      const s2 = UserSettings(
        general: GeneralSettings(
          language: 'en',
          theme: 'light',
          fontSize: '14',
          autoLogin: true,
          minimizeOnStart: false,
        ),
        privacy: PrivacySettings(
          allowStrangerAdd: true,
          showOnlineStatus: true,
          allowViewMoments: true,
          messageReadReceipt: true,
        ),
        message: MessagePreferenceSettings(
          enableNotification: true,
          enableSound: true,
          enableVibration: true,
          muteGroupMessages: false,
          autoDownloadImages: true,
        ),
        notifications: NotificationSettings(
          sound: true,
          desktop: true,
          preview: true,
        ),
      );

      expect(s1, equals(s2));
    });
  });

  group('GeneralSettings', () {
    test('fromJson creates GeneralSettings correctly', () {
      final json = {
        'language': 'zh-CN',
        'theme': 'dark',
        'fontSize': '16',
        'autoLogin': false,
        'minimizeOnStart': true,
      };
      final settings = GeneralSettings.fromJson(json);

      expect(settings.language, 'zh-CN');
      expect(settings.theme, 'dark');
      expect(settings.fontSize, '16');
      expect(settings.autoLogin, isFalse);
      expect(settings.minimizeOnStart, isTrue);
    });

    test('toJson roundtrip preserves data', () {
      const settings = GeneralSettings(
        language: 'en',
        theme: 'light',
        fontSize: '14',
        autoLogin: true,
        minimizeOnStart: false,
      );
      final json = settings.toJson();
      final restored = GeneralSettings.fromJson(json);

      expect(restored, equals(settings));
    });
  });

  group('PrivacySettings', () {
    test('fromJson creates PrivacySettings correctly', () {
      final json = {
        'allowStrangerAdd': false,
        'showOnlineStatus': true,
        'allowViewMoments': false,
        'messageReadReceipt': true,
      };
      final settings = PrivacySettings.fromJson(json);

      expect(settings.allowStrangerAdd, isFalse);
      expect(settings.showOnlineStatus, isTrue);
      expect(settings.allowViewMoments, isFalse);
      expect(settings.messageReadReceipt, isTrue);
    });

    test('toJson roundtrip preserves data', () {
      const settings = PrivacySettings(
        allowStrangerAdd: true,
        showOnlineStatus: false,
        allowViewMoments: true,
        messageReadReceipt: false,
      );
      final json = settings.toJson();
      final restored = PrivacySettings.fromJson(json);

      expect(restored, equals(settings));
    });
  });

  group('MessagePreferenceSettings', () {
    test('fromJson creates MessagePreferenceSettings correctly', () {
      final json = {
        'enableNotification': false,
        'enableSound': true,
        'enableVibration': false,
        'muteGroupMessages': true,
        'autoDownloadImages': false,
      };
      final settings = MessagePreferenceSettings.fromJson(json);

      expect(settings.enableNotification, isFalse);
      expect(settings.enableSound, isTrue);
      expect(settings.enableVibration, isFalse);
      expect(settings.muteGroupMessages, isTrue);
      expect(settings.autoDownloadImages, isFalse);
    });

    test('toJson roundtrip preserves data', () {
      const settings = MessagePreferenceSettings(
        enableNotification: true,
        enableSound: false,
        enableVibration: true,
        muteGroupMessages: false,
        autoDownloadImages: true,
      );
      final json = settings.toJson();
      final restored = MessagePreferenceSettings.fromJson(json);

      expect(restored, equals(settings));
    });
  });

  group('NotificationSettings', () {
    test('fromJson creates NotificationSettings correctly', () {
      final json = {
        'sound': true,
        'desktop': false,
        'preview': true,
      };
      final settings = NotificationSettings.fromJson(json);

      expect(settings.sound, isTrue);
      expect(settings.desktop, isFalse);
      expect(settings.preview, isTrue);
    });

    test('toJson roundtrip preserves data', () {
      const settings = NotificationSettings(
        sound: false,
        desktop: true,
        preview: false,
      );
      final json = settings.toJson();
      final restored = NotificationSettings.fromJson(json);

      expect(restored, equals(settings));
    });
  });

  group('UserSettings toJson', () {
    test('toJson serializes nested objects as typed references', () {
      const settings = UserSettings(
        general: GeneralSettings(
          language: 'zh-CN',
          theme: 'dark',
          fontSize: '16',
          autoLogin: true,
          minimizeOnStart: false,
        ),
        privacy: PrivacySettings(
          allowStrangerAdd: false,
          showOnlineStatus: true,
          allowViewMoments: false,
          messageReadReceipt: true,
        ),
        message: MessagePreferenceSettings(
          enableNotification: false,
          enableSound: true,
          enableVibration: false,
          muteGroupMessages: true,
          autoDownloadImages: false,
        ),
        notifications: NotificationSettings(
          sound: true,
          desktop: false,
          preview: true,
        ),
      );
      final json = settings.toJson();

      expect(json['general'], isA<GeneralSettings>());
      expect(json['privacy'], isA<PrivacySettings>());
      expect(json['message'], isA<MessagePreferenceSettings>());
      expect(json['notifications'], isA<NotificationSettings>());

      final general = json['general'] as GeneralSettings;
      expect(general.language, 'zh-CN');
      expect(general.theme, 'dark');
      expect(general.autoLogin, true);

      final privacy = json['privacy'] as PrivacySettings;
      expect(privacy.allowStrangerAdd, false);
      expect(privacy.showOnlineStatus, true);
    });
  });
}
