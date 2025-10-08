# 🍳 Módulo de Receitas - Picotinho

Sistema completo de gerenciamento de receitas integrado ao controle de estoque do Picotinho.

## ✅ Funcionalidades Implementadas

### 📊 Estrutura de Banco de Dados (Etapa 1)
- ✅ **6 Tabelas principais**:
  - `receitas` - Armazenamento de receitas com metadados completos
  - `receita_ingredientes` - Ingredientes de cada receita
  - `receitas_tags` - Sistema de tags para categorização
  - `cardapios` - Planejamento semanal de refeições
  - `cardapio_receitas` - Relacionamento entre cardápios e receitas
  - `listas_compras` - Listas de compras geradas automaticamente
  - `listas_compras_itens` - Itens das listas de compras

- ✅ **3 Enums**:
  - `fonte_receita`: minha | comunidade | api_externa | picotinho
  - `status_receita`: rascunho | ativa | arquivada
  - `tipo_refeicao`: cafe_manha | lanche_manha | almoco | lanche_tarde | jantar | ceia

- ✅ **11 Índices** para otimização de consultas
- ✅ **15 Políticas RLS** para segurança de dados

### 🔧 Backend Logic (Etapa 2)
- ✅ **5 RPC Functions**:
  1. `buscar_receitas_disponiveis` - Lista receitas com status de disponibilidade baseado no estoque
  2. `verificar_disponibilidade_receita` - Verifica ingredientes disponíveis vs necessários
  3. `criar_lista_compras_de_receita` - Gera lista de compras para uma receita
  4. `criar_lista_compras_de_cardapio` - Gera lista de compras para cardápio semanal
  5. `importar_receita_api` - Importa receitas de APIs externas (preparação)

### 🎨 Interface Frontend (Etapa 3)
- ✅ **2 Páginas principais**:
  - `/receitas` - Navegação e gerenciamento de receitas
  - `/cardapios` - Planejamento de cardápios semanais

- ✅ **8 Componentes React**:
  - `ReceitasList` - Listagem com filtros (disponíveis, parciais, favoritas)
  - `ReceitaCard` - Card com preview e status de disponibilidade
  - `ReceitaDialog` - Formulário de criação/edição
  - `ReceitaDetalhesDialog` - Visualização completa com ingredientes
  - `CardapiosList` - Listagem de cardápios
  - `CardapioCard` - Card de cardápio semanal
  - `CardapioDialog` - Criação de novos cardápios
  - `IngredientesManager` - Gerenciador de ingredientes

- ✅ **Sistema de Abas**: Todas | Disponíveis | Parciais | Favoritas

### 🌐 Integração com APIs (Etapa 4)
- ✅ **2 Edge Functions**:
  - `buscar-receitas-api` - Busca receitas em APIs externas
  - `importar-receita-api` - Importa receita completa para o banco

- ✅ **APIs Suportadas**:
  - TheMealDB (gratuita) ✅
  - Edamam (requer API key)

- ✅ **Componente de Busca**: `BuscarReceitasApi` com preview e importação

### 📸 Upload de Imagens (Etapa 5)
- ✅ **Storage Bucket**: `receitas-imagens`
  - Público para visualização
  - Limite de 5MB por imagem
  - Formatos: JPG, PNG, WEBP
  
- ✅ **Políticas RLS**:
  - Visualização pública
  - Upload para usuários autenticados
  - Edição/exclusão apenas do próprio conteúdo

- ✅ **Componente de Upload**: `ImageUpload`
  - Preview de imagem
  - Validação de tamanho e formato
  - Feedback de progresso

### 🧭 Navegação (Etapa 6 - Final)
- ✅ Rotas adicionadas ao `App.tsx`
- ✅ Links no menu principal (`/menu`)
- ✅ Ícones apropriados (ChefHat, Calendar)

## 🔑 Recursos Principais

### Inteligência de Estoque
- ✅ Verifica automaticamente se você tem os ingredientes
- ✅ Indica receitas **completas**, **parciais** ou **indisponíveis**
- ✅ Mostra quantos ingredientes faltam
- ✅ Gera lista de compras automaticamente

### Planejamento Semanal
- ✅ Crie cardápios semanais
- ✅ Organize refeições por dia da semana
- ✅ Gere lista de compras consolidada para a semana

### Importação Automática
- ✅ Busque receitas em APIs públicas
- ✅ Importe com um clique
- ✅ Ingredientes são automaticamente adicionados

### Upload de Fotos
- ✅ Adicione fotos às suas receitas
- ✅ Suporte a formatos modernos (WEBP)
- ✅ Armazenamento seguro e otimizado

## 📁 Estrutura de Arquivos

```
src/
├── pages/
│   ├── Receitas.tsx          # Página principal de receitas
│   └── Cardapios.tsx         # Página de cardápios semanais
├── components/receitas/
│   ├── ReceitasList.tsx      # Lista de receitas
│   ├── ReceitaCard.tsx       # Card individual
│   ├── ReceitaDialog.tsx     # Formulário de criação
│   ├── ReceitaDetalhesDialog.tsx  # Visualização detalhada
│   ├── CardapiosList.tsx     # Lista de cardápios
│   ├── CardapioCard.tsx      # Card de cardápio
│   ├── CardapioDialog.tsx    # Criação de cardápio
│   ├── ImageUpload.tsx       # Upload de imagens
│   ├── IngredientesManager.tsx # Gerenciamento de ingredientes
│   └── BuscarReceitasApi.tsx # Busca em APIs externas
└── supabase/functions/
    ├── buscar-receitas-api/
    └── importar-receita-api/
```

## 🚀 Como Usar

### Criar uma Receita
1. Acesse `/receitas`
2. Clique em "Nova Receita"
3. Adicione título, descrição, tempo de preparo
4. Upload de foto (opcional)
5. Adicione ingredientes
6. Escreva o modo de preparo
7. Salve!

### Buscar Receitas Online
1. Na página de receitas, clique em "Buscar Online"
2. Escolha a API (TheMealDB ou Edamam)
3. Digite o que procura (ex: "chicken", "pasta")
4. Clique em "Importar" na receita desejada

### Planejar Cardápio Semanal
1. Acesse `/cardapios`
2. Clique em "Novo Cardápio"
3. Defina o período (data início e fim)
4. Adicione receitas para cada dia/refeição
5. Gere lista de compras consolidada

### Verificar Disponibilidade
- O sistema verifica automaticamente seu estoque
- Receitas **verdes**: você tem tudo
- Receitas **amarelas**: faltam alguns itens
- Receitas **vermelhas**: muitos itens faltando

## 🔒 Segurança

- ✅ Row Level Security (RLS) em todas as tabelas
- ✅ Políticas de acesso baseadas em autenticação
- ✅ Usuários só veem e editam suas próprias receitas
- ✅ Storage com validação de tipo e tamanho de arquivo
- ✅ Funções com SECURITY DEFINER onde necessário

## 📊 Banco de Dados

### Tabelas Principais
- `receitas`: 15 colunas (título, descrição, instruções, tempo, porções, etc.)
- `receita_ingredientes`: Ingredientes com quantidade e unidade
- `cardapios`: Planejamento semanal
- `listas_compras`: Listas geradas automaticamente

### Relacionamentos
- Receita → Ingredientes (1:N)
- Receita → Tags (N:N)
- Cardápio → Receitas (N:N via cardapio_receitas)
- Lista → Itens (1:N)

## 🎯 Próximos Passos Sugeridos

1. **Sistema de Favoritos**: Marcar receitas preferidas
2. **Avaliações**: Estrelas e comentários
3. **Receitas Públicas**: Compartilhar receitas entre usuários
4. **Nutrição**: Informações nutricionais via APIs
5. **Passo a Passo**: Timer integrado para cada etapa
6. **Modo Cozinha**: Interface otimizada para seguir receitas

## 📝 Notas Técnicas

- TypeScript estrito em todos os componentes
- React Query para cache e sincronização
- Supabase para backend completo
- Tailwind CSS com design system consistente
- Componentes shadcn/ui reutilizáveis
- Edge Functions para lógica externa

---

**Desenvolvido para Picotinho** 🥘
Sistema completo de gestão de receitas integrado ao controle de estoque.
