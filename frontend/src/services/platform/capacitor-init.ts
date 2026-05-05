import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { App } from "@capacitor/app";
import { logger } from "@/utils/logger";

let backButtonHandler: ((event: { canGoBack: boolean }) => void) | null = null;

export function setupBackButtonHandler(
  handler: (event: { canGoBack: boolean }) => void,
): void {
  backButtonHandler = handler;
}

export async function initCapacitorPlugins(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0f172a" });
  } catch (e) {
    logger.warn("capacitor: StatusBar setup failed", e);
  }

  try {
    await SplashScreen.hide();
  } catch (e) {
    logger.warn("capacitor: SplashScreen hide failed", e);
  }

  try {
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch (e) {
    // Android doesn't support this — ignore
  }

  try {
    App.addListener("backButton", (event) => {
      if (backButtonHandler) {
        backButtonHandler(event);
      } else if (!event.canGoBack) {
        App.exitApp();
      } else {
        window.history.back();
      }
    });
  } catch (e) {
    logger.warn("capacitor: Back button setup failed", e);
  }

  logger.info("capacitor: plugins initialized");
}
