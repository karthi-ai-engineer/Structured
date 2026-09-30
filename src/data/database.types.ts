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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      day_notes: {
        Row: {
          date: string
          energy: number | null
          mood: number | null
          note: string | null
          reviewed_at: string | null
          updated_at: string
        }
        Insert: {
          date: string
          energy?: number | null
          mood?: number | null
          note?: string | null
          reviewed_at?: string | null
          updated_at?: string
        }
        Update: {
          date?: string
          energy?: number | null
          mood?: number | null
          note?: string | null
          reviewed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      focus_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          goal_id: string | null
          id: string
          kind: string
          planned_min: number | null
          started_at: string
          task_id: string | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          goal_id?: string | null
          id?: string
          kind?: string
          planned_min?: number | null
          started_at: string
          task_id?: string | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          goal_id?: string | null
          id?: string
          kind?: string
          planned_min?: number | null
          started_at?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "focus_sessions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "focus_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          color: string
          created_at: string
          deadline: string | null
          description: string | null
          icon: string | null
          id: string
          manual_value: number
          sort_order: number
          start_date: string | null
          status: string
          target_type: string
          target_value: number | null
          title: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          manual_value?: number
          sort_order?: number
          start_date?: string | null
          status?: string
          target_type?: string
          target_value?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          manual_value?: number
          sort_order?: number
          start_date?: string | null
          status?: string
          target_type?: string
          target_value?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      mcp_batches: {
        Row: {
          created_at: string
          id: string
          ops: Json
          summary: string | null
          tool: string
          undone_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          ops?: Json
          summary?: string | null
          tool: string
          undone_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ops?: Json
          summary?: string | null
          tool?: string
          undone_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          break_minutes: number
          day_end: string
          day_start: string
          default_alerts: number[]
          default_duration: number
          energy_enabled: boolean
          energy_limit: number
          focus_minutes: number
          id: number
          theme: string
          time_format: string
          timezone: string
          updated_at: string
          week_start: number
        }
        Insert: {
          break_minutes?: number
          day_end?: string
          day_start?: string
          default_alerts?: number[]
          default_duration?: number
          energy_enabled?: boolean
          energy_limit?: number
          focus_minutes?: number
          id?: number
          theme?: string
          time_format?: string
          timezone?: string
          updated_at?: string
          week_start?: number
        }
        Update: {
          break_minutes?: number
          day_end?: string
          day_start?: string
          default_alerts?: number[]
          default_duration?: number
          energy_enabled?: boolean
          energy_limit?: number
          focus_minutes?: number
          id?: number
          theme?: string
          time_format?: string
          timezone?: string
          updated_at?: string
          week_start?: number
        }
        Relationships: []
      }
      tasks: {
        Row: {
          alerts: number[] | null
          batch_id: string | null
          color: string
          completed_at: string | null
          created_at: string
          date: string | null
          deleted_at: string | null
          due_date: string | null
          duration_min: number
          energy: number | null
          goal_id: string | null
          icon: string | null
          id: string
          inbox_order: number
          is_all_day: boolean
          is_cancelled: boolean
          notes: string | null
          occurrence_date: string | null
          priority: number | null
          repeat_rule: string | null
          repeat_until: string | null
          series_id: string | null
          source: string
          start_time: string | null
          subtasks: Json
          title: string
          updated_at: string
        }
        Insert: {
          alerts?: number[] | null
          batch_id?: string | null
          color?: string
          completed_at?: string | null
          created_at?: string
          date?: string | null
          deleted_at?: string | null
          due_date?: string | null
          duration_min?: number
          energy?: number | null
          goal_id?: string | null
          icon?: string | null
          id?: string
          inbox_order?: number
          is_all_day?: boolean
          is_cancelled?: boolean
          notes?: string | null
          occurrence_date?: string | null
          priority?: number | null
          repeat_rule?: string | null
          repeat_until?: string | null
          series_id?: string | null
          source?: string
          start_time?: string | null
          subtasks?: Json
          title: string
          updated_at?: string
        }
        Update: {
          alerts?: number[] | null
          batch_id?: string | null
          color?: string
          completed_at?: string | null
          created_at?: string
          date?: string | null
          deleted_at?: string | null
          due_date?: string | null
          duration_min?: number
          energy?: number | null
          goal_id?: string | null
          icon?: string | null
          id?: string
          inbox_order?: number
          is_all_day?: boolean
          is_cancelled?: boolean
          notes?: string | null
          occurrence_date?: string | null
          priority?: number | null
          repeat_rule?: string | null
          repeat_until?: string | null
          series_id?: string | null
          source?: string
          start_time?: string | null
          subtasks?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          id: string
          items: Json
          name: string
        }
        Insert: {
          id?: string
          items?: Json
          name: string
        }
        Update: {
          id?: string
          items?: Json
          name?: string
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
