export interface I18nDictionary {
  common: {
    ok: string;
    cancel: string;
    confirm: string;
    save: string;
    back: string;
    loading: string;
    retry: string;
    done: string;
    yes: string;
    no: string;
  };
  auth: {
    login: string;
    register: string;
    username: string;
    password: string;
    confirmPassword: string;
    email: string;
    phone: string;
    logout: string;
    forgotPassword: string;
    noAccount: string;
    hasAccount: string;
    loginSuccess: string;
    registerSuccess: string;
  };
  tabs: {
    chat: string;
    contacts: string;
    groups: string;
    settings: string;
    moments: string;
  };
  chat: {
    send: string;
    placeholder: string;
    voice: string;
    image: string;
    file: string;
    video: string;
    recall: string;
    copy: string;
    delete: string;
    search: string;
    noSessions: string;
    newChat: string;
    groupChat: string;
    privateChat: string;
  };
  message: {
    recalled: string;
    deleted: string;
    loading: string;
    noMore: string;
    loadFailed: string;
    image: string;
    file: string;
    voice: string;
    video: string;
    aiReply: string;
  };
  settings: {
    title: string;
    language: string;
    theme: string;
    themeLight: string;
    themeDark: string;
    themeSystem: string;
    notification: string;
    sound: string;
    readReceipt: string;
    privacy: string;
    about: string;
    storage: string;
    ai: string;
    changePassword: string;
    editProfile: string;
  };
  errors: {
    network: string;
    server: string;
    unknown: string;
    unauthorized: string;
    forbidden: string;
    notFound: string;
    timeout: string;
    invalidInput: string;
    usernameTooShort: string;
    passwordTooShort: string;
    passwordMismatch: string;
    invalidEmail: string;
  };
}

export type Locale = 'zh-CN' | 'en-US';

export type TranslationKey = string;

export type TranslationParams = Record<string, string | number>;
