export const assertPlaintextSendAllowed = jest.fn();
export const blockEncryptedPendingPayload = jest.fn(() => false);
export const maskEncryptedMessage = jest.fn((msg: unknown) => msg);
