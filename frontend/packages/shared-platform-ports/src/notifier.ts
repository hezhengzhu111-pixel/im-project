export interface NotifierPort {
  notify(options: NotificationOptions): void;
}

export interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
}
