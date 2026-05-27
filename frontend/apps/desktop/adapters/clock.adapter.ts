import type { ClockPort } from "@im/shared-platform-ports";

export class DateClockAdapter implements ClockPort {
  now(): Date {
    return new Date();
  }

  nowMs(): number {
    return Date.now();
  }
}
