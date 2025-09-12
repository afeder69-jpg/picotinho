import React from "react";

import ReceiptList from "@/components/ReceiptList";
import UploadNoteButton from "@/components/UploadNoteButton";
import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn } from "lucide-react";
const Screenshots = () => {
  const { user, loading, signInAnonymously } = useAuth();
  const [refreshKey, setRefreshKey] = React.useState(0);

  const handleUploadSuccess = () => {
    setRefreshKey(prev => prev + 1);
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
        <div className="mb-6">
          <UploadNoteButton onUploadSuccess={handleUploadSuccess} />
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