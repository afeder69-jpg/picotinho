import { useState } from "react";

export const useQRScanner = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);

  const openScanner = () => setIsOpen(true);
  const closeScanner = () => setIsOpen(false);

  const handleScanSuccess = (result: string) => {
    setLastScannedCode(result);
    // Aqui você pode adicionar lógica adicional para processar o código
    console.log("QR Code escaneado:", result);
  };

  return {
    isOpen,
    lastScannedCode,
    openScanner,
    closeScanner,
    handleScanSuccess,
  };
};