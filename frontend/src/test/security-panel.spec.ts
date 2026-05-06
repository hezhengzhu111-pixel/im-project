import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SecurityPanel from "@/components/security/SecurityPanel.vue";

describe("SecurityPanel", () => {
  it("emits enable-encryption when enable button is clicked", async () => {
    const wrapper = mount(SecurityPanel, {
      props: {
        status: "plaintext",
        canEnable: true,
      },
      global: {
        stubs: {
          "el-icon": true,
        },
      },
    });

    await wrapper.find("button.enable-button").trigger("click");

    expect(wrapper.emitted("enable-encryption")).toHaveLength(1);
  });
});
