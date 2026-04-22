import React from "react";
import { Navigate } from "react-router-dom";

import ReceiptList from "@/components/ReceiptList";
import PageHeader from "@/components/PageHeader";
import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";

const Screenshots = () => {
  const { user, loading } = useAuth();
  const [refreshKey] = React.useState(0);

  // Detectar parâmetro ?highlight= na URL
  const searchParams = new URLSearchParams(window.location.search);
  const highlightNotaId = searchParams.get('highlight');

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <PageHeader title="Minhas Notas Fiscais" />
      <div className="container mx-auto px-4 py-6">
        <ReceiptList key={refreshKey} highlightNotaId={highlightNotaId} />
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
