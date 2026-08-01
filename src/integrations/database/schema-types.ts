export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Database schema shape used by the SQLite data layer.
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_exclusions: {
        Row: {
          active: boolean
          agent_id: string
          created_at: string
          end_date: string
          exclusion_type: Database["public"]["Enums"]["exclusion_type"]
          id: string
          notes: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          agent_id: string
          created_at?: string
          end_date: string
          exclusion_type: Database["public"]["Enums"]["exclusion_type"]
          id?: string
          notes?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          agent_id?: string
          created_at?: string
          end_date?: string
          exclusion_type?: Database["public"]["Enums"]["exclusion_type"]
          id?: string
          notes?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_exclusions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_cases: {
        Row: {
          agent_id: string
          banknote_count: number | null
          case_date: string
          case_number: string
          checkpoint_id: string | null
          country: string | null
          created_at: string
          currency_code: string | null
          dog_id: string | null
          id: string
          is_deleted: boolean
          location: string | null
          object_count: number | null
          object_type: Database["public"]["Enums"]["explosive_object_type"] | null
          observations: string | null
          quantity: number | null
          seizure_type: Database["public"]["Enums"]["seizure_type"] | null
          specialty: Database["public"]["Enums"]["operational_case_specialty"]
          threat_level: Database["public"]["Enums"]["threat_level"] | null
          total_amount: number | null
          unit: Database["public"]["Enums"]["seizure_unit"] | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          banknote_count?: number | null
          case_date: string
          case_number: string
          checkpoint_id?: string | null
          country?: string | null
          created_at?: string
          currency_code?: string | null
          dog_id?: string | null
          id?: string
          is_deleted?: boolean
          location?: string | null
          object_count?: number | null
          object_type?: Database["public"]["Enums"]["explosive_object_type"] | null
          observations?: string | null
          quantity?: number | null
          seizure_type?: Database["public"]["Enums"]["seizure_type"] | null
          specialty: Database["public"]["Enums"]["operational_case_specialty"]
          threat_level?: Database["public"]["Enums"]["threat_level"] | null
          total_amount?: number | null
          unit?: Database["public"]["Enums"]["seizure_unit"] | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          banknote_count?: number | null
          case_date?: string
          case_number?: string
          checkpoint_id?: string | null
          country?: string | null
          created_at?: string
          currency_code?: string | null
          dog_id?: string | null
          id?: string
          is_deleted?: boolean
          location?: string | null
          object_count?: number | null
          object_type?: Database["public"]["Enums"]["explosive_object_type"] | null
          observations?: string | null
          quantity?: number | null
          seizure_type?: Database["public"]["Enums"]["seizure_type"] | null
          specialty?: Database["public"]["Enums"]["operational_case_specialty"]
          threat_level?: Database["public"]["Enums"]["threat_level"] | null
          total_amount?: number | null
          unit?: Database["public"]["Enums"]["seizure_unit"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_cases_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_cases_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_cases_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_case_attachments: {
        Row: {
          case_id: string
          created_at: string
          file_name: string
          file_size: number
          id: string
          mime_type: string | null
          storage_path: string
        }
        Insert: {
          case_id: string
          created_at?: string
          file_name: string
          file_size: number
          id?: string
          mime_type?: string | null
          storage_path: string
        }
        Update: {
          case_id?: string
          created_at?: string
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_case_attachments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "operational_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          dog_id: string | null
          first_name: string
          gender: Database["public"]["Enums"]["gender_type"]
          grade: string
          id: string
          is_section_chief: boolean
          last_name: string
          observations: string | null
          phone: string | null
          photo_url: string | null
          professional_number: string
          section_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          dog_id?: string | null
          first_name: string
          gender: Database["public"]["Enums"]["gender_type"]
          grade: string
          id?: string
          is_section_chief?: boolean
          last_name: string
          observations?: string | null
          phone?: string | null
          photo_url?: string | null
          professional_number: string
          section_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          dog_id?: string | null
          first_name?: string
          gender?: Database["public"]["Enums"]["gender_type"]
          grade?: string
          id?: string
          is_section_chief?: boolean
          last_name?: string
          observations?: string | null
          phone?: string | null
          photo_url?: string | null
          professional_number?: string
          section_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: true
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      application_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      checkpoint_posts: {
        Row: {
          active: boolean
          /** ANY = 'all', MALE = 'male', FEMALE = 'female' */
          allowed_gender: Database["public"]["Enums"]["checkpoint_allowed_gender"]
          checkpoint_id: string
          created_at: string
          dog_required: boolean
          id: string
          required_agents: number
          shift: Database["public"]["Enums"]["shift_type"]
          specialty_required: Database["public"]["Enums"]["dog_specialty"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          /** ANY = 'all', MALE = 'male', FEMALE = 'female' */
          allowed_gender?: Database["public"]["Enums"]["checkpoint_allowed_gender"]
          checkpoint_id: string
          created_at?: string
          dog_required?: boolean
          id?: string
          required_agents?: number
          shift?: Database["public"]["Enums"]["shift_type"]
          specialty_required: Database["public"]["Enums"]["dog_specialty"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          /** ANY = 'all', MALE = 'male', FEMALE = 'female' */
          allowed_gender?: Database["public"]["Enums"]["checkpoint_allowed_gender"]
          checkpoint_id?: string
          created_at?: string
          dog_required?: boolean
          id?: string
          required_agents?: number
          shift?: Database["public"]["Enums"]["shift_type"]
          specialty_required?: Database["public"]["Enums"]["dog_specialty"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_posts_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoints: {
        Row: {
          active: boolean
          allowed_gender: Database["public"]["Enums"]["checkpoint_allowed_gender"]
          created_at: string
          day_explosives: number
          day_narcotics: number
          day_shift_enabled: boolean
          female_policy: Database["public"]["Enums"]["checkpoint_female_policy"]
          id: string
          name: string
          night_explosives: number
          night_narcotics: number
          night_only: boolean
          night_shift_enabled: boolean
          operating_days: number[]
          /** Planning assignment priority: 1=Critical, 2=High, 3=Normal, 4=Low */
          priority: number
          /** Phase 1: official staffing — narcotics (drugs + banknotes) K9 count */
          required_drugs: number
          /** Phase 1: official staffing — explosives K9 count */
          required_explosives: number
          /** Generated: required_drugs + required_explosives */
          total_required_staff: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          allowed_gender?: Database["public"]["Enums"]["checkpoint_allowed_gender"]
          created_at?: string
          day_explosives?: number
          day_narcotics?: number
          day_shift_enabled?: boolean
          female_policy?: Database["public"]["Enums"]["checkpoint_female_policy"]
          id?: string
          name: string
          night_explosives?: number
          night_narcotics?: number
          night_only?: boolean
          night_shift_enabled?: boolean
          operating_days?: number[]
          priority?: number
          required_drugs?: number
          required_explosives?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          allowed_gender?: Database["public"]["Enums"]["checkpoint_allowed_gender"]
          created_at?: string
          day_explosives?: number
          day_narcotics?: number
          day_shift_enabled?: boolean
          female_policy?: Database["public"]["Enums"]["checkpoint_female_policy"]
          id?: string
          name?: string
          night_explosives?: number
          night_narcotics?: number
          night_only?: boolean
          night_shift_enabled?: boolean
          operating_days?: number[]
          priority?: number
          required_drugs?: number
          required_explosives?: number
          updated_at?: string
        }
        Relationships: []
      }
      dogs: {
        Row: {
          active: boolean
          assignment_date: string | null
          breed: string | null
          created_at: string
          date_of_birth: string | null
          gender: Database["public"]["Enums"]["gender_type"]
          health_status: string | null
          id: string
          microchip_number: string | null
          name: string
          observations: string | null
          photo_url: string | null
          specialty: Database["public"]["Enums"]["dog_specialty"]
          status: Database["public"]["Enums"]["dog_status"]
          training_level: string | null
          updated_at: string
          vaccination_info: string | null
          veterinary_notes: string | null
        }
        Insert: {
          active?: boolean
          assignment_date?: string | null
          breed?: string | null
          created_at?: string
          date_of_birth?: string | null
          gender: Database["public"]["Enums"]["gender_type"]
          health_status?: string | null
          id?: string
          microchip_number?: string | null
          name: string
          observations?: string | null
          photo_url?: string | null
          specialty: Database["public"]["Enums"]["dog_specialty"]
          status?: Database["public"]["Enums"]["dog_status"]
          training_level?: string | null
          updated_at?: string
          vaccination_info?: string | null
          veterinary_notes?: string | null
        }
        Update: {
          active?: boolean
          assignment_date?: string | null
          breed?: string | null
          created_at?: string
          date_of_birth?: string | null
          gender?: Database["public"]["Enums"]["gender_type"]
          health_status?: string | null
          id?: string
          microchip_number?: string | null
          name?: string
          observations?: string | null
          photo_url?: string | null
          specialty?: Database["public"]["Enums"]["dog_specialty"]
          status?: Database["public"]["Enums"]["dog_status"]
          training_level?: string | null
          updated_at?: string
          vaccination_info?: string | null
          veterinary_notes?: string | null
        }
        Relationships: []
      }
      planning: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          planning_date: string
          section_id: string
          shift: Database["public"]["Enums"]["shift_type"]
          updated_at: string
          validated: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          planning_date: string
          section_id: string
          shift: Database["public"]["Enums"]["shift_type"]
          updated_at?: string
          validated?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          planning_date?: string
          section_id?: string
          shift?: Database["public"]["Enums"]["shift_type"]
          updated_at?: string
          validated?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "planning_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_assignments: {
        Row: {
          agent_id: string
          checkpoint_post_id: string | null
          created_at: string
          dog_id: string | null
          id: string
          is_hq_reserve: boolean
          is_off_duty: boolean
          planning_id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          checkpoint_post_id?: string | null
          created_at?: string
          dog_id?: string | null
          id?: string
          is_hq_reserve?: boolean
          is_off_duty?: boolean
          planning_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          checkpoint_post_id?: string | null
          created_at?: string
          dog_id?: string | null
          id?: string
          is_hq_reserve?: boolean
          is_off_duty?: boolean
          planning_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_assignments_checkpoint_post_id_fkey"
            columns: ["checkpoint_post_id"]
            isOneToOne: false
            referencedRelation: "checkpoint_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_assignments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_assignments_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "planning"
            referencedColumns: ["id"]
          },
        ]
      }
      rotation_history: {
        Row: {
          agent_id: string
          checkpoint_post_id: string | null
          created_at: string
          id: string
          is_hq_reserve: boolean
          is_off_duty: boolean
          planning_date: string
        }
        Insert: {
          agent_id: string
          checkpoint_post_id?: string | null
          created_at?: string
          id?: string
          is_hq_reserve?: boolean
          is_off_duty?: boolean
          planning_date: string
        }
        Update: {
          agent_id?: string
          checkpoint_post_id?: string | null
          created_at?: string
          id?: string
          is_hq_reserve?: boolean
          is_off_duty?: boolean
          planning_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotation_history_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotation_history_checkpoint_post_id_fkey"
            columns: ["checkpoint_post_id"]
            isOneToOne: false
            referencedRelation: "checkpoint_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          active: boolean
          commander_full_name: string
          commander_grade: string
          commander_mle: string
          created_at: string
          id: string
          name: string
          shift_type: Database["public"]["Enums"]["shift_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          commander_full_name?: string
          commander_grade?: string
          commander_mle?: string
          created_at?: string
          id?: string
          name: string
          shift_type: Database["public"]["Enums"]["shift_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          commander_full_name?: string
          commander_grade?: string
          commander_mle?: string
          created_at?: string
          id?: string
          name?: string
          shift_type?: Database["public"]["Enums"]["shift_type"]
          updated_at?: string
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
      /** ANY = 'all', MALE = 'male', FEMALE = 'female' */
      checkpoint_allowed_gender: "all" | "male" | "female"
      checkpoint_female_policy: "allowed" | "preferred" | "not_allowed"
      dog_specialty: "narcotics" | "explosives" | "currency"
      dog_status: "available" | "sick" | "heat"
      exclusion_type:
        | "absence"
        | "sickness"
        | "administrative_leave"
        | "special_leave"
        | "dog_sick"
        | "female_dog_heat"
        | "annual_leave"
        | "mission"
        | "training"
        | "other"
      explosive_object_type:
        | "firearm"
        | "bladed_weapon"
        | "grenade"
        | "homemade_explosive"
        | "ammunition"
        | "detonator"
        | "explosive_material"
        | "other"
      gender_type: "male" | "female"
      operational_case_specialty: "narcotics" | "explosives" | "currency"
      planning_priority: "high" | "medium" | "low"
      seizure_type:
        | "cannabis"
        | "exta"
        | "pofa"
        | "cocaine"
        | "heroin"
        | "synthetic_drugs"
        | "hashish"
        | "explosives"
        | "counterfeit_currency"
        | "other"
      seizure_unit: "kg" | "g" | "tonne" | "units" | "pieces" | "liters" | "banknotes"
      threat_level: "low" | "medium" | "high"
      shift_type: "day" | "night"
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
      checkpoint_allowed_gender: ["all", "male", "female"],
      checkpoint_female_policy: ["allowed", "preferred", "not_allowed"],
      dog_specialty: ["narcotics", "explosives", "currency"],
      dog_status: ["available", "sick", "heat"],
      exclusion_type: [
        "absence",
        "sickness",
        "administrative_leave",
        "special_leave",
        "dog_sick",
        "female_dog_heat",
        "annual_leave",
        "mission",
        "training",
        "other",
      ],
      explosive_object_type: [
        "firearm",
        "bladed_weapon",
        "grenade",
        "homemade_explosive",
        "ammunition",
        "detonator",
        "explosive_material",
        "other",
      ],
      gender_type: ["male", "female"],
      operational_case_specialty: ["narcotics", "explosives", "currency"],
      planning_priority: ["high", "medium", "low"],
      seizure_type: [
        "cannabis",
        "exta",
        "pofa",
        "cocaine",
        "heroin",
        "synthetic_drugs",
        "hashish",
        "explosives",
        "counterfeit_currency",
        "other",
      ],
      seizure_unit: ["kg", "g", "tonne", "units", "pieces", "liters", "banknotes"],
      threat_level: ["low", "medium", "high"],
      shift_type: ["day", "night"],
    },
  },
} as const
