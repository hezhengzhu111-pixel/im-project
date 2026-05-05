import { Capacitor } from "@capacitor/core";
import {
  Camera,
  CameraResultType,
  CameraSource,
  type Photo,
} from "@capacitor/camera";

export interface CameraPhoto {
  base64: string;
  format: string;
}

export async function takePhoto(): Promise<CameraPhoto> {
  const photo: Photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: true,
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera,
  });
  return {
    base64: photo.base64String ?? "",
    format: photo.format ?? "jpeg",
  };
}

export async function pickFromGallery(): Promise<CameraPhoto> {
  const photo: Photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: true,
    resultType: CameraResultType.Base64,
    source: CameraSource.Photos,
  });
  return {
    base64: photo.base64String ?? "",
    format: photo.format ?? "jpeg",
  };
}

export function isCameraAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export function base64ToFile(base64: string, format: string, filename?: string): File {
  const byteChars = atob(base64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const name = filename ?? `photo_${Date.now()}.${format}`;
  return new File([byteArray], name, { type: mime });
}
