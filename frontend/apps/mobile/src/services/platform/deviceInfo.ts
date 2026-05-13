import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

export const deviceInfo = {
  async getDeviceSummary() {
    return {
      platform: Platform.OS,
      appVersion: DeviceInfo.getVersion(),
      version: String(Platform.Version),
      brand: await DeviceInfo.getBrand(),
      model: await DeviceInfo.getModel(),
      systemVersion: await DeviceInfo.getSystemVersion(),
      uniqueId: await DeviceInfo.getUniqueId(),
      isEmulator: await DeviceInfo.isEmulator(),
    };
  },
};
