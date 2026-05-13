/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerNotificationBackgroundHandlers } from './src/services/notification/notificationService';

registerNotificationBackgroundHandlers();
AppRegistry.registerComponent(appName, () => App);
