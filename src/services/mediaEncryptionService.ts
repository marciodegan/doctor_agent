import { encryptFile as cryptoEncryptFile, decryptFile as cryptoDecryptFile } from "../lib/crypto";

export const mediaEncryptionService = {
  async encrypt(file: File, groupKey: Uint8Array): Promise<{ encryptedBlob: Blob; iv: string }> {
    try {
      const { encryptedBlob, ivBase64 } = await cryptoEncryptFile(file, groupKey);
      return { encryptedBlob, iv: ivBase64 };
    } catch (error) {
      console.error("[mediaEncryptionService] Encryption failed:", error);
      throw new Error("Não foi possível proteger este arquivo. Tente novamente.");
    }
  },

  async decrypt(encryptedBlob: Blob, groupKey: Uint8Array, iv: string, originalContentType: string): Promise<string> {
    try {
      return await cryptoDecryptFile(encryptedBlob, groupKey, iv, originalContentType);
    } catch (error: any) {
      console.error("[mediaEncryptionService] Decryption failed:", error);
      throw new Error("Não foi possível abrir este arquivo protegido. Verifique se você ainda tem acesso ao grupo.");
    }
  }
};
