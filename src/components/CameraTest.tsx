import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Camera, CameraResultType } from "@capacitor/camera";
import { toast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";

const CameraTest = () => {
  const [isTestingCamera, setIsTestingCamera] = useState(false);
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);

  const testeCamera = async () => {
    try {
      setIsTestingCamera(true);
      
      const photo = await Camera.getPhoto({
        quality: 90,
        resultType: CameraResultType.Base64
      });
      
      console.log("Foto capturada:", photo.base64String?.substring(0, 100));
      setLastPhoto(photo.base64String || null);
      
      toast({
        title: "Câmera funcionando!",
        description: "Foto capturada com sucesso",
      });
      
    } catch (error: any) {
      console.error("Erro no teste da câmera:", error);
      toast({
        title: "Erro na câmera",
        description: error?.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsTestingCamera(false);
    }
  };

  if (!Capacitor.isNativePlatform()) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Teste de câmera disponível apenas em dispositivos móveis
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <h3 className="font-semibold">Teste da Câmera</h3>
      
      <Button 
        onClick={testeCamera}
        disabled={isTestingCamera}
        className="w-full"
      >
        {isTestingCamera ? "Testando..." : "Testar Câmera"}
      </Button>
      
      {lastPhoto && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Última foto:</p>
          <img 
            src={`data:image/jpeg;base64,${lastPhoto}`}
            alt="Teste da câmera"
            className="w-full max-w-xs rounded-lg"
          />
        </div>
      )}
      
      <div className="text-xs text-muted-foreground">
        <p>Se a câmera funcionar aqui mas o QR scanner não, o problema é específico do ML Kit.</p>
      </div>
    </Card>
  );
};

export default CameraTest;