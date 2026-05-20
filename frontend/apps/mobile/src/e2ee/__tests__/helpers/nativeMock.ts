import { NativeModules } from 'react-native';

export type NativeRustE2eeModuleMock = {
  generatePreKeyBundle: jest.Mock;
  createOutboundSession: jest.Mock;
  createInboundSession: jest.Mock;
  encrypt: jest.Mock;
  decrypt: jest.Mock;
  exportSession: jest.Mock;
  restoreSession: jest.Mock;
  removeSession: jest.Mock;
};

export const installNativeModule = (): NativeRustE2eeModuleMock => {
  const module: NativeRustE2eeModuleMock = {
    generatePreKeyBundle: jest.fn(),
    createOutboundSession: jest.fn(),
    createInboundSession: jest.fn(async () => undefined),
    encrypt: jest.fn(),
    decrypt: jest.fn(),
    exportSession: jest.fn(),
    restoreSession: jest.fn(),
    removeSession: jest.fn(),
  };
  (NativeModules as Record<string, unknown>).RustE2eeModule = module;
  return module;
};

export const uninstallNativeModule = (): void => {
  delete (NativeModules as Record<string, unknown>).RustE2eeModule;
};
