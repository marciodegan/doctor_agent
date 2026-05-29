/**
 * Secure cryptographic helper layer for group file end-to-end encryption.
 * Implements client-side decryption and encryption using Web Crypto API.
 */

// Helper to convert ArrayBuffer to Base64
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to convert Base64 to ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 1. User Keypairs Generator (RSA-OAEP)
 * Generates an asymmetric keypair used to encrypt and decrypt symmetric keys.
 */
export async function generateUserKeyPair(): Promise<{
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
}> {
  console.log("[Crypto] Generating new RSA-OAEP user key pair");
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);

  return { publicKeyJwk, privateKeyJwk };
}

/**
 * 2. Group AES Key Generator
 * Generates a random 256-bit AES-GCM symmetric key for a group.
 */
export async function generateGroupKey(): Promise<Uint8Array> {
  console.log("[Crypto] Generating group key");
  const key = await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );

  const exportedRaw = await window.crypto.subtle.exportKey("raw", key);
  return new Uint8Array(exportedRaw);
}

/**
 * 3. Encrypt Group AES key using a target public key (RSA-OAEP)
 */
export async function encryptGroupKeyWithPublicKey(
  groupKeyBytes: Uint8Array,
  targetPublicKeyJwk: JsonWebKey
): Promise<string> {
  try {
    const publicKey = await window.crypto.subtle.importKey(
      "jwk",
      targetPublicKeyJwk,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      false,
      ["encrypt"]
    );

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: "RSA-OAEP",
      },
      publicKey,
      groupKeyBytes
    );

    return arrayBufferToBase64(encryptedBuffer);
  } catch (error) {
    console.error("[Crypto] Encryption of group key with public key failed", error);
    throw error;
  }
}

/**
 * 4. Decrypt Group AES key using private key (RSA-OAEP)
 */
export async function decryptGroupKeyWithPrivateKey(
  encryptedGroupKeyBase64: string,
  userPrivateKeyJwk: JsonWebKey
): Promise<Uint8Array> {
  try {
    console.log("[Crypto] Importing private key to decrypt group key");
    const privateKey = await window.crypto.subtle.importKey(
      "jwk",
      userPrivateKeyJwk,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      false,
      ["decrypt"]
    );

    const encryptedBuffer = base64ToArrayBuffer(encryptedGroupKeyBase64);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "RSA-OAEP",
      },
      privateKey,
      encryptedBuffer
    );

    return new Uint8Array(decryptedBuffer);
  } catch (error) {
    console.error("[Crypto] Decryption of group key with private key failed", error);
    throw error;
  }
}

/**
 * 5. Encrypt file locally (AES-GCM)
 */
export async function encryptFile(
  file: File,
  groupKeyBytes: Uint8Array
): Promise<{ encryptedBlob: Blob; ivBase64: string }> {
  console.log("[Crypto] Encrypting file", file.name, file.size);
  try {
    // Generate a secure 12-byte initialization vector (IV) for AES-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // Import the raw group key
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      groupKeyBytes,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );

    // Read file as ArrayBuffer
    const fileBytes = await file.arrayBuffer();

    // Encrypt
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      cryptoKey,
      fileBytes
    );

    console.log("[Crypto] File encrypted successfully");
    const encryptedBlob = new Blob([encryptedBuffer], {
      type: "application/octet-stream",
    });

    return {
      encryptedBlob,
      ivBase64: arrayBufferToBase64(iv.buffer),
    };
  } catch (error) {
    console.error("[Crypto] File encryption failed", error);
    throw error;
  }
}

/**
 * 6. Decrypt file locally (AES-GCM)
 */
export async function decryptFile(
  encryptedBlob: Blob,
  groupKeyBytes: Uint8Array,
  ivBase64: string,
  originalContentType: string
): Promise<string> {
  console.log("[Crypto] Decrypting file with IV", ivBase64);
  try {
    const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));

    // Import key
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      groupKeyBytes,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    const encryptedBuffer = await encryptedBlob.arrayBuffer();

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      cryptoKey,
      encryptedBuffer
    );

    console.log("[Crypto] File decrypted successfully");
    const decryptedBlob = new Blob([decryptedBuffer], {
      type: originalContentType,
    });

    return URL.createObjectURL(decryptedBlob);
  } catch (error) {
    console.error("[Crypto] Decryption failed", error);
    throw new Error("Não foi possível abrir este arquivo protegido.");
  }
}
