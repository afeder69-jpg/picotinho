import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Package, Calendar, Trash2, ArrowUp, ArrowDown, Minus, Edit3, Plus, Search, MoreVertical } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { formatarQuantidade } from '@/lib/utils';
import PicotinhoLogo from '@/components/PicotinhoLogo';
import { normalizarCategoria, categoriasEquivalentes, ordemCategorias, categoriasNormalizadas } from '@/lib/categorias';

interface EstoqueItem {
  id?: string;
  produto_nome?: string;
  produto_nome_exibicao: string;
  hash_agrupamento: string;
  categoria: string;
  unidade_medida: string;
  quantidade_total: number;
  preco_unitario_mais_recente: number | null;
  ultima_atualizacao: string;
  itens_originais: number;
  nomes_originais: string[];
  ids_originais: string[];
  user_id: string;
  // Campos de compatibilidade
  quantidade: number;
  preco_unitario_ultimo: number | null;
  updated_at: string;
  created_at?: string;
  origem?: string;
  produto_nome_normalizado?: string | null;
  produto_hash_normalizado?: string | null;
  nome_base?: string | null;
  marca?: string | null;
  tipo_embalagem?: string | null;
  qtd_valor?: number | null;
  qtd_base?: number | null;
  granel?: boolean | null;
  qtd_unidade?: string | null;
}

interface ProdutoSugestao {
  id: string;
  nome: string;
  categoria: string;
  unidade_medida: string;
}

const EstoqueAtual = () => {
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [precosAtuais, setPrecosAtuais] = useState<any[]>([]);
  const [datasNotasFiscais, setDatasNotasFiscais] = useState<{[key: string]: string}>({});
  const [historicoPrecos, setHistoricoPrecos] = useState<{[key: string]: any}>({});
  const [loading, setLoading] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>('');
  const [modoEdicao, setModoEdicao] = useState(false);
  const [itemEditando, setItemEditando] = useState<EstoqueItem | null>(null);
  const [novaQuantidade, setNovaQuantidade] = useState<number>(0);
  const [mostrarItensZerados, setMostrarItensZerados] = useState(false);
  
  // Estados para inserção de produto
  const [modalInserirAberto, setModalInserirAberto] = useState(false);
  const [produtosSugeridos, setProdutosSugeridos] = useState<ProdutoSugestao[]>([]);
  const [termoBusca, setTermoBusca] = useState('');
  const [produtoSelecionado, setProdutoSelecionado] = useState<ProdutoSugestao | null>(null);
  const [novoProduto, setNovoProduto] = useState({
    nome: '',
    categoria: '',
    quantidade: '',
    unidadeMedida: 'Unidade',
    valor: ''
  });
  const [sugestaoNome, setSugestaoNome] = useState<string>('');
  const [mostrarSugestao, setMostrarSugestao] = useState(false);
  const [diagnosticando, setDiagnosticando] = useState(false);
  
  // Estados para modal de confirmação de exclusão
  const [modalExclusaoAberto, setModalExclusaoAberto] = useState(false);
  const [itemParaExcluir, setItemParaExcluir] = useState<EstoqueItem | null>(null);

  // Função para obter coordenadas do usuário via GPS
  const obterCoordenadas = (): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        console.error('Geolocalização não suportada');
        // Fallback para Rio de Janeiro (região do usuário)
        resolve({ latitude: -22.9068, longitude: -43.1729 });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          console.error('Erro ao obter localização:', error);
          // Fallback para Rio de Janeiro (região do usuário)
          resolve({ latitude: -22.9068, longitude: -43.1729 });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutos
        }
      );
    });
  };
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadEstoque();
    loadPrecosAtuais();
    loadDatasNotasFiscais();
    // corrigirProdutosManuais(); // Removido - correção manual
  }, []);

  // Carregar histórico de preços quando o estoque for carregado
  useEffect(() => {
    if (estoque.length > 0) {
      console.log('🔄 useEffect: Chamando loadHistoricoPrecos com estoque.length:', estoque.length);
      // Timeout para evitar conflito com outros carregamentos
      setTimeout(() => {
        loadHistoricoPrecos();
      }, 1000);
    }
  }, [estoque]);

  // Função removida - estava causando problemas na marcação de produtos manuais

  const loadPrecosAtuais = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Buscar configuração de área de atuação do usuário
      const { data: config } = await supabase
        .from('configuracoes_usuario')
        .select('raio_busca_km')
        .eq('usuario_id', user.id)
        .maybeSingle();

      const raio = config?.raio_busca_km || 5.0;

      // Buscar posição atual do usuário via GPS
      const coordenadas = await obterCoordenadas();
      console.log('🌍 Coordenadas do usuário obtidas:', coordenadas);
      
      // Chamar função dinâmica que calcula preços por área
      const { data: precosAreaData, error: errorArea } = await supabase.functions.invoke('preco-atual-usuario', {
        body: {
          userId: user.id,
          latitude: coordenadas.latitude,
          longitude: coordenadas.longitude,
          raioKm: raio
        }
      });

      if (errorArea) {
        console.error('Erro ao buscar preços por área:', errorArea);
        // Fallback para o método antigo se as coordenadas não funcionaram
        await loadPrecosAtuaisLegacy();
        return;
      }

      if (precosAreaData?.success && precosAreaData?.resultados) {
        const precosFormatados = precosAreaData.resultados.map((item: any) => ({
          id: `area-${item.produto_nome}`,
          produto_nome: item.produto_nome,
          valor_unitario: item.valor_unitario,
          data_atualizacao: item.data_atualizacao,
          origem: 'area_dinamica',
          estabelecimento_nome: item.estabelecimento_nome
        }));

        console.log(`✅ Preços dinâmicos carregados por área (${raio}km):`, precosFormatados);
        setPrecosAtuais(precosFormatados);
      } else {
        // Fallback se não há resultados na área
        setPrecosAtuais([]);
      }
    } catch (error) {
      console.error('Erro ao carregar preços atuais dinâmicos:', error);
      // Fallback para o método antigo
      await loadPrecosAtuaisLegacy();
    }
  };

  const loadHistoricoPrecos = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || estoque.length === 0) return;

      console.log('🕒 Carregando histórico de preços para estoque...');

      // Extrair nomes únicos dos produtos do estoque
      const nomesProdutos = estoque.map(item => 
        item.produto_nome_exibicao || item.produto_nome || ''
      ).filter(nome => nome.trim() !== '');

      if (nomesProdutos.length === 0) return;

      // Buscar configuração de área de atuação do usuário
      const { data: config } = await supabase
        .from('configuracoes_usuario')
        .select('raio_busca_km')
        .eq('usuario_id', user.id)
        .maybeSingle();

      const raio = config?.raio_busca_km || 5.0;

      // Buscar posição atual do usuário via GPS
      const coordenadas = await obterCoordenadas();

      // Tentar buscar histórico primeiro
      try {
        const { data: historicoData, error: historicoError } = await supabase.functions.invoke('buscar-historico-precos-estoque', {
          body: {
            produtos: nomesProdutos,
            userId: user.id,
            latitude: coordenadas.latitude,
            longitude: coordenadas.longitude,
            raioKm: raio
          }
        });

        if (!historicoError && historicoData?.success) {
          console.log('✅ Histórico obtido com sucesso:', historicoData);
          const historicoMap: {[key: string]: any} = {};
          
          historicoData.resultados.forEach((item: any) => {
            if (item.produto) {
              historicoMap[item.produto] = {
                ultimaCompraUsuario: item.ultimaCompraUsuario,
                menorPrecoArea: item.menorPrecoArea
              };
            }
          });

          console.log('✅ Setando histórico de preços:', historicoMap);
          setHistoricoPrecos(historicoMap);
          return;
        } else {
          console.warn('⚠️ Falha no histórico, usando fallback:', historicoError);
        }
      } catch (error) {
        console.warn('⚠️ Erro na função de histórico, usando fallback:', error);
      }

      // Fallback: usar função de preços atuais
      const { data: precoAtualData } = await supabase.functions.invoke('preco-atual-usuario', {
        body: {
          userId: user.id,
          latitude: coordenadas.latitude,
          longitude: coordenadas.longitude,
          raioKm: raio
        }
      });
      
      if (precoAtualData?.success) {
        // Converter dados do fallback para o formato esperado
        const historicoMap: {[key: string]: any} = {};
        
        precoAtualData.resultados?.forEach((item: any) => {
          historicoMap[item.produto_nome] = {
            ultimaCompraUsuario: {
              data: item.data_atualizacao,
              preco: item.valor_unitario,
              quantidade: 1
            },
            menorPrecoArea: {
              data: item.data_atualizacao,
              preco: item.valor_unitario,
              quantidade: 1
            }
          };
        });

        console.log('⚠️ FALLBACK: Histórico carregado via fallback:', historicoMap);
        setHistoricoPrecos(historicoMap);
      }
    } catch (error) {
      console.error('Erro ao carregar histórico de preços:', error);
    }
  };

  const loadPrecosAtuaisLegacy = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Buscar preços específicos do usuário (produtos inseridos manualmente)
      const { data: precosUsuario, error: errorUsuario } = await supabase
        .from('precos_atuais_usuario')
        .select('*')
        .eq('user_id', user.id)
        .order('produto_nome', { ascending: true });

      if (errorUsuario) throw errorUsuario;

      // Buscar preços gerais (de notas fiscais públicas de outros usuários)
      const { data: precosGerais, error: errorGerais } = await supabase
        .from('precos_atuais')
        .select('*')
        .order('data_atualizacao', { ascending: false }); // Mais recentes primeiro

      if (errorGerais) throw errorGerais;

      // Unificar preços: priorizar sempre o mais recente (de qualquer usuário da área)
      const precosUnificados: any[] = [];
      
      // Primeiro, adicionar todos os preços gerais (sempre vêm de notas fiscais com data correta)
      (precosGerais || []).forEach(precoGeral => {
        precosUnificados.push({
          id: precoGeral.id,
          produto_nome: precoGeral.produto_nome,
          valor_unitario: precoGeral.valor_unitario,
          data_atualizacao: precoGeral.data_atualizacao, // Esta já é a data da nota fiscal
          origem: 'geral'
        });
      });
      
      // Depois, processar preços específicos do usuário
      (precosUsuario || []).forEach(precoUser => {
        // Verificar se existe preço geral para o mesmo produto
        const precoGeralExistente = precosGerais?.find(precoGeral => 
          precoGeral.produto_nome.toLowerCase() === precoUser.produto_nome.toLowerCase()
        );
        
        if (precoGeralExistente) {
          // Comparar por data: usar sempre o mais recente
          const dataGeral = new Date(precoGeralExistente.data_atualizacao);
          const dataUsuario = new Date(precoUser.data_atualizacao);
          
          if (dataGeral >= dataUsuario) {
            // Preço geral é mais recente ou igual, manter o geral (já adicionado)
            return;
          } else {
            // Preço do usuário é mais recente, substituir o geral
            const index = precosUnificados.findIndex(p => 
              p.produto_nome.toLowerCase() === precoUser.produto_nome.toLowerCase()
            );
            if (index >= 0) {
              precosUnificados[index] = {
                id: precoUser.id,
                produto_nome: precoUser.produto_nome,
                valor_unitario: precoUser.valor_unitario,
                data_atualizacao: precoUser.data_atualizacao, // Esta já é a data da nota fiscal
                origem: 'usuario'
              };
            }
          }
        } else {
          // Não existe preço geral, adicionar o preço do usuário
          precosUnificados.push({
            id: precoUser.id,
            produto_nome: precoUser.produto_nome,
            valor_unitario: precoUser.valor_unitario,
            data_atualizacao: precoUser.data_atualizacao, // Esta já é a data da nota fiscal
            origem: 'usuario'
          });
        }
      });

      setPrecosAtuais(precosUnificados);
    } catch (error) {
      console.error('Erro ao carregar preços atuais (legacy):', error);
    }
  };



  const loadDatasNotasFiscais = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Buscar todas as notas fiscais processadas do usuário
      const { data: notasImagens, error } = await supabase
        .from('notas_imagens')
        .select('dados_extraidos')
        .eq('usuario_id', user.id)
        .eq('processada', true)
        .not('dados_extraidos', 'is', null);

      if (error) throw error;

      const datasMap: {[key: string]: string} = {};
      
      notasImagens?.forEach(nota => {
        const dadosExtraidos = nota.dados_extraidos as any;
        if (dadosExtraidos?.itens) {
          // Buscar data da compra em várias estruturas possíveis
          const dataCompra = dadosExtraidos.compra?.data_emissao || 
                           dadosExtraidos.compra?.data_compra ||
                           dadosExtraidos.dataCompra ||
                           dadosExtraidos.data_emissao;
          
          dadosExtraidos.itens.forEach((item: any) => {
            const nomeProduto = item.descricao || item.nome;
            if (nomeProduto && dataCompra) {
              // Manter apenas a data mais recente para cada produto
              if (!datasMap[nomeProduto] || new Date(dataCompra) > new Date(datasMap[nomeProduto])) {
                datasMap[nomeProduto] = dataCompra;
              }
            }
          });
        }
      });

      console.log('📅 LOAD DATAS: Datas das notas fiscais carregadas:', datasMap);
      console.log('📅 LOAD DATAS: Total de produtos com data:', Object.keys(datasMap).length);
      setDatasNotasFiscais(datasMap);
    } catch (error) {
      console.error('Erro ao carregar datas das notas fiscais:', error);
    }
  };

  // Função para verificar se um produto foi inserido manualmente
  const isProdutoManual = (nomeProduto: string) => {
    console.log(`🔍 Verificando se "${nomeProduto}" é manual...`);
    console.log(`📦 Estoque disponível:`, estoque.map(item => ({ nome: item.produto_nome, origem: item.origem })));
    
    // Buscar no estoque se o produto tem origem 'manual'
    const produtoEstoque = estoque.find(item => 
      item.produto_nome.toLowerCase() === nomeProduto.toLowerCase() && 
      item.origem === 'manual'
    );
    
    console.log(`📦 Produto encontrado no estoque:`, produtoEstoque);
    const isManual = !!produtoEstoque;
    console.log(`✅ Produto "${nomeProduto}" é manual: ${isManual}`);
    
    return isManual;
  };

  // Função para encontrar a data da nota fiscal de um produto
  const encontrarDataNotaFiscal = (nomeProduto: string) => {
    console.log(`🔍 BUSCA DATA: produto="${nomeProduto}"`);
    console.log(`📅 BUSCA DATA: datasNotasFiscais disponíveis:`, Object.keys(datasNotasFiscais));
    console.log(`📅 BUSCA DATA: objeto completo:`, datasNotasFiscais);
    
    // Buscar correspondência exata primeiro
    if (datasNotasFiscais[nomeProduto]) {
      console.log(`✅ BUSCA DATA: Encontrou data exata para "${nomeProduto}": ${datasNotasFiscais[nomeProduto]}`);
      return datasNotasFiscais[nomeProduto];
    }
    
    // Normalizar nome do produto para busca
    const nomeProdutoNormalizado = nomeProduto.toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      // Remover unidades de medida comuns
      .replace(/\b(kg|g|ml|l|un|unidade|granel)\b/g, '')
      .trim();
    
    // Buscar por correspondência parcial mais inteligente
    for (const [produto, data] of Object.entries(datasNotasFiscais)) {
      const produtoNormalizado = produto.toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        // Remover unidades de medida comuns
        .replace(/\b(kg|g|ml|l|un|unidade|granel)\b/g, '')
        .trim();
      
      // Verificar se as palavras principais coincidem
      const palavrasProdutoEstoque = nomeProdutoNormalizado.split(' ').filter(p => p.length > 2);
      const palavrasProdutoNota = produtoNormalizado.split(' ').filter(p => p.length > 2);
      
      let coincidencias = 0;
      palavrasProdutoEstoque.forEach(palavra => {
        if (palavrasProdutoNota.some(p => p.includes(palavra) || palavra.includes(p))) {
          coincidencias++;
        }
      });
      
      // Se pelo menos 60% das palavras coincidem
      if (coincidencias >= Math.max(1, Math.floor(palavrasProdutoEstoque.length * 0.6))) {
        console.log(`✅ Encontrou data por similaridade para "${nomeProduto}" -> "${produto}": ${data}`);
        return data;
      }
    }
    
    console.log(`❌ Não encontrou data para "${nomeProduto}"`);
    return null;
  };

  // Função para normalizar texto removendo acentos
  const normalizarTexto = (texto: string) => {
    return texto
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9\s]/g, ' ') // Remove caracteres especiais
      .replace(/\s+/g, ' ') // Normaliza espaços
      .trim();
  };

  // Função para encontrar preço atual de um produto (agora dinamicamente pela área)
  const encontrarPrecoAtual = (nomeProduto: string) => {
    console.log(`🔍 Buscando preço atual dinâmico para: "${nomeProduto}"`);
    console.log(`📊 Preços dinâmicos disponíveis na área: ${precosAtuais.length}`);
    
    if (!nomeProduto) {
      console.log('❌ Nome do produto vazio');
      return null;
    }
    
    const nomeProdutoNormalizado = normalizarTexto(nomeProduto);
    console.log(`🔄 Nome normalizado: "${nomeProdutoNormalizado}"`);
    
    // Buscar nos preços dinâmicos da área (já calculados pela função de área)
    const precoAreaDinamica = precosAtuais.find(preco => 
      preco.produto_nome && 
      normalizarTexto(preco.produto_nome) === nomeProdutoNormalizado &&
      preco.origem === 'area_dinamica'
    );
    
    if (precoAreaDinamica) {
      console.log(`✅ Encontrou preço dinâmico na área: R$ ${precoAreaDinamica.valor_unitario} em ${precoAreaDinamica.estabelecimento_nome}`);
      return precoAreaDinamica;
    }
    
    // Busca por similaridade nos preços dinâmicos usando normalização melhorada
    const buscaSimilaridade = precosAtuais.find(preco => {
      if (!preco.produto_nome || preco.origem !== 'area_dinamica') return false;
      
      const precoNormalizado = normalizarTexto(preco.produto_nome);
      
      // Verificar se são exatamente iguais após normalização
      if (precoNormalizado === nomeProdutoNormalizado) {
        return true;
      }
      
      // Dividir em palavras e verificar se pelo menos 70% das palavras coincidem
      const palavrasPreco = precoNormalizado.split(/\s+/).filter(p => p.length > 2);
      const palavrasProduto = nomeProdutoNormalizado.split(/\s+/).filter(p => p.length > 2);
      
      if (palavrasProduto.length === 0) return false;
      
      let coincidencias = 0;
      palavrasProduto.forEach(palavra => {
        if (palavrasPreco.some(p => p.includes(palavra) || palavra.includes(p))) {
          coincidencias++;
        }
      });
      
      const percentualCoincidencia = coincidencias / palavrasProduto.length;
      return percentualCoincidencia >= 0.7; // 70% de similaridade
    });
    
    if (buscaSimilaridade) {
      console.log(`✅ Encontrou preço dinâmico por similaridade na área: R$ ${buscaSimilaridade.valor_unitario}`);
      return buscaSimilaridade;
    }
    
    console.log(`❌ Nenhum preço dinâmico encontrado para: "${nomeProduto}"`);
    return null;
  };

  const loadEstoque = async () => {
    const loadId = Math.random().toString(36).substr(2, 9);
    console.log(`🚀 INICIANDO loadEstoque [${loadId}] - loading atual:`, loading);
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log('❌ Usuário não autenticado');
        setLoading(false);
        return;
      }

      console.log('🔍 Buscando estoque para usuário:', user.id);

      // PRIMEIRO: Testar se consegue buscar QUALQUER dado do estoque
      const { data: testData, error: testError } = await supabase
        .from('estoque_app')
        .select('count')
        .eq('user_id', user.id);
      
      console.log('🧪 Teste de acesso ao estoque - count:', testData);
      console.log('🧪 Teste de acesso ao estoque - error:', testError);

      // BUSCAR ESTOQUE DO USUÁRIO com paginação para alto volume
      const LIMITE_BUSCA = 1000; // Limitar para evitar timeouts
      const { data, error } = await supabase
        .from('estoque_app')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }) // Mais recentes primeiro
        .limit(LIMITE_BUSCA);

      if (error) {
        console.error('❌ Erro ao buscar estoque:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        throw error;
      }

      console.log('📦 Raw data from DB:', data);
      console.log('📦 Data length:', data?.length || 0);
      console.log('📦 First 3 items com quantidades:', data?.slice(0, 3).map(item => ({
        nome: item.produto_nome,
        quantidade: item.quantidade,
        preco: item.preco_unitario_ultimo
      })));
      
      if (!data || data.length === 0) {
        console.warn('⚠️ Nenhum dado retornado do estoque!');
        setEstoque([]);
        setLoading(false);
        return;
      }

      // ✅ CORREÇÃO CRÍTICA: REMOVER CONSOLIDAÇÃO MANUAL INCORRETA
      // O banco já gerencia produtos únicos corretamente - não devemos consolidar manualmente
      // Isso estava causando perda de produtos na visualização (22 no banco vs 17 na tela)
      
      // 🚨 CORREÇÃO CRÍTICA: CONSOLIDAR DUPLICATAS CORRETAMENTE
      // O banco tem 44 itens (22 únicos duplicados) - vamos consolidar na tela
      const produtosMap = new Map<string, any>();
      
      data.forEach(item => {
        const chave = item.produto_nome; // Usar nome exato como chave
        
        if (produtosMap.has(chave)) {
          // Produto já existe, somar quantidades e manter o preço mais recente
          const itemExistente = produtosMap.get(chave);
          produtosMap.set(chave, {
            ...itemExistente,
            quantidade_total: itemExistente.quantidade_total + item.quantidade,
            quantidade: itemExistente.quantidade_total + item.quantidade, // Para compatibilidade
            preco_unitario_mais_recente: item.preco_unitario_ultimo || itemExistente.preco_unitario_mais_recente,
            preco_unitario_ultimo: item.preco_unitario_ultimo || itemExistente.preco_unitario_ultimo, // Para compatibilidade
            ultima_atualizacao: item.updated_at > itemExistente.ultima_atualizacao ? item.updated_at : itemExistente.ultima_atualizacao,
            updated_at: item.updated_at > itemExistente.updated_at ? item.updated_at : itemExistente.updated_at, // Para compatibilidade
            ids_originais: [...itemExistente.ids_originais, item.id],
            nomes_originais: [...itemExistente.nomes_originais, item.produto_nome],
            itens_originais: itemExistente.itens_originais + 1
          });
        } else {
          // Produto novo, adicionar (INCLUINDO produtos com quantidade zero)
          produtosMap.set(chave, {
            ...item,
            produto_nome_exibicao: item.produto_nome,
            hash_agrupamento: item.produto_nome,
            quantidade_total: item.quantidade,
            preco_unitario_mais_recente: item.preco_unitario_ultimo,
            ultima_atualizacao: item.updated_at,
            ids_originais: [item.id],
            nomes_originais: [item.produto_nome],
            itens_originais: 1
          });
        }
      });
      
      // Converter Map para Array
      const estoqueFormatado = Array.from(produtosMap.values());
      
      console.log('✅ Produtos ÚNICOS após consolidação:', estoqueFormatado.length);
      console.log('📦 Primeiros 3 produtos únicos:', estoqueFormatado.slice(0, 3).map(item => ({
        nome: item.produto_nome,
        quantidade: item.quantidade,
        preco: item.preco_unitario_ultimo
      })));
      
      // 🚨 VALIDAÇÃO CRÍTICA: Verificar se temos os 4 produtos problemáticos
      const produtosProblematicos = [
        'Queijo Parmesão President 100g Ralado',
        'Filé de Peito de Frango Seara 1kg Bandeja', 
        'Creme de Leite Italac 200g',
        'Requeijão Cremoso Tirolez 200g Tradicional'
      ];
      
      console.log('🔍 VERIFICANDO PRODUTOS PROBLEMÁTICOS:');
      produtosProblematicos.forEach(produtoTeste => {
        const encontrado = estoqueFormatado.find(p => p.produto_nome === produtoTeste);
        if (encontrado) {
          console.log(`✅ ${produtoTeste}: ENCONTRADO | Qtd: ${encontrado.quantidade}`);
        } else {
          console.log(`❌ ${produtoTeste}: NÃO ENCONTRADO!`);
        }
      });

      setEstoque(estoqueFormatado);
      
      // Encontrar a última atualização
      if (estoqueFormatado && estoqueFormatado.length > 0) {
        const ultimaData = estoqueFormatado.reduce((latest, item) => {
          const itemDate = new Date(item.updated_at);
          return itemDate > new Date(latest) ? item.updated_at : latest;
        }, estoqueFormatado[0].updated_at);
        setUltimaAtualizacao(ultimaData);
      }
    } catch (error) {
      console.error('Erro ao carregar estoque:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível carregar o estoque.",
      });
    } finally {
      console.log('🔚 FINALIZANDO loadEstoque - setando loading=false');
      setLoading(false);
    }
  };

  // Funções para inserção de produtos
  const buscarProdutosSugeridos = async (termo: string) => {
    if (termo.length < 2) {
      setProdutosSugeridos([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('produtos_app')
        .select('id, nome, categoria_id, unidade_medida')
        .ilike('nome', `%${termo}%`)
        .limit(10);

      if (error) throw error;

      const produtosMapeados = data?.map(produto => ({
        id: produto.id,
        nome: produto.nome,
        categoria: 'outros', // Pode mapear categoria_id para nome se necessário
        unidade_medida: produto.unidade_medida
      })) || [];

      setProdutosSugeridos(produtosMapeados);
    } catch (error) {
      console.error('Erro ao buscar produtos:', error);
    }
  };

  const abrirModalInserir = () => {
    setModalInserirAberto(true);
    setTermoBusca('');
    setProdutoSelecionado(null);
    setNovoProduto({
      nome: '',
      categoria: '',
      quantidade: '',
      unidadeMedida: 'un',
      valor: ''
    });
    setSugestaoNome('');
    setMostrarSugestao(false);
  };

  const fecharModalInserir = () => {
    setModalInserirAberto(false);
    setTermoBusca('');
    setProdutosSugeridos([]);
    setProdutoSelecionado(null);
  };

  const selecionarProduto = (produto: ProdutoSugestao) => {
    setProdutoSelecionado(produto);
    setTermoBusca(produto.nome);
    setProdutosSugeridos([]);
    setNovoProduto({
      nome: produto.nome,
      categoria: produto.categoria,
      quantidade: '',
      unidadeMedida: produto.unidade_medida,
      valor: ''
    });
  };

  // Função para categorizar produto e sugerir nome com IA
  const categorizarProdutoIA = async (nomeProduto: string): Promise<{category: string, suggestedName?: string}> => {
    try {
      const response = await supabase.functions.invoke('categorize-product', {
        body: { productName: nomeProduto }
      });
      
      if (response.error) {
        console.error('Erro na categorização:', response.error);
        return { category: 'outros', suggestedName: nomeProduto };
      }
      
      return {
        category: response.data?.category || 'outros',
        suggestedName: response.data?.suggestedName || nomeProduto
      };
    } catch (error) {
      console.error('Erro ao categorizar produto:', error);
      return { category: 'outros', suggestedName: nomeProduto };
    }
  };

  // Função auxiliar que continua o processo de inserção após escolha do nome
  const continuarInsercaoProduto = async (nomeEscolhido: string, categoriaEscolhida: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const quantidade = parseFloat(novoProduto.quantidade);
      const valor = parseFloat(novoProduto.valor);

      // Verificar se o produto já existe no estoque do usuário
      const { data: produtoExistente, error: erroVerificacao } = await supabase
        .from('estoque_app')
        .select('*')
        .eq('user_id', user.id)
        .eq('produto_nome', nomeEscolhido.toUpperCase())
        .single();

      if (produtoExistente) {
        // Atualizar quantidade existente
        const { error: erroUpdate } = await supabase
          .from('estoque_app')
          .update({ 
            quantidade: produtoExistente.quantidade + quantidade,
            preco_unitario_ultimo: valor, // Atualizar também o preço
            origem: 'manual', // Sempre marcar como manual quando inserido manualmente
            updated_at: new Date().toISOString()
          })
          .eq('id', produtoExistente.id);

        if (erroUpdate) throw erroUpdate;

        toast({
          title: "Sucesso",
          description: `Quantidade atualizada: +${formatarQuantidade(quantidade)} ${novoProduto.unidadeMedida}`,
        });
      } else {
        // Inserir novo produto no estoque
         const { error: erroInsert } = await supabase
           .from('estoque_app')
           .insert({
             user_id: user.id,
             produto_nome: nomeEscolhido.toUpperCase(),
             categoria: categoriaEscolhida || 'outros',
             unidade_medida: novoProduto.unidadeMedida,
             quantidade: quantidade,
             preco_unitario_ultimo: valor,
             origem: 'manual'
           });

        if (erroInsert) throw erroInsert;

        // Inserir o preço atual para o produto manual
        const { error: erroPreco } = await supabase
          .from('precos_atuais_usuario')
          .insert({
            user_id: user.id,
            produto_nome: nomeEscolhido.toUpperCase(),
            valor_unitario: valor,
            origem: 'manual'
          });

        if (erroPreco) {
          console.warn('Erro ao inserir preço usuario, mas produto foi inserido:', erroPreco);
        }

        toast({
          title: "Sucesso",
          description: `Produto "${nomeEscolhido}" adicionado ao estoque`,
        });
      }

      fecharModalInserir();
      loadEstoque();
    } catch (error) {
      console.error('Erro ao inserir produto:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível adicionar o produto ao estoque.",
      });
    }
  };

  const inserirProdutoNoEstoque = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Usuário não autenticado.",
        });
        return;
      }

      // Validações obrigatórias
      if (!novoProduto.nome.trim()) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Nome do produto é obrigatório.",
        });
        return;
      }

      if (!novoProduto.categoria) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Categoria é obrigatória.",
        });
        return;
      }

      const quantidade = parseFloat(novoProduto.quantidade);
      if (isNaN(quantidade) || quantidade <= 0) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Quantidade deve ser um número maior que zero.",
        });
        return;
      }

      const valor = parseFloat(novoProduto.valor);
      if (isNaN(valor) || valor <= 0) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Valor é obrigatório e deve ser maior que zero.",
        });
        return;
      }

      if (!novoProduto.unidadeMedida) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Unidade de medida é obrigatória.",
        });
        return;
      }

      // Usar categoria selecionada manualmente (sem IA)
      const categoria = novoProduto.categoria;
      const nomeParaSalvar = novoProduto.nome.trim();

      // Verificar se o produto já existe no estoque do usuário
      const { data: produtoExistente, error: erroVerificacao } = await supabase
        .from('estoque_app')
        .select('*')
        .eq('user_id', user.id)
        .eq('produto_nome', nomeParaSalvar.toUpperCase())
        .single();

      if (produtoExistente) {
        // Atualizar quantidade existente
        const { error: erroUpdate } = await supabase
          .from('estoque_app')
          .update({ 
            quantidade: produtoExistente.quantidade + quantidade,
            preco_unitario_ultimo: valor, // Atualizar também o preço
            origem: 'manual', // Marcar como manual quando inserido manualmente
            updated_at: new Date().toISOString()
          })
          .eq('id', produtoExistente.id);

        if (erroUpdate) throw erroUpdate;

        toast({
          title: "Sucesso",
          description: `Quantidade atualizada: +${formatarQuantidade(quantidade)} ${novoProduto.unidadeMedida}`,
        });
       } else {
          // Inserir novo produto no estoque
          console.log('💾 Inserindo no estoque_app:', {
            user_id: user.id,
            produto_nome: nomeParaSalvar.toUpperCase(),
            categoria: categoria || 'outros',
            unidade_medida: novoProduto.unidadeMedida,
            quantidade: quantidade,
            preco_unitario_ultimo: valor,
            origem: 'manual'
          });
          
           const { error: erroInsert } = await supabase
             .from('estoque_app')
             .insert({
               user_id: user.id,
               produto_nome: nomeParaSalvar.toUpperCase(),
               categoria: categoria || 'outros',
               unidade_medida: novoProduto.unidadeMedida,
               quantidade: quantidade,
               preco_unitario_ultimo: valor,
               origem: 'manual'
             });

         if (erroInsert) {
           console.error('❌ Erro ao inserir no estoque:', erroInsert);
           throw erroInsert;
         }
         console.log('✅ Produto inserido no estoque com sucesso');

        // Inserir o preço atual para o produto manual
        console.log('💰 Inserindo preço atual:', {
          user_id: user.id,
          produto_nome: nomeParaSalvar.toUpperCase(),
          valor_unitario: valor,
          origem: 'manual'
        });
        
        const { error: erroPreco } = await supabase
          .from('precos_atuais_usuario')
          .insert({
            user_id: user.id,
            produto_nome: nomeParaSalvar.toUpperCase(),
            valor_unitario: valor,
            origem: 'manual'
          });

        if (erroPreco) {
          console.error('❌ Erro ao inserir preço:', erroPreco);
          throw erroPreco;
        }
        console.log('✅ Preço inserido com sucesso');

        toast({
          title: "Sucesso",
          description: `Produto "${nomeParaSalvar}" adicionado ao estoque`,
        });
      }

      fecharModalInserir();
      await loadEstoque(); // Aguardar o reload do estoque
      await loadPrecosAtuais(); // Recarregar preços também
    } catch (error) {
      console.error('Erro ao inserir produto:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível adicionar o produto ao estoque.",
      });
    }
  };

  // Função para diagnosticar inconsistências entre notas fiscais e estoque
  const diagnosticarInconsistencias = async () => {
    try {
      setDiagnosticando(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      toast({
        title: "Diagnóstico iniciado",
        description: "Verificando inconsistências no estoque...",
      });

      const { data, error } = await supabase.rpc('diagnosticar_e_corrigir_estoque', {
        usuario_uuid: user.id
      });

      if (error) throw error;

      // Atualizar o estoque após o diagnóstico
      await loadEstoque();

      // Mostrar resultado detalhado
      toast({
        title: "Diagnóstico concluído ✅",
        description: typeof data === 'string' ? data : "Estoque verificado e corrigido com sucesso",
      });

    } catch (error) {
      console.error('Erro ao diagnosticar inconsistências:', error);
      toast({
        variant: "destructive",
        title: "Erro no diagnóstico",
        description: "Não foi possível completar o diagnóstico do estoque.",
      });
    } finally {
      setDiagnosticando(false);
    }
  };

  const limparEstoque = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.rpc('limpar_estoque_usuario', {
        usuario_uuid: user.id
      });

      if (error) throw error;

      await loadEstoque();
      
      toast({
        title: "Estoque limpo",
        description: "Todo o estoque foi removido com sucesso.",
      });
    } catch (error) {
      console.error('Erro ao limpar estoque:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível limpar o estoque.",
      });
    }
  };

  // Funções para edição e ajuste de quantidade
  const abrirModalEdicao = (item: EstoqueItem) => {
    setItemEditando(item);
    setNovaQuantidade(item.quantidade);
  };

  const fecharModalEdicao = () => {
    setItemEditando(null);
    setNovaQuantidade(0);
  };

  const ajustarQuantidade = (acao: 'aumentar' | 'diminuir' | 'zerar') => {
    if (!itemEditando) return;
    
    const increment = itemEditando.unidade_medida.toLowerCase().includes('kg') ? 0.01 : 1;
    
    setNovaQuantidade(prev => {
      switch (acao) {
        case 'aumentar':
          return prev + increment;
        case 'diminuir':
          return Math.max(0, prev - increment);
        case 'zerar':
          return 0;
        default:
          return prev;
      }
    });
  };

  const salvarAjuste = async () => {
    if (!itemEditando) return;

    try {
      const { error } = await supabase
        .from('estoque_app')
        .update({
          quantidade: novaQuantidade,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemEditando.id);

      if (error) throw error;

      await loadEstoque();
      fecharModalEdicao();
      
      toast({
        title: "Quantidade atualizada",
        description: `${itemEditando.produto_nome}: ${formatarQuantidade(novaQuantidade)} ${itemEditando.unidade_medida}`,
      });
    } catch (error) {
      console.error('Erro ao salvar ajuste:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível salvar o ajuste.",
      });
    }
  };

  // Funções para exclusão de produto
  const abrirModalExclusao = (item: EstoqueItem) => {
    setItemParaExcluir(item);
    setModalExclusaoAberto(true);
  };

  const fecharModalExclusao = () => {
    setModalExclusaoAberto(false);
    setItemParaExcluir(null);
  };

  const excluirProdutoDefinitivamente = async () => {
    if (!itemParaExcluir) return;

    try {
      const { error } = await supabase
        .from('estoque_app')
        .delete()
        .eq('id', itemParaExcluir.id);

      if (error) throw error;

      toast({
        title: "Produto excluído",
        description: `${itemParaExcluir.produto_nome} foi removido definitivamente do estoque.`,
      });

      fecharModalExclusao();
      fecharModalEdicao();
      loadEstoque();
    } catch (error) {
      console.error('Erro ao excluir produto:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível excluir o produto.",
      });
    }
  };

  // Funções utilitárias
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Função para formatar data de forma segura
  const formatDateSafe = (dateString: string | null | undefined) => {
    try {
      // Validar se a data não é nula ou indefinida
      if (!dateString || dateString === 'null' || dateString === 'undefined') {
        console.warn('Data nula ou indefinida recebida:', dateString);
        return 'Sem data';
      }

      // Converter para string se não for
      const dateStr = String(dateString);
      
      // Log para debug
      console.log('Formatando data:', dateStr);

      // Se a data tem formato "DD/MM/YYYY HH:mm:ss-TZ", converter para ISO
      if (dateStr.includes('/') && dateStr.includes(' ')) {
        const [datePart, timePart] = dateStr.split(' ');
        const [day, month, year] = datePart.split('/');
        const [time] = timePart.split('-'); // Remove timezone
        const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time}`;
        const formattedDate = new Date(isoString).toLocaleDateString('pt-BR');
        console.log('Data formatada (formato DD/MM/YYYY):', formattedDate);
        return formattedDate;
      }
      
      // Caso contrário, usar formato padrão
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        console.warn('Data inválida:', dateStr);
        return 'Data inválida';
      }
      
      const formattedDate = date.toLocaleDateString('pt-BR');
      console.log('Data formatada (formato padrão):', formattedDate);
      return formattedDate;
    } catch (error) {
      console.error('Erro ao formatar data:', dateString, error);
      return 'Data inválida';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const normalizeValue = (value: number) => {
    return Math.round(value * 100) / 100;
  };

  const formatCategoryName = (categoryName: string): string => {
    const raw = (categoryName || '').toString().trim();
    if (!raw) return 'Outros';
    const lower = raw.toLowerCase();
    // Se conter barra, usar a primeira parte para encurtar (ex.: "laticínios/frios" -> "laticínios")
    let short = lower.includes('/') ? lower.split('/')[0] : lower;
    short = short.replace(/\s+/g, ' ');
    // Capitalizar palavras
    return short.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const getCategoriaColor = (categoria: string) => {
    const colors: { [key: string]: string } = {
      'HORTIFRUTI': 'bg-green-100 text-green-800 border-green-200',
      'MERCEARIA': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'AÇOUGUE': 'bg-red-100 text-red-800 border-red-200',
      'PADARIA': 'bg-amber-100 text-amber-800 border-amber-200',
      'LATICÍNIOS/FRIOS': 'bg-blue-100 text-blue-800 border-blue-200',
      'LIMPEZA': 'bg-purple-100 text-purple-800 border-purple-200',
      'HIGIENE/FARMÁCIA': 'bg-pink-100 text-pink-800 border-pink-200',
      'BEBIDAS': 'bg-orange-100 text-orange-800 border-orange-200',
      'CONGELADOS': 'bg-cyan-100 text-cyan-800 border-cyan-200',
      'PET': 'bg-teal-100 text-teal-800 border-teal-200',
      'OUTROS': 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return colors[categoria.toUpperCase()] || colors['OUTROS'];
  };

  const groupByCategory = (items: EstoqueItem[]) => {
    // 🚨 CORREÇÃO CRÍTICA: NÃO CONSOLIDAR AQUI!
    // A consolidação já foi feita corretamente em loadEstoque()
    // Apenas agrupar por categoria sem perder produtos
    
    console.log('🏷️ groupByCategory - Itens recebidos:', items.length);
    console.log('🏷️ Primeiros 3 produtos para categorização:', items.slice(0, 3).map(item => ({
      nome: item.produto_nome,
      categoria: item.categoria,
      quantidade: item.quantidade
    })));

    // Usar as funções utilitárias para categorias (case-insensitive)

    // Agrupar por categoria usando a ordem definida
    const grouped: Record<string, EstoqueItem[]> = {};
    
    ordemCategorias.forEach(categoria => {
      const produtosDaCategoria = items.filter(item => 
        categoriasEquivalentes(item.categoria, categoria)
      );
      
      if (produtosDaCategoria.length > 0) {
        const categoriaNormalizada = normalizarCategoria(categoria);
        grouped[categoriaNormalizada] = produtosDaCategoria;
        console.log(`🏷️ Categoria ${categoriaNormalizada}: ${produtosDaCategoria.length} produtos`);
      }
    });
    
    console.log('🏷️ Total de categorias criadas:', Object.keys(grouped).length);
    console.log('🏷️ Total de produtos após agrupamento:', Object.values(grouped).reduce((total, itens) => total + itens.length, 0));

    return grouped;
  };

  console.log('🎯 RENDERIZAÇÃO - Estado atual:', {
    loading,
    estoqueLength: estoque.length,
    estoque: estoque.slice(0, 2)
  });

  if (loading) {
    console.log('⏳ Mostrando loading...');
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  console.log('🎯 RENDERIZAÇÃO - Estado atual:', {
    loading,
    estoqueLength: estoque.length,
    estoque: estoque.slice(0, 2)
  });

  if (loading) {
    console.log('⏳ Mostrando loading...');
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (estoque.length === 0) {
    console.log('❌ Mostrando estoque vazio - length:', estoque.length);
    console.log('❌ Array estoque completo:', estoque);
    console.log('❌ Tipo do estoque:', typeof estoque, Array.isArray(estoque));
    return (
      <div className="min-h-screen bg-background text-foreground">
        {/* Header com logo */}
        <div className="bg-card border-b border-border">
          <div className="flex justify-center items-center p-4">
            <PicotinhoLogo />
          </div>
        </div>
        
        <div className="container mx-auto p-6">
          <div className="text-center p-8">
            <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg sm:text-2xl font-bold mb-2 text-foreground">Estoque Vazio</h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              Seu estoque será preenchido automaticamente quando você processar notas fiscais com IA
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Filtrar estoque baseado na opção de mostrar itens zerados
  const estoqueParaExibir = mostrarItensZerados 
    ? estoque 
    : estoque.filter(item => parseFloat(item.quantidade.toString()) > 0);
  
  const groupedEstoque = groupByCategory(estoqueParaExibir);
  
  // Contagem real de produtos únicos considerando todas as categorias
  const totalProdutosUnicos = Object.values(groupedEstoque).reduce((total, itens) => total + itens.length, 0);
  
  // Calcular subtotais por categoria usando APENAS preços atuais (não preços pagos)
  const subtotaisPorCategoria = Object.entries(groupedEstoque).map(([categoria, itens]) => {
    // Subtotal com preços pagos (para exibição na coluna "Valor Pago")
    const subtotalPago = itens.reduce((sum, item) => {
      const preco = item.preco_unitario_ultimo || 0;
      const quantidade = parseFloat(item.quantidade.toString());
      const subtotalItem = Math.round((preco * quantidade) * 100) / 100;
      return sum + subtotalItem;
    }, 0);
    
    // Subtotal com preços atuais (para exibição na coluna "Valor Atual")
    const subtotalAtual = itens.reduce((sum, item) => {
      const precoAtual = encontrarPrecoAtual(item.produto_nome_normalizado || item.produto_nome);
      // REGRA: Apenas usar preços atuais (de notas fiscais), não preços pagos manuais
      const preco = precoAtual?.valor_unitario || 0; // Se não há preço atual, não somar
      const quantidade = parseFloat(item.quantidade.toString());
      const subtotalItem = Math.round((preco * quantidade) * 100) / 100;
      return sum + subtotalItem;
    }, 0);
    
    return { 
      categoria, 
      subtotal: Math.round(subtotalPago * 100) / 100,  // Para ordenação, usar preços pagos
      subtotalAtual: Math.round(subtotalAtual * 100) / 100 
    };
  }).sort((a, b) => b.subtotalAtual - a.subtotalAtual); // Ordenar por valor atual
  
  // Total do estoque considerando apenas preços atuais disponíveis
  const valorTotalEstoque = subtotaisPorCategoria.reduce((sum, cat) => sum + cat.subtotalAtual, 0);
  
  // Total dos preços pagos (para coluna "Valor Pago")
  const valorTotalPago = subtotaisPorCategoria.reduce((sum, cat) => sum + cat.subtotal, 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Botão Ações flutuante fixo alinhado com o botão Menu */}
      <div className="fixed top-14 left-0 right-0 z-40 pointer-events-none">
        <div className="flex justify-end w-full max-w-screen-lg mx-auto p-4">
          <div className="pointer-events-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              size="lg"
              className="h-16 w-16 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg"
            >
              <MoreVertical className="w-6 h-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-background z-50">
            <DropdownMenuItem onClick={abrirModalInserir}>
              <Plus className="w-4 h-4 mr-2" />
              Inserir Produto
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setModoEdicao(!modoEdicao)}>
              <Edit3 className="w-4 h-4 mr-2" />
              {modoEdicao ? "Sair da Edição" : "Ajustar Estoque"}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setMostrarItensZerados(!mostrarItensZerados)}
              className="justify-between"
            >
              <div className="flex items-center">
                <Package className="w-4 h-4 mr-2" />
                Mostrar itens zerados
              </div>
              <div className={`w-4 h-4 border-2 border-gray-400 rounded-sm flex items-center justify-center ${mostrarItensZerados ? 'bg-green-600 border-green-600' : ''}`}>
                {mostrarItensZerados && (
                  <div className="w-2 h-2 bg-white rounded-sm"></div>
                )}
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => document.getElementById('trigger-limpar-estoque')?.click()}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Limpar Estoque
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Header com logo */}
      <div className="bg-card border-b border-border">
        <div className="flex justify-center items-center p-4">
          <PicotinhoLogo />
        </div>
      </div>
      
      <div className="container mx-auto p-6">
        <div className="space-y-4">
          {/* Header da página - sem o botão ações */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-foreground">Estoque Atual</h1>
            </div>
          </div>
          {/* Cards de resumo */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Card className="md:col-span-2 lg:col-span-1">
              <CardHeader className="pb-2">
                <div className="text-center mb-3">
                  <p className="text-sm font-bold text-green-600">Valores em Estoque</p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                   {/* Cabeçalho das colunas */}
                    <div className="grid grid-cols-[1.8fr_0.8fr_1.8fr_1.8fr_0.6fr] gap-1 pb-1 border-b text-xs text-muted-foreground font-medium">
                      <span>Categoria</span>
                      <span className="text-center">Itens</span>
                      <span className="text-center">Valor Pago</span>
                      <span className="text-right">Valor Atual</span>
                      <span className="text-right"></span>
                    </div>
                  
                  {subtotaisPorCategoria.map(({ categoria, subtotal, subtotalAtual }) => {
                    // Calcular subtotal com preços atuais para esta categoria (mesmo cálculo do subtotal principal)
                    const itensCategoria = groupedEstoque[categoria] || [];
                    
                    // Função para determinar o ícone de tendência com normalização
                    const getTrendIcon = () => {
                      const subtotalNormalizado = normalizeValue(subtotal);
                      const subtotalAtualNormalizado = normalizeValue(subtotalAtual);
                      
                      if (subtotalAtualNormalizado > subtotalNormalizado) {
                        return <ArrowUp className="w-3 h-3 text-red-600" />;
                      } else if (subtotalAtualNormalizado < subtotalNormalizado) {
                        return <ArrowDown className="w-3 h-3 text-green-600" />;
                      } else {
                        return <Minus className="w-3 h-3 text-gray-400" />;
                      }
                    };

                     const scrollToCategory = () => {
                       const element = document.getElementById(`categoria-${categoria.toLowerCase()}`);
                       if (element) {
                         element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                       }
                     };

                      // Calcular quantidade total de itens na categoria
                     const quantidadeItens = itensCategoria.length;

                      return (
                        <div key={categoria} className="grid grid-cols-[1.8fr_0.8fr_1.8fr_1.8fr_0.6fr] gap-1 text-xs sm:text-sm items-center py-1">
                           <button 
                             onClick={scrollToCategory}
                             className="capitalize text-blue-600 hover:text-blue-800 underline underline-offset-2 hover:no-underline cursor-pointer text-left font-medium whitespace-nowrap max-w-[140px] truncate"
                           >
                             {formatCategoryName(categoria)}
                           </button>
                          <span className="font-medium text-muted-foreground text-center">{quantidadeItens}</span>
                          <span className="font-medium text-foreground text-center">{formatCurrency(subtotal)}</span>
                           <span className="font-medium text-blue-600 text-right">
                             {formatCurrency(subtotalAtual)}
                           </span>
                          <div className="flex justify-end">
                            {getTrendIcon()}
                          </div>
                       </div>
                     );
                  })}
                  
                      <div className="border-t pt-2 mt-2">
                        <div className="grid grid-cols-[1.8fr_0.8fr_1.8fr_1.8fr_0.6fr] gap-1 font-bold text-xs">
                          <span className="text-foreground">Total</span>
                          <span className="text-muted-foreground text-center">{totalProdutosUnicos}</span>
                         <span className="text-foreground text-center">{formatCurrency(valorTotalPago)}</span>
                         <span className="text-blue-600 text-right">
                           {formatCurrency(valorTotalEstoque)}
                          </span>
                          <div className="flex justify-end">
                             {/* Ícone de tendência total com normalização */}
                            {(() => {
                              const totalAtualNormalizado = normalizeValue(valorTotalEstoque);
                              const valorTotalPagoNormalizado = normalizeValue(valorTotalPago);
                              
                              if (totalAtualNormalizado > valorTotalPagoNormalizado) {
                                return <ArrowUp className="w-3 h-3 text-red-600" />;
                              } else if (totalAtualNormalizado < valorTotalPagoNormalizado) {
                                return <ArrowDown className="w-3 h-3 text-green-600" />;
                              } else {
                                return <Minus className="w-3 h-3 text-gray-400" />;
                              }
                            })()}
                         </div>
                        </div>
                      </div>
                      
                      {/* Linha de diferença - bloco independente separado da tabela */}
                      <div className="mt-3 pt-2 border-t border-dashed border-gray-300">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground font-medium">Diferença</span>
                          <div className={`font-medium ${(() => {
                            const diferenca = valorTotalEstoque - valorTotalPago;
                            return diferenca >= 0 ? 'text-red-600' : 'text-green-600';
                          })()} flex items-center gap-1`}>
                            <span>
                              {(() => {
                                const diferenca = valorTotalEstoque - valorTotalPago;
                                const sinal = diferenca >= 0 ? '+' : '';
                                return `${sinal}${formatCurrency(Math.abs(diferenca))}`;
                              })()}
                            </span>
                            <span className="text-xs">
                              ({(() => {
                                const diferenca = valorTotalEstoque - valorTotalPago;
                                const percentual = valorTotalPago > 0 ? ((diferenca / valorTotalPago) * 100) : 0;
                                const sinal = diferenca >= 0 ? '+' : '';
                                return `${sinal}${Math.abs(percentual).toFixed(1)}%`;
                              })()})
                            </span>
                          </div>
                        </div>
                      </div>
                   </div>
                 </CardContent>
               </Card>
             </div>


          {/* Modal de confirmação para limpar estoque (invisível, acionado pelo dropdown) */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button id="trigger-limpar-estoque" className="hidden"></button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Limpeza do Estoque</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação irá remover TODOS os produtos do seu estoque permanentemente. 
                  <br /><br />
                  <strong>⚠️ Esta ação é irreversível!</strong>
                  <br /><br />
                  Você terá que processar suas notas fiscais novamente para recriar o estoque. Tem certeza que deseja continuar?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={limparEstoque}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Sim, limpar tudo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          </div>

          {/* Lista de produtos por categoria */}
          <div className="space-y-4">
            {Object.entries(groupedEstoque).map(([categoria, itens]) => (
              <Card key={categoria} id={`categoria-${categoria.toLowerCase()}`}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`${getCategoriaColor(categoria)} text-sm font-bold`}>
                      {categoria}
                    </Badge>
                    <span className="text-sm font-medium text-primary">
                      {itens.length} {itens.length === 1 ? 'produto' : 'produtos'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="space-y-1">
                     {itens.map((item) => {
                        const precoAtual = encontrarPrecoAtual(item.produto_nome_normalizado || item.produto_nome);
                       const precoParaExibir = precoAtual?.valor_unitario || item.preco_unitario_ultimo;
                       const quantidade = parseFloat(item.quantidade.toString());
                       
                          return (
                            <div 
                              key={item.id} 
                              className={`flex items-center py-2 border-b border-border last:border-0 ${
                                quantidade === 0 ? 'bg-red-50 border-red-200' : ''
                              }`}
                            >
                             <div className="flex-1 overflow-hidden relative">
                                   <h3 className="text-xs font-medium text-foreground leading-tight relative">
                                     {item.produto_nome_exibicao || item.produto_nome_normalizado || item.produto_nome}
                                    {item.origem === 'manual' && (
                                      <span className="text-red-500 text-xs ml-1">(manual)</span>
                                    )}
                                 {/* Botão de ajuste sobreposto ao título do produto */}
                                 {modoEdicao && (
                                   <Button
                                     onClick={() => abrirModalEdicao(item)}
                                     className="absolute -top-1 -right-2 h-6 px-3 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-medium rounded-md border border-blue-300 shadow-sm transform hover:scale-105 transition-all duration-200 flex items-center gap-1"
                                     size="sm"
                                   >
                                     <Edit3 className="w-3 h-3" />
                                     Ajustar
                                   </Button>
                                 )}
                               </h3>
                                <div className="space-y-1 text-xs">
                                   {(() => {
                                     const nomeExibicao = item.produto_nome_exibicao || item.produto_nome_normalizado || item.produto_nome;
                                     const historicoProduto = historicoPrecos[nomeExibicao];
                                     const unidadeFormatada = item.unidade_medida.replace('Unidade', 'Un');

                                     // Debug para produtos manuais
                                     if (item.origem === 'manual') {
                                       console.log('PRODUTO MANUAL DEBUG:', {
                                         nome: nomeExibicao,
                                         origem: item.origem,
                                         created_at: item.created_at,
                                         preco_unitario_ultimo: item.preco_unitario_ultimo,
                                         historicoPrecos: historicoProduto,
                                         precoAtual: encontrarPrecoAtual(nomeExibicao)
                                       });
                                     }

                                     return (
                                      <>
                                        {/* Linha 1: Última compra do usuário - GARANTIR DADOS SEMPRE VISÍVEIS */}
                                        <div className="text-primary font-medium">
                                          {(() => {
                                            // Prioridade: dados do estoque SEMPRE primeiro
                                            const precoExibir = item.preco_unitario_ultimo || 0;
                                            const totalExibir = (precoExibir * quantidade).toFixed(2);
                                            
                                             // Buscar data: usar created_at para produtos manuais, data da nota fiscal para outros
                                             const dataRealCompra = item.origem === 'manual' 
                                               ? item.created_at 
                                               : encontrarDataNotaFiscal(nomeExibicao);
                                             const dataExibir = dataRealCompra ? formatDateSafe(dataRealCompra) : 'Sem data';
                                            
                                            return `${dataExibir} - R$ ${precoExibir.toFixed(2)}/${unidadeFormatada} - T: R$ ${totalExibir}`;
                                          })()}
                                        </div>

                                        {/* Linha 2: Menor preço na área */}
                                        {historicoProduto?.menorPrecoArea ? (
                                          <div className="text-muted-foreground">
                                            {historicoProduto.menorPrecoArea.data ? 
                                              formatDateSafe(historicoProduto.menorPrecoArea.data) : 
                                              'Sem data'
                                            } - R$ {(historicoProduto.menorPrecoArea.preco || 0).toFixed(2)}/{unidadeFormatada} - T: R$ {((historicoProduto.menorPrecoArea.preco || 0) * quantidade).toFixed(2)}
                                          </div>
                                        ) : precoAtual && precoAtual.valor_unitario ? (
                                          <div className="text-muted-foreground">
                                            {precoAtual.data_atualizacao ? 
                                              formatDateSafe(precoAtual.data_atualizacao) : 
                                              'Sem data'
                                            } - R$ {(precoAtual.valor_unitario || 0).toFixed(2)}/{unidadeFormatada} - T: R$ {((precoAtual.valor_unitario || 0) * quantidade).toFixed(2)}
                                          </div>
                                        ) : item.origem === 'manual' ? (
                                          <div className="text-muted-foreground">
                                            {item.created_at ? 
                                              formatDateSafe(item.created_at) : 
                                              'Sem data'
                                            } - R$ {(item.preco_unitario_ultimo || 0).toFixed(2)}/{unidadeFormatada} - T: R$ {((item.preco_unitario_ultimo || 0) * quantidade).toFixed(2)}
                                          </div>
                                        ) : null}

                                        {/* Fallback removido - sempre mostrar dados do estoque se disponíveis */}
                                      </>
                                    );
                                  })()}
                                </div>
                           </div>
                           
                               <div className="text-right flex-shrink-0 ml-2">
                                 <div className={`text-xs font-medium ${
                                   quantidade === 0 ? 'text-red-600' : 'text-foreground'
                                 }`}>
                                   {formatarQuantidade(quantidade)} {item.unidade_medida.replace('Unidade', 'Un')}
                                 </div>
                                  {/* Setinha de comparação de preços */}
                                  {(() => {
                                    const nomeExibicao = item.produto_nome_exibicao || item.produto_nome_normalizado || item.produto_nome;
                                    const historicoProduto = historicoPrecos[nomeExibicao];
                                    const precoAtual = encontrarPrecoAtual(nomeExibicao);
                                    
                                    // Para produtos manuais, sem comparação (preço igual)
                                    if (item.origem === 'manual') {
                                      return <Minus className="w-3 h-3 text-muted-foreground/60 mt-0.5" />;
                                    }
                                    
                                    // Comparar preço atual da área vs preço originalmente pago
                                    const precoOriginal = item.preco_unitario_ultimo || 0;
                                    let precoAreaAtual = 0;
                                    
                                    if (historicoProduto?.menorPrecoArea?.preco) {
                                      precoAreaAtual = historicoProduto.menorPrecoArea.preco;
                                    } else if (precoAtual?.valor_unitario) {
                                      precoAreaAtual = precoAtual.valor_unitario;
                                    }
                                    
                                    if (precoAreaAtual === 0 || precoOriginal === 0) {
                                      return <Minus className="w-3 h-3 text-muted-foreground/60 mt-0.5" />;
                                    }
                                    
                                    const atual = normalizeValue(precoAreaAtual);
                                    const original = normalizeValue(precoOriginal);
                                    
                                    if (atual > original) {
                                      return <ArrowUp className="w-3 h-3 text-red-600 mt-0.5" />;
                                    } else if (atual < original) {
                                      return <ArrowDown className="w-3 h-3 text-green-600 mt-0.5" />;
                                    } else {
                                      return <Minus className="w-3 h-3 text-muted-foreground/60 mt-0.5" />;
                                    }
                                  })()}
                          </div>
                       </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
         </div>
         
         {/* Espaço extra no final para evitar sobreposição com botões flutuantes */}
         <div className="h-24"></div>
       </div>

      {/* Modal de Edição */}
      <Dialog open={!!itemEditando} onOpenChange={fecharModalEdicao}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar Quantidade</DialogTitle>
          </DialogHeader>
          
          {itemEditando && (
            <div className="space-y-4">
               <div className="text-center">
                 <h3 className="font-semibold text-lg">{itemEditando.produto_nome_exibicao || itemEditando.produto_nome_normalizado || itemEditando.produto_nome}</h3>
                <p className="text-sm text-muted-foreground">
                  Quantidade atual: {formatarQuantidade(itemEditando.quantidade)} {itemEditando.unidade_medida.replace('Unidade', 'Un')}
                </p>
              </div>
              
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {formatarQuantidade(novaQuantidade)} {itemEditando.unidade_medida.replace('Unidade', 'Un')}
                </p>
              </div>
              
              <div className="flex justify-center gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => ajustarQuantidade('diminuir')}
                  className="h-12 w-12 p-0"
                >
                  <Minus className="w-6 h-6" />
                </Button>
                
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => ajustarQuantidade('zerar')}
                  className="h-12 px-4"
                >
                  Zerar
                </Button>
                
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => ajustarQuantidade('aumentar')}
                  className="h-12 w-12 p-0"
                >
                  <Plus className="w-6 h-6" />
                </Button>
              </div>
              
              <div className="text-center text-xs text-muted-foreground">
                {itemEditando.unidade_medida.toLowerCase().includes('kg') 
                  ? 'Cada clique ajusta 0,01 Kg (10 gramas)'
                  : 'Cada clique ajusta 1 unidade'
                }
              </div>
              
              {/* Botão Excluir Item */}
              <div className="mt-4 pt-4 border-t border-border">
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => abrirModalExclusao(itemEditando)}
                  className="w-full text-xs h-8"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Excluir Item
                </Button>
              </div>
              
              <div className="flex gap-2 mt-6">
                <Button variant="outline" onClick={fecharModalEdicao} className="flex-1">
                  Cancelar
                </Button>
                <Button onClick={salvarAjuste} className="flex-1">
                  Confirmar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão */}
      <AlertDialog open={modalExclusaoAberto} onOpenChange={setModalExclusaoAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {itemParaExcluir && (
                <>
                  <div className="font-medium text-foreground">
                    📦 {itemParaExcluir.produto_nome}
                  </div>
                  <div className="text-sm">
                    {parseFloat(itemParaExcluir.quantidade.toString()) === 0 ? (
                      <span>
                        👉 Este item será definitivamente excluído do estoque. Você confirma a exclusão?
                      </span>
                    ) : (
                      <span>
                        👉 Este item ainda possui produtos em estoque. Ao excluí-lo, o saldo atual será zerado e o item será removido definitivamente. Você confirma a exclusão?
                      </span>
                    )}
                  </div>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={fecharModalExclusao}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={excluirProdutoDefinitivamente}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Inserir Produto */}
      <Dialog open={modalInserirAberto} onOpenChange={fecharModalInserir}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Inserir Produto no Estoque</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* 1. Nome do produto - Campo de busca */}
            <div className="space-y-2">
              <Label htmlFor="busca-produto">Nome do produto *</Label>
              <div className="relative">
                <Input
                  id="busca-produto"
                  placeholder="Digite o nome do produto..."
                  value={termoBusca}
                  onChange={(e) => {
                    setTermoBusca(e.target.value);
                    buscarProdutosSugeridos(e.target.value);
                    setNovoProduto({ ...novoProduto, nome: e.target.value });
                  }}
                />
                <Search className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
              </div>
              
              {/* Lista de sugestões */}
              {produtosSugeridos.length > 0 && (
                <div className="border rounded-md max-h-32 overflow-y-auto">
                  {produtosSugeridos.map((produto) => (
                    <button
                      key={produto.id}
                      onClick={() => selecionarProduto(produto)}
                      className="w-full text-left px-3 py-2 hover:bg-muted border-b last:border-0 text-sm"
                    >
                      <div className="font-medium">{produto.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {produto.categoria} • {produto.unidade_medida}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Unidade de medida - Apenas 3 opções */}
            <div className="space-y-2">
              <Label htmlFor="unidade">Unidade de medida *</Label>
              <Select
                value={novoProduto.unidadeMedida}
                onValueChange={(value) => setNovoProduto({ ...novoProduto, unidadeMedida: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="kg">Quilo (kg)</SelectItem>
                  <SelectItem value="un">Unidade (un)</SelectItem>
                  <SelectItem value="L">Litro (L)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 3. Quantidade */}
            <div className="space-y-2">
              <Label htmlFor="quantidade">Quantidade *</Label>
              <Input
                id="quantidade"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Digite a quantidade"
                value={novoProduto.quantidade}
                onChange={(e) => setNovoProduto({ ...novoProduto, quantidade: e.target.value })}
              />
            </div>

            {/* 4. Categoria - 11 categorias fixas */}
            <div className="space-y-2">
              <Label htmlFor="categoria">Categoria *</Label>
              <Select
                value={novoProduto.categoria}
                onValueChange={(value) => setNovoProduto({ ...novoProduto, categoria: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="hortifruti">Hortifruti</SelectItem>
                  <SelectItem value="bebidas">Bebidas</SelectItem>
                  <SelectItem value="mercearia">Mercearia</SelectItem>
                  <SelectItem value="açougue">Açougue</SelectItem>
                  <SelectItem value="padaria">Padaria</SelectItem>
                  <SelectItem value="laticínios/frios">Laticínios/Frios</SelectItem>
                  <SelectItem value="limpeza">Limpeza</SelectItem>
                  <SelectItem value="higiene/farmácia">Higiene/Farmácia</SelectItem>
                  <SelectItem value="congelados">Congelados</SelectItem>
                  <SelectItem value="pet">Pet</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 5. Preço pago por unidade */}
            <div className="space-y-2">
              <Label htmlFor="valor">Preço pago por unidade *</Label>
              <Input
                id="valor"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Digite o preço que você pagou em R$"
                value={novoProduto.valor}
                onChange={(e) => setNovoProduto({ ...novoProduto, valor: e.target.value })}
              />
            </div>

            {/* Mostrar preço total calculado */}
            {novoProduto.valor && novoProduto.quantidade && (
              <div className="bg-muted p-3 rounded-md">
                <div className="text-sm font-medium text-foreground">
                  💰 Valor Total: {formatCurrency(parseFloat(novoProduto.valor) * parseFloat(novoProduto.quantidade))}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatarQuantidade(parseFloat(novoProduto.quantidade))} {novoProduto.unidadeMedida} × {formatCurrency(parseFloat(novoProduto.valor))}
                </div>
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={fecharModalInserir} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={inserirProdutoNoEstoque} 
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                Adicionar ao Estoque
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EstoqueAtual;
