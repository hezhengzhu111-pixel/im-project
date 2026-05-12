// Masking utilities extracted from apps/web/src/utils/auth.ts

/**
 * 脱敏处理
 */
export const maskSensitiveInfo = {
  // 脱敏邮箱
  email(email: string): string {
    if (!email) return "";
    const [username, domain] = email.split("@");
    if (username.length <= 2) {
      return `${username[0]}***@${domain}`;
    }
    return `${username.slice(0, 2)}***${username.slice(-1)}@${domain}`;
  },

  // 脱敏手机号
  phone(phone: string): string {
    if (!phone) return "";
    return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
  },

  // 脱敏身份证号
  idCard(idCard: string): string {
    if (!idCard) return "";
    return idCard.replace(/(\d{6})\d{8}(\d{4})/, "$1********$2");
  },
};
