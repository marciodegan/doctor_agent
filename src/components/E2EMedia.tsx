import React, { useState, useEffect } from "react";
import { Loader2, AlertCircle, FileText } from "lucide-react";
import { useGroup } from "../contexts/GroupContext";

interface E2EMediaProps {
  src: string;
  encryption?: {
    algorithm: string;
    iv: string;
    originalContentType: string;
    encrypted: boolean;
  } | null;
  className?: string;
  fallbackType?: "image" | "video" | "pdf";
  alt?: string;
  controls?: boolean;
}

export const E2EMedia: React.FC<E2EMediaProps> = ({
  src,
  encryption,
  className = "",
  fallbackType = "image",
  alt = "Imagem",
  controls = true
}) => {
  const { activeGroup, getGroupCryptoKey, apiFetch } = useGroup();
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let urlToCleanup: string | null = null;

    const resolveMedia = async () => {
      // If of legacy type or no encryption
      if (!encryption || !encryption.encrypted) {
        if (active) {
          setDecryptedUrl(src);
          setIsDecrypting(false);
        }
        return;
      }

      if (!activeGroup?.id) {
        if (active) {
          setError("Grupo não selecionado.");
        }
        return;
      }

      if (active) {
        setIsDecrypting(true);
        setError(null);
      }

      try {
        const key = await getGroupCryptoKey(activeGroup.id);
        if (!key) {
          throw new Error("Chave de segurança indisponível.");
        }

        let fetchUrl = src;
        // Routing through our proxy to avoid CORS issues for storage resources in the iframe
        let isProxied = false;
        if (src.startsWith("https://storage.googleapis.com/") || src.includes(".firebasestorage.app") || src.includes("firebasestorage.googleapis.com")) {
          fetchUrl = `/api/app/proxy-storage-file?url=${encodeURIComponent(src)}`;
          isProxied = true;
        }

        console.log(`[E2E] Fetching and decrypting resource: ${fetchUrl}`);
        const res = isProxied ? await apiFetch(fetchUrl) : await fetch(fetchUrl);
        if (!res.ok) {
          throw new Error(`Downloads falharam com status: ${res.status}`);
        }
        const encryptedBlob = await res.blob();

        const { decryptFile } = await import("../lib/crypto");
        const decryptedUrlString = await decryptFile(
          encryptedBlob,
          key,
          encryption.iv,
          encryption.originalContentType
        );

        if (active) {
          setDecryptedUrl(decryptedUrlString);
          urlToCleanup = decryptedUrlString;
        }
      } catch (err: any) {
        console.error("[E2E] Decryption on-the-fly failed:", err);
        if (active) {
          setError(err.message || "Falha na descriptografia");
        }
      } finally {
        if (active) {
          setIsDecrypting(false);
        }
      }
    };

    resolveMedia();

    return () => {
      active = false;
      if (urlToCleanup) {
        try {
          URL.revokeObjectURL(urlToCleanup);
        } catch (e) {
          console.warn("[E2E] Failed to revoke decrypted object URL", e);
        }
      }
    };
  }, [src, encryption, activeGroup?.id, getGroupCryptoKey]);

  if (isDecrypting) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 bg-slate-900/10 backdrop-blur-md rounded-2xl ${className}`}>
        <Loader2 className="h-5 w-5 animate-spin text-blue-600 mb-2" />
        <span className="text-[10px] font-black tracking-widest text-blue-800 uppercase animate-pulse">
          Descriptografando...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 bg-red-50 border border-red-100 rounded-2xl ${className}`}>
        <AlertCircle className="h-5 w-5 text-red-500 mb-1" />
        <span className="text-[9px] font-bold text-red-600 uppercase tracking-widest text-center">
          {error === "Chave de segurança indisponível." ? "Acesso Negado" : `Erro ao descriptografar (${error})`}
        </span>
      </div>
    );
  }

  if (!decryptedUrl) return null;

  // Resolve type
  const actualContentType = encryption?.originalContentType || "";
  const isVideo = actualContentType.startsWith("video/") || fallbackType === "video" || src.toLowerCase().split("?")[0].endsWith(".mp4") || src.toLowerCase().split("?")[0].endsWith(".mov");
  const isPdf = actualContentType === "application/pdf" || fallbackType === "pdf" || src.toLowerCase().split("?")[0].endsWith(".pdf");

  if (isPdf) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center p-5 bg-slate-900 text-center gap-3 rounded-2xl ${className}`}>
        <FileText className="text-red-500 shrink-0" size={36} />
        <span className="text-[10px] font-bold text-white truncate max-w-[200px]">Documento PDF Protegido</span>
        <a 
          href={decryptedUrl} 
          target="_blank" 
          rel="noreferrer" 
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
        >
          Visualizar PDF
        </a>
      </div>
    );
  }

  if (isVideo) {
    return (
      <video 
        src={decryptedUrl} 
        controls={controls} 
        className={`w-full h-full object-contain bg-slate-950 rounded-2xl ${className}`} 
      />
    );
  }

  return (
    <img 
      src={decryptedUrl} 
      alt={alt} 
      className={`w-full h-full object-cover rounded-2xl ${className}`} 
    />
  );
};
