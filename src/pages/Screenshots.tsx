import React from "react";

import ReceiptList from "@/components/ReceiptList";
import UploadNoteButton from "@/components/UploadNoteButton";
import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Screenshots = () => {
  const { user, loading, signInAnonymously } = useAuth();
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [isFixingNeighborhoods, setIsFixingNeighborhoods] = React.useState(false);

  const handleUploadSuccess = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleFixNeighborhoods = async () => {
    if (!user) return;
    
    setIsFixingNeighborhoods(true);
    try {
      const { data, error } = await supabase.functions.invoke('corrigir-bairros-notas', {
        body: { userId: user.id }
      });

      if (error) {
        console.error('Erro ao corrigir bairros:', error);
        toast.error('Erro ao corrigir bairros das notas');
        return;
      }

      toast.success(data.message || 'Bairros corrigidos com sucesso!');
      setRefreshKey(prev => prev + 1); // Refresh the list
    } catch (error) {
      console.error('Erro ao corrigir bairros:', error);
      toast.error('Erro ao corrigir bairros das notas');
    } finally {
      setIsFixingNeighborhoods(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <CardTitle>Acesso Necessário</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Para ver suas notas fiscais, você precisa fazer login.
            </p>
            <Button onClick={signInAnonymously} className="w-full">
              <LogIn className="w-4 h-4 mr-2" />
              Entrar Anonimamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Minhas Notas Fiscais</h1>
        <div className="mb-6 flex gap-4 flex-wrap">
          <UploadNoteButton onUploadSuccess={handleUploadSuccess} />
          <Button 
            onClick={handleFixNeighborhoods}
            disabled={isFixingNeighborhoods}
            variant="outline"
            size="sm"
          >
            <MapPin className="w-4 h-4 mr-2" />
            {isFixingNeighborhoods ? 'Corrigindo...' : 'Corrigir Bairros'}
          </Button>
        </div>
        <ReceiptList key={refreshKey} />
      </div>
    </div>
  );
};

const ScreenshotsWithProvider = () => {
  return (
    <AuthProvider>
      <Screenshots />
    </AuthProvider>
  );
};

export default ScreenshotsWithProvider;