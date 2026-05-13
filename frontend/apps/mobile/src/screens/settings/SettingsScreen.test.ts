import { getSettingsItems } from './SettingsScreen';

describe('SettingsScreen', () => {
  test('shows debug diagnostics entry only when debug diagnostics are enabled', () => {
    expect(getSettingsItems(true).some(([label]) => label === 'Debug Diagnostics')).toBe(true);
    expect(getSettingsItems(false).some(([label]) => label === 'Debug Diagnostics')).toBe(false);
  });
});
