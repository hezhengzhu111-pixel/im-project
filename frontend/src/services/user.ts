import { http } from "@/utils/request";
import type { UserDTO, LoginRequest, UserAuthResponse, RegisterRequest, UpdateUserRequest, UserSearchResult } from "@/types/user";

export const userService = {
  login: (data: LoginRequest) => http.post<UserAuthResponse>("/v1/user/login", data),
  register: (data: RegisterRequest) => http.post<UserDTO>("/v1/user/register", data),
  updateProfile: (data: UpdateUserRequest) => http.put<boolean>("/v1/user/profile", data),
  getUserInfo: (userId: string) => http.get<UserDTO>(`/v1/user/${userId}`),
  search: (keyword: string, type: string = "username") => http.get<UserDTO[]>("/v1/user/search", { params: { keyword, type } }),
  logout: () => http.post<string>("/v1/user/offline"),
  heartbeat: (userIds: string[]) => http.post<Record<string, boolean>>("/v1/user/heartbeat", userIds),
  online: () => http.post<string>("/v1/user/online"),
  checkOnlineStatus: (userIds: string[]) => http.post<Record<string, boolean>>("/v1/user/online-status", userIds),
};
