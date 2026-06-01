import { db, storage } from "../lib/firebase";
import { collection, doc, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { features } from "../config/features";
import { mediaEncryptionService } from "./mediaEncryptionService";

export interface UploadOptions {
  file: File;
  groupId: string;
  patientId: string;
  createdBy: string;
  createdByEmail?: string;
  description?: string;
  groupKey: Uint8Array | null;
  onProgress?: (progress: number) => void;
}

export const mediaUploadService = {
  validateFile(file: File): { isValid: boolean; error?: string } {
    const mime = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    const ext = name.split(".").pop() || "";
    
    const isImage = mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext);
    const isVideo = mime.startsWith("video/") || ["mp4", "mov", "qt", "quicktime", "m4v", "hevc", "webm", "avi", "wmv", "flv", "3gp", "3gpp", "mkv"].includes(ext);
    const isPdf = mime === "application/pdf" || ext === "pdf";

    // Standard limits
    if (isVideo && file.size > 100 * 1024 * 1024) {
      return { isValid: false, error: "Este vídeo é muito grande (máximo de 100MB). Escolha um vídeo menor para anexar." };
    }
    if (isImage && file.size > 20 * 1024 * 1024) {
      return { isValid: false, error: "Esta imagem é muito grande (máximo de 20MB). Escolha um arquivo menor." };
    }
    if (isPdf && file.size > 50 * 1024 * 1024) {
      return { isValid: false, error: "Este PDF é muito grande (máximo de 50MB). Escolha um arquivo menor." };
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
      groupKey,
      onProgress
    } = options;

    const validation = this.validateFile(file);
    if (!validation.isValid) {
      throw new Error(validation.error || "Arquivo inválido.");
    }

    const mime = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    const ext = name.split(".").pop() || "";

    const isImage = mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext);
    const isVideo = mime.startsWith("video/") || ["mp4", "mov", "qt", "quicktime", "m4v", "hevc", "webm", "avi", "wmv", "flv", "3gp", "3gpp", "mkv"].includes(ext);
    const isPdf = mime === "application/pdf" || ext === "pdf";

    let fileTypeResolved: "image" | "video" | "pdf" = "image";
    if (isVideo) {
      fileTypeResolved = "video";
    } else if (isPdf) {
      fileTypeResolved = "pdf";
    }

    // Determine contentType
    let originalContentType = mime;
    if (!originalContentType || originalContentType === "application/octet-stream" || originalContentType === "application/x-utext") {
      if (ext === "mov" || ext === "qt" || ext === "quicktime") originalContentType = "video/quicktime";
      else if (ext === "mp4") originalContentType = "video/mp4";
      else if (ext === "m4v") originalContentType = "video/x-m4v";
      else if (ext === "hevc") originalContentType = "video/hevc";
      else if (ext === "webm") originalContentType = "video/webm";
      else if (ext === "avi") originalContentType = "video/x-msvideo";
      else if (ext === "wmv") originalContentType = "video/x-ms-wmv";
      else if (ext === "mkv") originalContentType = "video/x-matroska";
      else if (ext === "jpg" || ext === "jpeg") originalContentType = "image/jpeg";
      else if (ext === "png") originalContentType = "image/png";
      else if (ext === "webp") originalContentType = "image/webp";
      else if (ext === "heic") originalContentType = "image/heic";
      else if (ext === "heif") originalContentType = "image/heif";
      else if (ext === "pdf") originalContentType = "application/pdf";
      else originalContentType = "application/octet-stream";
    }

    // Normalize and remove accents/diacritics
    const safeFileName = file.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");
      
    const fileId = doc(collection(db, "files")).id;
    const timestamp = Date.now();

    // Check central feature toggle
    const shouldEncrypt = features.mediaEncryptionEnabled && (fileTypeResolved === "image" || fileTypeResolved === "video");

    let fileToUpload: File | Blob = file;
    let isEncrypted = false;
    let ivBase64: string | null = null;

    if (shouldEncrypt) {
      if (!groupKey) {
        throw new Error("Chave de segurança do grupo indisponível. Para sua segurança, o envio de arquivos não criptografados foi bloqueado.");
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

    // 3. Determine target storage path
    let storagePath = "";
    if (isEncrypted) {
      storagePath = `groups/${groupId}/encrypted-files/${fileId}/${safeFileName}.encrypted`;
    } else {
      storagePath = `groups/${groupId}/patients/${patientId}/files/${timestamp}-${safeFileName}`;
    }

    console.log("[mediaUploadService] Starting direct Firebase Storage upload...");
    console.log("- file.name:", file.name);
    console.log("- storage path:", storagePath);

    // Initiate upload
    const storageRef = ref(storage, storagePath);
    const metadata = {
      contentType: isEncrypted ? "application/octet-stream" : originalContentType,
      customMetadata: {
        originalName: file.name,
        contentType: originalContentType,
      },
    };

    const uploadTask = uploadBytesResumable(storageRef, fileToUpload, metadata);

    const downloadURL = await new Promise<string>((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) onProgress(progress);
        },
        (error) => {
          reject(error);
        },
        async () => {
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          } catch (err) {
            reject(err);
          }
        }
      );
    });

    console.log("[mediaUploadService] Upload successful. downloadURL:", downloadURL);

    // Save complete metadata in Firestore
    const fileRef = doc(db, "files", fileId);
    await setDoc(fileRef, {
      id: fileId,
      groupId: groupId,
      patientId: patientId,
      uploadedBy: createdBy,
      uploadedByEmail: createdByEmail,
      createdBy: createdBy,
      originalName: file.name,
      originalFileName: file.name,
      safeFileName: safeFileName,
      contentType: isEncrypted ? "application/octet-stream" : originalContentType,
      originalContentType: originalContentType,
      fileType: fileTypeResolved,
      size: file.size,
      storagePath: storagePath,
      downloadURL: downloadURL,
      downloadUrl: downloadURL,
      description: description || file.name || "Arquivo",
      link: downloadURL,
      status: "active",
      timestamp: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      encrypted: isEncrypted,
      encryptionVersion: isEncrypted ? 1 : null,
      keyVersion: isEncrypted ? 1 : null,
      algorithm: isEncrypted ? "AES-GCM" : null,
      iv: isEncrypted ? ivBase64 : null,
      ...(isEncrypted ? {
        encryption: {
          algorithm: "AES-GCM",
          iv: ivBase64,
          originalContentType: originalContentType,
          encrypted: true
        }
      } : {})
    });

    return { fileId, downloadURL };
  }
};
