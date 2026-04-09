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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_suggestion_logs: {
        Row: {
          created_at: string | null
          id: string
          prompt_summary: string
          response_summary: Json
          weekly_menu_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          prompt_summary: string
          response_summary: Json
          weekly_menu_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          prompt_summary?: string
          response_summary?: Json
          weekly_menu_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestion_logs_weekly_menu_id_fkey"
            columns: ["weekly_menu_id"]
            isOneToOne: false
            referencedRelation: "weekly_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_alert_logs: {
        Row: {
          alert_month: string
          alert_type: string
          category_main: string
          created_at: string | null
          id: string
          user_id: string
          user_type: string
        }
        Insert: {
          alert_month: string
          alert_type: string
          category_main: string
          created_at?: string | null
          id?: string
          user_id: string
          user_type: string
        }
        Update: {
          alert_month?: string
          alert_type?: string
          category_main?: string
          created_at?: string | null
          id?: string
          user_id?: string
          user_type?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          category_main: string
          created_at: string
          id: string
          monthly_budget: number
          updated_at: string
          user_id: string | null
          user_type: string
        }
        Insert: {
          category_main: string
          created_at?: string
          id?: string
          monthly_budget: number
          updated_at?: string
          user_id?: string | null
          user_type: string
        }
        Update: {
          category_main?: string
          created_at?: string
          id?: string
          monthly_budget?: number
          updated_at?: string
          user_id?: string | null
          user_type?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          icon: string
          id: string
          main_category: string
          sort_order: number | null
          subcategories: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          main_category: string
          sort_order?: number | null
          subcategories: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          main_category?: string
          sort_order?: number | null
          subcategories?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      fixed_expenses: {
        Row: {
          amount: number
          category_main: string
          category_sub: string
          created_at: string | null
          end_date: string | null
          id: string
          is_active: boolean | null
          memo: string | null
          payment_day: number
          start_date: string | null
          updated_at: string | null
          user_id: string | null
          user_type: string
        }
        Insert: {
          amount: number
          category_main: string
          category_sub: string
          created_at?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          memo?: string | null
          payment_day: number
          start_date?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_type: string
        }
        Update: {
          amount?: number
          category_main?: string
          category_sub?: string
          created_at?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          memo?: string | null
          payment_day?: number
          start_date?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_type?: string
        }
        Relationships: []
      }
      gmail_filters: {
        Row: {
          created_at: string | null
          filter_type: string
          id: string
          keyword: string
          target_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          filter_type: string
          id?: string
          keyword: string
          target_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          filter_type?: string
          id?: string
          keyword?: string
          target_type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      gmail_processed_messages: {
        Row: {
          created_at: string | null
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_slots: {
        Row: {
          created_at: string | null
          date: string
          id: string
          is_skipped: boolean
          meal_type: string
          memo: string | null
          recipe_id: string | null
          servings: number
          weekly_menu_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          is_skipped?: boolean
          meal_type: string
          memo?: string | null
          recipe_id?: string | null
          servings?: number
          weekly_menu_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          is_skipped?: boolean
          meal_type?: string
          memo?: string | null
          recipe_id?: string | null
          servings?: number
          weekly_menu_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_slots_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_slots_weekly_menu_id_fkey"
            columns: ["weekly_menu_id"]
            isOneToOne: false
            referencedRelation: "weekly_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      pantry_items: {
        Row: {
          amount: number | null
          category: string | null
          created_at: string | null
          expiry_date: string | null
          id: string
          is_staple: boolean
          name: string
          source: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          is_staple?: boolean
          name: string
          source?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          is_staple?: boolean
          name?: string
          source?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          keys: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          keys: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          keys?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          amount: number
          id: string
          name: string
          recipe_id: string
          sort_order: number
          unit: string
        }
        Insert: {
          amount: number
          id?: string
          name: string
          recipe_id: string
          sort_order?: number
          unit: string
        }
        Update: {
          amount?: number
          id?: string
          name?: string
          recipe_id?: string
          sort_order?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ratings: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          rating: number
          recipe_id: string
          updated_at: string | null
          user_name: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          rating: number
          recipe_id: string
          updated_at?: string | null
          user_name: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          rating?: number
          recipe_id?: string
          updated_at?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ratings_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_steps: {
        Row: {
          id: string
          instruction: string
          recipe_id: string
          step_number: number
          tip: string | null
        }
        Insert: {
          id?: string
          instruction: string
          recipe_id: string
          step_number: number
          tip?: string | null
        }
        Update: {
          id?: string
          instruction?: string
          recipe_id?: string
          step_number?: number
          tip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          cook_method: string
          cook_time_min: number | null
          created_at: string | null
          description: string | null
          hotcook_menu_number: string | null
          hotcook_unit: string | null
          id: string
          image_url: string | null
          is_favorite: boolean
          prep_time_min: number | null
          servings_base: number
          source: string
          title: string
        }
        Insert: {
          cook_method?: string
          cook_time_min?: number | null
          created_at?: string | null
          description?: string | null
          hotcook_menu_number?: string | null
          hotcook_unit?: string | null
          id?: string
          image_url?: string | null
          is_favorite?: boolean
          prep_time_min?: number | null
          servings_base?: number
          source?: string
          title: string
        }
        Update: {
          cook_method?: string
          cook_time_min?: number | null
          created_at?: string | null
          description?: string | null
          hotcook_menu_number?: string | null
          hotcook_unit?: string | null
          id?: string
          image_url?: string | null
          is_favorite?: boolean
          prep_time_min?: number | null
          servings_base?: number
          source?: string
          title?: string
        }
        Relationships: []
      }
      saving_goals: {
        Row: {
          color: string | null
          created_at: string
          current_amount: number | null
          deadline: string | null
          goal_name: string
          icon: string | null
          id: string
          sort_order: number | null
          target_amount: number
          updated_at: string
          user_id: string | null
          user_type: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          current_amount?: number | null
          deadline?: string | null
          goal_name: string
          icon?: string | null
          id?: string
          sort_order?: number | null
          target_amount: number
          updated_at?: string
          user_id?: string | null
          user_type: string
        }
        Update: {
          color?: string | null
          created_at?: string
          current_amount?: number | null
          deadline?: string | null
          goal_name?: string
          icon?: string | null
          id?: string
          sort_order?: number | null
          target_amount?: number
          updated_at?: string
          user_id?: string | null
          user_type?: string
        }
        Relationships: []
      }
      saving_logs: {
        Row: {
          amount: number
          created_at: string | null
          date: string
          goal_id: string
          id: string
          memo: string | null
          type: string
          user_id: string
          user_type: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          date?: string
          goal_id: string
          id?: string
          memo?: string | null
          type: string
          user_id: string
          user_type: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          date?: string
          goal_id?: string
          id?: string
          memo?: string | null
          type?: string
          user_id?: string
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "saving_logs_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "saving_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_items: {
        Row: {
          amount: number | null
          category: string | null
          checked_by: string | null
          created_at: string | null
          id: string
          is_checked: boolean
          name: string
          price: number | null
          shopping_list_id: string
          unit: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          checked_by?: string | null
          created_at?: string | null
          id?: string
          is_checked?: boolean
          name: string
          price?: number | null
          shopping_list_id: string
          unit?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          checked_by?: string | null
          created_at?: string | null
          id?: string
          is_checked?: boolean
          name?: string
          price?: number | null
          shopping_list_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_items_shopping_list_id_fkey"
            columns: ["shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          actual_total: number | null
          created_at: string | null
          id: string
          status: string
          transaction_id: string | null
          weekly_menu_id: string
        }
        Insert: {
          actual_total?: number | null
          created_at?: string | null
          id?: string
          status?: string
          transaction_id?: string | null
          weekly_menu_id: string
        }
        Update: {
          actual_total?: number | null
          created_at?: string | null
          id?: string
          status?: string
          transaction_id?: string | null
          weekly_menu_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_weekly_menu_id_fkey"
            columns: ["weekly_menu_id"]
            isOneToOne: true
            referencedRelation: "weekly_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category_main: string
          category_sub: string
          created_at: string
          date: string
          id: string
          income_month: string | null
          items: Json | null
          memo: string | null
          metadata: Json | null
          source: string | null
          source_id: string | null
          store_name: string | null
          target_month: string | null
          type: string | null
          updated_at: string
          user_id: string | null
          user_type: string
        }
        Insert: {
          amount: number
          category_main: string
          category_sub: string
          created_at?: string
          date: string
          id?: string
          income_month?: string | null
          items?: Json | null
          memo?: string | null
          metadata?: Json | null
          source?: string | null
          source_id?: string | null
          store_name?: string | null
          target_month?: string | null
          type?: string | null
          updated_at?: string
          user_id?: string | null
          user_type: string
        }
        Update: {
          amount?: number
          category_main?: string
          category_sub?: string
          created_at?: string
          date?: string
          id?: string
          income_month?: string | null
          items?: Json | null
          memo?: string | null
          metadata?: Json | null
          source?: string | null
          source_id?: string | null
          store_name?: string | null
          target_month?: string | null
          type?: string | null
          updated_at?: string
          user_id?: string | null
          user_type?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          api_secret_key: string | null
          character_id: string | null
          gmail_auto_processing: boolean | null
          gmail_history_id: string | null
          gmail_integration_enabled: boolean | null
          gmail_watch_expiration: string | null
          google_refresh_token: string | null
          home_widgets: Json | null
          joint_theme_color: string | null
          linked_user_type: string | null
          notification_preferences: Json | null
          theme_color: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          api_secret_key?: string | null
          character_id?: string | null
          gmail_auto_processing?: boolean | null
          gmail_history_id?: string | null
          gmail_integration_enabled?: boolean | null
          gmail_watch_expiration?: string | null
          google_refresh_token?: string | null
          home_widgets?: Json | null
          joint_theme_color?: string | null
          linked_user_type?: string | null
          notification_preferences?: Json | null
          theme_color?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          api_secret_key?: string | null
          character_id?: string | null
          gmail_auto_processing?: boolean | null
          gmail_history_id?: string | null
          gmail_integration_enabled?: boolean | null
          gmail_watch_expiration?: string | null
          google_refresh_token?: string | null
          home_widgets?: Json | null
          joint_theme_color?: string | null
          linked_user_type?: string | null
          notification_preferences?: Json | null
          theme_color?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      weekly_menus: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          status: string
          updated_at: string | null
          week_start_date: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string | null
          week_start_date: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string | null
          week_start_date?: string
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
