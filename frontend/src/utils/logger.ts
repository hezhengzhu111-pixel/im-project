type LogLevel = "debug" | "info" | "warn" | "error";

const canLog = (level: LogLevel): boolean => {
  if (level === "warn" || level === "error") {
    return true;
  }
  return import.meta.env.DEV;
};

const write = (level: LogLevel, message: string, payload?: unknown) => {
  if (!canLog(level)) {
    return;
  }
  const prefix = `[im:${level}] ${message}`;
  if (level === "debug") {
    console.debug(prefix, payload);
    return;
  }
  if (level === "info") {
    console.info(prefix, payload);
    return;
  }
  if (level === "warn") {
    console.warn(prefix, payload);
    return;
  }
  console.error(prefix, payload);
};

export const logger = {
  debug: (message: string, payload?: unknown) => write("debug", message, payload),
  info: (message: string, payload?: unknown) => write("info", message, payload),
  warn: (message: string, payload?: unknown) => write("warn", message, payload),
  error: (message: string, payload?: unknown) => write("error", message, payload),
};
