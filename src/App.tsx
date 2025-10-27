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
import Receitas from "./pages/Receitas";
import ReceitaDetalhes from "./pages/ReceitaDetalhes";
import Cardapios from "./pages/Cardapios";
import CardapioDetalhes from "./pages/CardapioDetalhes";
import ListaCompras from "./pages/ListaCompras";
import ListasComprasIndex from "./pages/ListasComprasIndex";
import ListaComprasComprar from "./pages/ListaComprasComprar";

import BottomNavigation from "./components/BottomNavigation";
import NotFound from "./pages/NotFound";

console.log("App.tsx carregando...");
console.log("🚀 Picotinho versionCode: 3, versionName: 1.2");

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
                <Route path="/admin/normalizacao" element={<NormalizacaoGlobal />} />
                <Route path="/admin/gerenciar-masters" element={<GerenciarMasters />} />
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