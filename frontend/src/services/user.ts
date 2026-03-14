import { http } from "@/utils/request";
import type {
  UserDTO,
  LoginRequest,
  UserAuthResponse,
  RegisterRequest,
  UpdateUserRequest,
  UserSearchResult,
} from "@/types/user";

export const userService = {
  login: (data: LoginRequest) =>
    http.post<UserAuthResponse>("/user/login", data),
  register: (data: RegisterRequest) =>
    http.post<UserDTO>("/user/register", data),
  updateProfile: (data: UpdateUserRequest) =>
    http.put<boolean>("/user/profile", data),
  search: (keyword: string, type: string = "username") =>
    http.get<UserDTO[]>("/user/search", { params: { keyword, type } }),
  logout: () => http.post<string>("/user/logout"),
  heartbeat: (userIds: string[]) =>
    http.post<Record<string, boolean>>("/user/heartbeat", userIds),
  online: () => http.post<string>("/user/online"),
  checkOnlineStatus: (userIds: string[]) =>
    http.post<Record<string, boolean>>("/user/online-status", userIds),
};
