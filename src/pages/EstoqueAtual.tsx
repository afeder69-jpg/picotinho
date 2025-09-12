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

interface EstoqueItem {
  id: string;
  produto_nome: string;
  categoria: string;
  unidade_medida: string;
  quantidade: number;
  preco_unitario_ultimo: number | null;
  updated_at: string;
  origem: string; // 'manual' ou 'nota_fiscal'
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
  const [loading, setLoading] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>('');
  const [modoEdicao, setModoEdicao] = useState(false);
  const [itemEditando, setItemEditando] = useState<EstoqueItem | null>(null);
  const [novaQuantidade, setNovaQuantidade] = useState<number>(0);
  const [corrigindoPrecos, setCorrigindoPrecos] = useState(false);
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
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadEstoque();
    loadPrecosAtuais();
    loadDatasNotasFiscais();
    // corrigirProdutosManuais(); // Removido - correção manual
  }, []);

  // Função removida - estava causando problemas na marcação de produtos manuais

  const loadPrecosAtuais = async () => {
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
      console.error('Erro ao carregar preços atuais:', error);
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

      console.log('📅 Datas das notas fiscais carregadas:', datasMap);
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
    console.log(`🔍 Buscando data para produto: "${nomeProduto}"`);
    console.log(`📅 Datas disponíveis:`, Object.keys(datasNotasFiscais));
    
    // Buscar correspondência exata primeiro
    if (datasNotasFiscais[nomeProduto]) {
      console.log(`✅ Encontrou data exata para "${nomeProduto}": ${datasNotasFiscais[nomeProduto]}`);
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

  // Função para encontrar preço atual de um produto
  const encontrarPrecoAtual = (nomeProduto: string) => {
    console.log(`🔍 Buscando preço atual para: "${nomeProduto}"`);
    console.log(`📊 Preços disponíveis na área: ${precosAtuais.length}`);
    console.log(`📦 Produtos no estoque: ${estoque.length}`);
    
    if (!nomeProduto) {
      console.log('❌ Nome do produto vazio');
      return null;
    }
    
    const nomeProdutoNormalizado = nomeProduto.toLowerCase().trim();
    
    // 1. PRIORIDADE: Buscar preços de notas fiscais de outros usuários na área (mais recentes primeiro)
    // Busca exata nos preços da área
    const buscaExata = precosAtuais.find(preco => 
      preco.produto_nome && 
      preco.produto_nome.toLowerCase().trim() === nomeProdutoNormalizado &&
      preco.origem === 'geral' // Priorizar preços de outros usuários
    );
    if (buscaExata) {
      console.log(`✅ Encontrou preço exato de outro usuário na área: R$ ${buscaExata.valor_unitario}`);
      return buscaExata;
    }
    
    // 2. Busca por palavras-chave nos preços da área
    const palavrasChave = nomeProdutoNormalizado
      .replace(/\b(kg|g|ml|l|un|unidade|lata|pacote|caixa|frasco|100g|200g|300g|400g|500g|1kg|2kg)\b/g, '')
      .replace(/\b(\d+g|\d+ml|\d+l|\d+kg)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    const buscaPorPalavrasChave = precosAtuais.find(preco => {
      if (!preco.produto_nome || preco.origem !== 'geral') return false;
      
      const precoNormalizado = preco.produto_nome.toLowerCase()
        .replace(/\b(kg|g|ml|l|un|unidade|lata|pacote|caixa|frasco|100g|200g|300g|400g|500g|1kg|2kg)\b/g, '')
        .replace(/\b(\d+g|\d+ml|\d+l|\d+kg)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      return palavrasChave.includes(precoNormalizado) || precoNormalizado.includes(palavrasChave);
    });
    if (buscaPorPalavrasChave) {
      console.log(`✅ Encontrou preço por palavras-chave de outro usuário na área: R$ ${buscaPorPalavrasChave.valor_unitario}`);
      return buscaPorPalavrasChave;
    }
    
    // 3. Busca por similaridade nos preços da área
    const buscaSimilaridade = precosAtuais.find(preco => {
      if (!preco.produto_nome || preco.origem !== 'geral') return false;
      
      const precoLower = preco.produto_nome.toLowerCase();
      const produtoLower = nomeProdutoNormalizado;
      
      // Dividir em palavras e verificar se pelo menos 2 palavras coincidem
      const palavrasPreco = precoLower.split(/\s+/).filter(p => p.length > 2);
      const palavrasProduto = produtoLower.split(/\s+/).filter(p => p.length > 2);
      
      let coincidencias = 0;
      palavrasProduto.forEach(palavra => {
        if (palavrasPreco.some(p => p.includes(palavra) || palavra.includes(p))) {
          coincidencias++;
        }
      });
      
      return coincidencias >= 2;
    });
    
    if (buscaSimilaridade) {
      console.log(`✅ Encontrou preço por similaridade de outro usuário na área: R$ ${buscaSimilaridade.valor_unitario}`);
      return buscaSimilaridade;
    }
    
    // 4. Se não há preço mais recente de outros usuários, usar o próprio preço mais recente
    // Buscar TODAS as compras do usuário para este produto no estoque (considerando histórico completo)
    const produtosDoUsuario = estoque.filter(item => 
      item.produto_nome.toLowerCase() === nomeProduto.toLowerCase() &&
      item.preco_unitario_ultimo && 
      item.preco_unitario_ultimo > 0
    );
    
    if (produtosDoUsuario.length > 0) {
      // Buscar a data da nota fiscal mais recente para este produto
      const dataNotaFiscalMaisRecente = encontrarDataNotaFiscal(nomeProduto);
      
      // Se temos a data da nota, usar ela; senão usar a data de atualização mais recente
      let produtoMaisRecente = produtosDoUsuario[0];
      
      if (dataNotaFiscalMaisRecente) {
        // Usar o preço associado à data da nota fiscal
        produtoMaisRecente = produtosDoUsuario.find(p => {
          const dataNotaProduto = encontrarDataNotaFiscal(p.produto_nome);
          return dataNotaProduto === dataNotaFiscalMaisRecente;
        }) || produtoMaisRecente;
        
        console.log(`💰 Usando preço próprio mais recente (data da nota): R$ ${produtoMaisRecente.preco_unitario_ultimo} em ${dataNotaFiscalMaisRecente}`);
        return {
          produto_nome: nomeProduto,
          valor_unitario: produtoMaisRecente.preco_unitario_ultimo,
          data_atualizacao: dataNotaFiscalMaisRecente, // Usar data da nota fiscal
          origem: 'produto_proprio'
        };
      } else {
        // Usar o produto com updated_at mais recente
        produtoMaisRecente = produtosDoUsuario.reduce((mais_recente, atual) => 
          new Date(atual.updated_at) > new Date(mais_recente.updated_at) ? atual : mais_recente
        );
        
        console.log(`💰 Usando preço próprio mais recente (sem data de nota): R$ ${produtoMaisRecente.preco_unitario_ultimo}`);
        return {
          produto_nome: nomeProduto,
          valor_unitario: produtoMaisRecente.preco_unitario_ultimo,
          data_atualizacao: produtoMaisRecente.updated_at,
          origem: 'produto_proprio'
        };
      }
    }
    
    // 5. Verificar preços do usuário na tabela precos_atuais_usuario
    const precoManualTabela = precosAtuais.find(preco => 
      preco.origem === 'usuario' && 
      preco.produto_nome.toLowerCase() === nomeProduto.toLowerCase()
    );
    
    if (precoManualTabela) {
      console.log(`💰 Usando preço da tabela precos_atuais_usuario: R$ ${precoManualTabela.valor_unitario}`);
      return precoManualTabela;
    }
    
    console.log(`❌ Nenhum preço encontrado para: "${nomeProduto}"`);
    return null;
  };

  const loadEstoque = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('estoque_app')
        .select('*, origem')
        .eq('user_id', user.id)
        .gt('quantidade', 0)  // Mostrar apenas produtos com estoque para não poluir a interface
        .order('produto_nome', { ascending: true });

      if (error) throw error;

      console.log('📦 Estoque carregado:', data);
      setEstoque(data || []);
      
      // Encontrar a última atualização
      if (data && data.length > 0) {
        const ultimaData = data.reduce((latest, item) => {
          const itemDate = new Date(item.updated_at);
          return itemDate > new Date(latest) ? item.updated_at : latest;
        }, data[0].updated_at);
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
  const formatDateSafe = (dateString: string) => {
    try {
      // Se a data tem formato "DD/MM/YYYY HH:mm:ss-TZ", converter para ISO
      if (dateString.includes('/') && dateString.includes(' ')) {
        const [datePart, timePart] = dateString.split(' ');
        const [day, month, year] = datePart.split('/');
        const [time] = timePart.split('-'); // Remove timezone
        const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time}`;
        return new Date(isoString).toLocaleDateString('pt-BR');
      }
      // Caso contrário, usar formato padrão
      return new Date(dateString).toLocaleDateString('pt-BR');
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
      'açougue': 'bg-red-100 text-red-800 border-red-200',
      'frutas e verduras': 'bg-green-100 text-green-800 border-green-200',
      'padaria': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'lacticínios': 'bg-blue-100 text-blue-800 border-blue-200',
      'limpeza': 'bg-purple-100 text-purple-800 border-purple-200',
      'higiene': 'bg-pink-100 text-pink-800 border-pink-200',
      'bebidas': 'bg-orange-100 text-orange-800 border-orange-200',
      'congelados': 'bg-cyan-100 text-cyan-800 border-cyan-200',
      'outros': 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return colors[categoria.toLowerCase()] || colors['outros'];
  };

  const groupByCategory = (items: EstoqueItem[]) => {
    // Primeiro, remover duplicatas baseado no nome do produto
    const uniqueItems = items.reduce((unique, item) => {
      const existingIndex = unique.findIndex(u => u.produto_nome === item.produto_nome);
      if (existingIndex >= 0) {
        // Se encontrou duplicata, manter apenas o mais recente
        if (new Date(item.updated_at) > new Date(unique[existingIndex].updated_at)) {
          unique[existingIndex] = item;
        }
      } else {
        unique.push(item);
      }
      return unique;
    }, [] as EstoqueItem[]);

    return uniqueItems.reduce((groups, item) => {
      const categoria = (item.categoria || 'outros').toLowerCase();
      if (!groups[categoria]) {
        groups[categoria] = [];
      }
      groups[categoria].push(item);
      return groups;
    }, {} as { [key: string]: EstoqueItem[] });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (estoque.length === 0) {
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

  const groupedEstoque = groupByCategory(estoque);
  
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
      const precoAtual = encontrarPrecoAtual(item.produto_nome);
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
                      {categoria.charAt(0).toUpperCase() + categoria.slice(1)}
                    </Badge>
                    <span className="text-sm font-medium text-primary">
                      {itens.length} {itens.length === 1 ? 'produto' : 'produtos'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="space-y-1">
                     {itens.map((item) => {
                       const precoAtual = encontrarPrecoAtual(item.produto_nome);
                       const precoParaExibir = precoAtual?.valor_unitario || item.preco_unitario_ultimo;
                       const quantidade = parseFloat(item.quantidade.toString());
                       
                         return (
                           <div 
                             key={item.id} 
                             className="flex items-center py-2 border-b border-border last:border-0"
                           >
                            <div className="flex-1 overflow-hidden relative">
                                <h3 className="text-xs font-medium text-foreground leading-tight relative">
                                  {item.produto_nome}
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
                               <p className="text-xs text-muted-foreground space-y-1">
                                 {item.preco_unitario_ultimo && item.preco_unitario_ultimo > 0 ? (
                                   <>
                                     <div>
                                       Pago- {formatCurrency(item.preco_unitario_ultimo)} por {item.unidade_medida.replace('Unidade', 'Un')} - Subt.: {formatCurrency((item.preco_unitario_ultimo * quantidade))}
                                     </div>
                                     <div className="text-blue-600 font-medium flex items-center gap-1">
                                        {precoAtual ? (
                                          <>
                                             <span>
                                               {(() => {
                                                 // Se o preço atual vem de uma nota fiscal, usar a data da nota
                                                 // Se vem do próprio produto, usar a data da nota fiscal do produto ou a data de atualização
                                                 let dataExibir = precoAtual.data_atualizacao;
                                                 
                                                 if (precoAtual.origem === 'produto_proprio') {
                                                   const dataNotaFiscal = encontrarDataNotaFiscal(item.produto_nome);
                                                   if (dataNotaFiscal) {
                                                     dataExibir = dataNotaFiscal;
                                                   }
                                                 }
                                                 
                                                 return formatDateSafe(dataExibir);
                                               })()} - {formatCurrency(precoAtual.valor_unitario)} por {item.unidade_medida.replace('Unidade', 'Un')} - Subt.: {formatCurrency((precoAtual.valor_unitario * quantidade))}
                                             </span>
                                           {(() => {
                                             const subtotalPago = normalizeValue(item.preco_unitario_ultimo * quantidade);
                                             const subtotalAtual = normalizeValue(precoAtual.valor_unitario * quantidade);
                                             
                                              if (subtotalAtual > subtotalPago) {
                                                return <ArrowUp className="w-3 h-3 text-red-600 flex-shrink-0" />;
                                              } else if (subtotalAtual < subtotalPago) {
                                                return <ArrowDown className="w-3 h-3 text-green-600 flex-shrink-0" />;
                                             } else {
                                               return <Minus className="w-3 h-3 text-gray-400 flex-shrink-0" />;
                                             }
                                           })()}
                                         </>
                                       ) : (
                                          <span className="text-red-600">
                                            Sem preço - {formatCurrency(0)} por {item.unidade_medida.replace('Unidade', 'Un')} - Subt.: {formatCurrency(0)}
                                          </span>
                                       )}
                                     </div>
                                   </>
                                 ) : (
                                   <>
                                     <div>
                                       Produto inserido manualmente - sem valor definido
                                     </div>
                                      <div className="text-red-600 font-medium">
                                        Sem preço - {formatCurrency(0)} por {item.unidade_medida.replace('Unidade', 'Un')} - Subt.: {formatCurrency(0)}
                                      </div>
                                   </>
                                 )}
                              </p>
                           </div>
                           
                              <div className="text-right flex-shrink-0 ml-2">
                                <div className="text-xs font-medium text-foreground">
                                  {formatarQuantidade(quantidade)} {item.unidade_medida.replace('Unidade', 'Un')}
                                </div>
                                {/* Texto removido conforme solicitação do usuário */}
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
                <h3 className="font-semibold text-lg">{itemEditando.produto_nome}</h3>
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
