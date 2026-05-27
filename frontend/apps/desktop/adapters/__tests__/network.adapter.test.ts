import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { listen } from "@tauri-apps/api/event";
import { TauriNetworkStatusAdapter } from "../network.adapter";

const mockListen = vi.mocked(listen);

describe("TauriNetworkStatusAdapter", () => {
  const adapter = new TauriNetworkStatusAdapter();
  beforeEach(() => vi.clearAllMocks());

  it("isConnected returns true by default", () => {
    expect(adapter.isConnected()).toBe(true);
  });

  it("onOnline registers callback", () => {
    adapter.onOnline(() => {});
    expect(mockListen).toHaveBeenCalled();
  });
});
