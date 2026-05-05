import httpClient from "@/utils/httpClient";
import { registerAuthSessionAdapter } from "@/services/auth-session-adapter";
import { registerHttpErrorNotifier } from "@/services/http-error-notifier";

// Initialize adapters: register auth and error handling interceptors
registerHttpErrorNotifier();
registerAuthSessionAdapter((config) => httpClient(config));

export { http } from "@/utils/httpClient";
export default httpClient;
