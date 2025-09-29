import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/components/auth/AuthProvider";
import Index from "./pages/Index";
import Screenshots from "./pages/Screenshots";
import Menu from "./pages/Menu";
import Auth from "./pages/Auth";
import EstoqueAtual from "./pages/EstoqueAtual";
import AreaAtuacao from "./pages/AreaAtuacao";
import ConfiguracoesUsuario from "./pages/ConfiguracoesUsuario";
import CadastroUsuario from "./pages/CadastroUsuario";
import WhatsAppConfig from "./pages/WhatsAppConfig";
import CleanupUserData from "./pages/CleanupUserData";
import Relatorios from "./pages/Relatorios";

import BottomNavigation from "./components/BottomNavigation";
import NotFound from "./pages/NotFound";

console.log("App.tsx carregando...");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

console.log("QueryClient criado");

const App = () => {
  console.log("App renderizando...");
  
  try {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/menu" element={<Menu />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/screenshots" element={<Screenshots />} />
                <Route path="/estoque" element={<EstoqueAtual />} />
                <Route path="/area-atuacao" element={<AreaAtuacao />} />
                <Route path="/configuracoes" element={<ConfiguracoesUsuario />} />
                <Route path="/cadastro-usuario" element={<CadastroUsuario />} />
                <Route path="/whatsapp" element={<WhatsAppConfig />} />
                <Route path="/cleanup" element={<CleanupUserData />} />
                <Route path="/relatorios" element={<Relatorios />} />
                
                <Route path="*" element={<NotFound />} />
              </Routes>
              <BottomNavigation />
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  } catch (error) {
    console.error("Erro no App:", error);
    return <div>Erro na aplicação: {error.message}</div>;
  }
};

export default App;