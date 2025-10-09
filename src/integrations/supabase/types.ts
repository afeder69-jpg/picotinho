export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      cardapio_receitas: {
        Row: {
          cardapio_id: string
          created_at: string
          dia_semana: number
          id: string
          receita_id: string
          refeicao: string
        }
        Insert: {
          cardapio_id: string
          created_at?: string
          dia_semana: number
          id?: string
          receita_id: string
          refeicao: string
        }
        Update: {
          cardapio_id?: string
          created_at?: string
          dia_semana?: number
          id?: string
          receita_id?: string
          refeicao?: string
        }
        Relationships: [
          {
            foreignKeyName: "cardapio_receitas_cardapio_id_fkey"
            columns: ["cardapio_id"]
            isOneToOne: false
            referencedRelation: "cardapios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cardapio_receitas_receita_id_fkey"
            columns: ["receita_id"]
            isOneToOne: false
            referencedRelation: "receitas"
            referencedColumns: ["id"]
          },
        ]
      }
      cardapios: {
        Row: {
          created_at: string
          id: string
          semana_fim: string
          semana_inicio: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          semana_fim: string
          semana_inicio: string
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          semana_fim?: string
          semana_inicio?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categorias: {
        Row: {
          ativa: boolean | null
          cor: string | null
          created_at: string | null
          descricao: string | null
          icone: string | null
          id: string
          nome: string | null
          sinonimos: string[] | null
        }
        Insert: {
          ativa?: boolean | null
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          nome?: string | null
          sinonimos?: string[] | null
        }
        Update: {
          ativa?: boolean | null
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          nome?: string | null
          sinonimos?: string[] | null
        }
        Relationships: []
      }
      configuracoes_usuario: {
        Row: {
          created_at: string
          id: string
          raio_busca_km: number
          updated_at: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          raio_busca_km?: number
          updated_at?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          id?: string
          raio_busca_km?: number
          updated_at?: string
          usuario_id?: string
        }
        Relationships: []
      }
      consumos_app: {
        Row: {
          categoria: string | null
          created_at: string
          data_consumo: string
          id: string
          produto_id: string
          quantidade: number
          updated_at: string
          user_id: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          data_consumo?: string
          id?: string
          produto_id: string
          quantidade: number
          updated_at?: string
          user_id: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          data_consumo?: string
          id?: string
          produto_id?: string
          quantidade?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumos_app_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "estoque_app"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_app: {
        Row: {
          categoria: string
          compra_id: string | null
          created_at: string
          granel: boolean | null
          id: string
          imagem_url: string | null
          marca: string | null
          nome_base: string | null
          nota_id: string | null
          origem: string | null
          preco_por_unidade_base: number | null
          preco_unitario_ultimo: number | null
          produto_hash_normalizado: string | null
          produto_master_id: string | null
          produto_nome: string
          produto_nome_normalizado: string | null
          qtd_base: number | null
          qtd_unidade: string | null
          qtd_valor: number | null
          quantidade: number
          sku_global: string | null
          tipo_embalagem: string | null
          unidade_base: string | null
          unidade_medida: string
          updated_at: string
          user_id: string
        }
        Insert: {
          categoria: string
          compra_id?: string | null
          created_at?: string
          granel?: boolean | null
          id?: string
          imagem_url?: string | null
          marca?: string | null
          nome_base?: string | null
          nota_id?: string | null
          origem?: string | null
          preco_por_unidade_base?: number | null
          preco_unitario_ultimo?: number | null
          produto_hash_normalizado?: string | null
          produto_master_id?: string | null
          produto_nome: string
          produto_nome_normalizado?: string | null
          qtd_base?: number | null
          qtd_unidade?: string | null
          qtd_valor?: number | null
          quantidade?: number
          sku_global?: string | null
          tipo_embalagem?: string | null
          unidade_base?: string | null
          unidade_medida?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          categoria?: string
          compra_id?: string | null
          created_at?: string
          granel?: boolean | null
          id?: string
          imagem_url?: string | null
          marca?: string | null
          nome_base?: string | null
          nota_id?: string | null
          origem?: string | null
          preco_por_unidade_base?: number | null
          preco_unitario_ultimo?: number | null
          produto_hash_normalizado?: string | null
          produto_master_id?: string | null
          produto_nome?: string
          produto_nome_normalizado?: string | null
          qtd_base?: number | null
          qtd_unidade?: string | null
          qtd_valor?: number | null
          quantidade?: number
          sku_global?: string | null
          tipo_embalagem?: string | null
          unidade_base?: string | null
          unidade_medida?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_app_produto_master_id_fkey"
            columns: ["produto_master_id"]
            isOneToOne: false
            referencedRelation: "produtos_master_global"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_precos_app: {
        Row: {
          created_at: string | null
          data_preco: string
          id: string
          preco: number
          produto_id: string
          supermercado_id: string
        }
        Insert: {
          created_at?: string | null
          data_preco: string
          id?: string
          preco: number
          produto_id: string
          supermercado_id: string
        }
        Update: {
          created_at?: string | null
          data_preco?: string
          id?: string
          preco?: number
          produto_id?: string
          supermercado_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_precos_app_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos_app"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_precos_app_supermercado_id_fkey"
            columns: ["supermercado_id"]
            isOneToOne: false
            referencedRelation: "supermercados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_precos_app_supermercado_id_fkey"
            columns: ["supermercado_id"]
            isOneToOne: false
            referencedRelation: "supermercados_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_jobs: {
        Row: {
          access_key: string | null
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          payload: Json | null
          state: string
          updated_at: string
        }
        Insert: {
          access_key?: string | null
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          payload?: Json | null
          state: string
          updated_at?: string
        }
        Update: {
          access_key?: string | null
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          payload?: Json | null
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      listas_compras: {
        Row: {
          cardapio_id: string | null
          created_at: string
          id: string
          origem: string
          receita_id: string | null
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cardapio_id?: string | null
          created_at?: string
          id?: string
          origem: string
          receita_id?: string | null
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cardapio_id?: string | null
          created_at?: string
          id?: string
          origem?: string
          receita_id?: string | null
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listas_compras_cardapio_id_fkey"
            columns: ["cardapio_id"]
            isOneToOne: false
            referencedRelation: "cardapios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listas_compras_receita_id_fkey"
            columns: ["receita_id"]
            isOneToOne: false
            referencedRelation: "receitas"
            referencedColumns: ["id"]
          },
        ]
      }
      listas_compras_itens: {
        Row: {
          comprado: boolean
          created_at: string
          id: string
          lista_id: string
          produto_id: string | null
          produto_nome: string
          quantidade: number
          unidade_medida: string
        }
        Insert: {
          comprado?: boolean
          created_at?: string
          id?: string
          lista_id: string
          produto_id?: string | null
          produto_nome: string
          quantidade: number
          unidade_medida: string
        }
        Update: {
          comprado?: boolean
          created_at?: string
          id?: string
          lista_id?: string
          produto_id?: string | null
          produto_nome?: string
          quantidade?: number
          unidade_medida?: string
        }
        Relationships: [
          {
            foreignKeyName: "listas_compras_itens_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "listas_compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listas_compras_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "estoque_app"
            referencedColumns: ["id"]
          },
        ]
      }
      marcas_conhecidas: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      mercados: {
        Row: {
          bairro: string | null
          cidade: string | null
          created_at: string | null
          estado: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nome: string | null
          user_id: string
        }
        Insert: {
          bairro?: string | null
          cidade?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string | null
          user_id: string
        }
        Update: {
          bairro?: string | null
          cidade?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string | null
          user_id?: string
        }
        Relationships: []
      }
      normalizacao_decisoes_log: {
        Row: {
          candidato_id: string | null
          created_at: string | null
          decidido_por: string | null
          decisao: string
          decisao_master: Json | null
          feedback_texto: string | null
          id: string
          produto_master_final: string | null
          sugestao_ia: Json | null
          texto_original: string
          usado_para_treino: boolean | null
        }
        Insert: {
          candidato_id?: string | null
          created_at?: string | null
          decidido_por?: string | null
          decisao: string
          decisao_master?: Json | null
          feedback_texto?: string | null
          id?: string
          produto_master_final?: string | null
          sugestao_ia?: Json | null
          texto_original: string
          usado_para_treino?: boolean | null
        }
        Update: {
          candidato_id?: string | null
          created_at?: string | null
          decidido_por?: string | null
          decisao?: string
          decisao_master?: Json | null
          feedback_texto?: string | null
          id?: string
          produto_master_final?: string | null
          sugestao_ia?: Json | null
          texto_original?: string
          usado_para_treino?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "normalizacao_decisoes_log_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "produtos_candidatos_normalizacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalizacao_decisoes_log_produto_master_final_fkey"
            columns: ["produto_master_final"]
            isOneToOne: false
            referencedRelation: "produtos_master_global"
            referencedColumns: ["id"]
          },
        ]
      }
      normalizacoes_embalagens: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome_normalizado: string
          nome_original: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome_normalizado: string
          nome_original: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome_normalizado?: string
          nome_original?: string
          updated_at?: string
        }
        Relationships: []
      }
      normalizacoes_estabelecimentos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome_normalizado: string
          nome_original: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome_normalizado: string
          nome_original: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome_normalizado?: string
          nome_original?: string
          updated_at?: string
        }
        Relationships: []
      }
      normalizacoes_log: {
        Row: {
          acao: string
          candidatos: Json | null
          created_at: string | null
          id: string
          metadata: Json | null
          produto_id: string | null
          score_agregado: number | null
          score_embedding: number | null
          score_fuzzy: number | null
          texto_origem: string
          user_id: string | null
        }
        Insert: {
          acao: string
          candidatos?: Json | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          produto_id?: string | null
          score_agregado?: number | null
          score_embedding?: number | null
          score_fuzzy?: number | null
          texto_origem: string
          user_id?: string | null
        }
        Update: {
          acao?: string
          candidatos?: Json | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          produto_id?: string | null
          score_agregado?: number | null
          score_embedding?: number | null
          score_fuzzy?: number | null
          texto_origem?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "normalizacoes_log_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos_normalizados"
            referencedColumns: ["id"]
          },
        ]
      }
      normalizacoes_marcas: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome_normalizado: string
          nome_original: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome_normalizado: string
          nome_original: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome_normalizado?: string
          nome_original?: string
          updated_at?: string
        }
        Relationships: []
      }
      normalizacoes_nomes: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          termo_correto: string
          termo_errado: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          termo_correto: string
          termo_errado: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          termo_correto?: string
          termo_errado?: string
        }
        Relationships: []
      }
      normalizacoes_produtos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome_normalizado: string
          nome_original: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome_normalizado: string
          nome_original: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome_normalizado?: string
          nome_original?: string
          updated_at?: string
        }
        Relationships: []
      }
      notas: {
        Row: {
          cnpj: string | null
          confirmada: boolean | null
          created_at: string
          endereco: string | null
          html: string | null
          id: string
          mercado: string | null
          produtos: Json | null
          screenshot: string | null
          total: number | null
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          cnpj?: string | null
          confirmada?: boolean | null
          created_at?: string
          endereco?: string | null
          html?: string | null
          id?: string
          mercado?: string | null
          produtos?: Json | null
          screenshot?: string | null
          total?: number | null
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          cnpj?: string | null
          confirmada?: boolean | null
          created_at?: string
          endereco?: string | null
          html?: string | null
          id?: string
          mercado?: string | null
          produtos?: Json | null
          screenshot?: string | null
          total?: number | null
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      notas_imagens: {
        Row: {
          compra_id: string | null
          created_at: string | null
          dados_extraidos: Json | null
          data_criacao: string
          debug_texto: string | null
          excluida: boolean | null
          id: string
          imagem_path: string
          imagem_url: string
          nome_original: string | null
          normalizada: boolean | null
          origem: string | null
          processada: boolean | null
          updated_at: string | null
          usuario_id: string
        }
        Insert: {
          compra_id?: string | null
          created_at?: string | null
          dados_extraidos?: Json | null
          data_criacao?: string
          debug_texto?: string | null
          excluida?: boolean | null
          id?: string
          imagem_path: string
          imagem_url: string
          nome_original?: string | null
          normalizada?: boolean | null
          origem?: string | null
          processada?: boolean | null
          updated_at?: string | null
          usuario_id: string
        }
        Update: {
          compra_id?: string | null
          created_at?: string | null
          dados_extraidos?: Json | null
          data_criacao?: string
          debug_texto?: string | null
          excluida?: boolean | null
          id?: string
          imagem_path?: string
          imagem_url?: string
          nome_original?: string | null
          normalizada?: boolean | null
          origem?: string | null
          processada?: boolean | null
          updated_at?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      open_food_facts_controle: {
        Row: {
          com_imagem: boolean
          created_at: string
          id: string
          importado_em: string
          limite: number
          pagina: number
          produtos_duplicados: number
          produtos_erros: number
          produtos_importados: number
          total_produtos_retornados: number
        }
        Insert: {
          com_imagem?: boolean
          created_at?: string
          id?: string
          importado_em?: string
          limite?: number
          pagina: number
          produtos_duplicados?: number
          produtos_erros?: number
          produtos_importados?: number
          total_produtos_retornados?: number
        }
        Update: {
          com_imagem?: boolean
          created_at?: string
          id?: string
          importado_em?: string
          limite?: number
          pagina?: number
          produtos_duplicados?: number
          produtos_erros?: number
          produtos_importados?: number
          total_produtos_retornados?: number
        }
        Relationships: []
      }
      open_food_facts_staging: {
        Row: {
          codigo_barras: string
          created_at: string | null
          dados_brutos: Json
          id: string
          imagem_path: string | null
          imagem_url: string | null
          processada: boolean | null
          texto_original: string
          updated_at: string | null
        }
        Insert: {
          codigo_barras: string
          created_at?: string | null
          dados_brutos: Json
          id?: string
          imagem_path?: string | null
          imagem_url?: string | null
          processada?: boolean | null
          texto_original: string
          updated_at?: string | null
        }
        Update: {
          codigo_barras?: string
          created_at?: string | null
          dados_brutos?: Json
          id?: string
          imagem_path?: string | null
          imagem_url?: string | null
          processada?: boolean | null
          texto_original?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      precos_atuais: {
        Row: {
          created_at: string
          data_atualizacao: string
          estabelecimento_cnpj: string
          estabelecimento_nome: string
          granel: boolean | null
          id: string
          marca: string | null
          nome_base: string | null
          preco_por_unidade_base: number | null
          produto_codigo: string | null
          produto_hash_normalizado: string | null
          produto_nome: string
          produto_nome_normalizado: string | null
          qtd_base: number | null
          qtd_unidade: string | null
          qtd_valor: number | null
          tipo_embalagem: string | null
          valor_unitario: number
        }
        Insert: {
          created_at?: string
          data_atualizacao?: string
          estabelecimento_cnpj: string
          estabelecimento_nome: string
          granel?: boolean | null
          id?: string
          marca?: string | null
          nome_base?: string | null
          preco_por_unidade_base?: number | null
          produto_codigo?: string | null
          produto_hash_normalizado?: string | null
          produto_nome: string
          produto_nome_normalizado?: string | null
          qtd_base?: number | null
          qtd_unidade?: string | null
          qtd_valor?: number | null
          tipo_embalagem?: string | null
          valor_unitario: number
        }
        Update: {
          created_at?: string
          data_atualizacao?: string
          estabelecimento_cnpj?: string
          estabelecimento_nome?: string
          granel?: boolean | null
          id?: string
          marca?: string | null
          nome_base?: string | null
          preco_por_unidade_base?: number | null
          produto_codigo?: string | null
          produto_hash_normalizado?: string | null
          produto_nome?: string
          produto_nome_normalizado?: string | null
          qtd_base?: number | null
          qtd_unidade?: string | null
          qtd_valor?: number | null
          tipo_embalagem?: string | null
          valor_unitario?: number
        }
        Relationships: []
      }
      precos_atuais_usuario: {
        Row: {
          created_at: string
          data_atualizacao: string
          granel: boolean | null
          id: string
          marca: string | null
          nome_base: string | null
          origem: string
          preco_por_unidade_base: number | null
          produto_hash_normalizado: string | null
          produto_nome: string
          produto_nome_normalizado: string | null
          qtd_base: number | null
          qtd_unidade: string | null
          qtd_valor: number | null
          tipo_embalagem: string | null
          updated_at: string
          user_id: string
          valor_unitario: number
        }
        Insert: {
          created_at?: string
          data_atualizacao?: string
          granel?: boolean | null
          id?: string
          marca?: string | null
          nome_base?: string | null
          origem?: string
          preco_por_unidade_base?: number | null
          produto_hash_normalizado?: string | null
          produto_nome: string
          produto_nome_normalizado?: string | null
          qtd_base?: number | null
          qtd_unidade?: string | null
          qtd_valor?: number | null
          tipo_embalagem?: string | null
          updated_at?: string
          user_id: string
          valor_unitario?: number
        }
        Update: {
          created_at?: string
          data_atualizacao?: string
          granel?: boolean | null
          id?: string
          marca?: string | null
          nome_base?: string | null
          origem?: string
          preco_por_unidade_base?: number | null
          produto_hash_normalizado?: string | null
          produto_nome?: string
          produto_nome_normalizado?: string | null
          qtd_base?: number | null
          qtd_unidade?: string | null
          qtd_valor?: number | null
          tipo_embalagem?: string | null
          updated_at?: string
          user_id?: string
          valor_unitario?: number
        }
        Relationships: []
      }
      produtos: {
        Row: {
          created_at: string | null
          id: string
          nome: string | null
          nota_id: string | null
          preco: number | null
          quantidade: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome?: string | null
          nota_id?: string | null
          preco?: number | null
          quantidade?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string | null
          nota_id?: string | null
          preco?: number | null
          quantidade?: number | null
          user_id?: string
        }
        Relationships: []
      }
      produtos_app: {
        Row: {
          ativo: boolean | null
          categoria_id: string
          codigo_barras: string | null
          created_at: string | null
          descricao: string | null
          id: string
          marca: string | null
          nome: string
          unidade_medida: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria_id: string
          codigo_barras?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          marca?: string | null
          nome: string
          unidade_medida?: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria_id?: string
          codigo_barras?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          marca?: string | null
          nome?: string
          unidade_medida?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_app_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos_candidatos_normalizacao: {
        Row: {
          candidatos_similares: Json | null
          categoria_sugerida: string | null
          categoria_unidade_sugerida: string | null
          confianca_ia: number | null
          created_at: string | null
          granel_sugerido: boolean | null
          id: string
          marca_sugerida: string | null
          nome_base_sugerido: string | null
          nome_padrao_sugerido: string | null
          nota_imagem_id: string | null
          observacoes_revisor: string | null
          qtd_base_sugerida: number | null
          qtd_unidade_sugerido: string | null
          qtd_valor_sugerido: number | null
          razao_ia: string | null
          revisado_em: string | null
          revisado_por: string | null
          status: string | null
          sugestao_produto_master: string | null
          sugestao_sku_global: string | null
          texto_original: string
          tipo_embalagem_sugerido: string | null
          unidade_base_sugerida: string | null
          updated_at: string | null
          usuario_id: string | null
        }
        Insert: {
          candidatos_similares?: Json | null
          categoria_sugerida?: string | null
          categoria_unidade_sugerida?: string | null
          confianca_ia?: number | null
          created_at?: string | null
          granel_sugerido?: boolean | null
          id?: string
          marca_sugerida?: string | null
          nome_base_sugerido?: string | null
          nome_padrao_sugerido?: string | null
          nota_imagem_id?: string | null
          observacoes_revisor?: string | null
          qtd_base_sugerida?: number | null
          qtd_unidade_sugerido?: string | null
          qtd_valor_sugerido?: number | null
          razao_ia?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string | null
          sugestao_produto_master?: string | null
          sugestao_sku_global?: string | null
          texto_original: string
          tipo_embalagem_sugerido?: string | null
          unidade_base_sugerida?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Update: {
          candidatos_similares?: Json | null
          categoria_sugerida?: string | null
          categoria_unidade_sugerida?: string | null
          confianca_ia?: number | null
          created_at?: string | null
          granel_sugerido?: boolean | null
          id?: string
          marca_sugerida?: string | null
          nome_base_sugerido?: string | null
          nome_padrao_sugerido?: string | null
          nota_imagem_id?: string | null
          observacoes_revisor?: string | null
          qtd_base_sugerida?: number | null
          qtd_unidade_sugerido?: string | null
          qtd_valor_sugerido?: number | null
          razao_ia?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string | null
          sugestao_produto_master?: string | null
          sugestao_sku_global?: string | null
          texto_original?: string
          tipo_embalagem_sugerido?: string | null
          unidade_base_sugerida?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_candidatos_normalizacao_nota_imagem_id_fkey"
            columns: ["nota_imagem_id"]
            isOneToOne: false
            referencedRelation: "notas_imagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_candidatos_normalizacao_sugestao_produto_master_fkey"
            columns: ["sugestao_produto_master"]
            isOneToOne: false
            referencedRelation: "produtos_master_global"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos_master_global: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          categoria: string
          categoria_unidade: string | null
          codigo_barras: string | null
          confianca_normalizacao: number | null
          created_at: string | null
          granel: boolean | null
          id: string
          imagem_adicionada_em: string | null
          imagem_adicionada_por: string | null
          imagem_path: string | null
          imagem_url: string | null
          marca: string | null
          nome_base: string
          nome_padrao: string
          qtd_base: number | null
          qtd_unidade: string | null
          qtd_valor: number | null
          sku_global: string
          status: string | null
          tipo_embalagem: string | null
          total_notas: number | null
          total_usuarios: number | null
          unidade_base: string | null
          updated_at: string | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          categoria: string
          categoria_unidade?: string | null
          codigo_barras?: string | null
          confianca_normalizacao?: number | null
          created_at?: string | null
          granel?: boolean | null
          id?: string
          imagem_adicionada_em?: string | null
          imagem_adicionada_por?: string | null
          imagem_path?: string | null
          imagem_url?: string | null
          marca?: string | null
          nome_base: string
          nome_padrao: string
          qtd_base?: number | null
          qtd_unidade?: string | null
          qtd_valor?: number | null
          sku_global: string
          status?: string | null
          tipo_embalagem?: string | null
          total_notas?: number | null
          total_usuarios?: number | null
          unidade_base?: string | null
          updated_at?: string | null
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          categoria?: string
          categoria_unidade?: string | null
          codigo_barras?: string | null
          confianca_normalizacao?: number | null
          created_at?: string | null
          granel?: boolean | null
          id?: string
          imagem_adicionada_em?: string | null
          imagem_adicionada_por?: string | null
          imagem_path?: string | null
          imagem_url?: string | null
          marca?: string | null
          nome_base?: string
          nome_padrao?: string
          qtd_base?: number | null
          qtd_unidade?: string | null
          qtd_valor?: number | null
          sku_global?: string
          status?: string | null
          tipo_embalagem?: string | null
          total_notas?: number | null
          total_usuarios?: number | null
          unidade_base?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      produtos_normalizados: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          descricao: string | null
          embedding: string | null
          id: string
          marca: string | null
          nome_normalizado: string | null
          nome_padrao: string
          provisorio: boolean | null
          sku: string | null
          unidade_medida: string
          updated_at: string
          variante: string | null
        }
        Insert: {
          ativo?: boolean
          categoria: string
          created_at?: string
          descricao?: string | null
          embedding?: string | null
          id?: string
          marca?: string | null
          nome_normalizado?: string | null
          nome_padrao: string
          provisorio?: boolean | null
          sku?: string | null
          unidade_medida?: string
          updated_at?: string
          variante?: string | null
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          descricao?: string | null
          embedding?: string | null
          id?: string
          marca?: string | null
          nome_normalizado?: string | null
          nome_padrao?: string
          provisorio?: boolean | null
          sku?: string | null
          unidade_medida?: string
          updated_at?: string
          variante?: string | null
        }
        Relationships: []
      }
      produtos_sinonimos_globais: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          confianca: number | null
          created_at: string | null
          fonte: string | null
          id: string
          produto_master_id: string
          texto_variacao: string
          total_ocorrencias: number | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          confianca?: number | null
          created_at?: string | null
          fonte?: string | null
          id?: string
          produto_master_id: string
          texto_variacao: string
          total_ocorrencias?: number | null
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          confianca?: number | null
          created_at?: string | null
          fonte?: string | null
          id?: string
          produto_master_id?: string
          texto_variacao?: string
          total_ocorrencias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_sinonimos_globais_produto_master_id_fkey"
            columns: ["produto_master_id"]
            isOneToOne: false
            referencedRelation: "produtos_master_global"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_access_log: {
        Row: {
          access_type: string
          accessed_at: string | null
          accessed_user_id: string
          id: string
          ip_address: unknown | null
          success: boolean | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          access_type: string
          accessed_at?: string | null
          accessed_user_id: string
          id?: string
          ip_address?: unknown | null
          success?: boolean | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          access_type?: string
          accessed_at?: string | null
          accessed_user_id?: string
          id?: string
          ip_address?: unknown | null
          success?: boolean | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profile_security_log: {
        Row: {
          action: string
          blocked: boolean | null
          created_at: string | null
          id: string
          ip_address: unknown | null
          target_user_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          blocked?: boolean | null
          created_at?: string | null
          id?: string
          ip_address?: unknown | null
          target_user_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          blocked?: boolean | null
          created_at?: string | null
          id?: string
          ip_address?: unknown | null
          target_user_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          created_at: string | null
          email: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nome: string | null
          nome_completo: string | null
          provider: string | null
          provider_id: string | null
          telefone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string | null
          nome_completo?: string | null
          provider?: string | null
          provider_id?: string | null
          telefone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string | null
          nome_completo?: string | null
          provider?: string | null
          provider_id?: string | null
          telefone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      propostas_revisao: {
        Row: {
          aprovado_por: string | null
          candidatos: Json
          created_at: string | null
          fonte: string | null
          id: string
          novo_produto: Json | null
          observacoes: string | null
          produto_escolhido_id: string | null
          score_melhor: number | null
          status: string | null
          texto_origem: string
          updated_at: string | null
        }
        Insert: {
          aprovado_por?: string | null
          candidatos: Json
          created_at?: string | null
          fonte?: string | null
          id?: string
          novo_produto?: Json | null
          observacoes?: string | null
          produto_escolhido_id?: string | null
          score_melhor?: number | null
          status?: string | null
          texto_origem: string
          updated_at?: string | null
        }
        Update: {
          aprovado_por?: string | null
          candidatos?: Json
          created_at?: string | null
          fonte?: string | null
          id?: string
          novo_produto?: Json | null
          observacoes?: string | null
          produto_escolhido_id?: string | null
          score_melhor?: number | null
          status?: string | null
          texto_origem?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "propostas_revisao_produto_escolhido_id_fkey"
            columns: ["produto_escolhido_id"]
            isOneToOne: false
            referencedRelation: "produtos_normalizados"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          line_number: number | null
          name: string
          quantity: number | null
          receipt_id: string
          total_price: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          line_number?: number | null
          name: string
          quantity?: number | null
          receipt_id: string
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          line_number?: number | null
          name?: string
          quantity?: number | null
          receipt_id?: string
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_items_public: {
        Row: {
          brand: string | null
          created_at: string
          description: string
          gtin: string | null
          id: string
          line_number: number | null
          ncm: string | null
          quantity: number | null
          receipt_id: string
          total_price: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          description: string
          gtin?: string | null
          id?: string
          line_number?: number | null
          ncm?: string | null
          quantity?: number | null
          receipt_id: string
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          description?: string
          gtin?: string | null
          id?: string
          line_number?: number | null
          ncm?: string | null
          quantity?: number | null
          receipt_id?: string
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_public_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          created_at: string
          id: string
          processed_data: Json | null
          purchase_date: string | null
          qr_url: string
          raw_data: Json | null
          screenshot_path: string | null
          screenshot_url: string | null
          status: string | null
          store_cnpj: string | null
          store_name: string | null
          total_amount: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          processed_data?: Json | null
          purchase_date?: string | null
          qr_url: string
          raw_data?: Json | null
          screenshot_path?: string | null
          screenshot_url?: string | null
          status?: string | null
          store_cnpj?: string | null
          store_name?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          processed_data?: Json | null
          purchase_date?: string | null
          qr_url?: string
          raw_data?: Json | null
          screenshot_path?: string | null
          screenshot_url?: string | null
          status?: string | null
          store_cnpj?: string | null
          store_name?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      receipts_public: {
        Row: {
          access_key: string
          created_at: string
          emitted_at: string | null
          id: string
          issuer_cnpj: string | null
          issuer_name: string | null
          raw_payload: Json | null
          source_url: string | null
          store_address: string | null
          store_name: string | null
          total_amount: number | null
          uf: string
        }
        Insert: {
          access_key: string
          created_at?: string
          emitted_at?: string | null
          id?: string
          issuer_cnpj?: string | null
          issuer_name?: string | null
          raw_payload?: Json | null
          source_url?: string | null
          store_address?: string | null
          store_name?: string | null
          total_amount?: number | null
          uf: string
        }
        Update: {
          access_key?: string
          created_at?: string
          emitted_at?: string | null
          id?: string
          issuer_cnpj?: string | null
          issuer_name?: string | null
          raw_payload?: Json | null
          source_url?: string | null
          store_address?: string | null
          store_name?: string | null
          total_amount?: number | null
          uf?: string
        }
        Relationships: []
      }
      receita_ingredientes: {
        Row: {
          created_at: string
          id: string
          opcional: boolean
          produto_id: string | null
          produto_nome_busca: string
          quantidade: number
          receita_id: string
          unidade_medida: string
        }
        Insert: {
          created_at?: string
          id?: string
          opcional?: boolean
          produto_id?: string | null
          produto_nome_busca: string
          quantidade: number
          receita_id: string
          unidade_medida: string
        }
        Update: {
          created_at?: string
          id?: string
          opcional?: boolean
          produto_id?: string | null
          produto_nome_busca?: string
          quantidade?: number
          receita_id?: string
          unidade_medida?: string
        }
        Relationships: [
          {
            foreignKeyName: "receita_ingredientes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "estoque_app"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receita_ingredientes_receita_id_fkey"
            columns: ["receita_id"]
            isOneToOne: false
            referencedRelation: "receitas"
            referencedColumns: ["id"]
          },
        ]
      }
      receitas: {
        Row: {
          api_source_id: string | null
          api_source_name: string | null
          area: string | null
          categoria: string | null
          created_at: string
          descricao: string | null
          fonte: Database["public"]["Enums"]["fonte_receita"]
          id: string
          imagem_path: string | null
          imagem_url: string | null
          instrucoes: string
          modo_preparo: string | null
          porcoes: number | null
          publica: boolean
          status: Database["public"]["Enums"]["status_receita"]
          tempo_preparo: number | null
          tipo_refeicao: Database["public"]["Enums"]["tipo_refeicao"] | null
          titulo: string
          updated_at: string
          user_id: string | null
          video_url: string | null
        }
        Insert: {
          api_source_id?: string | null
          api_source_name?: string | null
          area?: string | null
          categoria?: string | null
          created_at?: string
          descricao?: string | null
          fonte?: Database["public"]["Enums"]["fonte_receita"]
          id?: string
          imagem_path?: string | null
          imagem_url?: string | null
          instrucoes: string
          modo_preparo?: string | null
          porcoes?: number | null
          publica?: boolean
          status?: Database["public"]["Enums"]["status_receita"]
          tempo_preparo?: number | null
          tipo_refeicao?: Database["public"]["Enums"]["tipo_refeicao"] | null
          titulo: string
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
        }
        Update: {
          api_source_id?: string | null
          api_source_name?: string | null
          area?: string | null
          categoria?: string | null
          created_at?: string
          descricao?: string | null
          fonte?: Database["public"]["Enums"]["fonte_receita"]
          id?: string
          imagem_path?: string | null
          imagem_url?: string | null
          instrucoes?: string
          modo_preparo?: string | null
          porcoes?: number | null
          publica?: boolean
          status?: Database["public"]["Enums"]["status_receita"]
          tempo_preparo?: number | null
          tipo_refeicao?: Database["public"]["Enums"]["tipo_refeicao"] | null
          titulo?: string
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      receitas_publicas_brasileiras: {
        Row: {
          categoria: string | null
          created_at: string
          fonte: string | null
          id: string
          imagem_url: string | null
          ingredientes: Json
          modo_preparo: string | null
          rendimento: string | null
          tags: string[] | null
          tempo_preparo: number | null
          titulo: string
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          fonte?: string | null
          id?: string
          imagem_url?: string | null
          ingredientes?: Json
          modo_preparo?: string | null
          rendimento?: string | null
          tags?: string[] | null
          tempo_preparo?: number | null
          titulo: string
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          fonte?: string | null
          id?: string
          imagem_url?: string | null
          ingredientes?: Json
          modo_preparo?: string | null
          rendimento?: string | null
          tags?: string[] | null
          tempo_preparo?: number | null
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      sinonimos_produtos: {
        Row: {
          aprovado_por: string | null
          confianca: number | null
          created_at: string | null
          fonte: string | null
          id: string
          metodo_criacao: string | null
          produto_id: string | null
          texto_origem: string
        }
        Insert: {
          aprovado_por?: string | null
          confianca?: number | null
          created_at?: string | null
          fonte?: string | null
          id?: string
          metodo_criacao?: string | null
          produto_id?: string | null
          texto_origem: string
        }
        Update: {
          aprovado_por?: string | null
          confianca?: number | null
          created_at?: string | null
          fonte?: string | null
          id?: string
          metodo_criacao?: string | null
          produto_id?: string | null
          texto_origem?: string
        }
        Relationships: [
          {
            foreignKeyName: "sinonimos_produtos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos_normalizados"
            referencedColumns: ["id"]
          },
        ]
      }
      supermercados: {
        Row: {
          ativo: boolean | null
          cep: string | null
          cidade: string | null
          cnpj: string
          created_at: string | null
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nome: string
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          cep?: string | null
          cidade?: string | null
          cnpj: string
          created_at?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string
          created_at?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      unidades_conversao: {
        Row: {
          ativo: boolean | null
          categoria_aplicavel: string | null
          created_at: string | null
          fator_conversao: number
          id: string
          unidade_destino: string
          unidade_origem: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria_aplicavel?: string | null
          created_at?: string | null
          fator_conversao: number
          id?: string
          unidade_destino: string
          unidade_origem: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria_aplicavel?: string | null
          created_at?: string | null
          fator_conversao?: number
          id?: string
          unidade_destino?: string
          unidade_origem?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          motivo_revogacao: string | null
          reativado_em: string | null
          reativado_por: string | null
          revogado_em: string | null
          revogado_por: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          motivo_revogacao?: string | null
          reativado_em?: string | null
          reativado_por?: string | null
          revogado_em?: string | null
          revogado_por?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          motivo_revogacao?: string | null
          reativado_em?: string | null
          reativado_por?: string | null
          revogado_em?: string | null
          revogado_por?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_roles_audit_log: {
        Row: {
          acao: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          executado_em: string
          executado_por: string
          id: string
          motivo: string | null
          user_role_id: string
        }
        Insert: {
          acao: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          executado_em?: string
          executado_por: string
          id?: string
          motivo?: string | null
          user_role_id: string
        }
        Update: {
          acao?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          executado_em?: string
          executado_por?: string
          id?: string
          motivo?: string | null
          user_role_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
        }
        Relationships: []
      }
      whatsapp_configuracoes: {
        Row: {
          api_provider: string
          ativo: boolean
          codigo_verificacao: string | null
          created_at: string
          data_codigo: string | null
          id: string
          numero_whatsapp: string
          ultima_mensagem: string | null
          updated_at: string
          usuario_id: string
          verificado: boolean
          webhook_token: string | null
        }
        Insert: {
          api_provider?: string
          ativo?: boolean
          codigo_verificacao?: string | null
          created_at?: string
          data_codigo?: string | null
          id?: string
          numero_whatsapp: string
          ultima_mensagem?: string | null
          updated_at?: string
          usuario_id: string
          verificado?: boolean
          webhook_token?: string | null
        }
        Update: {
          api_provider?: string
          ativo?: boolean
          codigo_verificacao?: string | null
          created_at?: string
          data_codigo?: string | null
          id?: string
          numero_whatsapp?: string
          ultima_mensagem?: string | null
          updated_at?: string
          usuario_id?: string
          verificado?: boolean
          webhook_token?: string | null
        }
        Relationships: []
      }
      whatsapp_mensagens: {
        Row: {
          anexo_info: Json | null
          comando_identificado: string | null
          conteudo: string
          created_at: string
          data_processamento: string | null
          data_recebimento: string
          erro_processamento: string | null
          id: string
          parametros_comando: Json | null
          processada: boolean
          remetente: string
          resposta_enviada: string | null
          tipo_mensagem: string
          updated_at: string
          usuario_id: string | null
          webhook_data: Json | null
        }
        Insert: {
          anexo_info?: Json | null
          comando_identificado?: string | null
          conteudo: string
          created_at?: string
          data_processamento?: string | null
          data_recebimento?: string
          erro_processamento?: string | null
          id?: string
          parametros_comando?: Json | null
          processada?: boolean
          remetente: string
          resposta_enviada?: string | null
          tipo_mensagem?: string
          updated_at?: string
          usuario_id?: string | null
          webhook_data?: Json | null
        }
        Update: {
          anexo_info?: Json | null
          comando_identificado?: string | null
          conteudo?: string
          created_at?: string
          data_processamento?: string | null
          data_recebimento?: string
          erro_processamento?: string | null
          id?: string
          parametros_comando?: Json | null
          processada?: boolean
          remetente?: string
          resposta_enviada?: string | null
          tipo_mensagem?: string
          updated_at?: string
          usuario_id?: string | null
          webhook_data?: Json | null
        }
        Relationships: []
      }
      whatsapp_sessions: {
        Row: {
          contexto: Json | null
          created_at: string
          estado: string
          expires_at: string
          id: string
          produto_id: string | null
          produto_nome: string | null
          remetente: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          contexto?: Json | null
          created_at?: string
          estado: string
          expires_at?: string
          id?: string
          produto_id?: string | null
          produto_nome?: string | null
          remetente: string
          updated_at?: string
          usuario_id: string
        }
        Update: {
          contexto?: Json | null
          created_at?: string
          estado?: string
          expires_at?: string
          id?: string
          produto_id?: string | null
          produto_nome?: string | null
          remetente?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: []
      }
      whatsapp_telefones_autorizados: {
        Row: {
          api_provider: string | null
          ativo: boolean
          codigo_verificacao: string | null
          created_at: string
          data_codigo: string | null
          id: string
          numero_whatsapp: string
          tipo: string
          updated_at: string
          usuario_id: string
          verificado: boolean
        }
        Insert: {
          api_provider?: string | null
          ativo?: boolean
          codigo_verificacao?: string | null
          created_at?: string
          data_codigo?: string | null
          id?: string
          numero_whatsapp: string
          tipo?: string
          updated_at?: string
          usuario_id: string
          verificado?: boolean
        }
        Update: {
          api_provider?: string | null
          ativo?: boolean
          codigo_verificacao?: string | null
          created_at?: string
          data_codigo?: string | null
          id?: string
          numero_whatsapp?: string
          tipo?: string
          updated_at?: string
          usuario_id?: string
          verificado?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      estoque_consolidado: {
        Row: {
          categoria: string | null
          hash_agrupamento: string | null
          ids_originais: string[] | null
          itens_originais: number | null
          nomes_originais: string[] | null
          preco_unitario_mais_recente: number | null
          produto_nome_exibicao: string | null
          quantidade_total: number | null
          ultima_atualizacao: string | null
          unidade_medida: string | null
          user_id: string | null
        }
        Relationships: []
      }
      estoque_stats: {
        Row: {
          total_categorias: number | null
          total_produtos: number | null
          ultima_atualizacao: string | null
          user_id: string | null
          valor_total_estoque: number | null
        }
        Relationships: []
      }
      profiles_public_safe: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string | null
          nome: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string | null
          nome?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string | null
          nome?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      stats_normalizacao: {
        Row: {
          acao: string | null
          data: string | null
          score_max: number | null
          score_medio: number | null
          score_min: number | null
          total: number | null
        }
        Relationships: []
      }
      supermercados_publicos: {
        Row: {
          ativo: boolean | null
          cidade: string | null
          created_at: string | null
          estado: string | null
          id: string | null
          latitude_aproximada: number | null
          longitude_aproximada: number | null
          nome: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          cidade?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string | null
          latitude_aproximada?: never
          longitude_aproximada?: never
          nome?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          cidade?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string | null
          latitude_aproximada?: never
          longitude_aproximada?: never
          nome?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      anonymize_user_profile: {
        Args: { profile_user_id: string }
        Returns: boolean
      }
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      buscar_categoria_por_termo: {
        Args: { termo_busca: string }
        Returns: {
          categoria_nome: string
        }[]
      }
      buscar_produto_por_sku: {
        Args: { sku_busca: string }
        Returns: {
          ativo: boolean
          categoria: string
          created_at: string
          descricao: string
          id: string
          marca: string
          nome_normalizado: string
          provisorio: boolean
          sku: string
          updated_at: string
          variante: string
        }[]
      }
      buscar_produtos_similares: {
        Args: {
          categoria_filtro: string
          limite?: number
          texto_busca: string
          threshold?: number
        }
        Returns: {
          categoria: string
          granel: boolean
          id: string
          marca: string
          nome_base: string
          nome_padrao: string
          qtd_unidade: string
          qtd_valor: number
          similarity: number
          sku_global: string
          tipo_embalagem: string
          total_usuarios: number
        }[]
      }
      buscar_receitas_brasileiras_disponiveis: {
        Args: Record<PropertyKey, never>
        Returns: {
          area: string
          categoria: string
          descricao: string
          disponibilidade: string
          imagem_url: string
          ingredientes_disponiveis: number
          porcoes: string
          receita_id: string
          tags: string[]
          titulo: string
          total_ingredientes: number
          video_url: string
        }[]
      }
      buscar_receitas_disponiveis: {
        Args: Record<PropertyKey, never> | { p_user_id: string }
        Returns: {
          descricao: string
          disponibilidade: Database["public"]["Enums"]["tipo_disponibilidade"]
          fonte: Database["public"]["Enums"]["fonte_receita"]
          imagem_url: string
          ingredientes_disponiveis: number
          ingredientes_faltantes: Json
          percentual_disponivel: number
          porcoes: number
          receita_id: string
          tempo_preparo: number
          titulo: string
          total_ingredientes: number
        }[]
      }
      calcular_preco_por_unidade_base: {
        Args: {
          preco_unitario: number
          qtd_base_input: number
          unidade_base_input: string
        }
        Returns: number
      }
      calcular_unidade_base: {
        Args: { qtd_unidade_input: string; qtd_valor_input: number }
        Returns: Json
      }
      cleanup_old_ingestion_jobs: {
        Args: { days_old?: number }
        Returns: number
      }
      consolidar_estoque_duplicado: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      corrigir_precos_manuais: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      corrigir_produtos_manuais_sem_preco: {
        Args: Record<PropertyKey, never>
        Returns: {
          acao_realizada: string
          preco_sugerido: number
          produto_id: string
          produto_nome: string
          quantidade: number
        }[]
      }
      corrigir_produtos_marcados_incorretamente_como_manuais: {
        Args: Record<PropertyKey, never>
        Returns: {
          detalhes: string
          produtos_corrigidos: number
        }[]
      }
      criar_lista_compras_de_cardapio: {
        Args:
          | { cardapio_uuid: string }
          | { p_cardapio_id: string; p_titulo?: string; p_user_id: string }
        Returns: string
      }
      criar_lista_compras_de_receita: {
        Args:
          | { p_receita_id: string; p_titulo?: string; p_user_id: string }
          | { receita_uuid: string }
        Returns: string
      }
      criar_sinonimo_global: {
        Args: {
          confianca_input?: number
          produto_master_id_input: string
          texto_variacao_input: string
        }
        Returns: string
      }
      diagnosticar_e_corrigir_estoque: {
        Args: { usuario_uuid: string }
        Returns: {
          acao_realizada: string
          detalhes: string
          tipo_problema: string
          valor_encontrado: number
        }[]
      }
      get_current_user_profile: {
        Args: Record<PropertyKey, never>
        Returns: {
          avatar_url: string
          created_at: string
          id: string
          nome: string
          telefone: string
          updated_at: string
          user_id: string
        }[]
      }
      get_profile_safe: {
        Args: { target_user_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          id: string
          nome: string
          telefone_display: string
          updated_at: string
          user_id: string
        }[]
      }
      get_profile_summary: {
        Args: { target_user_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          nome: string
          user_id: string
        }[]
      }
      get_supermercados_for_area: {
        Args: {
          requesting_user_id?: string
          search_latitude: number
          search_longitude: number
          search_radius_km: number
        }
        Returns: {
          cidade: string
          distancia_km: number
          estado: string
          id: string
          latitude_publica: number
          longitude_publica: number
          nome: string
          produtos_disponiveis: number
          tem_acesso_completo: boolean
        }[]
      }
      get_user_email: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      importar_receita_api: {
        Args: {
          p_api_source_id: string
          p_api_source_name: string
          p_descricao: string
          p_imagem_url: string
          p_ingredientes: Json
          p_instrucoes: string
          p_porcoes: number
          p_tempo_preparo: number
          p_titulo: string
          p_user_id: string
        }
        Returns: string
      }
      is_master: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_receita_image_owner: {
        Args: { image_path: string }
        Returns: boolean
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: unknown
      }
      limpar_dados_antigos: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      limpar_dados_usuario_completo: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      limpar_duplicacoes_processamento: {
        Args: Record<PropertyKey, never>
        Returns: {
          acao_realizada: string
          detalhes: string
          quantidade: number
        }[]
      }
      limpar_duplicados_estoque_temporario: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      limpar_estoque_completo_usuario: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      limpar_estoque_usuario: {
        Args: { usuario_uuid: string }
        Returns: undefined
      }
      limpar_produtos_fantasmas_e_corrigir_precos: {
        Args: Record<PropertyKey, never>
        Returns: {
          acao_realizada: string
          detalhes: string
          produto_afetado: string
        }[]
      }
      limpar_produtos_fantasmas_usuario: {
        Args: { target_user_id: string }
        Returns: {
          acao_realizada: string
          detalhes: string
          produto_afetado: string
        }[]
      }
      limpar_produtos_inconsistentes: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      limpar_residuos_usuario_completo: {
        Args: { target_user_id: string }
        Returns: {
          registros_removidos: number
          status: string
          tabela_limpa: string
        }[]
      }
      limpar_sessoes_expiradas: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      log_profile_access: {
        Args: { access_type: string; user_uuid: string }
        Returns: undefined
      }
      log_profile_access_secure: {
        Args: { operation_type: string; target_user_id: string }
        Returns: undefined
      }
      log_security_violation: {
        Args: {
          details: string
          target_user_id: string
          violation_type: string
        }
        Returns: undefined
      }
      mask_phone_number: {
        Args: { phone_number: string }
        Returns: string
      }
      mask_sensitive_profile_data: {
        Args: {
          email_val?: string
          nome_completo_val?: string
          telefone_val?: string
        }
        Returns: Json
      }
      normalizar_nome_estabelecimento: {
        Args: { nome_input: string }
        Returns: string
      }
      normalizar_produto_completo: {
        Args: { nome: string }
        Returns: string
      }
      normalizar_produto_v1: {
        Args: { nome_original: string }
        Returns: Json
      }
      normalizar_texto: {
        Args: { texto: string }
        Returns: string
      }
      popular_precos_atuais_das_notas: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      recalcular_estoque_completo: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      recalcular_estoque_usuario: {
        Args: { usuario_uuid: string }
        Returns: undefined
      }
      refresh_estoque_stats: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      refresh_stats_normalizacao: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      safe_mask_personal_data: {
        Args: {
          cep_input?: string
          email_input?: string
          nome_completo_input?: string
          telefone_input?: string
        }
        Returns: Json
      }
      secure_profile_access: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      sync_historical_access_keys: {
        Args: { target_user_id?: string }
        Returns: {
          chave_acesso: string
          compras_app_updated: number
          notas_fiscais_updated: number
          usuario_id: string
        }[]
      }
      text_similarity: {
        Args: { text1: string; text2: string }
        Returns: number
      }
      update_my_profile: {
        Args: { p_avatar_url?: string; p_nome?: string; p_telefone?: string }
        Returns: {
          avatar_url: string
          id: string
          nome: string
          telefone: string
          updated_at: string
          user_id: string
        }[]
      }
      upsert_produto_master: {
        Args: {
          p_categoria: string
          p_categoria_unidade: string
          p_confianca: number
          p_granel: boolean
          p_imagem_path: string
          p_imagem_url: string
          p_marca: string
          p_nome_base: string
          p_nome_padrao: string
          p_qtd_base: number
          p_qtd_unidade: string
          p_qtd_valor: number
          p_sku_global: string
          p_tipo_embalagem: string
          p_unidade_base: string
        }
        Returns: Json
      }
      validar_telefone_whatsapp: {
        Args: { telefone_numero: string }
        Returns: boolean
      }
      validate_profile_access_strict: {
        Args: { operation_type: string; target_user_id: string }
        Returns: boolean
      }
      validate_security_setup: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      validate_user_access: {
        Args: { user_uuid: string }
        Returns: boolean
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_similarity_search: {
        Args: {
          match_count?: number
          query_embedding: string
          similarity_threshold?: number
        }
        Returns: {
          categoria: string
          embedding: string
          id: string
          marca: string
          nome_normalizado: string
          similarity: number
          sku: string
          variante: string
        }[]
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      verificar_disponibilidade_receita: {
        Args:
          | { p_receita_id: string; p_user_id: string }
          | { receita_uuid: string }
        Returns: {
          disponivel: boolean
          ingrediente_nome: string
          quantidade_estoque: number
          quantidade_necessaria: string
        }[]
      }
    }
    Enums: {
      app_role: "master" | "user" | "admin"
      fonte_receita:
        | "minha"
        | "picotinho"
        | "comunidade"
        | "api_externa"
        | "brasileiras"
      status_receita: "rascunho" | "publicada" | "arquivada"
      tipo_disponibilidade: "completo" | "parcial" | "faltando"
      tipo_refeicao: "cafe_manha" | "almoco" | "jantar" | "lanche" | "sobremesa"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["master", "user", "admin"],
      fonte_receita: [
        "minha",
        "picotinho",
        "comunidade",
        "api_externa",
        "brasileiras",
      ],
      status_receita: ["rascunho", "publicada", "arquivada"],
      tipo_disponibilidade: ["completo", "parcial", "faltando"],
      tipo_refeicao: ["cafe_manha", "almoco", "jantar", "lanche", "sobremesa"],
    },
  },
} as const
