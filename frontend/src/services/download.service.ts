import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export async function downloadFile(url: string, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await downloadNative(url, filename);
  } else {
    downloadBrowser(url, filename);
  }
}

async function downloadNative(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  const blob = await response.blob();
  const base64 = await blobToBase64(blob);

  const result = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });

  try {
    await Share.share({
      title: filename,
      url: result.uri,
    });
  } catch {
    // User cancelled share — that's ok
  }
}

function downloadBrowser(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
