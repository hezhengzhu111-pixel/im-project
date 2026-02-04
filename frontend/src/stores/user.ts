/**
 * 用户状态管理
 * 管理用户登录、注册、个人信息等状态
 */

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { userApi } from "@/services";
import { STORAGE_CONFIG, APP_CONFIG } from "@/config";
import type { User, LoginRequest, RegisterRequest } from "@/types";
import { ElMessage } from "element-plus";
import router from "@/router";

export const useUserStore = defineStore("user", () => {
  // 状态
  const userInfo = ref<User | null>(null);
  const token = ref<string>("");
  const loading = ref(false);

  // 计算属性
  const isLoggedIn = computed(() => !!token.value && !!userInfo.value);
  const avatar = computed(
    () => userInfo.value?.avatar || APP_CONFIG.DEFAULT_AVATAR,
  );
  const nickname = computed(
    () => userInfo.value?.nickname || userInfo.value?.username || "未知用户",
  );
  const userId = computed(() => userInfo.value?.id || "");

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
    localStorage.removeItem(STORAGE_CONFIG.TOKEN_KEY);
    localStorage.removeItem(STORAGE_CONFIG.USER_INFO_KEY);
  };

  // 保存用户数据
  const saveUserData = (user: User, authToken: string) => {
    userInfo.value = user;
    token.value = authToken;
    localStorage.setItem(STORAGE_CONFIG.TOKEN_KEY, authToken);
    localStorage.setItem(STORAGE_CONFIG.USER_INFO_KEY, JSON.stringify(user));
  };

  // 登录
  const login = async (loginForm: LoginRequest) => {
    try {
      loading.value = true;

      const response = await userApi.loginWithPassword(
        loginForm.username,
        loginForm.password,
      );

      // 后端返回的是 UserAuthResponseDTO 格式：{success, message, user, token}
      if (response.success && response.user && response.token) {
        saveUserData(response.user, response.token);
        ElMessage.success("登录成功");
        return true;
      } else {
        throw new Error(response.message || "登录失败");
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
    try {
      loading.value = true;

      // 转换 RegisterRequest 到 UserDTO
      // 注意：registerForm 包含 confirmPassword 和 agreement，这些不应该发送给后端接口（如果后端严格校验）
      // 但通常 Jackson 配置了 fail-on-unknown-properties: false，所以多余字段会被忽略
      // 这里我们还是显式构造一个 UserDTO 对象比较规范
      const userDTO: UserDTO = {
        username: registerForm.username,
        password: registerForm.password,
        email: registerForm.email,
        nickname: registerForm.nickname || registerForm.username,
        phone: registerForm.phone
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
    try {
      // 通知服务器用户下线
      await userApi.logout();
    } catch (error) {
      console.error("下线通知失败:", error);
    } finally {
      clearUserData();
      ElMessage.success("已退出登录");
      router.push("/login");
    }
  };

  // 更新用户信息
  const updateUserInfo = async (userData: Partial<User>) => {
    try {
      loading.value = true;

      const response = await userApi.updateUserInfo(userData);

      if (response.code === 200 && response.data) {
        const updatedUser = { ...userInfo.value, ...response.data };
        userInfo.value = updatedUser;
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
      const response = await userApi.getUserInfo(userId);

      if (response.code === 200) {
        return response.data;
      } else {
        throw new Error(response.message || "获取用户信息失败");
      }
    } catch (error: any) {
      console.error("获取用户信息失败:", error);
      return null;
    }
  };

  // 获取用户设置
  const getUserSettings = async () => {
    try {
      // TODO: 实现从API获取用户设置
      // 目前返回默认设置
      return {
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
    } catch (error: any) {
      console.error("获取用户设置失败:", error);
      return {};
    }
  };

  // 删除账户
  const deleteAccount = async (_data: { password: string }) => {
    try {
      loading.value = true;

      // TODO: 实现删除账户API调用
      // const response = await userApi.deleteAccount(data)

      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 1000));

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

      // TODO: 实现绑定邮箱API调用
      // const response = await userApi.bindEmail(data)

      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 1000));

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

      // TODO: 实现绑定手机号API调用
      // const response = await userApi.bindPhone(data)

      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 1000));

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
  const sendEmailCode = async (_email: string) => {
    try {
      loading.value = true;

      // TODO: 实现发送邮箱验证码API调用
      // const response = await userApi.sendEmailCode(email)

      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 1000));

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
  const sendPhoneCode = async (_phone: string) => {
    try {
      loading.value = true;

      // TODO: 实现发送手机验证码API调用
      // const response = await userApi.sendPhoneCode(phone)

      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 1000));

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
    deleteAccount,
    bindEmail,
    bindPhone,
    sendEmailCode,
    sendPhoneCode,
    clearUserData,
    initializeStore,
    init,
  };
});
