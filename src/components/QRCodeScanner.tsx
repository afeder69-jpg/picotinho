import { useState, useEffect, useRef } from "react";
import { BarcodeScanner, LensFacing } from "@capacitor-mlkit/barcode-scanning";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Camera, QrCode } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { Html5QrcodeScanner } from "html5-qrcode";

interface QRCodeScannerProps {
  onScanSuccess: (result: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const QRCodeScanner = ({ onScanSuccess, onClose, isOpen }: QRCodeScannerProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (isOpen) {
      checkPermissionAndStart();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [isOpen]);

  const checkPermissionAndStart = async () => {
    try {
      if (isNative) {
        // 🔑 Solicita permissão direto
        const status = await BarcodeScanner.requestPermissions();
        if (status.camera === "granted") {
          setHasPermission(true);
          startNativeScanner();
        } else {
          toast({
            title: "Permissão negada",
            description: "Ative a permissão da câmera para escanear QR Codes",
            variant: "destructive",
          });
          onClose();
        }
      } else {
        setHasPermission(true);
        startWebScanner();
      }
    } catch (error) {
      console.error("Erro ao verificar permissão:", error);
      toast({
        title: "Erro",
        description: "Não foi possível acessar a câmera",
        variant: "destructive",
      });
      onClose();
    }
  };

  const startNativeScanner = async () => {
    try {
      setIsScanning(true);

      // 🔑 Usando listener contínuo do MLKit
      const listener = await BarcodeScanner.addListener("barcodeScanned", (result) => {
        if (result?.barcode?.rawValue) {
          console.log("QR Code escaneado:", result.barcode.rawValue);
          onScanSuccess(result.barcode.rawValue);
          stopScanner();
        }
      });

      await BarcodeScanner.startScan({
        formats: [], // vazio = todos os formatos
        lensFacing: LensFacing.Back,
      });

    } catch (error) {
      console.error("Erro ao escanear:", error);
      toast({
        title: "Erro ao escanear",
        description: "Não foi possível ler o QR Code",
        variant: "destructive",
      });
      stopScanner();
    }
  };

  const startWebScanner = () => {
    try {
      setIsScanning(true);
      setTimeout(() => {
        if (document.getElementById("qr-reader")) {
          scannerRef.current = new Html5QrcodeScanner(
            "qr-reader",
            { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
            false
          );

          scannerRef.current.render(
            (decodedText) => {
              console.log("QR Code escaneado:", decodedText);
              onScanSuccess(decodedText);
              stopScanner();
            },
            (error) => console.debug("Scanner error:", error)
          );
        }
      }, 100);
    } catch (error) {
      console.error("Erro ao escanear:", error);
      toast({
        title: "Erro ao escanear",
        description: "Não foi possível ler o QR Code",
        variant: "destructive",
      });
      stopScanner();
    }
  };

  const stopScanner = async () => {
    try {
      if (isNative) {
        await BarcodeScanner.stopScan();
        BarcodeScanner.removeAllListeners();
      } else {
        if (scannerRef.current) {
          scannerRef.current.clear();
          scannerRef.current = null;
        }
      }
      setIsScanning(false);
    } catch (error) {
      console.warn("Erro ao parar scanner:", error);
      setIsScanning(false);
    }
