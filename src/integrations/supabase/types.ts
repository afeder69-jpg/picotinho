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
      categorias: {
        Row: {
          ativa: boolean | null
          cor: string | null
          created_at: string | null
          descricao: string | null
          icone: string | null
          id: string
          nome: string | null
          user_id: string
        }
        Insert: {
          ativa?: boolean | null
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          nome?: string | null
          user_id: string
        }
        Update: {
          ativa?: boolean | null
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          nome?: string | null
          user_id?: string
        }
        Relationships: []
      }
      categorias_predefinidas: {
        Row: {
          created_at: string
          id: number
          nome: string
        }
        Insert: {
          created_at?: string
          id?: number
          nome: string
        }
        Update: {
          created_at?: string
          id?: number
          nome?: string
        }
        Relationships: []
      }
      compras_app: {
        Row: {
          chave_acesso: string | null
          created_at: string | null
          data_compra: string
          desconto: number | null
          forma_pagamento: string | null
          hora_compra: string | null
          id: string
          numero_nota_fiscal: string | null
          observacoes: string | null
          preco_total: number
          qr_code_url: string | null
          status: string | null
          supermercado_id: string
          taxa_servico: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          chave_acesso?: string | null
          created_at?: string | null
          data_compra: string
          desconto?: number | null
          forma_pagamento?: string | null
          hora_compra?: string | null
          id?: string
          numero_nota_fiscal?: string | null
          observacoes?: string | null
          preco_total?: number
          qr_code_url?: string | null
          status?: string | null
          supermercado_id: string
          taxa_servico?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          chave_acesso?: string | null
          created_at?: string | null
          data_compra?: string
          desconto?: number | null
          forma_pagamento?: string | null
          hora_compra?: string | null
          id?: string
          numero_nota_fiscal?: string | null
          observacoes?: string | null
          preco_total?: number
          qr_code_url?: string | null
          status?: string | null
          supermercado_id?: string
          taxa_servico?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_app_supermercado_id_fkey"
            columns: ["supermercado_id"]
            isOneToOne: false
            referencedRelation: "supermercados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_app_supermercado_id_fkey"
            columns: ["supermercado_id"]
            isOneToOne: false
            referencedRelation: "view_comparacao_supermercados_app"
            referencedColumns: ["supermercado_id"]
          },
        ]
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
      estoque_app: {
        Row: {
          categoria: string
          created_at: string
          id: string
          preco_unitario_ultimo: number | null
          produto_nome: string
          quantidade: number
          unidade_medida: string
          updated_at: string
          user_id: string
        }
        Insert: {
          categoria: string
          created_at?: string
          id?: string
          preco_unitario_ultimo?: number | null
          produto_nome: string
          quantidade?: number
          unidade_medida?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          categoria?: string
          created_at?: string
          id?: string
          preco_unitario_ultimo?: number | null
          produto_nome?: string
          quantidade?: number
          unidade_medida?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
            foreignKeyName: "historico_precos_app_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "view_comparacao_supermercados_app"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "historico_precos_app_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "view_preco_medio_produto_app"
            referencedColumns: ["produto_id"]
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
            referencedRelation: "view_comparacao_supermercados_app"
            referencedColumns: ["supermercado_id"]
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
      itens_compra_app: {
        Row: {
          compra_id: string
          created_at: string | null
          desconto_item: number | null
          id: string
          observacoes: string | null
          preco_total: number
          preco_unitario: number
          produto_id: string
          quantidade: number
        }
        Insert: {
          compra_id: string
          created_at?: string | null
          desconto_item?: number | null
          id?: string
          observacoes?: string | null
          preco_total: number
          preco_unitario: number
          produto_id: string
          quantidade: number
        }
        Update: {
          compra_id?: string
          created_at?: string | null
          desconto_item?: number | null
          id?: string
          observacoes?: string | null
          preco_total?: number
          preco_unitario?: number
          produto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_compra_app_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_app"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_compra_app_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos_app"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_compra_app_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "view_comparacao_supermercados_app"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "itens_compra_app_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "view_preco_medio_produto_app"
            referencedColumns: ["produto_id"]
          },
        ]
      }
      itens_nota: {
        Row: {
          categoria: string | null
          codigo: string | null
          created_at: string
          descricao: string
          descricao_normalizada: string | null
          id: string
          nota_id: string
          produto_normalizado_id: string | null
          quantidade: number | null
          unidade: string | null
          valor_total: number | null
          valor_unitario: number | null
        }
        Insert: {
          categoria?: string | null
          codigo?: string | null
          created_at?: string
          descricao: string
          descricao_normalizada?: string | null
          id?: string
          nota_id: string
          produto_normalizado_id?: string | null
          quantidade?: number | null
          unidade?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Update: {
          categoria?: string | null
          codigo?: string | null
          created_at?: string
          descricao?: string
          descricao_normalizada?: string | null
          id?: string
          nota_id?: string
          produto_normalizado_id?: string | null
          quantidade?: number | null
          unidade?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "itens_nota_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais"
            referencedColumns: ["id"]
          },
        ]
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
      notas_fiscais: {
        Row: {
          bairro: string | null
          chave_acesso: string | null
          cnpj: string | null
          created_at: string | null
          criado_em: string
          data_compra: string | null
          hora_compra: string | null
          id: string
          imagem_url: string | null
          mercado: string | null
          mercado_id: string | null
          qr_url: string | null
          qtd_itens: number | null
          status_processamento: string | null
          updated_at: string | null
          user_id: string | null
          valor_total: number | null
        }
        Insert: {
          bairro?: string | null
          chave_acesso?: string | null
          cnpj?: string | null
          created_at?: string | null
          criado_em?: string
          data_compra?: string | null
          hora_compra?: string | null
          id?: string
          imagem_url?: string | null
          mercado?: string | null
          mercado_id?: string | null
          qr_url?: string | null
          qtd_itens?: number | null
          status_processamento?: string | null
          updated_at?: string | null
          user_id?: string | null
          valor_total?: number | null
        }
        Update: {
          bairro?: string | null
          chave_acesso?: string | null
          cnpj?: string | null
          created_at?: string | null
          criado_em?: string
          data_compra?: string | null
          hora_compra?: string | null
          id?: string
          imagem_url?: string | null
          mercado?: string | null
          mercado_id?: string | null
          qr_url?: string | null
          qtd_itens?: number | null
          status_processamento?: string | null
          updated_at?: string | null
          user_id?: string | null
          valor_total?: number | null
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
          id: string
          imagem_path: string
          imagem_url: string
          nome_original: string | null
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
          id?: string
          imagem_path: string
          imagem_url: string
          nome_original?: string | null
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
          id?: string
          imagem_path?: string
          imagem_url?: string
          nome_original?: string | null
          processada?: boolean | null
          updated_at?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      precos_atuais: {
        Row: {
          created_at: string
          data_atualizacao: string
          estabelecimento_cnpj: string
          estabelecimento_nome: string
          id: string
          produto_codigo: string | null
          produto_nome: string
          valor_unitario: number
        }
        Insert: {
          created_at?: string
          data_atualizacao?: string
          estabelecimento_cnpj: string
          estabelecimento_nome: string
          id?: string
          produto_codigo?: string | null
          produto_nome: string
          valor_unitario: number
        }
        Update: {
          created_at?: string
          data_atualizacao?: string
          estabelecimento_cnpj?: string
          estabelecimento_nome?: string
          id?: string
          produto_codigo?: string | null
          produto_nome?: string
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
          {
            foreignKeyName: "produtos_app_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "view_gastos_categoria_app"
            referencedColumns: ["categoria_id"]
          },
        ]
      }
      produtos_normalizados: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          id: string
          nome_padrao: string
          unidade_medida: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          created_at?: string
          id?: string
          nome_padrao: string
          unidade_medida?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          id?: string
          nome_padrao?: string
          unidade_medida?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string
          nome: string | null
          provider: string | null
          provider_id: string | null
          telefone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          nome?: string | null
          provider?: string | null
          provider_id?: string | null
          telefone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          nome?: string | null
          provider?: string | null
          provider_id?: string | null
          telefone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
          nome?: string
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
          senha: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          senha?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          senha?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      view_comparacao_supermercados_app: {
        Row: {
          preco_medio: number | null
          produto_id: string | null
          produto_nome: string | null
          supermercado_id: string | null
          supermercado_nome: string | null
          ultima_compra: string | null
          vezes_comprado: number | null
        }
        Relationships: []
      }
      view_gastos_categoria_app: {
        Row: {
          categoria_id: string | null
          categoria_nome: string | null
          gasto_medio: number | null
          total_gasto: number | null
          total_itens: number | null
        }
        Relationships: []
      }
      view_preco_medio_produto_app: {
        Row: {
          categoria_nome: string | null
          maior_preco: number | null
          menor_preco: number | null
          preco_medio: number | null
          produto_id: string | null
          produto_nome: string | null
          total_compras: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_old_ingestion_jobs: {
        Args: { days_old?: number }
        Returns: number
      }
      consolidar_estoque_duplicado: {
        Args: Record<PropertyKey, never>
        Returns: undefined
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
      limpar_estoque_usuario: {
        Args: { usuario_uuid: string }
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
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
