import { isRecord } from "@/types/utils";

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const firstNonEmptyArray = (...values: unknown[]): unknown[] => {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
};

export const extractFriendRequestList = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) {
    return raw;
  }

  const record = isRecord(raw) ? raw : {};
  const directList = firstNonEmptyArray(
    record.content,
    record.records,
    record.list,
    record.items,
  );
  if (directList.length > 0) {
    return directList;
  }

  const data = isRecord(record.data) ? record.data : record.data;
  if (Array.isArray(data)) {
    return data;
  }
  if (isRecord(data)) {
    return firstNonEmptyArray(
      data.content,
      data.records,
      data.list,
      data.items,
    );
  }

  return asArray(data);
};
