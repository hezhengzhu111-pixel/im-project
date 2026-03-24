import axios from "axios";

export const refreshAccessTokenRaw = async (
  refreshToken: string,
  traceId: string,
) => {
  return axios.post(
    "/api/auth/refresh",
    { refreshToken },
    {
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "X-Gateway-Route": "true",
        "X-Trace-Id": traceId,
      },
      timeout: 10000,
    },
  );
};
