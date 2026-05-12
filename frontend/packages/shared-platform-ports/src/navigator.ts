export interface NavigatorPort {
  openUrl(url: string): void;
  canGoBack(): boolean;
  goBack(): void;
}
