import { mediaEncryptionService } from "./mediaEncryptionService";

export const mediaPreviewService = {
  isEncrypted(fileMetadata: any): boolean {
    // Existing files that do not have the encrypted field should be treated as encrypted: false.
    return fileMetadata?.encrypted === true;
  },

  async getPreviewUrl(
    fileMetadata: any,
    groupKey: Uint8Array | null,
    apiFetch: (url: string) => Promise<any>
  ): Promise<string> {
    const isEncrypted = this.isEncrypted(fileMetadata);

    if (!isEncrypted) {
      return fileMetadata.downloadUrl || fileMetadata.downloadURL || fileMetadata.link || "";
    }

    if (!groupKey) {
      throw new Error("Não foi possível abrir este arquivo protegido. Verifique se você ainda tem acesso ao grupo.");
    }

    const src = fileMetadata.downloadUrl || fileMetadata.downloadURL || fileMetadata.link;
    if (!src) {
      throw new Error("URL de download do arquivo inválida.");
    }

    try {
      let fetchUrl = src;
      let isProxied = false;
      if (src.startsWith("https://storage.googleapis.com/") || src.includes(".firebasestorage.app") || src.includes("firebasestorage.googleapis.com")) {
        fetchUrl = `/api/app/proxy-storage-file?url=${encodeURIComponent(src)}`;
        isProxied = true;
      }

      console.log(`[mediaPreviewService] Fetching encrypted resource: ${fetchUrl}`);
      const res = isProxied ? await apiFetch(fetchUrl) : await fetch(fetchUrl);
      if (!res.ok) {
        throw new Error(`O download falhou com status: ${res.status}`);
      }
      const encryptedBlob = await res.blob();

      // Retrieve iv from fileMetadata encryption object if present, else from direct fileMetadata.iv
      const iv = fileMetadata.iv || fileMetadata.encryption?.iv;
      const originalContentType = fileMetadata.originalContentType || fileMetadata.encryption?.originalContentType || "application/octet-stream";

      if (!iv) {
        throw new Error("Vetor de inicialização (IV) de criptografia ausente.");
      }

      const decryptedUrlString = await mediaEncryptionService.decrypt(
        encryptedBlob,
        groupKey,
        iv,
        originalContentType
      );

      return decryptedUrlString;
    } catch (err: any) {
      console.error("[mediaPreviewService] Decryption failed:", err);
      throw new Error("Não foi possível abrir este arquivo protegido. Verifique se você ainda tem acesso ao grupo.");
    }
  }
};
