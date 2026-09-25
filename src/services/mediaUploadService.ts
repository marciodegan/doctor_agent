import { db, auth } from "../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { features } from "../config/features";
import { mediaEncryptionService } from "./mediaEncryptionService";

export interface UploadOptions {
  file: File;
  groupId: string;
  patientId: string;
  createdBy: string;
  createdByEmail?: string;
  description?: string;
  groupKey?: Uint8Array | null;
  onProgress?: (progress: number) => void;
}

export const mediaUploadService = {
  validateFile(file: File): { isValid: boolean; error?: string } {
    const mime = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    const ext = name.split(".").pop() || "";

    const isImage =
      mime.startsWith("image/") ||
      ["jpg", "jpeg", "png", "webp", "heic", "heif", "bmp", "tiff", "svg"].includes(ext);
    const isVideo =
      mime.startsWith("video/") ||
      [
        "mp4",
        "mov",
        "qt",
        "quicktime",
        "m4v",
        "hevc",
        "webm",
        "avi",
        "wmv",
        "flv",
        "3gp",
        "3gpp",
        "mkv",
        "ts"
      ].includes(ext);
    const isPdf = mime === "application/pdf" || ext === "pdf";

    if (!isImage && !isVideo && !isPdf) {
      return {
        isValid: false,
        error: "Formato de arquivo não suportado. Por favor, envie uma foto, vídeo ou PDF."
      };
    }

    // Standard limits
    if (isVideo && file.size > 100 * 1024 * 1024) {
      return {
        isValid: false,
        error: "Este vídeo é muito grande (máximo de 100MB). Escolha um vídeo menor para anexar."
      };
    }
    if (isImage && file.size > 20 * 1024 * 1024) {
      return {
        isValid: false,
        error: "Esta imagem é muito grande (máximo de 20MB). Escolha um arquivo menor."
      };
    }
    if (isPdf && file.size > 50 * 1024 * 1024) {
      return {
        isValid: false,
        error: "Este PDF é muito grande (máximo de 50MB). Escolha um arquivo menor."
      };
    }

    return { isValid: true };
  },

  async upload(options: UploadOptions): Promise<{ fileId: string; downloadURL: string }> {
    const {
      file,
      groupId,
      patientId,
      createdBy,
      createdByEmail = "",
      description = "",
      groupKey = null,
      onProgress
    } = options;

    const validation = this.validateFile(file);
    if (!validation.isValid) {
      throw new Error(validation.error || "Arquivo inválido.");
    }

    const mime = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    const ext = name.split(".").pop() || "";

    const isVideo =
      mime.startsWith("video/") ||
      [
        "mp4",
        "mov",
        "qt",
        "quicktime",
        "m4v",
        "hevc",
        "webm",
        "avi",
        "wmv",
        "flv",
        "3gp",
        "3gpp",
        "mkv",
        "ts"
      ].includes(ext);
    const isPdf = mime === "application/pdf" || ext === "pdf";
    const fileTypeResolved: "image" | "video" | "pdf" = isVideo ? "video" : isPdf ? "pdf" : "image";

    // 1. Check central encryption feature toggle
    const shouldEncrypt =
      features.mediaEncryptionEnabled &&
      (fileTypeResolved === "image" || fileTypeResolved === "video");

    let fileToUpload: File | Blob = file;
    let isEncrypted = false;
    let ivBase64: string | null = null;

    if (shouldEncrypt) {
      if (!groupKey) {
        throw new Error(
          "Chave de segurança do grupo indisponível. Para sua segurança, o envio de arquivos não criptografados foi bloqueado."
        );
      }
      try {
        console.log("[mediaUploadService] Encrypting file before upload:", file.name);
        const { encryptedBlob, iv } = await mediaEncryptionService.encrypt(file, groupKey);
        fileToUpload = encryptedBlob;
        isEncrypted = true;
        ivBase64 = iv;
      } catch (err: any) {
        console.error("[mediaUploadService] Encryption failed:", err);
        throw new Error("Não foi possível proteger este arquivo. Tente novamente.");
      }
    }

    // 2. Prepare FormData
    const safeFileName = file.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");

    const formData = new FormData();
    formData.append("file", fileToUpload, safeFileName);
    formData.append("patientId", patientId);
    formData.append("description", description || file.name || "Arquivo");
    formData.append("groupId", groupId || "");
    formData.append(
      "platform",
      typeof navigator !== "undefined" && /mobi|android|iphone|ipad/i.test(navigator.userAgent)
        ? "mobile"
        : "desktop"
    );

    if (isEncrypted) {
      formData.append("isEncrypted", "true");
      formData.append("iv", ivBase64 || "");
      formData.append("originalContentType", mime);
    }

    // 3. Resolve auth token
    let authToken = "";
    try {
      authToken = (await auth.currentUser?.getIdToken()) || "";
    } catch (e) {}

    const isDemoMode =
      groupId === "demo-group-hospital" ||
      (typeof localStorage !== "undefined" &&
        (localStorage.getItem("activeGroupId") === "demo-group-hospital" ||
          localStorage.getItem("doctor_pro_auth_tokens")?.includes("demo")));

    if (!authToken && isDemoMode) {
      authToken = "demo-token";
    }

    // 4. Send upload request via XMLHttpRequest for real progress
    console.log("[mediaUploadService] Uploading file to /api/app/upload-image...");
    console.log("- file:", file.name, `(${file.size} bytes)`);
    console.log("- patientId:", patientId, "groupId:", groupId);

    const result = await new Promise<{ fileId: string; downloadURL: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/app/upload-image");
      xhr.withCredentials = true;

      if (groupId) {
        xhr.setRequestHeader("x-group-id", groupId);
      }
      if (authToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
      }
      if (isDemoMode) {
        xhr.setRequestHeader("x-demo-mode", "true");
      }

      if (xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (onProgress) onProgress(100);
            const downloadURL = data.downloadURL || data.downloadUrl || data.link;
            console.log("[mediaUploadService] Upload successful! URL:", downloadURL);
            resolve({
              fileId: data.fileId,
              downloadURL: downloadURL
            });
          } catch (err) {
            reject(new Error("Resposta inválida do servidor ao processar o arquivo."));
          }
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            const msg =
              errData.error || errData.message || `Erro no envio do arquivo (HTTP ${xhr.status})`;
            reject(new Error(msg));
          } catch (e) {
            reject(
              new Error(
                `Erro no envio do arquivo (HTTP ${xhr.status}): ${xhr.statusText || "Falha no servidor"}`
              )
            );
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error("Falha na conexão durante o envio do arquivo. Verifique sua conexão e tente novamente."));
      };

      xhr.onabort = () => {
        reject(new Error("Envio do arquivo cancelado."));
      };

      xhr.send(formData);
    });

    // 5. Optimistically update local Firestore cache if client is connected
    try {
      if (db && result.fileId) {
        const fileRef = doc(db, "files", result.fileId);
        setDoc(
          fileRef,
          {
            id: result.fileId,
            groupId: groupId,
            patientId: patientId,
            uploadedBy: createdBy,
            uploadedByEmail: createdByEmail,
            originalName: file.name,
            safeFileName: safeFileName,
            contentType: isEncrypted ? "application/octet-stream" : mime,
            fileType: fileTypeResolved,
            size: file.size,
            downloadURL: result.downloadURL,
            downloadUrl: result.downloadURL,
            description: description || file.name || "Arquivo",
            link: result.downloadURL,
            status: "active",
            timestamp: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            encrypted: isEncrypted,
            ...(isEncrypted
              ? {
                  encryption: {
                    algorithm: "AES-GCM",
                    iv: ivBase64,
                    originalContentType: mime,
                    encrypted: true
                  }
                }
              : {})
          },
          { merge: true }
        ).catch(() => {});
      }
    } catch (e) {}

    return result;
  }
};
