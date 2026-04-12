import axios from "axios";

export const refreshAccessTokenRaw = async (traceId: string) => {
  return axios.post(
    "/api/auth/refresh",
    {},
    {
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "X-Gateway-Route": "true",
        "X-Trace-Id": traceId,
      },
      withCredentials: true,
      timeout: 10000,
    },
  );
};
