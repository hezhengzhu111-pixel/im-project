import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    login_qps: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.RATE || 50000),
      timeUnit: "1s",
      duration: __ENV.DURATION || "5m",
      preAllocatedVUs: Number(__ENV.PRE_VUS || 2000),
      maxVUs: Number(__ENV.MAX_VUS || 10000),
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.001"],
    http_req_duration: ["p(99)<50"],
  },
};

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:8080";
const path = __ENV.PATH || "/api/user/login";

export default function () {
  const payload = JSON.stringify({
    username: `load-${__VU}`,
    password: "Benchmark#123",
  });

  const res = http.post(`${baseUrl}${path}`, payload, {
    headers: { "Content-Type": "application/json" },
    tags: { scenario: "login_qps", path },
  });

  check(res, {
    "status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  sleep(0.01);
}
