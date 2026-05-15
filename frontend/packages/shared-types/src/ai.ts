export interface AiApiKey {
  id: string;
  provider: string;
  keyName: string;
  maskedKey: string;
  isActive: boolean;
  validateStatus: string;
  lastValidatedAt?: string;
}

export interface AiSettings {
  autoReplyEnabled: boolean;
  autoReplyPersona: string;
}
