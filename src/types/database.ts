export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type Relationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne: boolean
  referencedRelation: string
  referencedColumns: string[]
}

type Table<Row, Insert, Update, Relationships extends Relationship[] = []> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: Relationships
}

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" }
  public: {
    Tables: {
      audit_logs: Table<
        { action: string; actor_user_id: string | null; entity_id: string | null; entity_type: string; id: string; metadata: Json; occurred_at: string; organization_id: string | null },
        { action: string; actor_user_id?: string | null; entity_id?: string | null; entity_type: string; id?: string; metadata?: Json; occurred_at?: string; organization_id?: string | null },
        { action?: string; actor_user_id?: string | null; entity_id?: string | null; entity_type?: string; id?: string; metadata?: Json; occurred_at?: string; organization_id?: string | null },
        [{ foreignKeyName: "audit_logs_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }]
      >
      customers: Table<
        { address: string | null; billing_email: string | null; created_at: string; created_by: string; id: string; name: string; notes: string | null; organization_id: string; phone: string | null; status: string; updated_at: string },
        { address?: string | null; billing_email?: string | null; created_at?: string; created_by: string; id?: string; name: string; notes?: string | null; organization_id: string; phone?: string | null; status?: string; updated_at?: string },
        { address?: string | null; billing_email?: string | null; created_at?: string; created_by?: string; id?: string; name?: string; notes?: string | null; organization_id?: string; phone?: string | null; status?: string; updated_at?: string },
        [{ foreignKeyName: "customers_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }]
      >
      dispatch_assignments: Table<
        { created_at: string; created_by: string; employee_id: string | null; id: string; job_id: string; organization_id: string; role: string | null; vehicle_id: string | null },
        { created_at?: string; created_by: string; employee_id?: string | null; id?: string; job_id: string; organization_id: string; role?: string | null; vehicle_id?: string | null },
        { created_at?: string; created_by?: string; employee_id?: string | null; id?: string; job_id?: string; organization_id?: string; role?: string | null; vehicle_id?: string | null },
        [
          { foreignKeyName: "dispatch_assignments_employee_id_fkey"; columns: ["employee_id"]; isOneToOne: false; referencedRelation: "employees"; referencedColumns: ["id"] },
          { foreignKeyName: "dispatch_assignments_job_id_fkey"; columns: ["job_id"]; isOneToOne: false; referencedRelation: "jobs"; referencedColumns: ["id"] },
          { foreignKeyName: "dispatch_assignments_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "dispatch_assignments_vehicle_id_fkey"; columns: ["vehicle_id"]; isOneToOne: false; referencedRelation: "fleet_vehicles"; referencedColumns: ["id"] }
        ]
      >
      employees: Table<
        { created_at: string; created_by: string; email: string | null; first_name: string; id: string; last_name: string; organization_id: string; phone: string | null; position: string | null; status: string; updated_at: string; user_id: string | null },
        { created_at?: string; created_by: string; email?: string | null; first_name: string; id?: string; last_name: string; organization_id: string; phone?: string | null; position?: string | null; status?: string; updated_at?: string; user_id?: string | null },
        { created_at?: string; created_by?: string; email?: string | null; first_name?: string; id?: string; last_name?: string; organization_id?: string; phone?: string | null; position?: string | null; status?: string; updated_at?: string; user_id?: string | null },
        [{ foreignKeyName: "employees_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }]
      >
      fleet_vehicles: Table<
        { created_at: string; created_by: string; id: string; name: string | null; organization_id: string; plate: string | null; status: string; unit_number: string; updated_at: string; vehicle_type: string },
        { created_at?: string; created_by: string; id?: string; name?: string | null; organization_id: string; plate?: string | null; status?: string; unit_number: string; updated_at?: string; vehicle_type?: string },
        { created_at?: string; created_by?: string; id?: string; name?: string | null; organization_id?: string; plate?: string | null; status?: string; unit_number?: string; updated_at?: string; vehicle_type?: string },
        [{ foreignKeyName: "fleet_vehicles_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }]
      >
      jobs: Table<
        { created_at: string; created_by: string; customer_id: string; id: string; job_number: string; notes: string | null; organization_id: string; scheduled_end: string | null; scheduled_start: string | null; site_address: string | null; site_name: string | null; status: string; title: string; updated_at: string },
        { created_at?: string; created_by: string; customer_id: string; id?: string; job_number: string; notes?: string | null; organization_id: string; scheduled_end?: string | null; scheduled_start?: string | null; site_address?: string | null; site_name?: string | null; status?: string; title: string; updated_at?: string },
        { created_at?: string; created_by?: string; customer_id?: string; id?: string; job_number?: string; notes?: string | null; organization_id?: string; scheduled_end?: string | null; scheduled_start?: string | null; site_address?: string | null; site_name?: string | null; status?: string; title?: string; updated_at?: string },
        [
          { foreignKeyName: "jobs_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
          { foreignKeyName: "jobs_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ]
      >
      membership_roles: Table<
        { created_at: string; id: string; membership_id: string; role_id: string },
        { created_at?: string; id?: string; membership_id: string; role_id: string },
        { created_at?: string; id?: string; membership_id?: string; role_id?: string },
        [
          { foreignKeyName: "membership_roles_membership_id_fkey"; columns: ["membership_id"]; isOneToOne: false; referencedRelation: "organization_members"; referencedColumns: ["id"] },
          { foreignKeyName: "membership_roles_role_id_fkey"; columns: ["role_id"]; isOneToOne: false; referencedRelation: "roles"; referencedColumns: ["id"] }
        ]
      >
      organization_members: Table<
        { created_at: string; created_by: string | null; id: string; joined_at: string; organization_id: string; status: string; updated_at: string; user_id: string },
        { created_at?: string; created_by?: string | null; id?: string; joined_at?: string; organization_id: string; status?: string; updated_at?: string; user_id: string },
        { created_at?: string; created_by?: string | null; id?: string; joined_at?: string; organization_id?: string; status?: string; updated_at?: string; user_id?: string },
        [{ foreignKeyName: "organization_members_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }]
      >
      organization_modules: Table<
        { created_at: string; enabled: boolean; id: string; module_key: string; organization_id: string; settings: Json; updated_at: string },
        { created_at?: string; enabled?: boolean; id?: string; module_key: string; organization_id: string; settings?: Json; updated_at?: string },
        { created_at?: string; enabled?: boolean; id?: string; module_key?: string; organization_id?: string; settings?: Json; updated_at?: string },
        [{ foreignKeyName: "organization_modules_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }]
      >
      organizations: Table<
        { country_code: string; created_at: string; created_by: string; id: string; legal_name: string | null; name: string; settings: Json; slug: string | null; status: string; timezone: string; updated_at: string },
        { country_code?: string; created_at?: string; created_by: string; id?: string; legal_name?: string | null; name: string; settings?: Json; slug?: string | null; status?: string; timezone?: string; updated_at?: string },
        { country_code?: string; created_at?: string; created_by?: string; id?: string; legal_name?: string | null; name?: string; settings?: Json; slug?: string | null; status?: string; timezone?: string; updated_at?: string }
      >
      permissions: Table<
        { description: string | null; key: string; module: string; name: string },
        { description?: string | null; key: string; module: string; name: string },
        { description?: string | null; key?: string; module?: string; name?: string }
      >
      profiles: Table<
        { avatar_path: string | null; created_at: string; display_name: string | null; first_name: string | null; last_name: string | null; phone: string | null; updated_at: string; user_id: string },
        { avatar_path?: string | null; created_at?: string; display_name?: string | null; first_name?: string | null; last_name?: string | null; phone?: string | null; updated_at?: string; user_id: string },
        { avatar_path?: string | null; created_at?: string; display_name?: string | null; first_name?: string | null; last_name?: string | null; phone?: string | null; updated_at?: string; user_id?: string }
      >
      role_permissions: Table<
        { created_at: string; id: string; permission_key: string; role_id: string },
        { created_at?: string; id?: string; permission_key: string; role_id: string },
        { created_at?: string; id?: string; permission_key?: string; role_id?: string },
        [
          { foreignKeyName: "role_permissions_permission_key_fkey"; columns: ["permission_key"]; isOneToOne: false; referencedRelation: "permissions"; referencedColumns: ["key"] },
          { foreignKeyName: "role_permissions_role_id_fkey"; columns: ["role_id"]; isOneToOne: false; referencedRelation: "roles"; referencedColumns: ["id"] }
        ]
      >
      roles: Table<
        { created_at: string; description: string | null; id: string; is_system: boolean; key: string; name: string; organization_id: string | null; updated_at: string },
        { created_at?: string; description?: string | null; id?: string; is_system?: boolean; key: string; name: string; organization_id?: string | null; updated_at?: string },
        { created_at?: string; description?: string | null; id?: string; is_system?: boolean; key?: string; name?: string; organization_id?: string | null; updated_at?: string },
        [{ foreignKeyName: "roles_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }]
      >
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"]
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"]
