// Indicador de recência baseado na data real de atualização do preço
// (precos_atuais.data_atualizacao, derivada da data/hora da nota fiscal).
// Fonte de verdade compartilhada entre lista de compras e tabela comparativa.

export type RecenciaIndicador = {
  cor: string;          // classe Tailwind do texto/emoji
  bg: string;           // classe Tailwind para fundo da bolinha
  emoji: string;        // emoji equivalente (usado na TabelaComparativa)
  label: string;        // descrição textual ("Atualizado há N dia(s)")
  faixa: 'recente' | 'medio' | 'antigo' | 'desconhecido';
};

export function getRecenciaIndicador(dataAtualizacao?: string | null): RecenciaIndicador {
  if (!dataAtualizacao) {
    return {
      cor: 'text-muted-foreground',
      bg: 'bg-muted-foreground',
      emoji: '⚪',
      label: 'Data desconhecida',
      faixa: 'desconhecido',
    };
  }

  const agora = new Date();
  const dataPreco = new Date(dataAtualizacao);
  const diffMs = agora.getTime() - dataPreco.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDias <= 3) {
    return {
      cor: 'text-green-500',
      bg: 'bg-green-500',
      emoji: '🟢',
      label: `Atualizado há ${diffDias} dia(s)`,
      faixa: 'recente',
    };
  }
  if (diffDias <= 10) {
    return {
      cor: 'text-yellow-500',
      bg: 'bg-yellow-500',
      emoji: '🟡',
      label: `Atualizado há ${diffDias} dias`,
      faixa: 'medio',
    };
  }
  return {
    cor: 'text-red-500',
    bg: 'bg-red-500',
    emoji: '🔴',
    label: `Atualizado há ${diffDias} dias`,
    faixa: 'antigo',
  };
}
