import { logger, redactSensitiveValue } from './logger';

describe('logger', () => {
  beforeEach(() => {
    logger.clear();
  });

  test('redacts sensitive data in strings and objects', () => {
    logger.error('auth', 'login failed token=plain-token', {
      accessToken: 'plain-token',
      cookie: 'session=abc',
      password: 'pass-123',
      authorization: 'Bearer super-secret-token',
      nested: {
        refreshToken: 'refresh-secret',
      },
      safe: 'visible',
    });

    const exported = logger.exportText();

    expect(exported).toContain('[REDACTED]');
    expect(exported).not.toContain('plain-token');
    expect(exported).not.toContain('session=abc');
    expect(exported).not.toContain('pass-123');
    expect(exported).not.toContain('super-secret-token');
    expect(exported).not.toContain('refresh-secret');
    expect(exported).toContain('visible');
  });

  test('redactSensitiveValue masks bearer tokens', () => {
    expect(redactSensitiveValue('Authorization: Bearer abc.def.ghi')).toBe('Authorization: Bearer [REDACTED]');
  });
});
