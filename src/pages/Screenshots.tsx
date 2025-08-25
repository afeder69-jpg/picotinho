import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ExternalLink, Trash2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import BottomNavigation from "@/components/BottomNavigation";

interface Screenshot {
  id: number;
  url: string;
  timestamp: string;
  screenshot: string;
}

const Screenshots = () => {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    loadScreenshots();
  }, []);

  const loadScreenshots = () => {
    const saved = JSON.parse(localStorage.getItem('qr_screenshots') || '[]');
    setScreenshots(saved.sort((a: Screenshot, b: Screenshot) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ));
  };

  const deleteScreenshot = (id: number) => {
    const updated = screenshots.filter(s => s.id !== id);
    setScreenshots(updated);
    localStorage.setItem('qr_screenshots', JSON.stringify(updated));
    toast({
      title: "Screenshot removido",
      description: "O screenshot foi removido com sucesso.",
    });
  };

  const openUrl = (url: string) => {
    window.open(url, '_blank');
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('pt-BR');
  };

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      <div className="flex-1 p-4 pb-24">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold mb-6">Páginas Salvas</h1>

        {screenshots.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">
                Nenhum screenshot foi capturado ainda.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Escaneie um QR Code com URL para começar.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {screenshots.map((screenshot) => (
              <Card key={screenshot.id}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-sm font-medium">
                        {screenshot.url}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(screenshot.timestamp)}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openUrl(screenshot.url)}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteScreenshot(screenshot.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="relative">
                    <img
                      src={screenshot.screenshot}
                      alt={`Screenshot de ${screenshot.url}`}
                      className="w-full rounded-lg border max-h-40 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setSelectedImage(screenshot.screenshot)}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        </div>
      </div>
      
      {/* Bottom navigation */}
      <BottomNavigation />

      {/* Full screen image viewer */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-none w-screen h-screen p-0 bg-black/95">
          <div className="relative w-full h-full flex items-center justify-center">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-10 text-white hover:bg-white/20"
              onClick={() => setSelectedImage(null)}
            >
              <X className="w-6 h-6" />
            </Button>
            {selectedImage && (
              <img
                src={selectedImage}
                alt="Nota fiscal em tela cheia"
                className="max-w-full max-h-full object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Screenshots;