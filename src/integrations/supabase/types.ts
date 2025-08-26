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
      mercados: {
        Row: {
          cidade: string | null
          created_at: string | null
          estado: string | null
          id: string
          nome: string | null
          user_id: string
        }
        Insert: {
          cidade?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string
          nome?: string | null
          user_id: string
        }
        Update: {
          cidade?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string
          nome?: string | null
          user_id?: string
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
        }
        Relationships: []
      }
      notas_fiscais: {
        Row: {
          chave_acesso: string | null
          created_at: string | null
          criado_em: string
          data_compra: string | null
          id: string
          imagem_url: string | null
          mercado: string | null
          qr_url: string | null
          user_id: string | null
          valor_total: number | null
        }
        Insert: {
          chave_acesso?: string | null
          created_at?: string | null
          criado_em?: string
          data_compra?: string | null
          id?: string
          imagem_url?: string | null
          mercado?: string | null
          qr_url?: string | null
          user_id?: string | null
          valor_total?: number | null
        }
        Update: {
          chave_acesso?: string | null
          created_at?: string | null
          criado_em?: string
          data_compra?: string | null
          id?: string
          imagem_url?: string | null
          mercado?: string | null
          qr_url?: string | null
          user_id?: string | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      [_ in never]: never
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
