/**
 * Tests for the `normalizeAiApiKey` function re-exported from @/normalizers/ai.
 *
 * The web normalizer is a re-export from @im/shared-normalizers, so these tests
 * verify both the re-export identity and the functional behavior.
 */
import { describe, it, expect } from 'vitest';
import { normalizeAiApiKey as webNormalizeAiApiKey } from '@/normalizers/ai';
import { normalizeAiApiKey as sharedNormalizeAiApiKey } from '@im/shared-normalizers';

describe('normalizers/ai: re-export identity', () => {
  it('normalizeAiApiKey is the same reference as @im/shared-normalizers', () => {
    expect(webNormalizeAiApiKey).toBe(sharedNormalizeAiApiKey);
  });

  it('produces identical output for the same input', () => {
    const raw = {
      id: '1',
      provider: 'deepseek',
      keyName: 'My Key',
      maskedKey: 'sk-***',
      isActive: true,
      validateStatus: 'ok',
    };
    expect(webNormalizeAiApiKey(raw)).toEqual(sharedNormalizeAiApiKey(raw));
  });
});

describe('normalizeAiApiKey', () => {
  it('normalizes a full AI API key object', () => {
    const raw = {
      id: 'key_001',
      provider: 'deepseek',
      keyName: 'Production Key',
      maskedKey: 'sk-***abc',
      isActive: true,
      validateStatus: 'ok',
      lastValidatedAt: '2024-06-01T12:00:00Z',
    };

    const result = webNormalizeAiApiKey(raw);
    expect(result.id).toBe('key_001');
    expect(result.provider).toBe('deepseek');
    expect(result.keyName).toBe('Production Key');
    expect(result.maskedKey).toBe('sk-***abc');
    expect(result.isActive).toBe(true);
    expect(result.validateStatus).toBe('ok');
    expect(result.lastValidatedAt).toBe('2024-06-01T12:00:00Z');
  });

  it('handles missing optional field lastValidatedAt', () => {
    const raw = {
      id: 'key_002',
      provider: 'openai',
      keyName: 'Test Key',
      maskedKey: 'sk-***xyz',
      isActive: false,
      validateStatus: 'invalid',
    };

    const result = webNormalizeAiApiKey(raw);
    expect(result.id).toBe('key_002');
    expect(result.provider).toBe('openai');
    expect(result.isActive).toBe(false);
    expect(result.validateStatus).toBe('invalid');
    expect(result.lastValidatedAt).toBeUndefined();
  });

  it('handles null input gracefully', () => {
    const result = webNormalizeAiApiKey(null);
    expect(result.id).toBe('');
    expect(result.provider).toBe('');
    expect(result.keyName).toBe('');
    expect(result.maskedKey).toBe('');
    expect(result.isActive).toBe(false);
    expect(result.validateStatus).toBe('');
    expect(result.lastValidatedAt).toBeUndefined();
  });

  it('handles undefined input gracefully', () => {
    const result = webNormalizeAiApiKey(undefined);
    expect(result.id).toBe('');
    expect(result.provider).toBe('');
  });

  it('handles non-object input gracefully', () => {
    const result = webNormalizeAiApiKey('not an object');
    expect(result.id).toBe('');
    expect(result.provider).toBe('');
  });

  it('coerces numeric and boolean values', () => {
    const raw = {
      id: 12345,
      provider: 'minimax',
      keyName: 67890,
      maskedKey: true,
      isActive: 1,
      validateStatus: null,
    };

    const result = webNormalizeAiApiKey(raw);
    expect(result.id).toBe('12345');
    expect(result.provider).toBe('minimax');
    expect(result.keyName).toBe('67890');
    // asString converts boolean true to fallback empty string
    expect(result.maskedKey).toBe('');
    // asBoolean treats number 1 as true (1 !== 0)
    expect(result.isActive).toBe(true);
    // asString returns fallback '' for null
    expect(result.validateStatus).toBe('');
  });

  it('handles empty object input', () => {
    const result = webNormalizeAiApiKey({});
    expect(result.id).toBe('');
    expect(result.provider).toBe('');
    expect(result.keyName).toBe('');
    expect(result.maskedKey).toBe('');
    expect(result.isActive).toBe(false);
    expect(result.validateStatus).toBe('');
    expect(result.lastValidatedAt).toBeUndefined();
  });

  it('supports minimax provider', () => {
    const raw = {
      id: 'key_003',
      provider: 'minimax',
      keyName: 'MiniMax Key',
      maskedKey: 'mm-***789',
      isActive: true,
      validateStatus: 'insufficient',
    };

    const result = webNormalizeAiApiKey(raw);
    expect(result.provider).toBe('minimax');
    expect(result.validateStatus).toBe('insufficient');
  });

  it('handles isActive string coercion', () => {
    const rawTrue = {
      id: '1', provider: 'deepseek', keyName: 'k', maskedKey: 'm',
      isActive: 'true', validateStatus: 'ok',
    };
    const rawFalse = {
      id: '2', provider: 'deepseek', keyName: 'k', maskedKey: 'm',
      isActive: '', validateStatus: 'ok',
    };

    expect(webNormalizeAiApiKey(rawTrue).isActive).toBe(true);
    expect(webNormalizeAiApiKey(rawFalse).isActive).toBe(false);
  });
});
