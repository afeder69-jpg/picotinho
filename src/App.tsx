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
import NormalizacaoGlobal from "./pages/admin/NormalizacaoGlobal";
import GerenciarMasters from "./pages/admin/GerenciarMasters";
import NormalizacoesEstabelecimentos from "./pages/admin/NormalizacoesEstabelecimentos";
import Receitas from "./pages/Receitas";
import ReceitaDetalhes from "./pages/ReceitaDetalhes";
import Cardapios from "./pages/Cardapios";
import CardapioDetalhes from "./pages/CardapioDetalhes";
import ListaCompras from "./pages/ListaCompras";
import ListasComprasIndex from "./pages/ListasComprasIndex";
import ListaComprasComprar from "./pages/ListaComprasComprar";

import BottomNavigation from "./components/BottomNavigation";
import NotFound from "./pages/NotFound";
import { APP_VERSION } from "./lib/constants";

console.log("App.tsx carregando...");
console.log(`🚀 Picotinho versionName: ${APP_VERSION}`);
console.log(`⏰ Build Timestamp: ${new Date().toISOString()}`);

// Limpeza agressiva de cache
const STORED_VERSION = localStorage.getItem("app_version");

if (STORED_VERSION !== APP_VERSION) {
  console.log(`🔄 Versão mudou de ${STORED_VERSION} para ${APP_VERSION} - limpando cache`);
  
  // Desregistrar service workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => registration.unregister());
    });
  }
  
  // Limpar storage
  localStorage.clear();
  sessionStorage.clear();
  
  // Salvar nova versão
  localStorage.setItem("app_version", APP_VERSION);
  
  // Force reload sem cache
  window.location.reload();
}

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
            {/* Banner de Diagnóstico Visível */}
            <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-black text-center py-1 text-xs font-mono">
              📱 v{APP_VERSION} | 🚨 InAppBrowser ATIVO | ⏰ Build: {new Date().toISOString().slice(0,19)}
            </div>
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
                <Route path="/admin/normalizacao" element={<NormalizacaoGlobal />} />
                <Route path="/admin/gerenciar-masters" element={<GerenciarMasters />} />
                <Route path="/admin/normalizacoes-estabelecimentos" element={<NormalizacoesEstabelecimentos />} />
                <Route path="/receitas" element={<Receitas />} />
                <Route path="/receita/:id" element={<ReceitaDetalhes />} />
                <Route path="/cardapios" element={<Cardapios />} />
                <Route path="/cardapio/:id" element={<CardapioDetalhes />} />
                <Route path="/listas-compras" element={<ListasComprasIndex />} />
                <Route path="/lista-compras/:id" element={<ListaCompras />} />
                <Route path="/lista-compras/:id/comprar" element={<ListaComprasComprar />} />
                
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