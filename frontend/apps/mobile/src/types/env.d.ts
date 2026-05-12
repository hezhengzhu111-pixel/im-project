declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

declare const require: (id: string) => unknown;
