import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

interface Screenshot {
  id: number;
  url: string;
  timestamp: string;
  screenshot: string;
}

const Screenshots = () => {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const navigate = useNavigate();

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
    <div className="min-h-screen bg-gradient-subtle">
      <div className="p-4">
        <div className="flex items-center mb-6">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/')}
            className="mr-4"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl font-bold">Screenshots QR Code</h1>
        </div>

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
                      className="w-full rounded-lg border max-h-40 object-cover"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Screenshots;