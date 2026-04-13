import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { normalizarParaBusca } from "@/lib/utils";
import { categoriasNormalizadas } from "@/lib/categorias";

/**
 * Normaliza categoria para valor canônico aceito por estoque_app.
 * Espelha a função SQL normalizar_categoria_estoque() — banco é a proteção definitiva.
 */
function normalizarCategoriaParaEstoque(cat: string | null | undefined): string {
  const map: Record<string, string> = {
    'açougue': 'açougue', 'acougue': 'açougue', 'carnes': 'açougue',
    'bebidas': 'bebidas',
    'congelados': 'congelados',
    'higiene': 'higiene/farmácia', 'higiene/farmácia': 'higiene/farmácia', 'higiene/farmacia': 'higiene/farmácia', 'farmácia': 'higiene/farmácia', 'farmacia': 'higiene/farmácia',
    'hortifruti': 'hortifruti', 'frutas': 'hortifruti', 'verduras': 'hortifruti', 'legumes': 'hortifruti',
    'laticínios/frios': 'laticínios/frios', 'laticínios': 'laticínios/frios', 'laticinios': 'laticínios/frios', 'laticinios/frios': 'laticínios/frios', 'frios': 'laticínios/frios',
    'limpeza': 'limpeza',
    'mercearia': 'mercearia', 'alimentos': 'mercearia',
    'padaria': 'padaria',
    'pet': 'pet',
    'outros': 'outros',
  };
  const key = (cat || '').toLowerCase().trim();
  return map[key] || 'outros';
}
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { 
  CheckCircle2, 
  XCircle, 
  X,
  Clock, 
  Package, 
  Users, 
  TrendingUp,
  Shield,
  Sparkles,
  AlertCircle,
  Edit3,
  Database,
  Globe,
  FileText,
  Settings,
  User,
  RotateCcw,
  Loader2,
  ImageOff,
  BarChart3,
  Zap,
  Check,
  Trash2,
  Building2,
  Search,
  MessageSquare,
  Send,
  Bug,
  Lightbulb,
  HelpCircle,
  ThumbsDown
} from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrapingControls } from "@/components/admin/ImageScraping/ScrapingControls";
import { ImagePreviewCard } from "@/components/admin/ImageScraping/ImagePreviewCard";

const NOVA_CAMPANHA_INITIAL_STATE = {
  titulo: '',
  mensagem: '',
  filtro_tipo: 'todos',
  filtro_valor: '',
  tipo_mensagem: '' as string,
  envio_emergencial: false,
};

const TIPO_MENSAGEM_OPTIONS = [
  { value: 'promocao', label: 'Promoção' },
  { value: 'novidade', label: 'Novidade do Picotinho' },
  { value: 'aviso_estoque', label: 'Aviso de estoque' },
  { value: 'dica', label: 'Dica / sugestão útil' },
];

function getTipoMensagemLabel(tipo: string | null): string {
  return TIPO_MENSAGEM_OPTIONS.find(o => o.value === tipo)?.label || tipo || 'Sem tipo';
}

export default function NormalizacaoGlobal() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isMaster, setIsMaster] = useState(false);
  const [stats, setStats] = useState({
    // Catálogo Master Global
    totalProdutosMaster: 0,
    produtosComImagem: 0,
    produtosSemImagem: 0,
    
    // Fila de Processamento - Auto-Aprovados
    autoAprovadosTotal: 0,
    
    // Fila de Processamento - Aprovados Manualmente
    aprovadosManuaisTotal: 0,
    
    // Fila de Processamento - Pendentes
    pendentesTotal: 0,
    
    // Outros
    totalUsuarios: 0,
    totalNotas: 0,
    estimativaNovos: 0,
    estabelecimentosPendentes: 0
  });
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [produtosMaster, setProdutosMaster] = useState<any[]>([]);
  const [processando, setProcessando] = useState(false);
  const [sincronizandoManual, setSincronizandoManual] = useState(false);
  
  // Estados para raspagem de imagens
  const [processandoImagens, setProcessandoImagens] = useState(false);
  const [imagensSugeridas, setImagensSugeridas] = useState<any[]>([]);
  const [totalProcessadoImagens, setTotalProcessadoImagens] = useState(0);
  
  // Estados para modais
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [candidatoAtual, setCandidatoAtual] = useState<any>(null);
  
  // Estados para formulário de edição
  const [editForm, setEditForm] = useState({
    nome_padrao: '',
    categoria: '',
    nome_base: '',
    marca: '',
    tipo_embalagem: '',
    qtd_valor: '',
    qtd_unidade: '',
    qtd_base: '',
    unidade_base: '',
    categoria_unidade: '',
    granel: false,
    sku_global: '',
    codigo_barras: ''
  });
  
  // Estado para observações de rejeição
  const [observacoesRejeicao, setObservacoesRejeicao] = useState('');
  
  // Estados para gerenciamento de imagens
  const [imagemFile, setImagemFile] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [produtoMasterEditando, setProdutoMasterEditando] = useState<string | null>(null);
  
  // Estados para filtro e busca do catálogo master
  const [filtroMaster, setFiltroMaster] = useState('');
  const [buscandoMaster, setBuscandoMaster] = useState(false);
  const [resultadosBusca, setResultadosBusca] = useState<any[]>([]);
  const [confirmarExclusaoOpen, setConfirmarExclusaoOpen] = useState(false);
  const [excluindoProduto, setExcluindoProduto] = useState(false);
  
  // Estados para paginação de candidatos
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const itensPorPagina = 20;

  // Lista de categorias padrão do Picotinho (11 categorias fixas)
  const categoriasPadrao = [
    'AÇOUGUE',
    'BEBIDAS',
    'CONGELADOS',
    'HIGIENE/FARMÁCIA',
    'HORTIFRUTI',
    'LATICÍNIOS/FRIOS',
    'LIMPEZA',
    'MERCEARIA',
    'OUTROS',
    'PADARIA',
    'PET'
  ];

  // Estados para detecção de produtos similares
  const [produtosSimilares, setProdutosSimilares] = useState<any[]>([]);
  const [carregandoSimilares, setCarregandoSimilares] = useState(false);

  // Estados para filtro e busca de candidatos pendentes
  const [filtroPendentes, setFiltroPendentes] = useState('');
  const [buscandoPendentes, setBuscandoPendentes] = useState(false);
  const [resultadosBuscaPendentes, setResultadosBuscaPendentes] = useState<any[]>([]);


  // Estados para consolidação de duplicados
  const [consolidando, setConsolidando] = useState(false);
  const [detectandoDuplicatas, setDetectandoDuplicatas] = useState(false);
  const [relatorioConsolidacao, setRelatorioConsolidacao] = useState<any>(null);
  const [confirmarConsolidacaoOpen, setConfirmarConsolidacaoOpen] = useState(false);
  
  
  // Estados para consolidação inteligente
  const [gruposDuplicatas, setGruposDuplicatas] = useState<any[]>([]);
  const [buscaDuplicatas, setBuscaDuplicatas] = useState("");
  const [produtosEscolhidos, setProdutosEscolhidos] = useState<Record<string, string>>({});
  const [produtosParaUnificar, setProdutosParaUnificar] = useState<Record<string, Set<string>>>({});
  const [gruposIgnorados, setGruposIgnorados] = useState<Set<string>>(new Set());
  const [gruposConsolidados, setGruposConsolidados] = useState<Set<string>>(new Set());
  const [consolidandoGrupo, setConsolidandoGrupo] = useState<string | null>(null);
  const [modalDuplicatasOpen, setModalDuplicatasOpen] = useState(false);

  // Estados para recategorização
  const [recategorizando, setRecategorizando] = useState(false);

  // Estados para feedbacks/suporte
  const [feedbackStats, setFeedbackStats] = useState({ erros: 0, sugestoes: 0, reclamacoes: 0, duvidas: 0, total: 0 });
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [feedbackFiltroTipo, setFeedbackFiltroTipo] = useState<string>('todos');
  const [feedbackFiltroStatus, setFeedbackFiltroStatus] = useState<string>('todos');
  const [feedbackDetalheOpen, setFeedbackDetalheOpen] = useState(false);
  const [feedbackAtual, setFeedbackAtual] = useState<any>(null);
  const [feedbackRespostas, setFeedbackRespostas] = useState<any[]>([]);
  const [feedbackNovaResposta, setFeedbackNovaResposta] = useState('');
  const [enviandoResposta, setEnviandoResposta] = useState(false);
  const [carregandoFeedbacks, setCarregandoFeedbacks] = useState(false);

  // Estados para campanhas WhatsApp
  const [campanhas, setCampanhas] = useState<any[]>([]);
  const [campanhaDetalheOpen, setCampanhaDetalheOpen] = useState(false);
  const [campanhaAtual, setCampanhaAtual] = useState<any>(null);
  const [campanhaEnvios, setCampanhaEnvios] = useState<any[]>([]);
  const [campanhaDisparos, setCampanhaDisparos] = useState<any[]>([]);
  const [novaCampanhaOpen, setNovaCampanhaOpen] = useState(false);
  const [novaCampanha, setNovaCampanha] = useState(NOVA_CAMPANHA_INITIAL_STATE);
  const [enviandoCampanha, setEnviandoCampanha] = useState(false);
  const [estimativaDestinatarios, setEstimativaDestinatarios] = useState<number | null>(null);
  const [estimativaEmergencial, setEstimativaEmergencial] = useState<number | null>(null);
  const [estimativaDiferenca, setEstimativaDiferenca] = useState<number | null>(null);
  const [filtrosDisponiveis, setFiltrosDisponiveis] = useState<{ estados: string[], cidades: string[] }>({ estados: [], cidades: [] });
  const [confirmandoEnvioCampanha, setConfirmandoEnvioCampanha] = useState(false);
  const [carregandoCampanhas, setCarregandoCampanhas] = useState(false);
  const [campanhasEmAndamento, setCampanhasEmAndamento] = useState(0);
  const [editandoCampanha, setEditandoCampanha] = useState(false);
  const [campanhaEditada, setCampanhaEditada] = useState<any>(null);
  const [confirmandoExclusaoCampanha, setConfirmandoExclusaoCampanha] = useState(false);
  const [confirmandoReenvioCampanha, setConfirmandoReenvioCampanha] = useState(false);
  const [campanhasDisparosMap, setCampanhasDisparosMap] = useState<Record<string, any>>({}); // ultimo disparo por campanha_id
  const [confirmandoEmergencial, setConfirmandoEmergencial] = useState(false);

  useEffect(() => {
    verificarAcessoMaster();
  }, []);

  // Auto-refresh dos dados a cada 30 segundos + ao voltar foco na aba
  useEffect(() => {
    if (!isMaster) return;

    // Polling a cada 30s
    const interval = setInterval(() => {
      console.log('🔄 Auto-refresh dashboard Master (30s)');
      carregarDados();
    }, 30_000);

    // Refresh ao voltar o foco para a aba
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('🔄 Auto-refresh dashboard Master (foco)');
        carregarDados();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isMaster, paginaAtual]);


  // useEffect para busca dinâmica com debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (filtroMaster.trim()) {
        await buscarProdutosMaster(filtroMaster.trim());
      } else {
        // Se filtro vazio, carregar produtos recentes
        setResultadosBusca([]);
        await carregarProdutosRecentes();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [filtroMaster]);

  // useEffect para busca dinâmica de pendentes com debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (filtroPendentes.trim()) {
        await buscarCandidatosPendentes(filtroPendentes.trim());
      } else {
        // Se filtro vazio, limpar resultados
        setResultadosBuscaPendentes([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [filtroPendentes]);
  
  // useEffect para recarregar dados ao mudar de página
  useEffect(() => {
    if (isMaster) {
      carregarDados();
    }
  }, [paginaAtual]);

  async function verificarAcessoMaster() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Acesso negado",
          description: "Você precisa estar autenticado",
          variant: "destructive"
        });
        navigate('/');
        return;
      }

      // Verificar se é master
      const { data: roles, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'master')
        .maybeSingle();

      if (!roles || roleError) {
        console.error('Erro ao verificar role:', roleError);
        toast({
          title: "Acesso restrito",
          description: "Apenas usuários master podem acessar esta área",
          variant: "destructive"
        });
        navigate('/');
        return;
      }

      setIsMaster(true);
      await carregarDados();
    } catch (error: any) {
      console.error('Erro ao verificar acesso:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  }

  async function carregarDados() {
    try {
      // ===== CATÁLOGO MASTER GLOBAL =====
      
      // Total de produtos master
      const { count: totalMaster } = await supabase
        .from('produtos_master_global')
        .select('*', { count: 'exact', head: true });

      // Masters com imagem
      const { count: mastersComImagem } = await supabase
        .from('produtos_master_global')
        .select('*', { count: 'exact', head: true })
        .not('imagem_url', 'is', null);
      
      // Masters sem imagem
      const mastersSemImagem = (totalMaster || 0) - (mastersComImagem || 0);

      // ===== CARREGAR TODOS OS CANDIDATOS =====
      const { data: todosCandidatos } = await supabase
        .from('produtos_candidatos_normalizacao')
        .select(`
          *,
          notas_imagens(origem)
        `)
        .order('created_at', { ascending: false });

      // Separar por status
      const pendentes = todosCandidatos?.filter(c => c.status === 'pendente') || [];
      
      // 🔍 CONTAR APENAS ÓRFÃOS: candidatos auto_aprovados cujo estoque não foi sincronizado
      const idsAutoAprovados = todosCandidatos?.filter(c => c.status === 'auto_aprovado').map(c => c.id) || [];
      
      let countOrfaos = 0;
      if (idsAutoAprovados.length > 0) {
        const { count } = await supabase
          .from('estoque_app')
          .select('id', { count: 'exact', head: true })
          .not('produto_candidato_id', 'is', null)
          .is('produto_master_id', null)
          .in('produto_candidato_id', idsAutoAprovados);
        
        countOrfaos = count || 0;
      }

      // 🔍 CORREÇÃO: Contar produtos aguardando normalização (com candidato PENDENTE ou PROCESSANDO)
      // Primeiro, buscar IDs dos candidatos que estão realmente pendentes/processando
      const { data: candidatosPendentesIds } = await supabase
        .from('produtos_candidatos_normalizacao')
        .select('id')
        .in('status', ['pendente', 'processando']);

      const idsCandidatosPendentes = new Set(
        candidatosPendentesIds?.map(c => c.id) || []
      );

      // Agora filtrar estoque que tem candidato pendente/processando
      const { data: estoquePendente } = await supabase
        .from('estoque_app')
        .select('produto_candidato_id')
        .not('produto_candidato_id', 'is', null)
        .is('produto_master_id', null);

      const aguardandoNoEstoque = estoquePendente?.filter(
        e => e.produto_candidato_id && idsCandidatosPendentes.has(e.produto_candidato_id)
      ).length || 0;

      // Aprovados manualmente
      const { count: aprovadosManualmente } = await supabase
        .from('produtos_candidatos_normalizacao')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'aprovado')
        .not('revisado_por', 'is', null);
      

      // Total de usuários (via RPC com SECURITY DEFINER para bypass RLS)
      const { data: totalUsuariosRpc } = await supabase.rpc('contar_usuarios_cadastrados');
      const usuarios = totalUsuariosRpc ? Array.from({ length: totalUsuariosRpc }) : [];

      // Total de notas lançadas no sistema (via RPC com SECURITY DEFINER)
      const { data: totalNotasRpc } = await supabase.rpc('contar_notas_sistema');
      const totalNotasSistema = totalNotasRpc || 0;

      // Estabelecimentos pendentes de normalização
      let estabelecimentosPendentes = 0;
      try {
        const { data: pendentesEstab } = await supabase.rpc('listar_estabelecimentos_pendentes', {
          p_incluir_normalizados: false,
          p_termo_busca: '',
        });
        estabelecimentosPendentes = pendentesEstab?.length || 0;
      } catch (e) {
        console.error('Erro ao contar estabelecimentos pendentes:', e);
      }

      // Usar o maior valor entre pendentes na tabela e aguardando no estoque (agora corrigido)
      const totalAguardando = Math.max(pendentes.length, aguardandoNoEstoque);
      
      // Calcular estimativa de novos produtos (30% dos aguardando)
      const estimativaNovos = Math.round(totalAguardando * 0.3);

      setStats({
        // Catálogo Master Global
        totalProdutosMaster: totalMaster || 0,
        produtosComImagem: mastersComImagem || 0,
        produtosSemImagem: mastersSemImagem,
        
        // Fila de Processamento - Órfãos (apenas itens não sincronizados)
        autoAprovadosTotal: countOrfaos,
        
        // Fila de Processamento - Aprovados Manualmente
        aprovadosManuaisTotal: aprovadosManualmente || 0,
        
        // Fila de Processamento - Aguardando (corrigido)
        pendentesTotal: totalAguardando,
        
        // Outros
        totalUsuarios: usuarios?.length || 0,
        totalNotas: totalNotasSistema,
        estimativaNovos,
        estabelecimentosPendentes
      });

      // ===== PAGINAÇÃO APENAS DE PENDENTES =====
      const inicio = (paginaAtual - 1) * itensPorPagina;
      const fim = inicio + itensPorPagina;
      
      const candidatosPaginados = pendentes.slice(inicio, fim);
      setCandidatos(candidatosPaginados);
      
      // Calcular total de páginas baseado apenas em pendentes
      const totalPags = Math.ceil(pendentes.length / itensPorPagina);
      setTotalPaginas(totalPags);

      // Carregar produtos recentes iniciais
      await carregarProdutosRecentes();

      // Carregar feedbacks
      await carregarFeedbacks();

      // Carregar campanhas
      await carregarCampanhas();

    } catch (error: any) {
      console.error('Erro ao carregar dados:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados",
        variant: "destructive"
      });
    }
  }

  async function carregarProdutosRecentes() {
    try {
      const { data: masterRecentes } = await supabase
        .from('produtos_master_global')
        .select('*')
        .eq('status', 'ativo')
        .order('created_at', { ascending: false })
        .limit(20);

      setProdutosMaster(masterRecentes || []);
    } catch (error: any) {
      console.error('Erro ao carregar produtos recentes:', error);
    }
  }

  async function carregarFeedbacks() {
    setCarregandoFeedbacks(true);
    try {
      // Contar pendentes por tipo (novo + em_analise)
      const { data: pendentes } = await supabase
        .from('feedbacks')
        .select('tipo, status')
        .in('status', ['novo', 'em_analise']);

      const stats = { erros: 0, sugestoes: 0, reclamacoes: 0, duvidas: 0, total: 0 };
      (pendentes || []).forEach((f: any) => {
        stats.total++;
        if (f.tipo === 'erro') stats.erros++;
        else if (f.tipo === 'sugestao') stats.sugestoes++;
        else if (f.tipo === 'reclamacao') stats.reclamacoes++;
        else if (f.tipo === 'duvida') stats.duvidas++;
      });
      setFeedbackStats(stats);

      // Carregar feedbacks recentes
      const { data: lista } = await supabase
        .from('feedbacks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      setFeedbacks(lista || []);
    } catch (error: any) {
      console.error('Erro ao carregar feedbacks:', error);
    } finally {
      setCarregandoFeedbacks(false);
    }
  }

  async function abrirDetalheFeedback(feedback: any) {
    setFeedbackAtual(feedback);
    setFeedbackDetalheOpen(true);
    setFeedbackNovaResposta('');
    // Carregar respostas
    const { data } = await supabase
      .from('feedbacks_respostas')
      .select('*')
      .eq('feedback_id', feedback.id)
      .order('created_at', { ascending: true });
    setFeedbackRespostas(data || []);
  }

  async function enviarRespostaFeedback() {
    if (!feedbackAtual || !feedbackNovaResposta.trim()) return;
    setEnviandoResposta(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke('responder-feedback-whatsapp', {
        body: {
          feedback_id: feedbackAtual.id,
          mensagem: feedbackNovaResposta.trim(),
          autor_id: user?.id
        }
      });
      if (error) throw error;
      if (data?.envio_status === 'enviado') {
        toast({ title: "Resposta enviada", description: "Mensagem enviada via WhatsApp com sucesso!" });
      } else {
        toast({ title: "Resposta registrada", description: `Envio WhatsApp: ${data?.envio_status || 'falha'}. ${data?.envio_erro || ''}`, variant: "destructive" });
      }
      setFeedbackNovaResposta('');
      await abrirDetalheFeedback(feedbackAtual);
      await carregarFeedbacks();
    } catch (error: any) {
      console.error('Erro ao enviar resposta:', error);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setEnviandoResposta(false);
    }
  }

  async function atualizarStatusFeedback(feedbackId: string, novoStatus: 'novo' | 'em_analise' | 'respondido' | 'resolvido') {
    try {
      await supabase.from('feedbacks').update({ status: novoStatus }).eq('id', feedbackId);
      toast({ title: "Status atualizado", description: `Feedback marcado como ${novoStatus.replace('_', ' ')}` });
      if (feedbackAtual?.id === feedbackId) {
        setFeedbackAtual({ ...feedbackAtual, status: novoStatus });
      }
      await carregarFeedbacks();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  }

  // ===== FUNÇÕES DE CAMPANHAS WHATSAPP =====
  async function carregarCampanhas() {
    setCarregandoCampanhas(true);
    try {
      const { data } = await supabase
        .from('campanhas_whatsapp')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      setCampanhas(data || []);
      const emAndamento = (data || []).filter((c: any) => c.status === 'enviando').length;
      setCampanhasEmAndamento(emAndamento);

      // Buscar o disparo mais recente por campanha
      const ids = (data || []).map((c: any) => c.id);
      if (ids.length > 0) {
        const { data: disparos } = await supabase
          .from('campanhas_whatsapp_disparos')
          .select('*')
          .in('campanha_id', ids)
          .order('iniciado_em', { ascending: false });

        const map: Record<string, any> = {};
        for (const d of (disparos || [])) {
          if (!map[d.campanha_id]) {
            map[d.campanha_id] = d;
          }
        }
        setCampanhasDisparosMap(map);
      }
    } catch (error: any) {
      console.error('Erro ao carregar campanhas:', error);
    } finally {
      setCarregandoCampanhas(false);
    }
  }

  async function carregarFiltrosCampanha() {
    try {
      const { data: session } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('enviar-campanha-whatsapp', {
        body: { action: 'filtros' },
        headers: { Authorization: `Bearer ${session?.session?.access_token}` }
      });
      if (!error && data) {
        setFiltrosDisponiveis({ estados: data.estados || [], cidades: data.cidades || [] });
      }
    } catch (err: any) {
      console.error('Erro ao carregar filtros:', err);
    }
  }

  function limparNovaCampanha() {
    setNovaCampanha({ ...NOVA_CAMPANHA_INITIAL_STATE });
    setEstimativaDestinatarios(null);
    setEstimativaEmergencial(null);
    setEstimativaDiferenca(null);
    setConfirmandoEnvioCampanha(false);
    setConfirmandoEmergencial(false);
  }

  function fecharNovaCampanhaDialog() {
    if (enviandoCampanha) return;
    setNovaCampanhaOpen(false);
    limparNovaCampanha();
  }

  async function estimarDestinatariosCampanha(campanha = novaCampanha) {
    setEstimativaDestinatarios(null);
    setEstimativaEmergencial(null);
    setEstimativaDiferenca(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('enviar-campanha-whatsapp', {
        body: { 
          action: 'preview', 
          filtro_tipo: campanha.filtro_tipo, 
          filtro_valor: campanha.filtro_valor || null,
          tipo_mensagem: campanha.tipo_mensagem || null
        },
        headers: { Authorization: `Bearer ${session?.session?.access_token}` }
      });
      if (error) {
        console.error('Erro ao estimar destinatários (edge function):', error);
        setEstimativaDestinatarios(-1);
        return;
      }
      if (data?.error) {
        console.error('Erro ao estimar destinatários (resposta):', data.error);
        setEstimativaDestinatarios(-1);
        return;
      }
      setEstimativaDestinatarios(data?.total_normal ?? data?.total ?? 0);
      setEstimativaEmergencial(data?.total_emergencial ?? null);
      setEstimativaDiferenca(data?.diferenca ?? null);
    } catch (err: any) {
      console.error('Erro ao estimar destinatários:', err);
      setEstimativaDestinatarios(-1);
    }
  }

  async function criarEEnviarCampanha() {
    if (enviandoCampanha) return;
    if (!novaCampanha.titulo.trim() || !novaCampanha.mensagem.trim() || !novaCampanha.tipo_mensagem) return;
    setEnviandoCampanha(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      // Criar campanha
      const { data: campanhaCriada, error: insertError } = await supabase
        .from('campanhas_whatsapp')
        .insert({
          titulo: novaCampanha.titulo.trim(),
          mensagem: novaCampanha.mensagem.trim(),
          filtro_tipo: novaCampanha.filtro_tipo,
          filtro_valor: novaCampanha.filtro_valor || null,
          tipo_mensagem: novaCampanha.tipo_mensagem,
          envio_emergencial: novaCampanha.envio_emergencial,
          criado_por: user.id,
          status: 'rascunho'
        } as any)
        .select()
        .single();

      if (insertError) throw insertError;

      // Disparar envio
      const { data: session } = await supabase.auth.getSession();
      const { data: resultado, error: envioError } = await supabase.functions.invoke('enviar-campanha-whatsapp', {
        body: { action: 'enviar', campanha_id: campanhaCriada.id },
        headers: { Authorization: `Bearer ${session?.session?.access_token}` }
      });

      if (envioError) throw envioError;

      toast({ title: "Campanha enviada!", description: `Processados: ${resultado?.total_processados || 0} destinatários` });
      setNovaCampanhaOpen(false);
      limparNovaCampanha();
      await carregarCampanhas();
    } catch (error: any) {
      console.error('Erro ao criar campanha:', error);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      setConfirmandoEnvioCampanha(false);
    } finally {
      setEnviandoCampanha(false);
    }
  }

  async function reprocessarCampanha(campanhaId: string) {
    setEnviandoCampanha(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const { data: resultado, error } = await supabase.functions.invoke('enviar-campanha-whatsapp', {
        body: { action: 'enviar', campanha_id: campanhaId },
        headers: { Authorization: `Bearer ${session?.session?.access_token}` }
      });

      if (error) throw error;

      toast({ title: "Reprocessamento concluído", description: `${resultado?.total_processados || 0} envios reprocessados` });
      await carregarCampanhas();
      if (campanhaAtual?.id === campanhaId) {
        await abrirDetalheCampanha({ ...campanhaAtual, id: campanhaId });
      }
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setEnviandoCampanha(false);
    }
  }

  async function abrirDetalheCampanha(campanha: any) {
    setCampanhaAtual(campanha);
    setCampanhaDetalheOpen(true);
    setEditandoCampanha(false);
    setCampanhaEditada(null);
    setConfirmandoExclusaoCampanha(false);
    setConfirmandoReenvioCampanha(false);
    // Carregar envios e disparos em paralelo
    const [enviosRes, disparosRes] = await Promise.all([
      supabase
        .from('campanhas_whatsapp_envios')
        .select('*')
        .eq('campanha_id', campanha.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('campanhas_whatsapp_disparos')
        .select('*')
        .eq('campanha_id', campanha.id)
        .order('iniciado_em', { ascending: false })
    ]);
    setCampanhaEnvios(enviosRes.data || []);
    setCampanhaDisparos(disparosRes.data || []);
  }

  async function salvarEdicaoCampanha() {
    if (!campanhaEditada || !campanhaAtual) return;
    setEnviandoCampanha(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('enviar-campanha-whatsapp', {
        body: {
          action: 'editar',
          campanha_id: campanhaAtual.id,
          titulo: campanhaEditada.titulo,
          mensagem: campanhaEditada.mensagem,
          filtro_tipo: campanhaEditada.filtro_tipo,
          filtro_valor: campanhaEditada.filtro_valor || null,
          tipo_mensagem: campanhaEditada.tipo_mensagem || undefined,
          envio_emergencial: campanhaEditada.envio_emergencial,
        },
        headers: { Authorization: `Bearer ${session?.session?.access_token}` }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Campanha atualizada" });
      setEditandoCampanha(false);
      const updated = { ...campanhaAtual, ...campanhaEditada };
      setCampanhaAtual(updated);
      await carregarCampanhas();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setEnviandoCampanha(false);
    }
  }

  async function excluirCampanha() {
    if (!campanhaAtual) return;
    setEnviandoCampanha(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('enviar-campanha-whatsapp', {
        body: { action: 'excluir', campanha_id: campanhaAtual.id },
        headers: { Authorization: `Bearer ${session?.session?.access_token}` }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Campanha excluída" });
      setCampanhaDetalheOpen(false);
      setConfirmandoExclusaoCampanha(false);
      await carregarCampanhas();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setEnviandoCampanha(false);
    }
  }

  async function reenviarCampanha() {
    if (!campanhaAtual) return;
    setEnviandoCampanha(true);
    setConfirmandoReenvioCampanha(false);
    try {
      const { data: session } = await supabase.auth.getSession();
      const { data: resultado, error } = await supabase.functions.invoke('enviar-campanha-whatsapp', {
        body: { action: 'reenviar', campanha_id: campanhaAtual.id },
        headers: { Authorization: `Bearer ${session?.session?.access_token}` }
      });
      if (error) throw error;
      if (resultado?.error) throw new Error(resultado.error);
      toast({ title: "Reenvio concluído", description: `${resultado?.total_processados || 0} destinatários processados` });
      await carregarCampanhas();
      await abrirDetalheCampanha({ ...campanhaAtual, id: campanhaAtual.id });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setEnviandoCampanha(false);
    }
  }

  function getStatusCampanhaBadge(status: string) {
    const map: Record<string, { label: string, variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      rascunho: { label: 'Rascunho', variant: 'secondary' },
      enviando: { label: 'Enviando...', variant: 'default' },
      concluida: { label: 'Concluída', variant: 'outline' },
      concluida_parcial: { label: 'Parcial', variant: 'destructive' },
      falha: { label: 'Falha', variant: 'destructive' }
    };
    const info = map[status] || { label: status, variant: 'secondary' as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  }

  async function buscarProdutosMaster(termo: string) {
    setBuscandoMaster(true);
    try {
      const normalizado = termo.trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      
      const palavras = normalizado
        .split(/[;\s]+/)
        .filter(p => p.length >= 2);

      if (palavras.length === 0) {
        setResultadosBusca([]);
        return;
      }

      const { data, error } = await supabase.rpc(
        'buscar_produtos_master_por_palavras' as any,
        { p_palavras: palavras, p_limite: 50 }
      );

      if (error) throw error;
      setResultadosBusca(data || []);
    } catch (error: any) {
      console.error('Erro ao buscar produtos:', error);
      toast({
        title: "Erro na busca",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setBuscandoMaster(false);
    }
  }

  async function buscarCandidatosPendentes(termo: string) {
    setBuscandoPendentes(true);
    try {
      // Detectar se tem múltiplos termos separados por ";"
      const termos = termo.includes(';') 
        ? termo.split(';').map(t => t.trim()).filter(t => t.length > 0)
        : [termo.trim()];

      // Buscar todos os candidatos pendentes
      const { data, error } = await supabase
        .from('produtos_candidatos_normalizacao')
        .select('*')
        .eq('status', 'pendente')
        .order('confianca_ia', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Extrair palavras (split por ; e espaços, mínimo 2 chars)
      const palavras = normalizarParaBusca(termo)
        .split(/[;\s]+/)
        .filter(p => p.length >= 2);

      if (palavras.length === 0) {
        setResultadosBuscaPendentes([]);
        return;
      }

      // Concatenar campos relevantes e exigir TODAS as palavras (AND)
      const filtrados = (data || []).filter(candidato => {
        const textoCompleto = normalizarParaBusca(
          [candidato.texto_original, candidato.nome_padrao_sugerido,
           candidato.nome_base_sugerido, candidato.marca_sugerida,
           candidato.categoria_sugerida, candidato.sugestao_sku_global]
          .filter(Boolean).join(' ')
        );
        return palavras.every(p => textoCompleto.includes(p));
      });
      
      setResultadosBuscaPendentes(filtrados);
      
    } catch (error: any) {
      console.error('Erro ao buscar candidatos:', error);
      toast({
        title: "Erro na busca",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setBuscandoPendentes(false);
    }
  }

  async function processarNormalizacao() {
    setProcessando(true);
    try {
      toast({
        title: "Processamento iniciado",
        description: "A normalização está sendo processada em background...",
      });

      const { data, error } = await supabase.functions.invoke('processar-normalizacao-global', {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (error) throw error;

      toast({
        title: "Processamento concluído",
        description: `${data.processados} produtos processados. ${data.auto_aprovados} auto-aprovados, ${data.para_revisao} aguardando revisão.`,
      });

      await carregarDados();

    } catch (error: any) {
      console.error('Erro ao processar:', error);
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setProcessando(false);
    }
  }

  async function sincronizarCandidatosAprovados() {
    setSincronizandoManual(true);
    try {
      toast({
        title: "Sincronização iniciada",
        description: "Aplicando candidatos aprovados ao estoque...",
      });

      const { data, error } = await supabase.functions.invoke('aplicar-candidatos-aprovados', {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (error) throw error;

      const mensagem = data.sincronizados > 0 
        ? `${data.sincronizados} candidatos aplicados ao estoque com sucesso!`
        : 'Todos os candidatos já estavam sincronizados.';

      toast({
        title: "Sincronização concluída",
        description: mensagem,
      });

      await carregarDados();

    } catch (error: any) {
      console.error('Erro ao sincronizar:', error);
      toast({
        title: "Erro na sincronização",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSincronizandoManual(false);
    }
  }



  async function handleConsolidarDuplicatas() {
    setDetectandoDuplicatas(true);
    setConfirmarConsolidacaoOpen(false);
    
    try {
      toast({
        title: "🔍 Detectando duplicatas...",
        description: "Analisando produtos master com IA. Isso pode levar alguns minutos.",
      });

      // Chamar Edge Function para detectar duplicatas com IA (com timeout e retry)
      const detectarComTimeout = async (tentativa = 1): Promise<any> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

        try {
          const { data, error } = await supabase.functions.invoke('detectar-duplicatas-master', {
            body: {},
            headers: {
              'Content-Type': 'application/json'
            }
          });

          clearTimeout(timeoutId);

          if (error) {
            console.error(`❌ Erro ao detectar duplicatas (tentativa ${tentativa}):`, error);
            
            // Retry em caso de timeout ou erro de rede
            if (tentativa < 2 && (error.message?.includes('timeout') || error.message?.includes('network'))) {
              toast({
                title: "⚠️ Timeout detectado",
                description: `Tentando novamente... (${tentativa + 1}/2)`,
              });
              await new Promise(resolve => setTimeout(resolve, 2000)); // Aguardar 2s antes de retry
              return detectarComTimeout(tentativa + 1);
            }
            
            throw error;
          }

          return data;
        } catch (err: any) {
          clearTimeout(timeoutId);
          
          if (err.name === 'AbortError') {
            console.error('❌ Timeout na detecção de duplicatas');
            throw new Error('A detecção de duplicatas demorou muito. Tente filtrar por categoria específica.');
          }
          
          throw err;
        }
      };

      const data = await detectarComTimeout();
      
      // 🔍 Diagnóstico objetivo do retorno
      const grupos = Array.isArray(data?.grupos) ? data.grupos : [];
      console.log('📊 [DETECÇÃO] Retorno da edge function:', {
        typeof_data: typeof data,
        total_grupos_campo: data?.total_grupos,
        total_duplicatas_campo: data?.total_duplicatas,
        grupos_array_length: grupos.length,
        tempo_decorrido_s: data?.tempo_decorrido_s,
        comparacoes_realizadas: data?.comparacoes_realizadas,
        primeiro_grupo: grupos[0] ? { id: grupos[0].id, categoria: grupos[0].categoria, qtd_produtos: grupos[0].produtos?.length } : null,
      });
      
      if (grupos.length === 0) {
        toast({
          title: "✅ Nenhuma duplicata encontrada",
          description: `Catálogo Master já está consolidado! (${data?.comparacoes_realizadas || 0} comparações em ${data?.tempo_decorrido_s || 0}s)`
        });
        return;
      }
      
      // Preparar escolhas pré-selecionadas (produto com mais notas)
      const escolhas: Record<string, string> = {};
      const unificar: Record<string, Set<string>> = {};
      grupos.forEach((grupo: any) => {
        // Pré-selecionar o com mais notas
        const maisNotas = [...grupo.produtos].sort((a: any, b: any) => 
          b.total_notas - a.total_notas
        )[0];
        escolhas[grupo.id] = maisNotas.id;
        // Pré-marcar todos os outros para unificação
        unificar[grupo.id] = new Set(
          grupo.produtos.filter((p: any) => p.id !== maisNotas.id).map((p: any) => p.id)
        );
      });
      
      setGruposDuplicatas(grupos);
      setProdutosEscolhidos(escolhas);
      setProdutosParaUnificar(unificar);
      setGruposConsolidados(new Set());
      setModalDuplicatasOpen(true);
      
      
      toast({
        title: "🎯 Duplicatas detectadas!",
        description: `${grupos.length} grupo(s) encontrado(s). Tempo: ${data?.tempo_decorrido_s || 0}s`
      });
      
    } catch (error: any) {
      console.error('Erro ao consolidar duplicatas:', error);
      toast({
        title: "❌ Erro ao buscar duplicatas",
        description: error.message || "Tente novamente em alguns instantes",
        variant: "destructive"
      });
    } finally {
      setDetectandoDuplicatas(false);
    }
  }



  async function executarConsolidacaoIndividual(grupoId: string) {
    const grupo = gruposDuplicatas.find(g => g.id === grupoId);
    if (!grupo) return;

    const manterID = produtosEscolhidos[grupoId];
    const unificarSet = produtosParaUnificar[grupoId] || new Set();
    const removerIDs = Array.from(unificarSet).filter(id => id !== manterID);

    if (removerIDs.length === 0) {
      toast({
        title: "⚠️ Nenhum item selecionado",
        description: "Marque ao menos um produto para unificar com o principal.",
        variant: "destructive"
      });
      return;
    }

    setConsolidandoGrupo(grupoId);

    try {
      toast({
        title: "⚙️ Consolidando grupo...",
        description: "Criando sinônimos e atualizando referências"
      });

      const { data, error } = await supabase.functions.invoke(
        'consolidar-masters-manual',
        { body: { grupos: [{ manter_id: manterID, remover_ids: removerIDs }] } }
      );

      if (error) throw error;

      toast({
        title: "✅ Grupo consolidado!",
        description: `${data.total_masters_removidos} produto(s) unificado(s)`,
        duration: 5000
      });

      // Remover grupo da lista sem fechar o modal
      setGruposConsolidados(prev => new Set(prev).add(grupoId));
      setGruposDuplicatas(prev => prev.filter(g => g.id !== grupoId));

      // Recarregar dados em background
      carregarDados();
      carregarProdutosRecentes();

    } catch (error: any) {
      console.error('Erro ao consolidar grupo:', error);
      toast({
        title: "❌ Erro na consolidação",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setConsolidandoGrupo(null);
    }
  }

  async function executarConsolidacaoManual() {
    setConsolidando(true);
    
    try {
      // Filtrar grupos ignorados e já consolidados
      const gruposParaConsolidar = gruposDuplicatas
        .filter(grupo => !gruposIgnorados.has(grupo.id) && !gruposConsolidados.has(grupo.id))
        .map(grupo => {
          const manterID = produtosEscolhidos[grupo.id];
          const unificarSet = produtosParaUnificar[grupo.id] || new Set();
          const removerIDs = Array.from(unificarSet).filter(id => id !== manterID);
          
          return {
            manter_id: manterID,
            remover_ids: removerIDs
          };
        })
        .filter(g => g.remover_ids.length > 0);

      if (gruposParaConsolidar.length === 0 && gruposIgnorados.size === 0) {
        toast({
          title: "❌ Nenhum grupo com itens selecionados",
          description: "Marque ao menos um produto para unificar em cada grupo.",
          variant: "destructive"
        });
        setConsolidando(false);
        return;
      }

      if (gruposParaConsolidar.length === 0 && gruposIgnorados.size > 0) {
        toast({
          title: "✅ Grupos ignorados",
          description: `${gruposIgnorados.size} grupo(s) marcado(s) como não-duplicatas`
        });
        setModalDuplicatasOpen(false);
        setGruposDuplicatas([]);
        setProdutosEscolhidos({});
        setProdutosParaUnificar({});
        setGruposIgnorados(new Set());
        setGruposConsolidados(new Set());
        setBuscaDuplicatas("");
        setConsolidando(false);
        return;
      }

      toast({
        title: "⚙️ Consolidando...",
        description: "Criando sinônimos e atualizando referências"
      });

      const { data, error } = await supabase.functions.invoke(
        'consolidar-masters-manual',
        { body: { grupos: gruposParaConsolidar } }
      );

      if (error) throw error;

      setRelatorioConsolidacao(data);
      
      const ignoradosMsg = gruposIgnorados.size > 0 
        ? ` (${gruposIgnorados.size} grupo(s) ignorado(s))` 
        : '';
      
      toast({
        title: "✅ Consolidação concluída!",
        description: `${data.total_masters_removidos} produto(s) consolidado(s) em ${data.total_grupos_consolidados} grupo(s)${ignoradosMsg}`,
        duration: 5000
      });

      // Fechar modal e limpar estados
      setModalDuplicatasOpen(false);
      setGruposDuplicatas([]);
      setProdutosEscolhidos({});
      setProdutosParaUnificar({});
      setGruposIgnorados(new Set());
      setGruposConsolidados(new Set());
      setBuscaDuplicatas("");
      
      // Recarregar dados
      await carregarDados();
      await carregarProdutosRecentes();

    } catch (error: any) {
      console.error('Erro ao consolidar:', error);
      toast({
        title: "❌ Erro na consolidação",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setConsolidando(false);
    }
  }

  async function consolidarMastersDuplicados() {
    // Redirecionar para nova função
    await handleConsolidarDuplicatas();
  }


  // Função para calcular unidade base
  function calcularUnidadeBase(qtd_valor: number, qtd_unidade: string) {
    let qtd_base = qtd_valor;
    let unidade_base = qtd_unidade;
    let categoria_unidade = 'UNIDADE';
    
    const unidadeUpper = qtd_unidade.toUpperCase();
    
    // L → ml
    if (['L', 'LITRO', 'LITROS'].includes(unidadeUpper)) {
      qtd_base = qtd_valor * 1000;
      unidade_base = 'ml';
      categoria_unidade = 'VOLUME';
    }
    // kg → g
    else if (['KG', 'KILO', 'KILOS'].includes(unidadeUpper)) {
      qtd_base = qtd_valor * 1000;
      unidade_base = 'g';
      categoria_unidade = 'PESO';
    }
    // ml
    else if (['ML', 'MILILITRO', 'MILILITROS'].includes(unidadeUpper)) {
      categoria_unidade = 'VOLUME';
      unidade_base = 'ml';
    }
    // g
    else if (['G', 'GRAMA', 'GRAMAS'].includes(unidadeUpper)) {
      categoria_unidade = 'PESO';
      unidade_base = 'g';
    }
    
    return { qtd_base, unidade_base, categoria_unidade };
  }

  async function abrirModalEdicao(candidato: any) {
    setCandidatoAtual(candidato);
    setProdutoMasterEditando(null);
    
    // Limpar estados de imagem
    setImagemFile(null);
    setImagemPreview(null);
    
    // Calcular unidade base automaticamente
    const qtdValor = parseFloat(candidato.qtd_valor_sugerido || '0');
    const qtdUnidade = candidato.qtd_unidade_sugerido || '';
    const { qtd_base, unidade_base, categoria_unidade } = calcularUnidadeBase(qtdValor, qtdUnidade);
    
    setEditForm({
      nome_padrao: candidato.nome_padrao_sugerido || '',
      categoria: candidato.categoria_sugerida || '',
      nome_base: candidato.nome_base_sugerido || '',
      marca: candidato.marca_sugerida || '',
      tipo_embalagem: candidato.tipo_embalagem_sugerido || '',
      qtd_valor: candidato.qtd_valor_sugerido?.toString() || '',
      qtd_unidade: candidato.qtd_unidade_sugerido || '',
      qtd_base: qtd_base.toString(),
      unidade_base: unidade_base,
      categoria_unidade: categoria_unidade,
      granel: candidato.granel_sugerido || false,
      sku_global: candidato.sugestao_sku_global || '',
      codigo_barras: ''
    });

    // Buscar EAN comercial via RPC segura (bypass RLS, restrito a masters)
    try {
      const { data: ean } = await supabase
        .rpc('buscar_ean_por_candidato', { p_candidato_id: candidato.id });
      if (ean) {
        setEditForm(prev => ({ ...prev, codigo_barras: ean }));
      }
    } catch (e) {
      console.log('Erro ao buscar EAN do estoque:', e);
    }
    
    // Buscar produtos similares antes de abrir o modal
    buscarProdutosSimilares(candidato);
    
    setEditModalOpen(true);
  }

  function abrirModalRejeicao(candidato: any) {
    setCandidatoAtual(candidato);
    setObservacoesRejeicao('');
    setRejectModalOpen(true);
  }

  async function aprovarComModificacoes() {
    if (!candidatoAtual) return;

    try {
      setPaginaAtual(1); // Resetar para primeira página
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      let imagemUrl = null;
      let imagemPath = null;

      // Upload de imagem se selecionada
      if (imagemFile) {
        setUploadingImage(true);
        const tempId = crypto.randomUUID();
        const fileExt = imagemFile.name.split('.').pop();
        const fileName = `${tempId}-${Date.now()}.${fileExt}`;
        const filePath = fileName;

        const { error: uploadError } = await supabase.storage
          .from('produtos-master-fotos')
          .upload(filePath, imagemFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('produtos-master-fotos')
          .getPublicUrl(filePath);

        imagemUrl = publicUrl;
        imagemPath = filePath;
        setUploadingImage(false);
      }

      // Garantir SKU único antes de inserir
      let skuFinal = editForm.sku_global;
      const { data: skuExistente } = await supabase
        .from('produtos_master_global')
        .select('id')
        .eq('sku_global', skuFinal)
        .maybeSingle();

      if (skuExistente) {
        // SKU já existe, gerar sufixo único
        const sufixo = Date.now().toString(36).toUpperCase();
        skuFinal = `${editForm.sku_global}-${sufixo}`;
      }

      // Criar produto master com dados editados
      const insertData: any = {
        sku_global: skuFinal,
        nome_padrao: editForm.nome_padrao,
        categoria: editForm.categoria,
        nome_base: editForm.nome_base,
        marca: editForm.marca || null,
        tipo_embalagem: editForm.tipo_embalagem || null,
        qtd_valor: editForm.qtd_valor ? parseFloat(editForm.qtd_valor) : null,
        qtd_unidade: editForm.qtd_unidade || null,
        qtd_base: editForm.qtd_base ? parseFloat(editForm.qtd_base) : null,
        unidade_base: editForm.unidade_base || null,
        categoria_unidade: editForm.categoria_unidade || null,
        granel: editForm.granel,
        codigo_barras: editForm.codigo_barras || null,
        confianca_normalizacao: candidatoAtual.confianca_ia,
        aprovado_por: user.id,
        aprovado_em: new Date().toISOString(),
        status: 'ativo'
      };

      if (imagemUrl) {
        insertData.imagem_url = imagemUrl;
        insertData.imagem_path = imagemPath;
        insertData.imagem_adicionada_por = user.id;
        insertData.imagem_adicionada_em = new Date().toISOString();
      }

      const { data: produtoMaster, error: errorMaster } = await supabase
        .from('produtos_master_global')
        .insert(insertData)
        .select()
        .single();

      if (errorMaster) throw errorMaster;

      // Atualizar candidato
      const { error: errorCandidato } = await supabase
        .from('produtos_candidatos_normalizacao')
        .update({ 
          status: 'aprovado',
          revisado_por: user.id,
          revisado_em: new Date().toISOString(),
          sugestao_produto_master: produtoMaster.id
        })
        .eq('id', candidatoAtual.id);

      if (errorCandidato) throw errorCandidato;
      
      // 🔥 NOVO: Atualizar estoques vinculados a este candidato
      console.log(`🔗 Atualizando estoques vinculados ao candidato ${candidatoAtual.id}...`);
      const { data: estoquesAtualizados, error: errorEstoque } = await supabase
        .from('estoque_app')
        .update({
          produto_master_id: produtoMaster.id,
          produto_nome_normalizado: produtoMaster.nome_padrao,
          sku_global: produtoMaster.sku_global,
          nome_base: produtoMaster.nome_base,
          marca: produtoMaster.marca,
          tipo_embalagem: produtoMaster.tipo_embalagem,
          qtd_valor: produtoMaster.qtd_valor,
          qtd_unidade: produtoMaster.qtd_unidade,
          categoria: normalizarCategoriaParaEstoque(produtoMaster.categoria),
          produto_candidato_id: null  // Limpar link provisório
        })
        .eq('produto_candidato_id', candidatoAtual.id)
        .select();

      if (errorEstoque) {
        console.error('⚠️ Erro ao atualizar estoques vinculados:', errorEstoque);
      } else {
        const count = estoquesAtualizados?.length || 0;
        console.log(`✅ ${count} registros de estoque atualizados com normalização`);
        if (count > 0) {
          toast({
            title: "✅ Estoques atualizados",
            description: `${count} ${count === 1 ? 'produto' : 'produtos'} no estoque ${count === 1 ? 'foi atualizado' : 'foram atualizados'} automaticamente`,
          });
        }
      }

      // Salvar no log de decisões para aprendizado da IA
      const { error: errorLog } = await supabase
        .from('normalizacao_decisoes_log')
        .insert({
          texto_original: candidatoAtual.texto_original,
          candidato_id: candidatoAtual.id,
          decisao: 'aprovado_com_modificacoes',
          sugestao_ia: {
            nome_padrao: candidatoAtual.nome_padrao_sugerido,
            categoria: candidatoAtual.categoria_sugerida,
            nome_base: candidatoAtual.nome_base_sugerido,
            marca: candidatoAtual.marca_sugerida,
            tipo_embalagem: candidatoAtual.tipo_embalagem_sugerido,
            qtd_valor: candidatoAtual.qtd_valor_sugerido,
            qtd_unidade: candidatoAtual.qtd_unidade_sugerido,
            granel: candidatoAtual.granel_sugerido,
            confianca: candidatoAtual.confianca_ia
          },
          decisao_master: editForm,
          decidido_por: user.id,
          produto_master_final: produtoMaster.id,
          usado_para_treino: false
        });

      if (errorLog) console.error('Erro ao salvar log:', errorLog);

      toast({
        title: "Aprovado com modificações",
        description: "Produto adicionado ao catálogo master com suas edições",
      });

      setEditModalOpen(false);
      await carregarDados();

    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive"
      });
    }
  }

  const buscarProdutosSimilares = async (candidato: any) => {
    if (!candidato.nome_base_sugerido || !candidato.categoria_sugerida) {
      setProdutosSimilares([]);
      return;
    }

    setCarregandoSimilares(true);
    try {
      const { data, error } = await supabase
        .rpc('buscar_produtos_similares_master', {
          p_nome_base: candidato.nome_base_sugerido,
          p_categoria: candidato.categoria_sugerida,
          p_limite: 10
        });

      if (error) throw error;
      
      // Filtrar apenas com score >= 0.6 (60%)
      const similares = (data || []).filter((p: any) => p.score >= 0.6);
      setProdutosSimilares(similares);
      
      if (similares.length > 0) {
        console.log(`✅ Encontrados ${similares.length} produtos similares para "${candidato.nome_base_sugerido}"`);
      }
    } catch (error: any) {
      console.error('❌ Erro ao buscar similares:', error);
      setProdutosSimilares([]);
    } finally {
      setCarregandoSimilares(false);
    }
  };

  const vincularAProdutoExistente = async (produtoMasterId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      // Atualizar candidato para vincular ao master existente
      const { error } = await supabase
        .from('produtos_candidatos_normalizacao')
        .update({ 
          status: 'aprovado',
          revisado_por: user.id,
          revisado_em: new Date().toISOString(),
          sugestao_produto_master: produtoMasterId,
          observacoes_revisor: 'Vinculado a produto master existente via detecção de similaridade'
        })
        .eq('id', candidatoAtual.id);

      if (error) throw error;

      // Buscar dados do produto master para sincronização com estoque
      const { data: produtoMaster, error: errorMaster } = await supabase
        .from('produtos_master_global')
        .select('*')
        .eq('id', produtoMasterId)
        .single();

      if (errorMaster) throw errorMaster;

      // Atualizar estoques vinculados a este candidato
      console.log(`🔗 Atualizando estoques vinculados ao candidato ${candidatoAtual.id}...`);
      const { data: estoquesAtualizados, error: errorEstoque } = await supabase
        .from('estoque_app')
        .update({
          produto_master_id: produtoMaster.id,
          produto_nome_normalizado: produtoMaster.nome_padrao,
          sku_global: produtoMaster.sku_global,
          nome_base: produtoMaster.nome_base,
          marca: produtoMaster.marca,
          tipo_embalagem: produtoMaster.tipo_embalagem,
          qtd_valor: produtoMaster.qtd_valor,
          qtd_unidade: produtoMaster.qtd_unidade,
          categoria: normalizarCategoriaParaEstoque(produtoMaster.categoria),
          imagem_url: produtoMaster.imagem_url || null,
          produto_candidato_id: null
        })
        .eq('produto_candidato_id', candidatoAtual.id)
        .select();

      if (errorEstoque) {
        console.error('⚠️ Erro ao atualizar estoques vinculados:', errorEstoque);
      } else {
        const count = estoquesAtualizados?.length || 0;
        console.log(`✅ ${count} registros de estoque atualizados`);
        if (count > 0) {
          toast({
            title: "✅ Estoques atualizados",
            description: `${count} ${count === 1 ? 'produto' : 'produtos'} no estoque ${count === 1 ? 'foi atualizado' : 'foram atualizados'}`,
          });
        }
      }

      // Salvar no log de decisões
      const { error: errorLog } = await supabase
        .from('normalizacao_decisoes_log')
        .insert({
          texto_original: candidatoAtual.texto_original,
          candidato_id: candidatoAtual.id,
          decisao: 'vinculado_a_existente',
          sugestao_ia: {
            nome_padrao: candidatoAtual.nome_padrao_sugerido,
            categoria: candidatoAtual.categoria_sugerida,
            nome_base: candidatoAtual.nome_base_sugerido
          },
          decidido_por: user.id,
          produto_master_final: produtoMasterId
        });

      if (errorLog) console.error('Erro ao salvar log:', errorLog);

      toast({
        title: "✅ Vinculado com sucesso",
        description: "Produto vinculado ao master existente sem criar duplicata"
      });

      // Fechar modal e recarregar
      setEditModalOpen(false);
      setProdutosSimilares([]);
      await carregarDados();
      
    } catch (error: any) {
      console.error('Erro ao vincular:', error);
      toast({
        title: "❌ Erro ao vincular",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  async function aprovarSemModificacoes(candidatoId: string) {
    try {
      setPaginaAtual(1); // Resetar para primeira página
      const candidato = candidatos.find(c => c.id === candidatoId);
      if (!candidato) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Criar produto master
      const { data: produtoMaster, error: errorMaster } = await supabase
        .from('produtos_master_global')
        .insert({
          sku_global: candidato.sugestao_sku_global,
          nome_padrao: candidato.nome_padrao_sugerido,
          categoria: candidato.categoria_sugerida,
          nome_base: candidato.nome_base_sugerido,
          marca: candidato.marca_sugerida,
          tipo_embalagem: candidato.tipo_embalagem_sugerido,
          qtd_valor: candidato.qtd_valor_sugerido,
          qtd_unidade: candidato.qtd_unidade_sugerido,
          granel: candidato.granel_sugerido,
          confianca_normalizacao: candidato.confianca_ia,
          aprovado_por: user.id,
          aprovado_em: new Date().toISOString(),
          status: 'ativo'
        })
        .select()
        .single();

      if (errorMaster) throw errorMaster;

      // Atualizar candidato
      const { error: errorCandidato } = await supabase
        .from('produtos_candidatos_normalizacao')
        .update({ 
          status: 'aprovado',
          revisado_por: user.id,
          revisado_em: new Date().toISOString(),
          sugestao_produto_master: produtoMaster.id
        })
        .eq('id', candidatoId);

      if (errorCandidato) throw errorCandidato;
      
      // 🔥 NOVO: Atualizar estoques vinculados a este candidato
      console.log(`🔗 Atualizando estoques vinculados ao candidato ${candidatoId}...`);
      const { data: estoquesAtualizados, error: errorEstoque } = await supabase
        .from('estoque_app')
        .update({
          produto_master_id: produtoMaster.id,
          produto_nome_normalizado: produtoMaster.nome_padrao,
          sku_global: produtoMaster.sku_global,
          nome_base: produtoMaster.nome_base,
          marca: produtoMaster.marca,
          tipo_embalagem: produtoMaster.tipo_embalagem,
          qtd_valor: produtoMaster.qtd_valor,
          qtd_unidade: produtoMaster.qtd_unidade,
          categoria: normalizarCategoriaParaEstoque(produtoMaster.categoria),
          produto_candidato_id: null  // Limpar link provisório
        })
        .eq('produto_candidato_id', candidatoId)
        .select();

      if (errorEstoque) {
        console.error('⚠️ Erro ao atualizar estoques vinculados:', errorEstoque);
      } else {
        const count = estoquesAtualizados?.length || 0;
        console.log(`✅ ${count} registros de estoque atualizados com normalização`);
        if (count > 0) {
          toast({
            title: "✅ Estoques atualizados",
            description: `${count} ${count === 1 ? 'produto' : 'produtos'} no estoque ${count === 1 ? 'foi atualizado' : 'foram atualizados'} automaticamente`,
          });
        }
      }

      // Salvar no log - aprovação sem modificações
      const { error: errorLog } = await supabase
        .from('normalizacao_decisoes_log')
        .insert({
          texto_original: candidato.texto_original,
          candidato_id: candidato.id,
          decisao: 'aprovado_sem_modificacoes',
          sugestao_ia: {
            nome_padrao: candidato.nome_padrao_sugerido,
            categoria: candidato.categoria_sugerida,
            confianca: candidato.confianca_ia
          },
          decidido_por: user.id,
          produto_master_final: produtoMaster.id,
          usado_para_treino: false
        });

      if (errorLog) console.error('Erro ao salvar log:', errorLog);

      toast({
        title: "Aprovado",
        description: "Produto adicionado ao catálogo master",
      });

      await carregarDados();

    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive"
      });
    }
  }

  async function editarProdutoMaster(produtoId: string) {
    try {
      const { data: produto, error } = await supabase
        .from('produtos_master_global')
        .select('*')
        .eq('id', produtoId)
        .single();

      if (error) throw error;
      if (!produto) return;

      setProdutoMasterEditando(produtoId);
      setCandidatoAtual(null);

      // Preencher form com dados do produto master
      setEditForm({
        nome_padrao: produto.nome_padrao || '',
        categoria: produto.categoria || '',
        nome_base: produto.nome_base || '',
        marca: produto.marca || '',
        tipo_embalagem: produto.tipo_embalagem || '',
        qtd_valor: produto.qtd_valor?.toString() || '',
        qtd_unidade: produto.qtd_unidade || '',
        qtd_base: produto.qtd_base?.toString() || '',
        unidade_base: produto.unidade_base || '',
        categoria_unidade: produto.categoria_unidade || '',
        granel: produto.granel || false,
        sku_global: produto.sku_global || '',
        codigo_barras: produto.codigo_barras || ''
      });

      // Carregar imagem existente se houver
      if (produto.imagem_url) {
        setImagemPreview(produto.imagem_url);
      } else {
        setImagemPreview(null);
      }
      setImagemFile(null);

      setEditModalOpen(true);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive"
      });
    }
  }

  async function salvarEdicaoProdutoMaster() {
    if (!produtoMasterEditando) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      let imagemUrl = imagemPreview; // Manter existente
      let imagemPath = null;

      // Upload de nova imagem se selecionada
      if (imagemFile) {
        setUploadingImage(true);
        const fileExt = imagemFile.name.split('.').pop();
        const fileName = `${produtoMasterEditando}-${Date.now()}.${fileExt}`;
        const filePath = fileName;

        const { error: uploadError } = await supabase.storage
          .from('produtos-master-fotos')
          .upload(filePath, imagemFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('produtos-master-fotos')
          .getPublicUrl(filePath);

        imagemUrl = publicUrl;
        imagemPath = filePath;
        setUploadingImage(false);
      }

      // Atualizar produto master (sku_global não é editável após criação)
      const updateData: any = {
        nome_padrao: editForm.nome_padrao,
        categoria: editForm.categoria,
        nome_base: editForm.nome_base,
        marca: editForm.marca || null,
        tipo_embalagem: editForm.tipo_embalagem || null,
        qtd_valor: editForm.qtd_valor ? parseFloat(editForm.qtd_valor) : null,
        qtd_unidade: editForm.qtd_unidade || null,
        qtd_base: editForm.qtd_base ? parseFloat(editForm.qtd_base) : null,
        unidade_base: editForm.unidade_base || null,
        categoria_unidade: editForm.categoria_unidade || null,
        granel: editForm.granel,
        codigo_barras: editForm.codigo_barras || null,
        updated_at: new Date().toISOString()
      };

      if (imagemFile && imagemUrl && imagemPath) {
        updateData.imagem_url = imagemUrl;
        updateData.imagem_path = imagemPath;
        updateData.imagem_adicionada_por = user.id;
        updateData.imagem_adicionada_em = new Date().toISOString();
      }

      const { error } = await supabase
        .from('produtos_master_global')
        .update(updateData)
        .eq('id', produtoMasterEditando);

      if (error) throw error;

      toast({
        title: "Produto atualizado",
        description: "As alterações foram salvas com sucesso",
      });

      setEditModalOpen(false);
      setProdutoMasterEditando(null);
      await carregarDados();

    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive"
      });
    }
  }

  async function excluirProdutoMaster() {
    if (!produtoMasterEditando) return;

    try {
      setExcluindoProduto(true);

      // 1. Deletar imagem do storage (se existir)
      if (imagemPreview && imagemPreview.includes('produtos-master-fotos')) {
        const pathMatch = imagemPreview.match(/produtos-master-fotos\/(.+)$/);
        if (pathMatch) {
          const filePath = pathMatch[1].split('?')[0];
          await supabase.storage
            .from('produtos-master-fotos')
            .remove([filePath]);
        }
      }

      // 2. Desvincular candidatos que referenciam este master
      const { data: candidatosAfetados, error: updateError } = await supabase
        .from('produtos_candidatos_normalizacao')
        .update({ sugestao_produto_master: null })
        .eq('sugestao_produto_master', produtoMasterEditando)
        .select('id');

      if (updateError) {
        console.error('Erro ao desvincular candidatos:', updateError);
        throw updateError;
      }

      // 3. Deletar o produto master
      const { error } = await supabase
        .from('produtos_master_global')
        .delete()
        .eq('id', produtoMasterEditando);

      if (error) throw error;

      toast({
        title: "✅ Produto excluído",
        description: `Produto removido. ${candidatosAfetados?.length || 0} candidatos desvinculados.`,
      });

      // 3. Fechar modais e recarregar dados
      setConfirmarExclusaoOpen(false);
      setEditModalOpen(false);
      setProdutoMasterEditando(null);
      await carregarDados();

    } catch (error: any) {
      console.error('Erro ao excluir produto:', error);
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setExcluindoProduto(false);
    }
  }

  async function rejeitarComObservacoes() {
    if (!candidatoAtual) return;
    
    if (!observacoesRejeicao.trim()) {
      toast({
        title: "Observações obrigatórias",
        description: "Por favor, explique o motivo da rejeição para ajudar a IA a aprender",
        variant: "destructive"
      });
      return;
    }

    try {
      setPaginaAtual(1); // Resetar para primeira página
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Atualizar candidato com observações
      const { error: errorCandidato } = await supabase
        .from('produtos_candidatos_normalizacao')
        .update({ 
          status: 'rejeitado',
          revisado_por: user.id,
          revisado_em: new Date().toISOString(),
          observacoes_revisor: observacoesRejeicao
        })
        .eq('id', candidatoAtual.id);

      if (errorCandidato) throw errorCandidato;

      // Salvar no log para aprendizado
      const { error: errorLog } = await supabase
        .from('normalizacao_decisoes_log')
        .insert({
          texto_original: candidatoAtual.texto_original,
          candidato_id: candidatoAtual.id,
          decisao: 'rejeitado',
          sugestao_ia: {
            nome_padrao: candidatoAtual.nome_padrao_sugerido,
            categoria: candidatoAtual.categoria_sugerida,
            confianca: candidatoAtual.confianca_ia,
            razao_ia: candidatoAtual.razao_ia
          },
          feedback_texto: observacoesRejeicao,
          decidido_por: user.id,
          usado_para_treino: false
        });

      if (errorLog) console.error('Erro ao salvar log:', errorLog);

      toast({
        title: "Rejeitado",
        description: "Feedback registrado para melhorar a IA",
      });

      setRejectModalOpen(false);
      await carregarDados();

    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive"
      });
    }
  }

  // ============= FUNÇÕES DE RASPAGEM DE IMAGENS =============
  
  const buscarImagensProdutos = async (batchSize: number, autoAprovar: boolean) => {
    setProcessandoImagens(true);
    setImagensSugeridas([]);
    
    try {
      // Buscar produtos sem imagem
      const { data: produtosSemImagem, error: errorProdutos } = await supabase
        .from('produtos_master_global')
        .select('id, sku_global, nome_padrao')
        .is('imagem_url', null)
        .eq('status', 'ativo')
        .limit(batchSize);

      if (errorProdutos) throw errorProdutos;
      if (!produtosSemImagem || produtosSemImagem.length === 0) {
        toast({
          title: "Sem produtos",
          description: "Não há produtos sem imagem para processar",
        });
        setProcessandoImagens(false);
        return;
      }

      const produtoIds = produtosSemImagem.map(p => p.id);

      toast({
        title: "Processando...",
        description: `Buscando imagens para ${produtoIds.length} produtos...`,
      });

      // Chamar edge function
      const { data, error } = await supabase.functions.invoke('buscar-imagens-produtos', {
        body: { produtoIds }
      });

      if (error) throw error;
      if (!data || !data.success) {
        throw new Error(data?.error || 'Erro ao buscar imagens');
      }

      const resultados = data.resultados || [];
      
      // Se auto-aprovar, atualizar produtos com confiança >= 80%
      if (autoAprovar) {
        const paraAprovar = resultados.filter(
          (r: any) => 
            r.status === 'success' && 
            r.opcoesImagens?.length > 0 &&
            r.opcoesImagens[0].confianca >= 80
        );

        for (const resultado of paraAprovar) {
          const primeiraImagem = resultado.opcoesImagens[0];
          await supabase
            .from('produtos_master_global')
            .update({
              imagem_url: primeiraImagem.imageUrl,
              imagem_path: primeiraImagem.imagemPath,
              imagem_adicionada_em: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', resultado.produtoId);
        }

        toast({
          title: "Processamento completo!",
          description: `${paraAprovar.length} imagens auto-aprovadas, ${resultados.length - paraAprovar.length} aguardando revisão`,
        });

        // Mostrar apenas os que precisam revisão
        setImagensSugeridas(resultados.filter((r: any) => 
          r.status === 'error' || 
          !r.opcoesImagens?.length ||
          r.opcoesImagens[0].confianca < 80
        ));
        setTotalProcessadoImagens(prev => prev + paraAprovar.length);
      } else {
        setImagensSugeridas(resultados);
        toast({
          title: "Busca completa!",
          description: `${resultados.length} resultados encontrados`,
        });
      }

      // Recarregar stats
      await carregarDados();

    } catch (error: any) {
      console.error('Erro ao buscar imagens:', error);
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessandoImagens(false);
    }
  };

  const handleImagemAprovada = (produtoId: string) => {
    setImagensSugeridas(prev => prev.filter(item => item.produtoId !== produtoId));
    setTotalProcessadoImagens(prev => prev + 1);
    carregarDados();
    toast({
      title: "✅ Imagem aprovada!",
      description: "Card removido da lista",
    });
  };

  const handleImagemRejeitada = (produtoId: string) => {
    setImagensSugeridas(prev => prev.filter(item => item.produtoId !== produtoId));
    toast({
      title: "Imagem rejeitada",
      description: "Card removido. Você pode buscar novamente depois",
    });
  };

  const handleResultadoAtualizado = (novoResultado: any) => {
    setImagensSugeridas(prev => 
      prev.map(item => 
        item.produtoId === novoResultado.produtoId 
          ? {
              ...item,
              ...novoResultado,
              // Força atualização do key para re-render
              _updateKey: Date.now()
            }
          : item
      )
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Shield className="w-12 h-12 mx-auto animate-pulse text-primary" />
          <p className="text-muted-foreground">Verificando acesso master...</p>
        </div>
      </div>
    );
  }

  if (!isMaster) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary" />
            Normalização Global Master
          </h1>
          <p className="text-muted-foreground mt-1">
            Sistema de normalização universal de produtos Picotinho
          </p>
        </div>
      </div>

      {/* Dashboard Otimizado */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Dashboard de Normalização
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Grid de Estatísticas */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {/* Catálogo Master */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="bg-gradient-to-br from-primary/10 to-purple-50 dark:from-primary/20 dark:to-purple-950/30 rounded-lg p-4 border-2 border-primary/30 hover:border-primary/50 transition-all cursor-help">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="h-5 w-5 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground">Catálogo Master</span>
                    </div>
                    <div className="text-3xl font-bold text-primary mb-1">
                      {stats.totalProdutosMaster}
                    </div>
                    <div className="text-xs text-muted-foreground">produtos únicos</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Total de produtos únicos no catálogo master</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Auto-Aprovados */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-lg p-4 border-2 border-green-300 dark:border-green-700 hover:border-green-400 dark:hover:border-green-600 transition-all cursor-help">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <span className="text-xs font-medium text-muted-foreground">Auto-Aprovados</span>
                      <Badge variant="default" className="bg-green-600 text-white text-[10px] px-1.5 py-0">
                        IA ≥ 90%
                      </Badge>
                    </div>
                    <div className="text-3xl font-bold text-green-700 dark:text-green-300 mb-1">
                      {stats.autoAprovadosTotal}
                    </div>
                    <div className="text-xs text-muted-foreground">candidatos aprovados</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-semibold">Aprovados automaticamente pela IA (confiança ≥ 90%)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Aprovados Manualmente */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-lg p-4 border-2 border-blue-300 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-600 transition-all cursor-help">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-medium text-muted-foreground">Aprov. Manual</span>
                    </div>
                    <div className="text-3xl font-bold text-blue-700 dark:text-blue-300 mb-1">
                      {stats.aprovadosManuaisTotal}
                    </div>
                    <div className="text-xs text-muted-foreground">candidatos aprovados</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Produtos aprovados manualmente por você</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Produtos sem Fotos */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 rounded-lg p-4 border-2 border-orange-300 dark:border-orange-700 hover:border-orange-400 dark:hover:border-orange-600 transition-all cursor-help">
                    <div className="flex items-center gap-2 mb-2">
                      <ImageOff className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      <span className="text-xs font-medium text-muted-foreground">Sem Fotos</span>
                    </div>
                    <div className="text-3xl font-bold text-orange-700 dark:text-orange-300 mb-1">
                      {stats.produtosSemImagem}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      de {stats.totalProdutosMaster} produtos
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Produtos do catálogo master sem imagem</p>
                  <p className="text-xs mt-1">{stats.produtosComImagem} já possuem imagem</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Aguardando Revisão */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 rounded-lg p-4 border-2 border-yellow-300 dark:border-yellow-700 hover:border-yellow-400 dark:hover:border-yellow-600 transition-all cursor-help">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                      <span className="text-xs font-medium text-muted-foreground">Aguardando</span>
                    </div>
                    <div className="text-3xl font-bold text-yellow-700 dark:text-yellow-300 mb-1">
                      {stats.pendentesTotal}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ~{stats.estimativaNovos} novos estimados
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-semibold">Candidatos aguardando revisão</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Estabelecimentos Pendentes */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div 
                    className="bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/30 rounded-lg p-4 border-2 border-rose-300 dark:border-rose-700 hover:border-rose-400 dark:hover:border-rose-600 transition-all cursor-pointer"
                    onClick={() => navigate('/admin/normalizacoes-estabelecimentos')}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                      <span className="text-xs font-medium text-muted-foreground">Estab. Pendentes</span>
                    </div>
                    <div className="text-3xl font-bold text-rose-700 dark:text-rose-300 mb-1">
                      {stats.estabelecimentosPendentes}
                    </div>
                    <div className="text-xs text-muted-foreground">estabelecimentos</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Estabelecimentos ainda sem regra de normalização</p>
                  <p className="text-xs mt-1">Clique para gerenciar</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Usuários Cadastrados */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30 rounded-lg p-4 border-2 border-teal-300 dark:border-teal-700 hover:border-teal-400 dark:hover:border-teal-600 transition-all cursor-help">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                      <span className="text-xs font-medium text-muted-foreground">Usuários</span>
                    </div>
                    <div className="text-3xl font-bold text-teal-700 dark:text-teal-300 mb-1">
                      {stats.totalUsuarios}
                    </div>
                    <div className="text-xs text-muted-foreground">cadastrados</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Total de usuários cadastrados no sistema</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Total de Notas no Sistema */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 rounded-lg p-4 border-2 border-violet-300 dark:border-violet-700 hover:border-violet-400 dark:hover:border-violet-600 transition-all cursor-help">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                      <span className="text-xs font-medium text-muted-foreground">Notas</span>
                    </div>
                    <div className="text-3xl font-bold text-violet-700 dark:text-violet-300 mb-1">
                      {stats.totalNotas}
                    </div>
                    <div className="text-xs text-muted-foreground">lançadas no sistema</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Total de notas lançadas por todos os usuários</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Suporte / Feedbacks */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 rounded-lg p-4 border-2 ${feedbackStats.total > 0 ? 'border-orange-400 dark:border-orange-600 animate-pulse' : 'border-orange-300 dark:border-orange-700'} hover:border-orange-400 dark:hover:border-orange-600 transition-all cursor-help`}>
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      <span className="text-xs font-medium text-muted-foreground">Suporte</span>
                    </div>
                    <div className="text-3xl font-bold text-orange-700 dark:text-orange-300 mb-1">
                      {feedbackStats.total}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {feedbackStats.erros > 0 && <div>🐛 {feedbackStats.erros} erro{feedbackStats.erros > 1 ? 's' : ''}</div>}
                      {feedbackStats.sugestoes > 0 && <div>💡 {feedbackStats.sugestoes} sugestão{feedbackStats.sugestoes > 1 ? 'ões' : ''}</div>}
                      {feedbackStats.reclamacoes > 0 && <div>👎 {feedbackStats.reclamacoes} reclamação{feedbackStats.reclamacoes > 1 ? 'ões' : ''}</div>}
                      {feedbackStats.duvidas > 0 && <div>❓ {feedbackStats.duvidas} dúvida{feedbackStats.duvidas > 1 ? 's' : ''}</div>}
                      {feedbackStats.total === 0 && <div>pendentes de ação</div>}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Feedbacks pendentes de ação (novo + em análise)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Separador */}
          <div className="border-t border-border"></div>

          {/* Botões de Ação */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button 
              onClick={processarNormalizacao}
              disabled={processando || consolidando || sincronizandoManual}
              className="flex-1 gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl transition-all"
            >
              <Zap className="w-4 h-4" />
              {processando ? 'Processando...' : 'Processar Novas Normalizações'}
            </Button>

            {stats.autoAprovadosTotal > 0 && (
              <Button 
                onClick={sincronizarCandidatosAprovados}
                disabled={processando || consolidando || sincronizandoManual}
                variant="secondary"
                className="flex-1 gap-2 shadow-lg hover:shadow-xl transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                {sincronizandoManual ? 'Corrigindo...' : 'Corrigir Sincronização (Emergência)'}
                <Badge 
                  variant="default" 
                  className="ml-2"
                >
                  {stats.autoAprovadosTotal}
                </Badge>
              </Button>
            )}

            <Button 
              onClick={() => setConfirmarConsolidacaoOpen(true)}
              disabled={processando || consolidando || detectandoDuplicatas || sincronizandoManual}
              variant="destructive"
              className="flex-1 gap-2 shadow-lg hover:shadow-xl transition-all"
            >
              <Database className="w-4 h-4" />
              {detectandoDuplicatas ? 'Detectando...' : consolidando ? 'Consolidando...' : 'Buscar e Consolidar Duplicatas'}
            </Button>

            <Button 
              onClick={() => navigate("/admin/normalizacoes-estabelecimentos")}
              variant="outline"
              className="gap-2 shadow-lg hover:shadow-xl transition-all"
              disabled={processando || consolidando || sincronizandoManual}
            >
              <Building2 className="w-4 h-4" />
              Gerenciar Estabelecimentos
            </Button>

            <Button 
              onClick={() => navigate("/recategorizar-inteligente")}
              variant="secondary"
              className="gap-2 shadow-lg hover:shadow-xl transition-all"
              disabled={processando || consolidando || recategorizando || sincronizandoManual}
            >
              <RotateCcw className="w-4 h-4" />
              Recategorizar Produtos
            </Button>
          </div>
        </CardContent>
      </Card>


      {/* Progresso da Detecção de Duplicatas */}
      {detectandoDuplicatas && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5 animate-pulse" />
              Detectando Duplicatas...
            </CardTitle>
            <CardDescription>
              Analisando produtos master com IA. Isso pode levar alguns minutos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progresso da Consolidação */}
      {consolidando && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 animate-pulse" />
              Consolidando Masters Duplicados
            </CardTitle>
            <CardDescription>
              Removendo duplicatas e criando sinônimos...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-destructive"></div>
            </div>
          </CardContent>
        </Card>
      )}


      {/* Relatório de Consolidação */}
      {relatorioConsolidacao && (
        <Card className="border-green-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Consolidação Concluída
            </CardTitle>
            <CardDescription>
              Resumo da operação
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Grupos Consolidados</p>
                <p className="text-2xl font-bold text-green-600">{relatorioConsolidacao.grupos_consolidados}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Masters Removidos</p>
                <p className="text-2xl font-bold text-destructive">{relatorioConsolidacao.masters_removidos}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sinônimos Criados</p>
                <p className="text-2xl font-bold text-blue-600">{relatorioConsolidacao.sinonimos_criados}</p>
              </div>
            </div>

            {relatorioConsolidacao.grupos && relatorioConsolidacao.grupos.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Grupos Consolidados:</p>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {relatorioConsolidacao.grupos.map((grupo: any, idx: number) => (
                    <div key={idx} className="text-sm p-2 bg-muted rounded border">
                      <p className="font-medium">{grupo.nome_base} {grupo.marca && `(${grupo.marca})`}</p>
                      <p className="text-muted-foreground">
                        {grupo.duplicados_removidos} duplicados removidos → Master: {grupo.master_principal_sku}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {grupo.sinonimos_criados} sinônimos | {grupo.referencias_atualizadas_estoque} refs estoque
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button 
              onClick={() => setRelatorioConsolidacao(null)} 
              variant="outline" 
              className="w-full"
            >
              Fechar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="pendentes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pendentes" className="gap-2">
            <Clock className="w-4 h-4" />
            Pendentes ({stats.pendentesTotal})
          </TabsTrigger>
          <TabsTrigger value="catalogo" className="gap-2">
            <Package className="w-4 h-4" />
            Catálogo Master
          </TabsTrigger>
          <TabsTrigger value="raspagem-imagens" className="gap-2">
            <ImageOff className="w-4 h-4" />
            Raspagem de Imagens ({stats.produtosSemImagem})
          </TabsTrigger>
          <TabsTrigger value="suporte" className="gap-2">
            <MessageSquare className="w-4 h-4" />
            Suporte {feedbackStats.total > 0 && <Badge variant="destructive" className="ml-1">{feedbackStats.total}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="campanhas" className="gap-2" onClick={() => { carregarFiltrosCampanha(); }}>
            <Send className="w-4 h-4" />
            Campanhas {campanhasEmAndamento > 0 && <Badge variant="default" className="ml-1">{campanhasEmAndamento}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Candidatos Pendentes */}
        <TabsContent value="pendentes" className="space-y-4">
          {/* Campo de busca */}
          <div className="mb-4 space-y-2">
            <Input
              placeholder="Buscar pendentes... (use ; para múltiplos termos: ex: manteiga ; aviação)"
              value={filtroPendentes}
              onChange={(e) => setFiltroPendentes(e.target.value)}
              className="max-w-md"
            />
            {filtroPendentes && filtroPendentes.includes(';') && (
              <div className="text-xs text-muted-foreground">
                🔍 Buscando por {filtroPendentes.split(';').filter(t => t.trim()).length} termos
              </div>
            )}
            {filtroPendentes && (
              <p className="text-sm text-muted-foreground">
                {buscandoPendentes 
                  ? 'Buscando...' 
                  : `Mostrando ${resultadosBuscaPendentes.length} de ${candidatos.length} pendente(s)`}
              </p>
            )}
          </div>

          {candidatos.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Tudo aprovado!</h3>
                <p className="text-muted-foreground text-center">
                  Não há candidatos pendentes de revisão no momento.
                </p>
              </CardContent>
            </Card>
          ) : buscandoPendentes ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Clock className="w-16 h-16 text-muted-foreground mb-4 animate-pulse" />
                <p className="text-muted-foreground">Buscando candidatos...</p>
              </CardContent>
            </Card>
          ) : (filtroPendentes ? resultadosBuscaPendentes : candidatos).length === 0 && filtroPendentes ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="w-16 h-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhum resultado encontrado</h3>
                <p className="text-muted-foreground text-center">
                  Tente outros termos de busca ou remova o filtro
                </p>
              </CardContent>
            </Card>
          ) : (
            (filtroPendentes ? resultadosBuscaPendentes : candidatos).map((candidato) => (
              <Card key={candidato.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{candidato.nome_padrao_sugerido}</CardTitle>
                        <Badge variant={candidato.confianca_ia >= 80 ? "default" : "secondary"}>
                          {candidato.confianca_ia}% confiança
                        </Badge>
                        <Badge variant="outline">{candidato.categoria_sugerida}</Badge>
                      </div>
                      <CardDescription>
                        Texto original: "{candidato.texto_original}"
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => abrirModalEdicao(candidato)}
                        className="gap-1"
                      >
                        <Edit3 className="w-4 h-4" />
                        Editar e Aprovar
                      </Button>
                      <Button 
                        size="sm" 
                        variant="default"
                        onClick={() => aprovarSemModificacoes(candidato.id)}
                        className="gap-1"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Aprovar
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => abrirModalRejeicao(candidato)}
                        className="gap-1"
                      >
                        <XCircle className="w-4 h-4" />
                        Rejeitar
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">SKU:</span>
                      <p className="font-mono">{candidato.sugestao_sku_global}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Nome Base:</span>
                      <p className="font-medium">{candidato.nome_base_sugerido}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Marca:</span>
                      <p>{candidato.marca_sugerida || '-'}</p>
                    </div>
                     <div>
                       <span className="text-muted-foreground">Quantidade:</span>
                       <p>
                         {candidato.qtd_valor_sugerido} {candidato.qtd_unidade_sugerido}
                         {candidato.granel_sugerido && ' (granel)'}
                       </p>
                       {candidato.qtd_base_sugerida && (
                         <p className="text-xs text-muted-foreground mt-1">
                           Base: {candidato.qtd_base_sugerida} {candidato.unidade_base_sugerida}
                         </p>
                       )}
                     </div>
                   </div>
                  {candidato.razao_ia && (
                    <div className="mt-4 p-3 bg-muted rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Análise da IA:</p>
                          <p className="text-sm text-muted-foreground">{candidato.razao_ia}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
          
          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-muted-foreground">
                Página {paginaAtual} de {totalPaginas} • {stats.pendentesTotal} candidatos no total
              </div>
              
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => paginaAtual > 1 && setPaginaAtual(paginaAtual - 1)}
                      className={paginaAtual === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  
                  {/* Mostrar primeiras páginas */}
                  {[...Array(totalPaginas)].map((_, i) => {
                    const pageNum = i + 1;
                    
                    // Mostrar apenas páginas relevantes
                    const showPage = (
                      pageNum === 1 || // primeira página
                      pageNum === totalPaginas || // última página
                      (pageNum >= paginaAtual - 1 && pageNum <= paginaAtual + 1) // páginas próximas
                    );
                    
                    // Mostrar ellipsis
                    const showEllipsisBefore = pageNum === paginaAtual - 1 && paginaAtual > 3;
                    const showEllipsisAfter = pageNum === paginaAtual + 1 && paginaAtual < totalPaginas - 2;
                    
                    if (!showPage && !showEllipsisBefore && !showEllipsisAfter) {
                      return null;
                    }
                    
                    if (showEllipsisBefore && pageNum > 1) {
                      return (
                        <PaginationItem key={`ellipsis-before-${i}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      );
                    }
                    
                    if (showEllipsisAfter && pageNum < totalPaginas) {
                      return (
                        <PaginationItem key={`ellipsis-after-${i}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      );
                    }
                    
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          onClick={() => setPaginaAtual(pageNum)}
                          isActive={paginaAtual === pageNum}
                          className="cursor-pointer"
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  
                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => paginaAtual < totalPaginas && setPaginaAtual(paginaAtual + 1)}
                      className={paginaAtual === totalPaginas ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </TabsContent>

        {/* Catálogo Master */}
        <TabsContent value="catalogo" className="space-y-4">
          {/* Campo de busca */}
          <div className="mb-4 space-y-2">
            <Input
              placeholder="Buscar... (use ; para múltiplos termos: ex: leite ; piracanjuba)"
              value={filtroMaster}
              onChange={(e) => setFiltroMaster(e.target.value)}
              className="max-w-md"
            />
            {filtroMaster && filtroMaster.includes(';') && (
              <div className="text-xs text-muted-foreground">
                🔍 Buscando por {filtroMaster.split(';').filter(t => t.trim()).length} termos
              </div>
            )}
            {filtroMaster && (
              <p className="text-sm text-muted-foreground">
                {buscandoMaster ? 'Buscando...' : `Mostrando ${resultadosBusca.length} resultado(s)`}
              </p>
            )}
          </div>

          {buscandoMaster ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="w-16 h-16 text-muted-foreground mb-4 animate-pulse" />
                <p className="text-muted-foreground">Buscando produtos...</p>
              </CardContent>
            </Card>
          ) : (filtroMaster ? resultadosBusca : produtosMaster).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="w-16 h-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {filtroMaster ? 'Nenhum resultado encontrado' : 'Catálogo vazio'}
                </h3>
                <p className="text-muted-foreground text-center">
                  {filtroMaster 
                    ? 'Tente outros termos de busca' 
                    : 'Nenhum produto normalizado ainda. Execute o processamento para começar.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            (filtroMaster ? resultadosBusca : produtosMaster)
              .map((produto) => (
              <Card key={produto.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      {/* Foto do produto */}
                      {produto.imagem_url && (
                        <div className="w-16 h-16 rounded-md overflow-hidden bg-muted border flex-shrink-0">
                          <img 
                            src={produto.imagem_url} 
                            alt={produto.nome_padrao}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-lg">{produto.nome_padrao}</CardTitle>
                          <Badge variant="outline">{produto.categoria}</Badge>
                          {produto.status === 'ativo' && (
                            <Badge variant="default">Ativo</Badge>
                          )}
                          <Badge variant={produto.imagem_url ? "default" : "secondary"}>
                            {produto.imagem_url ? "COM FOTO" : "SEM FOTO"}
                          </Badge>
                        </div>
                        <CardDescription>SKU: {produto.sku_global}</CardDescription>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => editarProdutoMaster(produto.id)}
                        className="gap-1"
                      >
                        <Edit3 className="w-4 h-4" />
                        Editar
                      </Button>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="text-center">
                          <Users className="w-4 h-4 mx-auto mb-1" />
                          <span>{produto.total_usuarios}</span>
                        </div>
                        <div className="text-center">
                          <TrendingUp className="w-4 h-4 mx-auto mb-1" />
                          <span>{produto.total_notas}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Nome Base:</span>
                      <p className="font-medium">{produto.nome_base}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Marca:</span>
                      <p>{produto.marca || '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Embalagem:</span>
                      <p>{produto.tipo_embalagem || '-'}</p>
                    </div>
                     <div>
                       <span className="text-muted-foreground">Quantidade:</span>
                       <p>
                         {produto.qtd_valor} {produto.qtd_unidade}
                         {produto.granel && ' (granel)'}
                       </p>
                       {produto.qtd_base && (
                         <p className="text-xs text-muted-foreground mt-1">
                           Base: {produto.qtd_base} {produto.unidade_base}
                         </p>
                       )}
                     </div>
                   </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="raspagem-imagens" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <ScrapingControls
                totalSemImagem={stats.produtosSemImagem}
                totalProcessado={totalProcessadoImagens}
                processando={processandoImagens}
                onBuscarImagens={buscarImagensProdutos}
              />
            </div>

            <div className="md:col-span-2">
              {imagensSugeridas.length === 0 && !processandoImagens ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <ImageOff className="w-16 h-16 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Nenhuma busca realizada</h3>
                    <p className="text-muted-foreground text-center">
                      Selecione o tamanho do lote e clique em "Buscar Imagens no Google" para começar
                    </p>
                  </CardContent>
                </Card>
              ) : processandoImagens ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-16 h-16 text-primary mb-4 animate-spin" />
                    <h3 className="text-lg font-semibold mb-2">Processando...</h3>
                    <p className="text-muted-foreground text-center">
                      Buscando e baixando imagens do Google. Isso pode levar alguns minutos.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {imagensSugeridas.map((resultado) => (
                    <ImagePreviewCard
                      key={resultado.produtoId}
                      resultado={resultado}
                      onAprovado={handleImagemAprovada}
                      onRejeitado={handleImagemRejeitada}
                      onResultadoAtualizado={handleResultadoAtualizado}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Suporte / Feedbacks */}
        <TabsContent value="suporte" className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-3 mb-4">
            <select
              value={feedbackFiltroTipo}
              onChange={(e) => setFeedbackFiltroTipo(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="todos">Todos os tipos</option>
              <option value="erro">🐛 Erros</option>
              <option value="sugestao">💡 Sugestões</option>
              <option value="reclamacao">👎 Reclamações</option>
              <option value="duvida">❓ Dúvidas</option>
            </select>
            <select
              value={feedbackFiltroStatus}
              onChange={(e) => setFeedbackFiltroStatus(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="todos">Todos os status</option>
              <option value="novo">🆕 Novo</option>
              <option value="em_analise">🔍 Em análise</option>
              <option value="respondido">✅ Respondido</option>
              <option value="resolvido">✔️ Resolvido</option>
            </select>
            <Button variant="outline" size="sm" onClick={carregarFeedbacks} disabled={carregandoFeedbacks}>
              <RotateCcw className={`w-4 h-4 mr-1 ${carregandoFeedbacks ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>

          {/* Lista de feedbacks */}
          <div className="space-y-3">
            {feedbacks
              .filter(f => feedbackFiltroTipo === 'todos' || f.tipo === feedbackFiltroTipo)
              .filter(f => feedbackFiltroStatus === 'todos' || f.status === feedbackFiltroStatus)
              .map((feedback: any) => {
                const tipoIcons: Record<string, string> = { erro: '🐛', sugestao: '💡', reclamacao: '👎', duvida: '❓' };
                const tipoLabels: Record<string, string> = { erro: 'Erro', sugestao: 'Sugestão', reclamacao: 'Reclamação', duvida: 'Dúvida' };
                const statusColors: Record<string, string> = {
                  novo: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
                  em_analise: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
                  respondido: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                  resolvido: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                };
                return (
                  <Card
                    key={feedback.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => abrirDetalheFeedback(feedback)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{tipoIcons[feedback.tipo] || '📩'}</span>
                            <span className="font-medium text-sm">{tipoLabels[feedback.tipo] || feedback.tipo}</span>
                            <Badge className={`text-xs ${statusColors[feedback.status] || ''}`}>
                              {feedback.status?.replace('_', ' ')}
                            </Badge>
                            {feedback.prioridade === 'alta' || feedback.prioridade === 'urgente' ? (
                              <Badge variant="destructive" className="text-xs">{feedback.prioridade}</Badge>
                            ) : null}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{feedback.mensagem}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span>📱 {feedback.telefone_whatsapp || 'Sem telefone'}</span>
                            <span>📅 {new Date(feedback.created_at).toLocaleDateString('pt-BR')} {new Date(feedback.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            {feedbacks.filter(f => feedbackFiltroTipo === 'todos' || f.tipo === feedbackFiltroTipo).filter(f => feedbackFiltroStatus === 'todos' || f.status === feedbackFiltroStatus).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum feedback encontrado com os filtros selecionados.</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Campanhas WhatsApp */}
        <TabsContent value="campanhas" className="space-y-4">
          {/* Cards resumo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Campanhas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{campanhas.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Concluídas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{campanhas.filter(c => c.status === 'concluida').length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Em Andamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{campanhasEmAndamento}</div>
              </CardContent>
            </Card>
          </div>

          {/* Botão Nova Campanha */}
          <Button
            type="button"
            onClick={() => {
              const campanhaInicial = { ...NOVA_CAMPANHA_INITIAL_STATE };
              setNovaCampanha(campanhaInicial);
              setConfirmandoEnvioCampanha(false);
              setEstimativaDestinatarios(null);
              setNovaCampanhaOpen(true);
              estimarDestinatariosCampanha(campanhaInicial);
            }}
            className="gap-2"
          >
            <Send className="w-4 h-4" />
            Nova Campanha
          </Button>

          {/* Lista de campanhas */}
          {campanhas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Send className="w-16 h-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhuma campanha ainda</h3>
                <p className="text-muted-foreground text-center">Crie sua primeira campanha para enviar mensagens via WhatsApp.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {campanhas.map((campanha) => {
                const ultimoDisparo = campanhasDisparosMap[campanha.id];
                const totalDisparos = (campanha.total_reenvios || 0) + 1;
                const temDisparos = !!ultimoDisparo;
                return (
                <Card key={campanha.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => abrirDetalheCampanha(campanha)}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold">{campanha.titulo}</h4>
                          {getStatusCampanhaBadge(campanha.status)}
                          {campanha.tipo_mensagem ? (
                            <Badge variant="outline" className="text-xs">{getTipoMensagemLabel(campanha.tipo_mensagem)}</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">Sem tipo</Badge>
                          )}
                          {campanha.envio_emergencial && (
                            <Badge variant="destructive" className="text-xs">🚨 Emergencial</Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {campanha.filtro_tipo === 'todos' ? 'Todos' : `${campanha.filtro_tipo}: ${campanha.filtro_valor}`}
                          </Badge>
                          {totalDisparos > 1 && (
                            <Badge variant="secondary" className="text-xs">
                              Enviada {totalDisparos}x
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1">{campanha.mensagem}</p>
                      </div>
                      <div className="text-right text-sm text-muted-foreground space-y-1 shrink-0 ml-4">
                        <div>
                          {temDisparos
                            ? <>Último envio: {new Date(ultimoDisparo.iniciado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} {new Date(ultimoDisparo.iniciado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>
                            : <>Criada em {new Date(campanha.created_at).toLocaleDateString('pt-BR')}</>
                          }
                        </div>
                        <div className="flex gap-3 justify-end">
                          <span>📩 {campanha.total_enviados}/{campanha.total_destinatarios}</span>
                          {campanha.total_falhas > 0 && <span className="text-destructive">❌ {campanha.total_falhas}</span>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* Dialog Nova Campanha */}
      <Dialog
        open={novaCampanhaOpen}
        onOpenChange={(open) => {
          if (!open) {
            fecharNovaCampanhaDialog();
            return;
          }
          if (!enviandoCampanha) {
            setNovaCampanhaOpen(true);
          }
        }}
      >
        <DialogContent
          className="max-w-lg"
          onPointerDownOutside={(event) => {
            if (enviandoCampanha) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (enviandoCampanha) event.preventDefault();
          }}
        >
          {!confirmandoEnvioCampanha ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Send className="w-5 h-5" />
                  Nova Campanha WhatsApp
                </DialogTitle>
                <DialogDescription>Envie uma mensagem para seus usuários ativos via WhatsApp.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="camp_titulo">Título da campanha *</Label>
                  <Input id="camp_titulo" value={novaCampanha.titulo} onChange={(e) => setNovaCampanha({ ...novaCampanha, titulo: e.target.value })} placeholder="Ex: Novidades do Picotinho" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="camp_msg">Mensagem *</Label>
                  <Textarea id="camp_msg" value={novaCampanha.mensagem} onChange={(e) => setNovaCampanha({ ...novaCampanha, mensagem: e.target.value })} placeholder="Escreva a mensagem que será enviada..." rows={5} />
                  <p className="text-xs text-muted-foreground">Prefixo automático: 📢 *Picotinho*</p>
                </div>
                {/* Tipo da mensagem (obrigatório) */}
                <div className="space-y-2">
                  <Label>Tipo da mensagem *</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={novaCampanha.tipo_mensagem}
                    onChange={(e) => {
                      const proximaCampanha = { ...novaCampanha, tipo_mensagem: e.target.value };
                      setNovaCampanha(proximaCampanha);
                      estimarDestinatariosCampanha(proximaCampanha);
                    }}
                  >
                    <option value="">Selecione o tipo...</option>
                    {TIPO_MENSAGEM_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">O envio respeitará as preferências dos usuários para este tipo de mensagem.</p>
                </div>
                <div className="space-y-2">
                  <Label>Público-alvo</Label>
                  <RadioGroup
                    value={novaCampanha.filtro_tipo}
                    onValueChange={(v) => {
                      const proximaCampanha = { ...novaCampanha, filtro_tipo: v, filtro_valor: '' };
                      setNovaCampanha(proximaCampanha);
                      estimarDestinatariosCampanha(proximaCampanha);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="todos" id="filtro_todos" />
                      <Label htmlFor="filtro_todos">Todos os usuários ativos</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="estado" id="filtro_estado" />
                      <Label htmlFor="filtro_estado">Por Estado</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="cidade" id="filtro_cidade" />
                      <Label htmlFor="filtro_cidade">Por Cidade</Label>
                    </div>
                  </RadioGroup>
                </div>
                {novaCampanha.filtro_tipo !== 'todos' && (
                  <div className="space-y-2">
                    <Label>{novaCampanha.filtro_tipo === 'estado' ? 'Estado' : 'Cidade'}</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={novaCampanha.filtro_valor}
                      onChange={(e) => {
                        const proximaCampanha = { ...novaCampanha, filtro_valor: e.target.value };
                        setNovaCampanha(proximaCampanha);
                        estimarDestinatariosCampanha(proximaCampanha);
                      }}
                    >
                      <option value="">Selecione...</option>
                      {(novaCampanha.filtro_tipo === 'estado' ? filtrosDisponiveis.estados : filtrosDisponiveis.cidades).map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                )}
                {/* Envio emergencial - apenas para master */}
                {isMaster && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="camp_emergencial"
                        checked={novaCampanha.envio_emergencial}
                        onCheckedChange={(checked) => setNovaCampanha({ ...novaCampanha, envio_emergencial: !!checked })}
                      />
                      <Label htmlFor="camp_emergencial" className="text-sm font-medium cursor-pointer">
                        🚨 Envio emergencial (ignorar preferências dos usuários)
                      </Label>
                    </div>
                    {novaCampanha.envio_emergencial && (
                      <div className="rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-3 text-sm space-y-1">
                        <p className="font-medium text-yellow-800 dark:text-yellow-300">⚠️ Modo emergencial ativado</p>
                        <p className="text-yellow-700 dark:text-yellow-400">Esta campanha ignorará as preferências de tipo de mensagem dos usuários e será enviada para todos os telefones elegíveis. Use apenas em casos excepcionais (incidentes de segurança, avisos urgentes do sistema, comunicações críticas).</p>
                      </div>
                    )}
                  </div>
                )}
                {/* Estimativa de destinatários */}
                {estimativaDestinatarios !== null && (
                  <div className="rounded-lg bg-muted p-3 space-y-1">
                    <p className="text-sm font-medium">📊 Destinatários (respeitando preferências): <strong>{estimativaDestinatarios}</strong></p>
                    {novaCampanha.envio_emergencial && estimativaEmergencial !== null && (
                      <>
                        <p className="text-sm font-medium">🚨 Destinatários (emergencial): <strong>{estimativaEmergencial}</strong></p>
                        {estimativaDiferenca !== null && estimativaDiferenca > 0 && (
                          <p className="text-xs text-yellow-700 dark:text-yellow-400">+{estimativaDiferenca} destinatário(s) adicional(is) por ignorar preferências</p>
                        )}
                      </>
                    )}
                    <p className="text-xs text-muted-foreground">Critério: telefones autorizados (verificado + ativo), DISTINCT por usuário</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={fecharNovaCampanhaDialog}>Cancelar</Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (novaCampanha.envio_emergencial) {
                      setConfirmandoEmergencial(true);
                    } else {
                      setConfirmandoEnvioCampanha(true);
                    }
                  }}
                  disabled={!novaCampanha.titulo.trim() || !novaCampanha.mensagem.trim() || !novaCampanha.tipo_mensagem || (novaCampanha.filtro_tipo !== 'todos' && !novaCampanha.filtro_valor) || estimativaDestinatarios === 0}
                  className="gap-2"
                >
                  <Send className="w-4 h-4" />
                  Revisar e Enviar
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Confirmar envio de campanha?</DialogTitle>
                <DialogDescription>Revise os dados abaixo antes de disparar a campanha.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                  <p className="font-semibold">{novaCampanha.titulo}</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{novaCampanha.mensagem}</p>
                </div>
                <div className="space-y-2 rounded-lg border p-4 text-sm">
                  <p><strong>Tipo:</strong> {getTipoMensagemLabel(novaCampanha.tipo_mensagem)}</p>
                  <p><strong>Público:</strong> {novaCampanha.filtro_tipo === 'todos' ? 'Todos os usuários' : `${novaCampanha.filtro_tipo}: ${novaCampanha.filtro_valor}`}</p>
                  <p><strong>Destinatários estimados:</strong> {novaCampanha.envio_emergencial ? (estimativaEmergencial ?? estimativaDestinatarios ?? 'Calculando...') : (estimativaDestinatarios === null ? 'Calculando...' : estimativaDestinatarios === -1 ? <span className="text-destructive">Erro ao estimar. <button type="button" className="underline" onClick={() => estimarDestinatariosCampanha()}>Tentar novamente</button></span> : estimativaDestinatarios)}</p>
                  {novaCampanha.envio_emergencial && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 mt-2 space-y-1">
                      <p className="font-semibold text-destructive">🚨 ENVIO EMERGENCIAL</p>
                      <p className="text-destructive/90 text-xs">Esta campanha ignorará as preferências de mensagens dos usuários. A mensagem será enviada para todos os telefones elegíveis. Esta opção deve ser usada apenas em casos excepcionais.</p>
                    </div>
                  )}
                  <p className="text-muted-foreground">As mensagens serão enviadas via WhatsApp com o prefixo 📢 *Picotinho*. Esta ação não pode ser desfeita.</p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConfirmandoEnvioCampanha(false)} disabled={enviandoCampanha}>Voltar</Button>
                <Button type="button" onClick={criarEEnviarCampanha} disabled={enviandoCampanha} className="gap-2">
                  {enviandoCampanha ? <><Loader2 className="h-4 w-4 animate-spin" />Enviando...</> : <><Send className="h-4 w-4" />Confirmar e Enviar</>}
                </Button>
              </DialogFooter>
            </>
          )}
      <Dialog open={campanhaDetalheOpen} onOpenChange={(open) => {
        if (!open) {
          setEditandoCampanha(false);
          setCampanhaEditada(null);
          setConfirmandoReenvioCampanha(false);
        }
        setCampanhaDetalheOpen(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {campanhaAtual && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Send className="w-5 h-5" />
                  {editandoCampanha ? 'Editar Campanha' : campanhaAtual.titulo}
                  {!editandoCampanha && getStatusCampanhaBadge(campanhaAtual.status)}
                </DialogTitle>
                <DialogDescription>
                  Criada em {new Date(campanhaAtual.created_at).toLocaleDateString('pt-BR')} às {new Date(campanhaAtual.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {(campanhaAtual.total_reenvios || 0) > 0 && ` · Enviada ${(campanhaAtual.total_reenvios || 0) + 1} vez(es)`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {editandoCampanha && campanhaEditada ? (
                  /* Modo edição */
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Título</Label>
                      <Input value={campanhaEditada.titulo} onChange={(e) => setCampanhaEditada({ ...campanhaEditada, titulo: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Mensagem</Label>
                      <Textarea value={campanhaEditada.mensagem} onChange={(e) => setCampanhaEditada({ ...campanhaEditada, mensagem: e.target.value })} rows={5} />
                    </div>
                    <div className="space-y-2">
                      <Label>Público-alvo</Label>
                      <RadioGroup
                        value={campanhaEditada.filtro_tipo}
                        onValueChange={(v) => setCampanhaEditada({ ...campanhaEditada, filtro_tipo: v, filtro_valor: '' })}
                      >
                        <div className="flex items-center gap-2"><RadioGroupItem value="todos" id="edit_todos" /><Label htmlFor="edit_todos">Todos</Label></div>
                        <div className="flex items-center gap-2"><RadioGroupItem value="estado" id="edit_estado" /><Label htmlFor="edit_estado">Por Estado</Label></div>
                        <div className="flex items-center gap-2"><RadioGroupItem value="cidade" id="edit_cidade" /><Label htmlFor="edit_cidade">Por Cidade</Label></div>
                      </RadioGroup>
                    </div>
                    {campanhaEditada.filtro_tipo !== 'todos' && (
                      <div className="space-y-2">
                        <Label>{campanhaEditada.filtro_tipo === 'estado' ? 'Estado' : 'Cidade'}</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={campanhaEditada.filtro_valor || ''}
                          onChange={(e) => setCampanhaEditada({ ...campanhaEditada, filtro_valor: e.target.value })}
                        >
                          <option value="">Selecione...</option>
                          {(campanhaEditada.filtro_tipo === 'estado' ? filtrosDisponiveis.estados : filtrosDisponiveis.cidades).map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button onClick={salvarEdicaoCampanha} disabled={enviandoCampanha || !campanhaEditada.titulo.trim() || !campanhaEditada.mensagem.trim()} className="gap-2">
                        {enviandoCampanha ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Salvar
                      </Button>
                      <Button variant="outline" onClick={() => { setEditandoCampanha(false); setCampanhaEditada(null); }} disabled={enviandoCampanha}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  /* Modo visualização */
                  <>
                    {/* Mensagem */}
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-1">Mensagem:</p>
                      <p className="text-sm whitespace-pre-wrap">{campanhaAtual.mensagem}</p>
                    </div>

                    {/* Critério de disparo */}
                    <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                      <p className="font-medium">Critério de disparo:</p>
                      <p>Público: {campanhaAtual.filtro_tipo === 'todos' ? 'Todos os usuários ativos' : `${campanhaAtual.filtro_tipo}: ${campanhaAtual.filtro_valor}`}</p>
                      <p>Total destinatários: {campanhaAtual.total_destinatarios}</p>
                      <p>Enviados: {campanhaAtual.total_enviados} | Falhas: {campanhaAtual.total_falhas}</p>
                    </div>

                    {/* Ações */}
                    <div className="flex flex-wrap gap-2">
                      {/* Editar */}
                      {campanhaAtual.status !== 'enviando' && (
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                          setCampanhaEditada({
                            titulo: campanhaAtual.titulo,
                            mensagem: campanhaAtual.mensagem,
                            filtro_tipo: campanhaAtual.filtro_tipo,
                            filtro_valor: campanhaAtual.filtro_valor || '',
                          });
                          setEditandoCampanha(true);
                          carregarFiltrosCampanha();
                        }}>
                          <Edit3 className="w-4 h-4" /> Editar
                        </Button>
                      )}

                      {/* Reprocessar falhas */}
                      {['falha', 'concluida_parcial'].includes(campanhaAtual.status) && (
                        <Button onClick={() => reprocessarCampanha(campanhaAtual.id)} disabled={enviandoCampanha} variant="outline" size="sm" className="gap-2">
                          <RotateCcw className="w-4 h-4" />
                          {enviandoCampanha ? 'Reprocessando...' : 'Reprocessar falhas'}
                        </Button>
                      )}

                      {/* Reenviar campanha completa */}
                      {['concluida', 'concluida_parcial', 'falha'].includes(campanhaAtual.status) && !confirmandoReenvioCampanha && (
                        <Button onClick={() => setConfirmandoReenvioCampanha(true)} disabled={enviandoCampanha} variant="outline" size="sm" className="gap-2">
                          <Send className="w-4 h-4" /> Reenviar campanha
                        </Button>
                      )}

                      {/* Excluir */}
                      {campanhaAtual.status !== 'enviando' && (
                        <Button variant="destructive" size="sm" className="gap-2" onClick={() => setConfirmandoExclusaoCampanha(true)} disabled={enviandoCampanha}>
                          <Trash2 className="w-4 h-4" /> Excluir
                        </Button>
                      )}
                    </div>

                    {/* Confirmação de reenvio inline */}
                    {confirmandoReenvioCampanha && (
                      <div className="p-3 border border-primary/30 rounded-lg bg-muted/50 space-y-2">
                        <p className="text-sm font-medium">⚠️ Confirmar reenvio completo?</p>
                        <p className="text-xs text-muted-foreground">Isso limpará os envios da rodada anterior, reconsultará todos os destinatários e fará um novo disparo completo. O histórico de disparos anteriores será preservado.</p>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={reenviarCampanha} disabled={enviandoCampanha} className="gap-2">
                            {enviandoCampanha ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Confirmar reenvio
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setConfirmandoReenvioCampanha(false)} disabled={enviandoCampanha}>Cancelar</Button>
                        </div>
                      </div>
                    )}

                    {/* Histórico de disparos */}
                    {campanhaDisparos.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Histórico de disparos ({campanhaDisparos.length})</h4>
                        <div className="space-y-1">
                          {campanhaDisparos.map((d, idx) => (
                            <div key={d.id} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">#{campanhaDisparos.length - idx}</span>
                                <span className="text-xs">
                                  {new Date(d.iniciado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
                                  {new Date(d.iniciado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs">📩 {d.total_enviados}/{d.total_destinatarios}</span>
                                {d.total_falhas > 0 && <span className="text-xs text-destructive">❌ {d.total_falhas}</span>}
                                <Badge variant={d.status === 'concluida' ? 'outline' : d.status === 'falha' ? 'destructive' : 'secondary'} className="text-xs">
                                  {d.status === 'concluida' ? 'Concluído' : d.status === 'falha' ? 'Falha' : d.status === 'concluida_parcial' ? 'Parcial' : d.status === 'enviando' ? 'Enviando...' : d.status}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Lista de envios */}
                    <div>
                      <h4 className="font-medium mb-2">Envios ({campanhaEnvios.length})</h4>
                      <div className="max-h-60 overflow-y-auto space-y-1">
                        {campanhaEnvios.map((envio) => (
                          <div key={envio.id} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                            <span className="font-mono text-xs">{envio.telefone}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant={envio.status === 'enviado' ? 'outline' : envio.status === 'falha' ? 'destructive' : 'secondary'}>
                                {envio.status}
                              </Badge>
                              {envio.enviado_em && <span className="text-xs text-muted-foreground">{new Date(envio.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
                            </div>
                          </div>
                        ))}
                        {campanhaEnvios.length === 0 && <p className="text-sm text-muted-foreground">Nenhum envio registrado.</p>}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* AlertDialog de exclusão de campanha */}
      <AlertDialog open={confirmandoExclusaoCampanha} onOpenChange={setConfirmandoExclusaoCampanha}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apagará a campanha <strong>"{campanhaAtual?.titulo}"</strong>, todos os envios registrados e o histórico de disparos de forma permanente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviandoCampanha}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluirCampanha} disabled={enviandoCampanha} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {enviandoCampanha ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de detalhe do feedback */}
      <Dialog open={feedbackDetalheOpen} onOpenChange={setFeedbackDetalheOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-5 w-5" />
            <span className="sr-only">Fechar</span>
          </DialogClose>
          {feedbackAtual && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="text-xl">
                    {feedbackAtual.tipo === 'erro' ? '🐛' : feedbackAtual.tipo === 'sugestao' ? '💡' : feedbackAtual.tipo === 'reclamacao' ? '👎' : '❓'}
                  </span>
                  {feedbackAtual.tipo === 'erro' ? 'Relato de Erro' : feedbackAtual.tipo === 'sugestao' ? 'Sugestão' : feedbackAtual.tipo === 'reclamacao' ? 'Reclamação' : 'Dúvida'}
                </DialogTitle>
                <DialogDescription>
                  Recebido em {new Date(feedbackAtual.created_at).toLocaleDateString('pt-BR')} às {new Date(feedbackAtual.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Info do usuário */}
                <div className="p-3 bg-muted rounded-lg space-y-1 text-sm">
                  <div><strong>Telefone:</strong> {feedbackAtual.telefone_whatsapp || 'Não disponível'}</div>
                  <div><strong>Canal:</strong> {feedbackAtual.canal}</div>
                  <div><strong>Status:</strong> {feedbackAtual.status?.replace('_', ' ')}</div>
                  <div><strong>Prioridade:</strong> {feedbackAtual.prioridade}</div>
                  {feedbackAtual.contexto && <div><strong>Contexto:</strong> {feedbackAtual.contexto}</div>}
                </div>

                {/* Mensagem */}
                <div className="p-4 border rounded-lg">
                  <Label className="text-xs text-muted-foreground mb-1 block">Mensagem do usuário</Label>
                  <p className="text-sm whitespace-pre-wrap">{feedbackAtual.mensagem}</p>
                </div>

                {/* Ações de status */}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={feedbackAtual.status === 'em_analise' ? 'default' : 'outline'} onClick={() => atualizarStatusFeedback(feedbackAtual.id, 'em_analise')}>
                    🔍 Em análise
                  </Button>
                  <Button size="sm" variant={feedbackAtual.status === 'respondido' ? 'default' : 'outline'} onClick={() => atualizarStatusFeedback(feedbackAtual.id, 'respondido')}>
                    ✅ Respondido
                  </Button>
                  <Button size="sm" variant={feedbackAtual.status === 'resolvido' ? 'default' : 'outline'} onClick={() => atualizarStatusFeedback(feedbackAtual.id, 'resolvido')}>
                    ✔️ Resolvido
                  </Button>
                </div>

                {/* Histórico de respostas */}
                {feedbackRespostas.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Histórico de interações</Label>
                    {feedbackRespostas.map((r: any) => (
                      <div key={r.id} className={`p-3 rounded-lg text-sm ${r.autor_tipo === 'ia' || r.autor_tipo === 'sistema' ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800' : 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800'}`}>
                        <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                          <span className="font-medium">{r.autor_tipo === 'ia' ? '🤖 IA' : r.autor_tipo === 'sistema' ? '⚙️ Sistema' : r.autor_tipo === 'master' ? '👑 Master' : `👤 ${r.autor_tipo}`}</span>
                          <span>{new Date(r.created_at).toLocaleDateString('pt-BR')} {new Date(r.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          {r.enviada_via_whatsapp && (
                            <Badge variant={r.envio_whatsapp_status === 'enviado' ? 'default' : 'destructive'} className="text-xs">
                              WhatsApp: {r.envio_whatsapp_status}
                            </Badge>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap">{r.mensagem}</p>
                        {r.envio_whatsapp_erro && <p className="text-xs text-destructive mt-1">Erro: {r.envio_whatsapp_erro}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Campo de resposta */}
                <div className="space-y-2 border-t pt-4">
                  <Label>Responder via WhatsApp</Label>
                  <Textarea
                    placeholder="Digite sua resposta..."
                    value={feedbackNovaResposta}
                    onChange={(e) => setFeedbackNovaResposta(e.target.value)}
                    rows={3}
                  />
                  <Button
                    onClick={enviarRespostaFeedback}
                    disabled={enviandoResposta || !feedbackNovaResposta.trim() || !feedbackAtual.telefone_whatsapp}
                    className="w-full gap-2"
                  >
                    {enviandoResposta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {enviandoResposta ? 'Enviando...' : 'Enviar via WhatsApp'}
                  </Button>
                  {!feedbackAtual.telefone_whatsapp && (
                    <p className="text-xs text-destructive">⚠️ Sem telefone associado — não é possível enviar via WhatsApp.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Edição */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Normalização</DialogTitle>
            <DialogDescription>
              Modifique os campos conforme necessário. Suas correções ajudarão a IA a aprender.
            </DialogDescription>
          </DialogHeader>

          {/* ⚠️ ALERTA DE PRODUTOS SIMILARES */}
          {carregandoSimilares ? (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg mb-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm text-muted-foreground">
                Buscando produtos similares no catálogo...
              </span>
            </div>
          ) : produtosSimilares.length > 0 && (
            <div className="p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg space-y-3 mb-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-semibold text-yellow-900 flex items-center gap-2">
                    ⚠️ {produtosSimilares.length} Produto{produtosSimilares.length > 1 ? 's' : ''} Similar{produtosSimilares.length > 1 ? 'es' : ''} Encontrado{produtosSimilares.length > 1 ? 's' : ''}
                  </h4>
                  <p className="text-sm text-yellow-800 mt-1">
                    Já existem produtos parecidos no catálogo. Se este produto é igual a algum abaixo, 
                    clique em <strong>"🔗 Vincular"</strong> para evitar duplicação.
                  </p>
                </div>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {produtosSimilares.map((similar: any) => (
                  <div 
                    key={similar.id}
                    className="p-3 bg-white border-2 border-yellow-300 rounded-lg space-y-2 hover:border-yellow-400 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 truncate">
                          {similar.nome_padrao}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            📦 {similar.categoria}
                          </Badge>
                          {similar.marca && (
                            <Badge variant="secondary" className="text-xs bg-purple-50 text-purple-700">
                              🏷️ {similar.marca}
                            </Badge>
                          )}
                          {similar.qtd_valor && similar.qtd_unidade && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                              ⚖️ {similar.qtd_valor}{similar.qtd_unidade}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1.5 font-mono bg-gray-50 px-2 py-1 rounded border border-gray-200 inline-block">
                          SKU: {similar.sku_global}
                        </p>
                      </div>
                      
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <Badge 
                          variant={similar.score >= 0.8 ? "default" : "secondary"}
                          className={`text-xs whitespace-nowrap ${
                            similar.score >= 0.9 ? 'bg-red-500' :
                            similar.score >= 0.8 ? 'bg-orange-500' :
                            'bg-yellow-500'
                          }`}
                        >
                          📊 {Math.round(similar.score * 100)}%
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => vincularAProdutoExistente(similar.id)}
                          className="text-xs h-7 bg-green-50 hover:bg-green-100 text-green-700 border-green-300"
                        >
                          🔗 Vincular
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-yellow-700 bg-yellow-100 p-2 rounded border border-yellow-300 flex items-start gap-2">
                <Zap className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Dica:</strong> Produtos com 90%+ de similaridade geralmente são idênticos. 
                  Se decidir criar novo produto mesmo assim, certifique-se de que existe diferença real.
                </span>
              </div>
            </div>
          )}
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome_padrao">Nome Padrão *</Label>
              <Input
                id="nome_padrao"
                value={editForm.nome_padrao}
                onChange={(e) => setEditForm({...editForm, nome_padrao: e.target.value})}
                placeholder="Ex: Arroz Branco Tipo 1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="categoria">Categoria *</Label>
                <select
                  id="categoria"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={editForm.categoria}
                  onChange={(e) => setEditForm({...editForm, categoria: e.target.value})}
                >
                  <option value="">Selecione uma categoria...</option>
                  {categoriasPadrao.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome_base">Nome Base *</Label>
                <Input
                  id="nome_base"
                  value={editForm.nome_base}
                  onChange={(e) => setEditForm({...editForm, nome_base: e.target.value})}
                  placeholder="Ex: Arroz"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="marca">Marca</Label>
                <Input
                  id="marca"
                  value={editForm.marca}
                  onChange={(e) => setEditForm({...editForm, marca: e.target.value})}
                  placeholder="Ex: Tio João"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo_embalagem">Tipo Embalagem</Label>
                <Input
                  id="tipo_embalagem"
                  value={editForm.tipo_embalagem}
                  onChange={(e) => setEditForm({...editForm, tipo_embalagem: e.target.value})}
                  placeholder="Ex: Pacote, Caixa"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="qtd_valor">Quantidade (Valor)</Label>
                <Input
                  id="qtd_valor"
                  type="number"
                  step="0.01"
                  value={editForm.qtd_valor}
                  onChange={(e) => setEditForm({...editForm, qtd_valor: e.target.value})}
                  placeholder="Ex: 1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="qtd_unidade">Quantidade (Unidade)</Label>
                <Input
                  id="qtd_unidade"
                  value={editForm.qtd_unidade}
                  onChange={(e) => setEditForm({...editForm, qtd_unidade: e.target.value})}
                  placeholder="Ex: kg, g, L"
                />
              </div>
            </div>

            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <Label className="text-sm font-semibold">Unidade Base (auto-calculado, editável)</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="qtd_base" className="text-xs">Quantidade Base</Label>
                  <Input
                    id="qtd_base"
                    type="number"
                    step="0.001"
                    value={editForm.qtd_base}
                    onChange={(e) => setEditForm({...editForm, qtd_base: e.target.value})}
                    placeholder="Ex: 1250"
                  />
                  <p className="text-xs text-muted-foreground">Sempre em ml/g</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unidade_base" className="text-xs">Unidade Base</Label>
                  <Input
                    id="unidade_base"
                    value={editForm.unidade_base}
                    onChange={(e) => setEditForm({...editForm, unidade_base: e.target.value})}
                    placeholder="ml, g, ou un"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="categoria_unidade" className="text-xs">Categoria</Label>
                  <select 
                    id="categoria_unidade"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editForm.categoria_unidade}
                    onChange={(e) => setEditForm({...editForm, categoria_unidade: e.target.value})}
                  >
                    <option value="VOLUME">VOLUME</option>
                    <option value="PESO">PESO</option>
                    <option value="UNIDADE">UNIDADE</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sku_global">SKU Global</Label>
              <Input
                id="sku_global"
                value={editForm.sku_global}
                disabled={!!produtoMasterEditando}
                placeholder="Gerado automaticamente"
                className="font-mono"
              />
              {produtoMasterEditando && (
                <p className="text-xs text-muted-foreground">O SKU não pode ser alterado após a criação.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="codigo_barras">EAN Comercial (Código de Barras)</Label>
              <Input
                id="codigo_barras"
                value={editForm.codigo_barras}
                onChange={(e) => setEditForm({...editForm, codigo_barras: e.target.value})}
                placeholder="Ex: 7891234567890"
                className="font-mono"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="granel"
                checked={editForm.granel}
                onCheckedChange={(checked) => setEditForm({...editForm, granel: checked})}
              />
              <Label htmlFor="granel">Produto vendido a granel</Label>
            </div>

            {/* Seção de Imagem do Produto */}
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <Label>Foto do Produto (opcional)</Label>
              
              {/* Preview da imagem */}
              {imagemPreview && (
                <div className="relative w-32 h-32 rounded-lg overflow-hidden border">
                  <img src={imagemPreview} alt="Preview" className="w-full h-full object-cover" />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-1 right-1"
                    onClick={() => {
                      setImagemPreview(null);
                      setImagemFile(null);
                    }}
                  >
                    Remover
                  </Button>
                </div>
              )}
              
              {/* Input de arquivo */}
              {!imagemPreview && (
                <Input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      // Validar tamanho (5MB)
                      if (file.size > 5242880) {
                        toast({
                          title: "Arquivo muito grande",
                          description: "A imagem deve ter no máximo 5MB",
                          variant: "destructive"
                        });
                        return;
                      }
                      
                      setImagemFile(file);
                      
                      // Gerar preview
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setImagemPreview(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              )}
              
              <p className="text-sm text-muted-foreground">
                Formatos: JPG, PNG, WEBP (máx. 5MB)
              </p>
            </div>

            {candidatoAtual && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Texto original:</strong> {candidatoAtual.texto_original}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between items-center">
            {/* Lado esquerdo - Botão de Exclusão (só quando editando Master) */}
            {produtoMasterEditando && (
              <Button 
                variant="destructive" 
                onClick={() => {
                  setEditModalOpen(false);
                  setConfirmarExclusaoOpen(true);
                }}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Excluir Produto
              </Button>
            )}
            
            {/* Lado direito - Botões normais */}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setEditModalOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={produtoMasterEditando ? salvarEdicaoProdutoMaster : aprovarComModificacoes} 
                disabled={!editForm.nome_padrao || !editForm.categoria || !editForm.nome_base || uploadingImage}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {uploadingImage ? 'Enviando imagem...' : produtoMasterEditando ? 'Salvar Alterações' : 'Aprovar com Modificações'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Rejeição */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rejeitar Normalização</DialogTitle>
            <DialogDescription>
              Por favor, explique o motivo da rejeição. Isso ajudará a IA a melhorar suas sugestões.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {candidatoAtual && (
              <div className="space-y-2">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm">
                    <strong>Texto original:</strong> {candidatoAtual.texto_original}
                  </p>
                  <p className="text-sm mt-2">
                    <strong>Sugestão da IA:</strong> {candidatoAtual.nome_padrao_sugerido}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="observacoes">Motivo da rejeição *</Label>
              <Textarea
                id="observacoes"
                value={observacoesRejeicao}
                onChange={(e) => setObservacoesRejeicao(e.target.value)}
                placeholder="Ex: Nome muito genérico, falta informação da marca, categoria incorreta..."
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Suas observações serão usadas para treinar a IA e melhorar futuras normalizações.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={rejeitarComObservacoes}
              disabled={!observacoesRejeicao.trim()}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Rejeitar com Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Escolha de Duplicatas */}
      <Dialog open={modalDuplicatasOpen} onOpenChange={(open) => { setModalDuplicatasOpen(open); if (!open) setBuscaDuplicatas(""); }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Database className="w-6 h-6 text-primary" />
              Duplicatas Detectadas
              {(() => {
                const termo = normalizarParaBusca(buscaDuplicatas);
                const totalFiltrados = termo
                  ? gruposDuplicatas.filter(g => g.produtos?.some((item: any) =>
                      [item.nome_padrao, item.marca, item.sku_global].some(v => normalizarParaBusca(v || '').includes(termo))
                    )).length
                  : gruposDuplicatas.length;
                return ` (${termo ? `${totalFiltrados} de ` : ''}${gruposDuplicatas.length} ${gruposDuplicatas.length === 1 ? 'grupo' : 'grupos'})`;
              })()}
            </DialogTitle>
            <DialogDescription className="text-base">
              Selecione qual produto <strong>MANTER</strong> em cada grupo e marque quais serão <strong>unificados</strong> com ele.
            </DialogDescription>
          </DialogHeader>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto por nome, marca ou SKU..."
              value={buscaDuplicatas}
              onChange={(e) => setBuscaDuplicatas(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="space-y-6 py-4">
            {gruposDuplicatas
              .filter(grupo => {
                const termo = normalizarParaBusca(buscaDuplicatas);
                if (!termo) return true;
                return grupo.produtos?.some((item: any) =>
                  [item.nome_padrao, item.marca, item.sku_global].some(v => normalizarParaBusca(v || '').includes(termo))
                );
              })
              .map((grupo, idx) => {
                const principalId = produtosEscolhidos[grupo.id];
                const unificarSet = produtosParaUnificar[grupo.id] || new Set();
                const qtdSelecionados = Array.from(unificarSet).filter(id => id !== principalId).length;
                const isConsolidandoEste = consolidandoGrupo === grupo.id;

                return (
              <Card key={grupo.id} className="border-2 border-primary/20 shadow-sm">
                <CardHeader className="pb-3 bg-muted/30">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Grupo {idx + 1}: {grupo.categoria}
                      <Badge variant="secondary" className="text-xs">
                        {grupo.produtos.length} produtos
                      </Badge>
                    </span>
                    <Badge variant="outline" className="text-sm">
                      <Sparkles className="w-3 h-3 mr-1" />
                      {Math.round(grupo.score_similaridade * 100)}% similar
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  {gruposIgnorados.has(grupo.id) ? (
                    <div className="p-4 bg-muted rounded-lg text-center">
                      <p className="text-sm text-muted-foreground mb-2">
                        ✅ Marcado como <strong>NÃO-DUPLICATAS</strong>
                      </p>
                      <p className="text-xs text-muted-foreground mb-3">
                        Todos os produtos serão mantidos separados
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setGruposIgnorados(prev => {
                            const novo = new Set(prev);
                            novo.delete(grupo.id);
                            return novo;
                          });
                        }}
                      >
                        Desfazer
                      </Button>
                    </div>
                  ) : (
                    <>
                      <RadioGroup 
                        value={principalId || ''}
                        onValueChange={(value) => {
                          const oldPrincipal = produtosEscolhidos[grupo.id];
                          setProdutosEscolhidos(prev => ({
                            ...prev,
                            [grupo.id]: value
                          }));
                          // Ao trocar o principal: remover novo principal dos checkboxes, adicionar antigo
                          setProdutosParaUnificar(prev => {
                            const novoSet = new Set(prev[grupo.id] || []);
                            novoSet.delete(value); // Novo principal nunca é para unificar
                            if (oldPrincipal && oldPrincipal !== value) {
                              novoSet.add(oldPrincipal); // Antigo principal volta como candidato
                            }
                            return { ...prev, [grupo.id]: novoSet };
                          });
                        }}
                      >
                        {grupo.produtos.map((produto: any) => {
                          const isEscolhido = principalId === produto.id;
                          const isParaUnificar = !isEscolhido && unificarSet.has(produto.id);
                          const isPreservado = !isEscolhido && !isParaUnificar;
                          
                          return (
                            <div 
                              key={produto.id}
                              className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-all ${
                                isEscolhido
                                  ? 'border-green-500 bg-green-50/50 shadow-md'
                                  : isParaUnificar
                                    ? 'border-destructive/40 bg-destructive/5'
                                    : 'border-muted bg-muted/20 opacity-60'
                              }`}
                            >
                              <div className="flex items-center gap-2 mt-1">
                                <RadioGroupItem 
                                  value={produto.id} 
                                  id={`radio-${grupo.id}-${produto.id}`}
                                />
                                {!isEscolhido && (
                                  <Checkbox
                                    id={`check-${grupo.id}-${produto.id}`}
                                    checked={isParaUnificar}
                                    onCheckedChange={(checked) => {
                                      setProdutosParaUnificar(prev => {
                                        const novoSet = new Set(prev[grupo.id] || []);
                                        if (checked) {
                                          novoSet.add(produto.id);
                                        } else {
                                          novoSet.delete(produto.id);
                                        }
                                        return { ...prev, [grupo.id]: novoSet };
                                      });
                                    }}
                                  />
                                )}
                              </div>
                              <label 
                                htmlFor={`radio-${grupo.id}-${produto.id}`}
                                className="flex-1 cursor-pointer space-y-2"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <div className="font-semibold text-sm leading-tight">
                                      {produto.nome_padrao}
                                    </div>
                                    <div className="text-xs text-muted-foreground font-mono mt-1 bg-muted px-2 py-1 rounded">
                                      SKU: {produto.sku_global}
                                    </div>
                                    {produto.codigo_barras && (
                                      <div className="text-xs text-muted-foreground font-mono mt-1 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                                        EAN: {produto.codigo_barras}
                                      </div>
                                    )}
                                  </div>
                                  {isEscolhido && (
                                    <Badge className="bg-green-600 text-white gap-1 shrink-0">
                                      <Check className="w-3 h-3" />
                                      PRINCIPAL
                                    </Badge>
                                  )}
                                  {isParaUnificar && (
                                    <Badge variant="destructive" className="gap-1 shrink-0">
                                      <Trash2 className="w-3 h-3" />
                                      UNIFICAR
                                    </Badge>
                                  )}
                                  {isPreservado && (
                                    <Badge variant="outline" className="gap-1 shrink-0 text-muted-foreground">
                                      <Shield className="w-3 h-3" />
                                      PRESERVAR
                                    </Badge>
                                  )}
                                </div>
                                
                                <div className="flex flex-wrap gap-2">
                                  {produto.marca && (
                                    <Badge variant="secondary" className="text-xs">
                                      🏷️ {produto.marca}
                                    </Badge>
                                  )}
                                  {produto.qtd_valor && produto.qtd_unidade && (
                                    <Badge variant="secondary" className="text-xs">
                                      📏 {produto.qtd_valor}{produto.qtd_unidade}
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="text-xs">
                                    📊 {produto.total_notas} {produto.total_notas === 1 ? 'nota' : 'notas'}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    👥 {produto.total_usuarios} {produto.total_usuarios === 1 ? 'usuário' : 'usuários'}
                                  </Badge>
                                </div>
                              </label>
                            </div>
                          );
                        })}
                      </RadioGroup>
                      
                      {/* Ações do grupo */}
                      <div className="mt-3 pt-3 border-t flex flex-col gap-2">
                        <Button
                          onClick={() => executarConsolidacaoIndividual(grupo.id)}
                          disabled={isConsolidandoEste || consolidando || qtdSelecionados === 0}
                          size="sm"
                          className="w-full gap-2"
                        >
                          {isConsolidandoEste ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Consolidando...
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              Consolidar este grupo ({qtdSelecionados} {qtdSelecionados === 1 ? 'item' : 'itens'})
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                  onClick={async () => {
                    try {
                      setGruposIgnorados(prev => new Set(prev).add(grupo.id));
                      
                      const pares: any[] = [];
                      for (let i = 0; i < grupo.produtos.length; i++) {
                        for (let j = i + 1; j < grupo.produtos.length; j++) {
                          const [id1, id2] = [grupo.produtos[i].id, grupo.produtos[j].id].sort();
                          pares.push({
                            produto_1_id: id1,
                            produto_2_id: id2,
                            decidido_por: (await supabase.auth.getUser()).data.user?.id,
                            observacao: `Grupo ${grupo.id} - Score: ${(grupo.score_similaridade * 100).toFixed(1)}%`
                          });
                        }
                      }
                      
                      const { error } = await supabase
                        .from('masters_duplicatas_ignoradas')
                        .insert(pares);
                      
                      if (error) {
                        console.error('Erro ao persistir decisão:', error);
                        toast({
                          title: "⚠️ Aviso",
                          description: "Decisão aplicada localmente, mas erro ao salvar no banco",
                          variant: "destructive"
                        });
                      } else {
                        console.log(`✅ ${pares.length} par(es) persistido(s) no banco`);
                      }
                      
                      toast({
                        title: "✅ Grupo ignorado",
                        description: "Marcado como NÃO-DUPLICATAS. Não aparecerá nas próximas buscas.",
                      });
                      
                    } catch (error: any) {
                      console.error('Erro ao marcar como não-duplicata:', error);
                      toast({
                        title: "Erro",
                        description: error.message,
                        variant: "destructive"
                      });
                    }
                  }}
                          className="w-full"
                        >
                          <X className="w-4 h-4 mr-2" />
                          Não São Duplicatas - Manter Todos
                        </Button>
                      </div>
                    </>
                  )}
                  
                  {/* Resumo do que será feito */}
                  {!gruposIgnorados.has(grupo.id) && (
                    <div className="mt-3 p-3 bg-accent/50 border border-accent rounded-lg text-xs">
                      <p className="font-semibold text-foreground mb-1">
                        ⚙️ O que será feito neste grupo:
                      </p>
                      <ul className="text-muted-foreground space-y-0.5 ml-4 list-disc">
                        <li>Produto principal será <strong>mantido</strong></li>
                        {qtdSelecionados > 0 && (
                          <li>{qtdSelecionados} produto(s) marcado(s) serão <strong>unificados</strong></li>
                        )}
                        {grupo.produtos.length - 1 - qtdSelecionados > 0 && (
                          <li>{grupo.produtos.length - 1 - qtdSelecionados} produto(s) serão <strong>preservados</strong> (não entram na consolidação)</li>
                        )}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
                );
              })}
          </div>

          {gruposDuplicatas.length === 0 && gruposConsolidados.size > 0 && (
            <div className="p-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-semibold">Todos os grupos foram processados!</p>
              <p className="text-sm text-muted-foreground">{gruposConsolidados.size} grupo(s) consolidado(s)</p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setModalDuplicatasOpen(false)}
              disabled={consolidando || !!consolidandoGrupo}
            >
              {gruposDuplicatas.length === 0 ? 'Fechar' : 'Cancelar'}
            </Button>
            {gruposDuplicatas.filter(g => !gruposIgnorados.has(g.id)).length > 1 && (
              <Button
                onClick={executarConsolidacaoManual}
                disabled={consolidando || !!consolidandoGrupo}
                className="gap-2 min-w-[200px]"
              >
                {consolidando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Consolidando todos...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Consolidar Todos ({gruposDuplicatas.filter(g => !gruposIgnorados.has(g.id)).length} grupos)
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de Confirmação para Consolidação */}
      <AlertDialog open={confirmarConsolidacaoOpen} onOpenChange={setConfirmarConsolidacaoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Consolidar Produtos Duplicados?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Esta operação irá:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Buscar produtos master com nomes muito similares</li>
                <li>Consolidar duplicatas em um único produto principal</li>
                <li>Criar sinônimos automáticos para manter referências</li>
                <li>Atualizar todas as referências no estoque dos usuários</li>
              </ul>
              <p className="font-semibold text-destructive mt-3">
                ⚠️ Esta ação é irreversível!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={consolidarMastersDuplicados}
              className="bg-destructive hover:bg-destructive/90"
            >
              Sim, Consolidar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog de Confirmação de Exclusão */}
      <AlertDialog open={confirmarExclusaoOpen} onOpenChange={setConfirmarExclusaoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              Confirmar Exclusão do Produto Master
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Você está prestes a <strong>excluir permanentemente</strong> o produto:
              </p>
              <div className="p-3 bg-muted rounded-lg space-y-1">
                <p className="font-semibold">{editForm.nome_padrao}</p>
                <p className="text-sm text-muted-foreground">SKU: {editForm.sku_global}</p>
                {editForm.categoria && (
                  <p className="text-sm text-muted-foreground">Categoria: {editForm.categoria}</p>
                )}
              </div>
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ <strong>ATENÇÃO:</strong> Esta ação NÃO pode ser desfeita!
                </p>
                <ul className="text-xs text-yellow-700 mt-2 space-y-1 ml-4 list-disc">
                  <li>O produto será removido do catálogo master global</li>
                  <li>Produtos normalizados de usuários vinculados a este master perderão a referência</li>
                  <li>Candidatos pendentes vinculados serão desvinculados</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoProduto}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={excluirProdutoMaster}
              disabled={excluindoProduto}
              className="bg-destructive hover:bg-destructive/90"
            >
              {excluindoProduto ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Sim, Excluir Permanentemente
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
