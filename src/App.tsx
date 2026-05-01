import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProcessingNotesProvider } from "@/contexts/ProcessingNotesContext";
import { RestrictedRouteGuard } from "@/components/auth/RestrictedRouteGuard";
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
import RecategorizarProdutosInteligente from "./pages/RecategorizarProdutosInteligente";
import Receitas from "./pages/Receitas";
import ReceitaDetalhes from "./pages/ReceitaDetalhes";
import Cardapios from "./pages/Cardapios";
import CardapioDetalhes from "./pages/CardapioDetalhes";
import ListaCompras from "./pages/ListaCompras";
import ListasComprasIndex from "./pages/ListasComprasIndex";
import ListaComprasComprar from "./pages/ListaComprasComprar";
import DataDeletion from "./pages/DataDeletion";
import Privacy from "./pages/Privacy";
import ConsultaPrecos from "./pages/ConsultaPrecos";
import Terms from "./pages/Terms";
import ResetPassword from "./pages/ResetPassword";

import BottomNavigation from "./components/BottomNavigation";
import { GlobalProcessingIndicator } from "./components/GlobalProcessingIndicator";
import NotFound from "./pages/NotFound";
import { APP_VERSION } from "./lib/constants";

console.log("App.tsx carregando...");
console.log(`🚀 Picotinho versionName: ${APP_VERSION}`);
console.log(`⏰ Build Timestamp: ${new Date().toISOString()}`);

// Invalidação cirúrgica de cache (preserva auth/PKCE do Supabase)
const STORED_VERSION = localStorage.getItem("app_version");

if (STORED_VERSION !== APP_VERSION) {
  console.log(`🔄 Versão mudou de ${STORED_VERSION} para ${APP_VERSION} - limpando cache da aplicação`);

  // Desregistrar service workers (não bloqueante)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => registration.unregister());
    }).catch(() => {});
  }

  // Limpar APENAS chaves da aplicação. Preservar:
  // - chaves do Supabase (sb-*, supabase.auth.*) → sessão e PKCE
  // - app_version
  const preserveKey = (key: string) =>
    key === 'app_version' ||
    key.startsWith('sb-') ||
    key.startsWith('supabase.') ||
    key.includes('-auth-token');

  try {
    const lsKeys = Object.keys(localStorage);
    lsKeys.forEach((key) => {
      if (!preserveKey(key)) localStorage.removeItem(key);
    });
    const ssKeys = Object.keys(sessionStorage);
    ssKeys.forEach((key) => {
      if (!preserveKey(key)) sessionStorage.removeItem(key);
    });
  } catch (e) {
    console.warn('Falha ao limpar cache seletivo:', e);
  }

  localStorage.setItem("app_version", APP_VERSION);
  // NÃO recarregar — recarregar destrói o fluxo de OAuth retornando à app
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
          <ProcessingNotesProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <RestrictedRouteGuard>
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
                <Route path="/recategorizar-inteligente" element={<RecategorizarProdutosInteligente />} />
                <Route path="/receitas" element={<Receitas />} />
                <Route path="/receita/:id" element={<ReceitaDetalhes />} />
                <Route path="/cardapios" element={<Cardapios />} />
                <Route path="/cardapio/:id" element={<CardapioDetalhes />} />
                <Route path="/listas-compras" element={<ListasComprasIndex />} />
                <Route path="/lista-compras/:id" element={<ListaCompras />} />
                <Route path="/lista-compras/:id/comprar" element={<ListaComprasComprar />} />
                <Route path="/consulta-precos" element={<ConsultaPrecos />} />
                <Route path="/data-deletion" element={<DataDeletion />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                
                <Route path="*" element={<NotFound />} />
              </Routes>
              <GlobalProcessingIndicator />
              <BottomNavigation />
              </RestrictedRouteGuard>
            </BrowserRouter>
          </TooltipProvider>
        </ProcessingNotesProvider>
      </AuthProvider>
    </QueryClientProvider>
    );
  } catch (error) {
    console.error("Erro no App:", error);
    return <div>Erro na aplicação: {error.message}</div>;
  }
};

export default App;