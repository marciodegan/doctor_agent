import { db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

export const APP_VERSION = "1.0.7";

export interface VersionConfig {
  latestVersion: string;
  forceUpdate: boolean;
  message?: string;
}

export async function fetchLatestVersion(): Promise<VersionConfig | null> {
  try {
    const versionDocRef = doc(db, "app_config", "version");
    const docSnap = await getDoc(versionDocRef);
    if (docSnap.exists()) {
      return docSnap.data() as VersionConfig;
    }
  } catch (error) {
    console.error("Error fetching latest app version from Firestore:", error);
  }
  return null;
}
