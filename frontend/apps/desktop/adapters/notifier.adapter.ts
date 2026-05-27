import type { NotifierPort } from "@im/shared-platform-ports";

export class NotImplementedNotifierAdapter implements NotifierPort {
  notify(): void {
    throw new Error("NotifierPort.notify not implemented for desktop");
  }
}
