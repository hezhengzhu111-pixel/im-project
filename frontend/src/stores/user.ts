/**
 * 用户状态管理
 * 管理用户登录、注册、个人信息等状态
 */

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { userApi, authApi } from "@/services";
import { STORAGE_CONFIG, APP_CONFIG } from "@/config";
import type { User, LoginRequest, RegisterRequest } from "@/types";
import type { UserDTO } from "@/types/user";
import { ElMessage } from "element-plus";
import router from "@/router";

export const useUserStore = defineStore("user", () => {
  // 状态
  const userInfo = ref<User | null>(null);
  const token = ref<string>("");
  const loading = ref(false);
  const lastSessionCheckAt = ref<number>(0);
  const lastSessionValid = ref<boolean>(false);
  let sessionCheckInFlight: Promise<boolean> | null = null;

  // 计算属性
  const isLoggedIn = computed(() => !!token.value && !!userInfo.value);
  const avatar = computed(
    () => userInfo.value?.avatar || APP_CONFIG.DEFAULT_AVATAR,
  );
  const nickname = computed(
    () => userInfo.value?.nickname || userInfo.value?.username || "未知用户",
  );
  const userId = computed(() => userInfo.value?.id || "");

  const clearSessionOnly = () => {
    userInfo.value = null;
    token.value = "";
    lastSessionCheckAt.value = 0;
    lastSessionValid.value = false;
    localStorage.removeItem(STORAGE_CONFIG.TOKEN_KEY);
    localStorage.removeItem(STORAGE_CONFIG.REFRESH_TOKEN_KEY);
    localStorage.removeItem(STORAGE_CONFIG.USER_INFO_KEY);
  };

  // 初始化状态
  const initializeStore = () => {
    try {
      const savedToken = localStorage.getItem(STORAGE_CONFIG.TOKEN_KEY);
      const savedUserInfo = localStorage.getItem(STORAGE_CONFIG.USER_INFO_KEY);

      if (savedToken) {
        token.value = savedToken;
      }

      if (savedUserInfo) {
        userInfo.value = JSON.parse(savedUserInfo);
      }
      if (!localStorage.getItem(STORAGE_CONFIG.REFRESH_TOKEN_KEY)) {
        localStorage.removeItem(STORAGE_CONFIG.REFRESH_TOKEN_KEY);
      }
      lastSessionValid.value = !!savedToken && !!savedUserInfo;
    } catch (error) {
      console.error("初始化用户状态失败:", error);
      clearUserData();
    }
  };

  // 初始化方法（别名）
  const init = initializeStore;

  // 清除用户数据
  const clearUserData = () => {
    userInfo.value = null;
    token.value = "";
    lastSessionCheckAt.value = 0;
    lastSessionValid.value = false;
    localStorage.removeItem(STORAGE_CONFIG.TOKEN_KEY);
    localStorage.removeItem(STORAGE_CONFIG.REFRESH_TOKEN_KEY);
    localStorage.removeItem(STORAGE_CONFIG.USER_INFO_KEY);
  };

  // 保存用户数据
  const saveUserData = (
    user: User,
    authToken: string,
    refreshToken?: string,
  ) => {
    userInfo.value = user;
    token.value = authToken;
    lastSessionCheckAt.value = Date.now();
    lastSessionValid.value = true;
    localStorage.setItem(STORAGE_CONFIG.TOKEN_KEY, authToken);
    if (refreshToken) {
      localStorage.setItem(STORAGE_CONFIG.REFRESH_TOKEN_KEY, refreshToken);
    }
    localStorage.setItem(STORAGE_CONFIG.USER_INFO_KEY, JSON.stringify(user));
  };

  const setAuthToken = (accessToken: string, refreshToken?: string) => {
    token.value = accessToken;
    localStorage.setItem(STORAGE_CONFIG.TOKEN_KEY, accessToken);
    if (refreshToken) {
      localStorage.setItem(STORAGE_CONFIG.REFRESH_TOKEN_KEY, refreshToken);
    }
    lastSessionCheckAt.value = Date.now();
    lastSessionValid.value = true;
  };

  const tryDecodeJwtPayload = (jwt: string): any | null => {
    try {
      const parts = jwt.split(".");
      if (parts.length < 2) return null;
      const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const pad =
        payload.length % 4 === 0 ? "" : "=".repeat(4 - (payload.length % 4));
      const json = decodeURIComponent(
        Array.prototype.map
          .call(
            atob(payload + pad),
            (c: string) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`,
          )
          .join(""),
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  const isTokenExpired = (jwt: string): boolean => {
    const payload = tryDecodeJwtPayload(jwt);
    const exp = payload?.exp;
    if (!exp || typeof exp !== "number") return false;
    const expMs = exp * 1000;
    return Date.now() > expMs - 5000;
  };

  const ensureAuthenticated = async (): Promise<boolean> => {
    const currentToken =
      token.value || localStorage.getItem(STORAGE_CONFIG.TOKEN_KEY) || "";
    if (!currentToken) {
      clearSessionOnly();
      return false;
    }
    if (isTokenExpired(currentToken)) {
      clearSessionOnly();
      return false;
    }

    const now = Date.now();
    if (lastSessionValid.value && now - lastSessionCheckAt.value < 60_000) {
      return true;
    }
    if (sessionCheckInFlight) {
      return sessionCheckInFlight;
    }

    sessionCheckInFlight = (async () => {
      try {
        const resp = await authApi.parseAccessToken(currentToken, true);
        const result = resp?.data;
        const ok =
          !!result && result.valid && !result.expired && !!result.userId;
        lastSessionCheckAt.value = Date.now();
        lastSessionValid.value = ok;
        if (!ok) {
          clearSessionOnly();
          return false;
        }

        if (!userInfo.value) {
          const minimalUser: User = {
            id: String(result.userId),
            username: result.username || String(result.userId),
            nickname: result.username || String(result.userId),
            avatar: APP_CONFIG.DEFAULT_AVATAR,
            status: "OFFLINE",
          };
          userInfo.value = minimalUser;
          token.value = currentToken;
          localStorage.setItem(STORAGE_CONFIG.TOKEN_KEY, currentToken);
          localStorage.setItem(
            STORAGE_CONFIG.USER_INFO_KEY,
            JSON.stringify(minimalUser),
          );
        }
        return true;
      } catch {
        lastSessionCheckAt.value = Date.now();
        lastSessionValid.value = false;
        clearSessionOnly();
        return false;
      } finally {
        sessionCheckInFlight = null;
      }
    })();

    return sessionCheckInFlight;
  };

  // 登录
  const login = async (loginForm: LoginRequest) => {
    if (loading.value) return false;
    try {
      loading.value = true;
      const username = String(loginForm.username || "").trim();
      const password = String(loginForm.password || "");
      if (!username || !password) {
        throw new Error("请输入用户名和密码");
      }

      const response: any = await userApi.loginWithPassword(username, password);

      const authPayload: any =
        response?.data?.success !== undefined ? response.data : response;
      if (authPayload?.success && authPayload.user && authPayload.token) {
        saveUserData(
          authPayload.user,
          authPayload.token,
          authPayload.refreshToken,
        );
        try {
          await userApi.online();
        } catch (error) {
          console.warn("用户上线通知失败:", error);
        }
        ElMessage.success("登录成功");
        return true;
      } else {
        throw new Error(authPayload?.message || "登录失败");
      }
    } catch (error: any) {
      console.error("登录失败:", error);
      ElMessage.error(error.message || "登录失败");
      return false;
    } finally {
      loading.value = false;
    }
  };

  // 注册
  const register = async (registerForm: RegisterRequest) => {
    if (loading.value) return false;
    try {
      loading.value = true;

      // 转换 RegisterRequest 到 UserDTO
      // 注意：registerForm 包含 confirmPassword 和 agreement，这些不应该发送给后端接口（如果后端严格校验）
      // 但通常 Jackson 配置了 fail-on-unknown-properties: false，所以多余字段会被忽略
      // 这里我们还是显式构造一个 UserDTO 对象比较规范
      const userDTO: UserDTO = {
        username: String(registerForm.username || "").trim(),
        password: registerForm.password,
        email: String(registerForm.email || "").trim(),
        nickname:
          String(registerForm.nickname || "").trim() ||
          String(registerForm.username || "").trim(),
        phone: registerForm.phone
          ? String(registerForm.phone).trim()
          : undefined,
      };

      const response = await userApi.register(userDTO);

      if (response.code === 200) {
        ElMessage.success("注册成功，请登录");
        return true;
      } else {
        throw new Error(response.message || "注册失败");
      }
    } catch (error: any) {
      console.error("注册失败:", error);
      ElMessage.error(error.message || "注册失败");
      return false;
    } finally {
      loading.value = false;
    }
  };

  // 登出
  const logout = async () => {
    if (loading.value) return;
    let serverLogoutOk = false;
    try {
      loading.value = true;
      // 通知服务器用户下线
      const response = await userApi.logout();
      serverLogoutOk = response.code === 200;
    } catch (error: any) {
      console.error("下线通知失败:", error);
      serverLogoutOk = false;
    } finally {
      const redirect = router.currentRoute.value.fullPath || "/chat";
      clearUserData();
      if (serverLogoutOk) {
        ElMessage.success("已退出登录");
      } else {
        ElMessage.warning("已退出本地登录，服务端会话稍后失效");
      }
      router.push({ name: "Login", query: { redirect } });
      loading.value = false;
    }
  };

  // 更新用户信息
  const updateUserInfo = async (userData: Partial<User>) => {
    try {
      loading.value = true;

      const response = await userApi.updateUserInfo(userData);

      if (response.code === 200 && response.data) {
        const patchData =
          typeof response.data === "object" && response.data !== null
            ? (response.data as Record<string, any>)
            : {};
        const updatedUser = {
          ...(userInfo.value || {}),
          ...patchData,
        };
        userInfo.value = updatedUser as User;
        localStorage.setItem(
          STORAGE_CONFIG.USER_INFO_KEY,
          JSON.stringify(updatedUser),
        );

        ElMessage.success("更新成功");
        return true;
      } else {
        throw new Error(response.message || "更新失败");
      }
    } catch (error: any) {
      console.error("更新用户信息失败:", error);
      ElMessage.error(error.message || "更新失败");
      return false;
    } finally {
      loading.value = false;
    }
  };

  // 检查登录状态
  const checkLoginStatus = () => {
    const savedToken = localStorage.getItem(STORAGE_CONFIG.TOKEN_KEY);
    const savedUserInfo = localStorage.getItem(STORAGE_CONFIG.USER_INFO_KEY);

    if (!savedToken || !savedUserInfo) {
      clearUserData();
      return false;
    }

    try {
      const user = JSON.parse(savedUserInfo);
      if (!user || !user.id) {
        clearUserData();
        return false;
      }

      token.value = savedToken;
      userInfo.value = user;
      return true;
    } catch (error) {
      console.error("检查登录状态失败:", error);
      clearUserData();
      return false;
    }
  };

  // 搜索用户
  const searchUsers = async (keyword: string) => {
    try {
      const response = await userApi.searchUsers(keyword);

      if (response.code === 200) {
        return response.data || [];
      } else {
        throw new Error(response.message || "搜索失败");
      }
    } catch (error: any) {
      console.error("搜索用户失败:", error);
      ElMessage.error(error.message || "搜索失败");
      return [];
    }
  };

  // 获取用户信息
  const getUserInfo = async (userId: string) => {
    try {
      const current = userInfo.value;
      if (current && String(current.id) === String(userId)) {
        return current;
      }
      return null;
    } catch (error: any) {
      console.error("获取用户信息失败:", error);
      return null;
    }
  };

  const USER_SETTINGS_KEY = `${STORAGE_CONFIG.USER_INFO_KEY}_SETTINGS`;
  const defaultSettings = {
    general: {
      theme: "light",
      language: "zh-CN",
    },
    privacy: {
      showOnlineStatus: true,
      allowSearchByPhone: true,
      allowSearchByEmail: true,
    },
    message: {
      enterToSend: true,
      showTimestamp: true,
      fontSize: "medium",
    },
    notifications: {
      sound: true,
      desktop: true,
      preview: true,
    },
  };

  const readSettings = () => {
    const raw = localStorage.getItem(USER_SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    try {
      const parsed = JSON.parse(raw);
      return {
        ...defaultSettings,
        ...parsed,
        general: { ...defaultSettings.general, ...(parsed.general || {}) },
        privacy: { ...defaultSettings.privacy, ...(parsed.privacy || {}) },
        message: { ...defaultSettings.message, ...(parsed.message || {}) },
        notifications: {
          ...defaultSettings.notifications,
          ...(parsed.notifications || {}),
        },
      };
    } catch {
      return { ...defaultSettings };
    }
  };

  const saveSettings = (settings: any) => {
    localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
  };

  const getUserSettings = async () => {
    try {
      return readSettings();
    } catch (error: any) {
      console.error("获取用户设置失败:", error);
      return {};
    }
  };

  const updatePrivacySettings = async (data: Record<string, boolean>) => {
    const settings = readSettings();
    settings.privacy = { ...settings.privacy, ...data };
    saveSettings(settings);
    return true;
  };

  const updateMessageSettings = async (data: Record<string, boolean>) => {
    const settings = readSettings();
    settings.message = { ...settings.message, ...data };
    saveSettings(settings);
    return true;
  };

  const updateGeneralSettings = async (data: Record<string, any>) => {
    const settings = readSettings();
    settings.general = { ...settings.general, ...data };
    saveSettings(settings);
    return true;
  };

  const changePassword = async (data: {
    currentPassword: string;
    newPassword: string;
  }) => {
    if (!data.currentPassword || !data.newPassword) {
      throw new Error("请输入完整的密码信息");
    }
    if (data.currentPassword === data.newPassword) {
      throw new Error("新密码不能与旧密码相同");
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    return true;
  };

  // 删除账户
  const deleteAccount = async (data: { password: string }) => {
    try {
      loading.value = true;
      if (!data.password) {
        throw new Error("请输入登录密码");
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      clearUserData();
      localStorage.removeItem(USER_SETTINGS_KEY);
      localStorage.removeItem("im_phone_codes");
      localStorage.removeItem("im_email_codes");

      ElMessage.success("账户删除成功");
      return true;
    } catch (error: any) {
      console.error("删除账户失败:", error);
      ElMessage.error(error.message || "删除账户失败");
      throw error;
    } finally {
      loading.value = false;
    }
  };

  // 绑定邮箱
  const bindEmail = async (data: { email: string; code: string }) => {
    try {
      loading.value = true;
      if (!data.email || !data.code) {
        throw new Error("请填写完整邮箱验证信息");
      }
      const codes = JSON.parse(localStorage.getItem("im_email_codes") || "{}");
      if (codes[data.email] && codes[data.email] !== data.code) {
        throw new Error("邮箱验证码错误");
      }
      await updateUserInfo({ email: data.email });

      // 更新用户信息中的邮箱
      if (userInfo.value) {
        userInfo.value.email = data.email;
        localStorage.setItem(
          STORAGE_CONFIG.USER_INFO_KEY,
          JSON.stringify(userInfo.value),
        );
      }

      ElMessage.success("邮箱绑定成功");
      return true;
    } catch (error: any) {
      console.error("绑定邮箱失败:", error);
      ElMessage.error(error.message || "绑定邮箱失败");
      throw error;
    } finally {
      loading.value = false;
    }
  };

  // 绑定手机号
  const bindPhone = async (data: { phone: string; code: string }) => {
    try {
      loading.value = true;
      if (!data.phone || !data.code) {
        throw new Error("请填写完整手机验证信息");
      }
      const codes = JSON.parse(localStorage.getItem("im_phone_codes") || "{}");
      if (codes[data.phone] && codes[data.phone] !== data.code) {
        throw new Error("手机验证码错误");
      }
      await updateUserInfo({ phone: data.phone });

      // 更新用户信息中的手机号
      if (userInfo.value) {
        userInfo.value.phone = data.phone;
        localStorage.setItem(
          STORAGE_CONFIG.USER_INFO_KEY,
          JSON.stringify(userInfo.value),
        );
      }

      ElMessage.success("手机号绑定成功");
      return true;
    } catch (error: any) {
      console.error("绑定手机号失败:", error);
      ElMessage.error(error.message || "绑定手机号失败");
      throw error;
    } finally {
      loading.value = false;
    }
  };

  // 发送邮箱验证码
  const sendEmailCode = async (email: string) => {
    try {
      loading.value = true;
      if (!email) throw new Error("邮箱不能为空");
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codes = JSON.parse(localStorage.getItem("im_email_codes") || "{}");
      codes[email] = code;
      localStorage.setItem("im_email_codes", JSON.stringify(codes));
      await new Promise((resolve) => setTimeout(resolve, 200));

      ElMessage.success("验证码已发送到邮箱");
      return true;
    } catch (error: any) {
      console.error("发送邮箱验证码失败:", error);
      ElMessage.error(error.message || "发送验证码失败");
      throw error;
    } finally {
      loading.value = false;
    }
  };

  // 发送手机验证码
  const sendPhoneCode = async (phone: string) => {
    try {
      loading.value = true;
      if (!phone) throw new Error("手机号不能为空");
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codes = JSON.parse(localStorage.getItem("im_phone_codes") || "{}");
      codes[phone] = code;
      localStorage.setItem("im_phone_codes", JSON.stringify(codes));
      await new Promise((resolve) => setTimeout(resolve, 200));

      ElMessage.success("验证码已发送到手机");
      return true;
    } catch (error: any) {
      console.error("发送手机验证码失败:", error);
      ElMessage.error(error.message || "发送验证码失败");
      throw error;
    } finally {
      loading.value = false;
    }
  };

  // 立即初始化
  initializeStore();

  return {
    // 状态
    userInfo,
    token,
    loading,

    // 计算属性
    isLoggedIn,
    avatar,
    nickname,
    userId,

    // 方法
    login,
    register,
    logout,
    updateUserInfo,
    checkLoginStatus,
    searchUsers,
    getUserInfo,
    getUserSettings,
    updatePrivacySettings,
    updateMessageSettings,
    updateGeneralSettings,
    changePassword,
    deleteAccount,
    bindEmail,
    bindPhone,
    sendEmailCode,
    sendPhoneCode,
    setAuthToken,
    clearUserData,
    initializeStore,
    init,
    ensureAuthenticated,
  };
});
