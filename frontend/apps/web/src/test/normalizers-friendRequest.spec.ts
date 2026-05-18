/**
 * Tests for the `extractFriendRequestList` function re-exported from @/normalizers/friendRequest.
 *
 * The web normalizer is a re-export from @im/shared-normalizers. These tests
 * cover both re-export identity and the functional behavior of list extraction
 * from various response shapes.
 */
import { describe, it, expect } from 'vitest';
import { extractFriendRequestList as webExtractFriendRequestList } from '@/normalizers/friendRequest';
import { extractFriendRequestList as sharedExtractFriendRequestList } from '@im/shared-normalizers';

describe('normalizers/friendRequest: re-export identity', () => {
  it('extractFriendRequestList is the same reference as @im/shared-normalizers', () => {
    expect(webExtractFriendRequestList).toBe(sharedExtractFriendRequestList);
  });

  it('produces identical output for the same input', () => {
    const raw = { data: { list: [{ id: '1' }, { id: '2' }] } };
    expect(webExtractFriendRequestList(raw)).toEqual(
      sharedExtractFriendRequestList(raw),
    );
  });
});

describe('extractFriendRequestList', () => {
  it('returns array input directly', () => {
    const arr = [
      { id: '1', applicantId: 'u1' },
      { id: '2', applicantId: 'u2' },
    ];
    expect(webExtractFriendRequestList(arr)).toBe(arr);
  });

  it('extracts from content field', () => {
    const content = [{ id: '1' }, { id: '2' }];
    expect(webExtractFriendRequestList({ content })).toEqual(content);
  });

  it('extracts from records field', () => {
    const records = [{ id: '1' }];
    expect(webExtractFriendRequestList({ records })).toEqual(records);
  });

  it('extracts from list field', () => {
    const list = [{ id: '1' }];
    expect(webExtractFriendRequestList({ list })).toEqual(list);
  });

  it('extracts from items field', () => {
    const items = [{ id: '1' }];
    expect(webExtractFriendRequestList({ items })).toEqual(items);
  });

  it('prioritizes content over records when both present', () => {
    const content = [{ id: 'content' }];
    const records = [{ id: 'records' }];
    expect(webExtractFriendRequestList({ content, records })).toEqual(content);
  });

  it('extracts from data.content when data is object', () => {
    const arr = [{ id: '1' }];
    expect(webExtractFriendRequestList({ data: { content: arr } })).toEqual(arr);
  });

  it('extracts from data.records when data is object', () => {
    const arr = [{ id: '1' }];
    expect(webExtractFriendRequestList({ data: { records: arr } })).toEqual(arr);
  });

  it('extracts from data.list when data is object', () => {
    const arr = [{ id: '1' }];
    expect(webExtractFriendRequestList({ data: { list: arr } })).toEqual(arr);
  });

  it('extracts from data.items when data is object', () => {
    const arr = [{ id: '1' }];
    expect(webExtractFriendRequestList({ data: { items: arr } })).toEqual(arr);
  });

  it('returns data directly when data is an array', () => {
    const arr = [{ id: '1' }];
    expect(webExtractFriendRequestList({ data: arr })).toEqual(arr);
  });

  it('returns empty array for null input', () => {
    expect(webExtractFriendRequestList(null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(webExtractFriendRequestList(undefined)).toEqual([]);
  });

  it('returns empty array for empty object', () => {
    expect(webExtractFriendRequestList({})).toEqual([]);
  });

  it('returns empty array for non-object non-array input', () => {
    expect(webExtractFriendRequestList('string')).toEqual([]);
    expect(webExtractFriendRequestList(123)).toEqual([]);
    expect(webExtractFriendRequestList(true)).toEqual([]);
  });

  it('returns empty array when data has no list-like field', () => {
    expect(webExtractFriendRequestList({ data: { name: 'test' } })).toEqual([]);
  });

  it('returns empty array when data is a string', () => {
    expect(webExtractFriendRequestList({ data: 'not-an-array' })).toEqual([]);
  });

  it('extracts from nested data.content when content is empty and data has content', () => {
    // Edge case: top-level content is empty string, but data.content has array
    const arr = [{ id: 'deep' }];
    expect(webExtractFriendRequestList({ content: '', data: { content: arr } })).toEqual(arr);
  });

  it('handles deeply nested API response shape', () => {
    // Simulates: { code: 200, data: { records: [...] } }
    const records = [
      { id: 'r1', applicantId: 'a1', status: 'PENDING' },
      { id: 'r2', applicantId: 'a2', status: 'ACCEPTED' },
    ];
    const result = webExtractFriendRequestList({
      code: 200,
      message: 'success',
      data: { records },
    });
    expect(result).toEqual(records);
    expect(result).toHaveLength(2);
  });

  it('returns first non-empty array field when multiple present', () => {
    const list = [{ id: 'list1' }];
    const items = [{ id: 'item1' }];
    // content is checked first
    const result = webExtractFriendRequestList({
      content: list,
      items,
    });
    expect(result).toEqual(list);
  });

  it('handles empty arrays in fields', () => {
    expect(webExtractFriendRequestList({ content: [], records: [] })).toEqual([]);
    expect(webExtractFriendRequestList({ data: { list: [] } })).toEqual([]);
  });
});
