import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Camera, Download, Trash2, FileImage, Monitor, Target } from "lucide-react";
import { useScreenCapture } from "@/hooks/useScreenCapture";

const ScreenCaptureComponent = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const {
    isCapturing,
    capturedImages,
    captureFullPage,
    captureReceiptPage,
    downloadImage,
    clearImages,
    removeImage
  } = useScreenCapture();

  const handleCaptureReceiptPage = async () => {
    const image = await captureReceiptPage();
    if (image) {
      setIsDialogOpen(false);
    }
  };

  const handleCaptureFullPage = async () => {
    const image = await captureFullPage();
    if (image) {
      setIsDialogOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button 
            variant="default" 
            className="w-full bg-gradient-primary shadow-button hover:shadow-lg"
            disabled={isCapturing}
          >
            <Camera className="w-4 h-4 mr-2" />
            {isCapturing ? "Capturando..." : "Capturar Nota Fiscal"}
          </Button>
        </DialogTrigger>
        
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Capturar Tela</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3">
            <Button
              onClick={handleCaptureReceiptPage}
              disabled={isCapturing}
              className="w-full justify-start"
              variant="outline"
            >
              <FileImage className="w-4 h-4 mr-2" />
              Capturar Nota Fiscal (Otimizado)
            </Button>
            
            <Button
              onClick={handleCaptureFullPage}
              disabled={isCapturing}
              className="w-full justify-start"
              variant="outline"
            >
              <Monitor className="w-4 h-4 mr-2" />
              Capturar Página Completa
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lista de imagens capturadas */}
      {capturedImages.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm">Imagens Capturadas</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearImages}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-2">
            {capturedImages.map((image) => (
              <div
                key={image.timestamp}
                className="flex items-center justify-between p-2 border rounded-lg bg-muted/30"
              >
                <div className="flex items-center space-x-3">
                  <img
                    src={image.url}
                    alt="Captura"
                    className="w-12 h-12 object-cover rounded border"
                  />
                  <div>
                    <p className="text-sm font-medium">{image.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(image.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadImage(image)}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeImage(image.timestamp)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ScreenCaptureComponent;