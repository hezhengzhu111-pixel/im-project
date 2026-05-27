import type { LifecyclePort } from "@im/shared-platform-ports";

export class NotImplementedLifecycleAdapter implements LifecyclePort {
  onForeground(_callback: () => void): void {
    throw new Error("LifecyclePort.onForeground not implemented for desktop");
  }

  onBackground(_callback: () => void): void {
    throw new Error("LifecyclePort.onBackground not implemented for desktop");
  }
}
