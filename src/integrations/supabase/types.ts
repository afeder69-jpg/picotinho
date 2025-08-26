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
          created_at: string | null
          descricao: string | null
          id: string
          nome: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
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
      [_ in never]: never
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
