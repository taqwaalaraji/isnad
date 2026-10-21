export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string;
          created_at: string;
          details: NonNullable<Json>;
          id: number;
          newsroom_id: string | null;
          target_id: string | null;
          target_type: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: never;
          newsroom_id?: string | null;
          target_id?: string | null;
          target_type?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: never;
          newsroom_id?: string | null;
          target_id?: string | null;
          target_type?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activity_log_newsroom_id_fkey";
            columns: ["newsroom_id"];
            isOneToOne: false;
            referencedRelation: "newsrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_log_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      alerts: {
        Row: {
          body: string | null;
          created_at: string;
          delivered_email_at: string | null;
          delivered_telegram_at: string | null;
          dismissed_at: string | null;
          id: string;
          kind: Database["public"]["Enums"]["alert_kind"];
          newsroom_id: string;
          payload: NonNullable<Json>;
          read_at: string | null;
          title: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          body?: string | null;
          created_at?: string;
          delivered_email_at?: string | null;
          delivered_telegram_at?: string | null;
          dismissed_at?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["alert_kind"];
          newsroom_id: string;
          payload?: NonNullable<Json>;
          read_at?: string | null;
          title: string;
          user_id?: string | null;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          delivered_email_at?: string | null;
          delivered_telegram_at?: string | null;
          dismissed_at?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["alert_kind"];
          newsroom_id?: string;
          payload?: NonNullable<Json>;
          read_at?: string | null;
          title?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "alerts_newsroom_id_fkey";
            columns: ["newsroom_id"];
            isOneToOne: false;
            referencedRelation: "newsrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alerts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      briefs: {
        Row: {
          content: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          entity_id: string;
          error: string | null;
          guest_name: string | null;
          id: string;
          interview_date: string | null;
          newsroom_id: string;
          status: string;
          title: string;
          topic_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          content?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          entity_id: string;
          error?: string | null;
          guest_name?: string | null;
          id?: string;
          interview_date?: string | null;
          newsroom_id: string;
          status?: string;
          title: string;
          topic_id?: string | null;
          updated_at?: string;
        };
        Update: {
          content?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          entity_id?: string;
          error?: string | null;
          guest_name?: string | null;
          id?: string;
          interview_date?: string | null;
          newsroom_id?: string;
          status?: string;
          title?: string;
          topic_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "briefs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "briefs_entity_id_fkey";
            columns: ["entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "briefs_newsroom_id_fkey";
            columns: ["newsroom_id"];
            isOneToOne: false;
            referencedRelation: "newsrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "briefs_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      checks: {
        Row: {
          archived_at: string | null;
          assigned_editor_id: string | null;
          channel: Database["public"]["Enums"]["intake_channel"];
          claim_count: number;
          context_count: number;
          created_at: string;
          created_by: string | null;
          decided_count: number;
          desk_id: string | null;
          dialect: string;
          differs_count: number;
          error: string | null;
          id: string;
          input_kind: Database["public"]["Enums"]["input_kind"];
          input_text: string | null;
          input_url: string | null;
          match_count: number;
          mime_type: string | null;
          newsroom_id: string;
          none_count: number;
          original_filename: string | null;
          progress: NonNullable<Json>;
          public_slug: string | null;
          published_at: string | null;
          published_url: string | null;
          recorded_at: string;
          registry_checked_at: string | null;
          search_text: string | null;
          size_bytes: number | null;
          speakers: string | null;
          stage: Database["public"]["Enums"]["check_stage"];
          status: Database["public"]["Enums"]["check_status"];
          storage_path: string | null;
          telegram_chat_id: number | null;
          telegram_message_id: number | null;
          title: string;
          updated_at: string;
          visibility: Database["public"]["Enums"]["check_visibility"];
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          assigned_editor_id?: string | null;
          channel?: Database["public"]["Enums"]["intake_channel"];
          claim_count?: number;
          context_count?: number;
          created_at?: string;
          created_by?: string | null;
          decided_count?: number;
          desk_id?: string | null;
          dialect?: string;
          differs_count?: number;
          error?: string | null;
          id?: string;
          input_kind: Database["public"]["Enums"]["input_kind"];
          input_text?: string | null;
          input_url?: string | null;
          match_count?: number;
          mime_type?: string | null;
          newsroom_id: string;
          none_count?: number;
          original_filename?: string | null;
          progress?: NonNullable<Json>;
          public_slug?: string | null;
          published_at?: string | null;
          published_url?: string | null;
          recorded_at?: string;
          registry_checked_at?: string | null;
          search_text?: never;
          size_bytes?: number | null;
          speakers?: string | null;
          stage?: Database["public"]["Enums"]["check_stage"];
          status?: Database["public"]["Enums"]["check_status"];
          storage_path?: string | null;
          telegram_chat_id?: number | null;
          telegram_message_id?: number | null;
          title: string;
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["check_visibility"];
        };
        Update: {
          archived_at?: string | null;
          assigned_editor_id?: string | null;
          channel?: Database["public"]["Enums"]["intake_channel"];
          claim_count?: number;
          context_count?: number;
          created_at?: string;
          created_by?: string | null;
          decided_count?: number;
          desk_id?: string | null;
          dialect?: string;
          differs_count?: number;
          error?: string | null;
          id?: string;
          input_kind?: Database["public"]["Enums"]["input_kind"];
          input_text?: string | null;
          input_url?: string | null;
          match_count?: number;
          mime_type?: string | null;
          newsroom_id?: string;
          none_count?: number;
          original_filename?: string | null;
          progress?: NonNullable<Json>;
          public_slug?: string | null;
          published_at?: string | null;
          published_url?: string | null;
          recorded_at?: string;
          registry_checked_at?: string | null;
          search_text?: never;
          size_bytes?: number | null;
          speakers?: string | null;
          stage?: Database["public"]["Enums"]["check_stage"];
          status?: Database["public"]["Enums"]["check_status"];
          storage_path?: string | null;
          telegram_chat_id?: number | null;
          telegram_message_id?: number | null;
          title?: string;
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["check_visibility"];
        };
        Relationships: [
          {
            foreignKeyName: "checks_assigned_editor_id_fkey";
            columns: ["assigned_editor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checks_desk_id_fkey";
            columns: ["desk_id"];
            isOneToOne: false;
            referencedRelation: "desks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checks_newsroom_id_fkey";
            columns: ["newsroom_id"];
            isOneToOne: false;
            referencedRelation: "newsrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      claim_results: {
        Row: {
          chain: NonNullable<Json>;
          chain_status: Database["public"]["Enums"]["chain_status"];
          check_id: string;
          claim_id: string;
          comparison: NonNullable<Json>;
          created_at: string;
          differing_fields: string[];
          discovered: boolean;
          document_version_id: string | null;
          earlier_figures: NonNullable<Json>;
          evidence: Json | null;
          evidence_verified: boolean;
          figure_id: string | null;
          needs_review: boolean;
          searched_sources: NonNullable<Json>;
          suggested_wording: string | null;
          updated_at: string;
          verdict: Database["public"]["Enums"]["verdict"];
          verifier: Json | null;
        };
        ComputedFields: never;
        Insert: {
          chain?: NonNullable<Json>;
          chain_status: Database["public"]["Enums"]["chain_status"];
          check_id: string;
          claim_id: string;
          comparison?: NonNullable<Json>;
          created_at?: string;
          differing_fields?: string[];
          discovered?: boolean;
          document_version_id?: string | null;
          earlier_figures?: NonNullable<Json>;
          evidence?: Json | null;
          evidence_verified?: boolean;
          figure_id?: string | null;
          needs_review?: boolean;
          searched_sources?: NonNullable<Json>;
          suggested_wording?: string | null;
          updated_at?: string;
          verdict: Database["public"]["Enums"]["verdict"];
          verifier?: Json | null;
        };
        Update: {
          chain?: NonNullable<Json>;
          chain_status?: Database["public"]["Enums"]["chain_status"];
          check_id?: string;
          claim_id?: string;
          comparison?: NonNullable<Json>;
          created_at?: string;
          differing_fields?: string[];
          discovered?: boolean;
          document_version_id?: string | null;
          earlier_figures?: NonNullable<Json>;
          evidence?: Json | null;
          evidence_verified?: boolean;
          figure_id?: string | null;
          needs_review?: boolean;
          searched_sources?: NonNullable<Json>;
          suggested_wording?: string | null;
          updated_at?: string;
          verdict?: Database["public"]["Enums"]["verdict"];
          verifier?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "claim_results_check_id_fkey";
            columns: ["check_id"];
            isOneToOne: false;
            referencedRelation: "checks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claim_results_claim_id_fkey";
            columns: ["claim_id"];
            isOneToOne: true;
            referencedRelation: "claims";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claim_results_document_version_id_fkey";
            columns: ["document_version_id"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claim_results_figure_id_fkey";
            columns: ["figure_id"];
            isOneToOne: false;
            referencedRelation: "figures";
            referencedColumns: ["id"];
          },
        ];
      };
      claims: {
        Row: {
          attribution: string | null;
          breakdown: string | null;
          check_id: string;
          checkable: boolean;
          claim_type: string;
          created_at: string;
          decimals: number;
          end_ms: number | null;
          entity_id: string | null;
          entity_text: string | null;
          geography: string | null;
          id: string;
          idx: number;
          indicator_id: string | null;
          indicator_text: string | null;
          period_end: string | null;
          period_start: string | null;
          period_text: string | null;
          qualifier: string;
          review_state: Database["public"]["Enums"]["claim_review_state"];
          scale: string;
          segment_id: string | null;
          span_end: number | null;
          span_start: number | null;
          span_text: string;
          speaker: string | null;
          start_ms: number | null;
          uncheckable_reason: string | null;
          unit: string | null;
          value: number | null;
          value_base: number | null;
        };
        ComputedFields: never;
        Insert: {
          attribution?: string | null;
          breakdown?: string | null;
          check_id: string;
          checkable?: boolean;
          claim_type?: string;
          created_at?: string;
          decimals?: number;
          end_ms?: number | null;
          entity_id?: string | null;
          entity_text?: string | null;
          geography?: string | null;
          id?: string;
          idx: number;
          indicator_id?: string | null;
          indicator_text?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          period_text?: string | null;
          qualifier?: string;
          review_state?: Database["public"]["Enums"]["claim_review_state"];
          scale?: string;
          segment_id?: string | null;
          span_end?: number | null;
          span_start?: number | null;
          span_text: string;
          speaker?: string | null;
          start_ms?: number | null;
          uncheckable_reason?: string | null;
          unit?: string | null;
          value?: number | null;
          value_base?: number | null;
        };
        Update: {
          attribution?: string | null;
          breakdown?: string | null;
          check_id?: string;
          checkable?: boolean;
          claim_type?: string;
          created_at?: string;
          decimals?: number;
          end_ms?: number | null;
          entity_id?: string | null;
          entity_text?: string | null;
          geography?: string | null;
          id?: string;
          idx?: number;
          indicator_id?: string | null;
          indicator_text?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          period_text?: string | null;
          qualifier?: string;
          review_state?: Database["public"]["Enums"]["claim_review_state"];
          scale?: string;
          segment_id?: string | null;
          span_end?: number | null;
          span_start?: number | null;
          span_text?: string;
          speaker?: string | null;
          start_ms?: number | null;
          uncheckable_reason?: string | null;
          unit?: string | null;
          value?: number | null;
          value_base?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "claims_check_id_fkey";
            columns: ["check_id"];
            isOneToOne: false;
            referencedRelation: "checks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claims_entity_id_fkey";
            columns: ["entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claims_indicator_id_fkey";
            columns: ["indicator_id"];
            isOneToOne: false;
            referencedRelation: "indicators";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claims_segment_id_fkey";
            columns: ["segment_id"];
            isOneToOne: false;
            referencedRelation: "segments";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          body: string;
          check_id: string;
          claim_id: string | null;
          created_at: string;
          id: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          check_id: string;
          claim_id?: string | null;
          created_at?: string;
          id?: string;
          user_id?: string | null;
        };
        Update: {
          body?: string;
          check_id?: string;
          claim_id?: string | null;
          created_at?: string;
          id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "comments_check_id_fkey";
            columns: ["check_id"];
            isOneToOne: false;
            referencedRelation: "checks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_claim_id_fkey";
            columns: ["claim_id"];
            isOneToOne: false;
            referencedRelation: "claims";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      decisions: {
        Row: {
          action: Database["public"]["Enums"]["decision_action"];
          check_id: string;
          claim_id: string | null;
          created_at: string;
          id: string;
          note: string | null;
          user_id: string | null;
          wording: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: Database["public"]["Enums"]["decision_action"];
          check_id: string;
          claim_id?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          user_id?: string | null;
          wording?: string | null;
        };
        Update: {
          action?: Database["public"]["Enums"]["decision_action"];
          check_id?: string;
          claim_id?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          user_id?: string | null;
          wording?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "decisions_check_id_fkey";
            columns: ["check_id"];
            isOneToOne: false;
            referencedRelation: "checks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "decisions_claim_id_fkey";
            columns: ["claim_id"];
            isOneToOne: false;
            referencedRelation: "claims";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "decisions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      desks: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          newsroom_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          newsroom_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          newsroom_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "desks_newsroom_id_fkey";
            columns: ["newsroom_id"];
            isOneToOne: false;
            referencedRelation: "newsrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      document_versions: {
        Row: {
          content_hash: string;
          created_at: string;
          document_id: string;
          extraction_error: string | null;
          extraction_status: Database["public"]["Enums"]["extraction_status"];
          fetched_at: string;
          fetched_by: string | null;
          fetched_via: Database["public"]["Enums"]["fetch_origin"];
          figures_count: number;
          id: string;
          mime_type: string;
          page_count: number | null;
          previous_version_id: string | null;
          size_bytes: number;
          storage_path: string;
          tables: NonNullable<Json>;
          text_content: string | null;
          text_normalized: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          content_hash: string;
          created_at?: string;
          document_id: string;
          extraction_error?: string | null;
          extraction_status?: Database["public"]["Enums"]["extraction_status"];
          fetched_at?: string;
          fetched_by?: string | null;
          fetched_via: Database["public"]["Enums"]["fetch_origin"];
          figures_count?: number;
          id?: string;
          mime_type: string;
          page_count?: number | null;
          previous_version_id?: string | null;
          size_bytes?: number;
          storage_path: string;
          tables?: NonNullable<Json>;
          text_content?: string | null;
          text_normalized?: string | null;
          version: number;
        };
        Update: {
          content_hash?: string;
          created_at?: string;
          document_id?: string;
          extraction_error?: string | null;
          extraction_status?: Database["public"]["Enums"]["extraction_status"];
          fetched_at?: string;
          fetched_by?: string | null;
          fetched_via?: Database["public"]["Enums"]["fetch_origin"];
          figures_count?: number;
          id?: string;
          mime_type?: string;
          page_count?: number | null;
          previous_version_id?: string | null;
          size_bytes?: number;
          storage_path?: string;
          tables?: NonNullable<Json>;
          text_content?: string | null;
          text_normalized?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_versions_fetched_by_fkey";
            columns: ["fetched_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_versions_previous_version_id_fkey";
            columns: ["previous_version_id"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          created_at: string;
          current_version_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["document_kind"];
          language: string;
          newsroom_id: string | null;
          published_at: string | null;
          source_id: string;
          title: string;
          updated_at: string;
          url: string | null;
          watch: boolean;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          current_version_id?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["document_kind"];
          language?: string;
          newsroom_id?: string | null;
          published_at?: string | null;
          source_id: string;
          title: string;
          updated_at?: string;
          url?: string | null;
          watch?: boolean;
        };
        Update: {
          created_at?: string;
          current_version_id?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["document_kind"];
          language?: string;
          newsroom_id?: string | null;
          published_at?: string | null;
          source_id?: string;
          title?: string;
          updated_at?: string;
          url?: string | null;
          watch?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "documents_current_version_fk";
            columns: ["current_version_id"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_newsroom_id_fkey";
            columns: ["newsroom_id"];
            isOneToOne: false;
            referencedRelation: "newsrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      entities: {
        Row: {
          aliases: string[];
          created_at: string;
          description_ar: string | null;
          description_en: string | null;
          emirate: string | null;
          id: string;
          kind: Database["public"]["Enums"]["entity_kind"];
          level: Database["public"]["Enums"]["entity_level"];
          name_ar: string;
          name_en: string;
          search_text: string | null;
          short_name_ar: string | null;
          short_name_en: string | null;
          slug: string;
          website: string | null;
        };
        ComputedFields: never;
        Insert: {
          aliases?: string[];
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          emirate?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["entity_kind"];
          level?: Database["public"]["Enums"]["entity_level"];
          name_ar: string;
          name_en: string;
          search_text?: never;
          short_name_ar?: string | null;
          short_name_en?: string | null;
          slug: string;
          website?: string | null;
        };
        Update: {
          aliases?: string[];
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          emirate?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["entity_kind"];
          level?: Database["public"]["Enums"]["entity_level"];
          name_ar?: string;
          name_en?: string;
          search_text?: never;
          short_name_ar?: string | null;
          short_name_en?: string | null;
          slug?: string;
          website?: string | null;
        };
        Relationships: [];
      };
      eval_runs: {
        Row: {
          created_at: string;
          dataset: string;
          error: string | null;
          finished_at: string | null;
          id: string;
          metrics: NonNullable<Json>;
          results: NonNullable<Json>;
          settings: NonNullable<Json>;
          started_by: string | null;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          dataset?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          metrics?: NonNullable<Json>;
          results?: NonNullable<Json>;
          settings?: NonNullable<Json>;
          started_by?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          dataset?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          metrics?: NonNullable<Json>;
          results?: NonNullable<Json>;
          settings?: NonNullable<Json>;
          started_by?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "eval_runs_started_by_fkey";
            columns: ["started_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      figures: {
        Row: {
          breakdown: string | null;
          created_at: string;
          decimals: number;
          document_id: string;
          document_version_id: string;
          entity_id: string | null;
          geography: string;
          id: string;
          indicator_id: string | null;
          is_current: boolean;
          location: NonNullable<Json>;
          measure: string;
          newsroom_id: string | null;
          period_end: string;
          period_label: string;
          period_start: string;
          published_at: string | null;
          quote: string;
          quote_verified: boolean;
          review_note: string | null;
          review_status: Database["public"]["Enums"]["review_status"];
          reviewed_at: string | null;
          reviewed_by: string | null;
          scale: string;
          source_id: string;
          status: Database["public"]["Enums"]["figure_status"];
          supersedes_id: string | null;
          unit: string;
          value: number;
          value_base: number;
        };
        ComputedFields: never;
        Insert: {
          breakdown?: string | null;
          created_at?: string;
          decimals?: number;
          document_id: string;
          document_version_id: string;
          entity_id?: string | null;
          geography?: string;
          id?: string;
          indicator_id?: string | null;
          is_current?: boolean;
          location?: NonNullable<Json>;
          measure?: string;
          newsroom_id?: string | null;
          period_end: string;
          period_label: string;
          period_start: string;
          published_at?: string | null;
          quote: string;
          quote_verified?: boolean;
          review_note?: string | null;
          review_status?: Database["public"]["Enums"]["review_status"];
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          scale?: string;
          source_id: string;
          status?: Database["public"]["Enums"]["figure_status"];
          supersedes_id?: string | null;
          unit?: string;
          value: number;
          value_base: number;
        };
        Update: {
          breakdown?: string | null;
          created_at?: string;
          decimals?: number;
          document_id?: string;
          document_version_id?: string;
          entity_id?: string | null;
          geography?: string;
          id?: string;
          indicator_id?: string | null;
          is_current?: boolean;
          location?: NonNullable<Json>;
          measure?: string;
          newsroom_id?: string | null;
          period_end?: string;
          period_label?: string;
          period_start?: string;
          published_at?: string | null;
          quote?: string;
          quote_verified?: boolean;
          review_note?: string | null;
          review_status?: Database["public"]["Enums"]["review_status"];
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          scale?: string;
          source_id?: string;
          status?: Database["public"]["Enums"]["figure_status"];
          supersedes_id?: string | null;
          unit?: string;
          value?: number;
          value_base?: number;
        };
        Relationships: [
          {
            foreignKeyName: "figures_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "figures_document_version_id_fkey";
            columns: ["document_version_id"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "figures_entity_id_fkey";
            columns: ["entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "figures_indicator_id_fkey";
            columns: ["indicator_id"];
            isOneToOne: false;
            referencedRelation: "indicators";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "figures_newsroom_id_fkey";
            columns: ["newsroom_id"];
            isOneToOne: false;
            referencedRelation: "newsrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "figures_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "figures_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "figures_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "figures";
            referencedColumns: ["id"];
          },
        ];
      };
      follows: {
        Row: {
          created_at: string;
          newsroom_id: string;
          target_id: string;
          target_type: Database["public"]["Enums"]["follow_target"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          newsroom_id: string;
          target_id: string;
          target_type: Database["public"]["Enums"]["follow_target"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          newsroom_id?: string;
          target_id?: string;
          target_type?: Database["public"]["Enums"]["follow_target"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "follows_newsroom_id_fkey";
            columns: ["newsroom_id"];
            isOneToOne: false;
            referencedRelation: "newsrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follows_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      indicators: {
        Row: {
          aliases: string[];
          created_at: string;
          default_geography: string;
          definition_ar: string | null;
          definition_en: string | null;
          frequency: string | null;
          id: string;
          name_ar: string;
          name_en: string;
          search_text: string | null;
          slug: string;
          topic_id: string | null;
          unit: string;
          unit_kind: Database["public"]["Enums"]["unit_kind"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          aliases?: string[];
          created_at?: string;
          default_geography?: string;
          definition_ar?: string | null;
          definition_en?: string | null;
          frequency?: string | null;
          id?: string;
          name_ar: string;
          name_en: string;
          search_text?: never;
          slug: string;
          topic_id?: string | null;
          unit?: string;
          unit_kind?: Database["public"]["Enums"]["unit_kind"];
          updated_at?: string;
        };
        Update: {
          aliases?: string[];
          created_at?: string;
          default_geography?: string;
          definition_ar?: string | null;
          definition_en?: string | null;
          frequency?: string | null;
          id?: string;
          name_ar?: string;
          name_en?: string;
          search_text?: never;
          slug?: string;
          topic_id?: string | null;
          unit?: string;
          unit_kind?: Database["public"]["Enums"]["unit_kind"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "indicators_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          desk_id: string | null;
          email: string;
          expires_at: string;
          full_name: string;
          id: string;
          invited_by: string | null;
          newsroom_id: string;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["member_role"];
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          desk_id?: string | null;
          email: string;
          expires_at?: string;
          full_name?: string;
          id?: string;
          invited_by?: string | null;
          newsroom_id: string;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          desk_id?: string | null;
          email?: string;
          expires_at?: string;
          full_name?: string;
          id?: string;
          invited_by?: string | null;
          newsroom_id?: string;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_desk_id_fkey";
            columns: ["desk_id"];
            isOneToOne: false;
            referencedRelation: "desks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_newsroom_id_fkey";
            columns: ["newsroom_id"];
            isOneToOne: false;
            referencedRelation: "newsrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          attempts: number;
          created_at: string;
          dedupe_key: string | null;
          finished_at: string | null;
          id: number;
          kind: string;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
          priority: number;
          run_after: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["job_status"];
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          created_at?: string;
          dedupe_key?: string | null;
          finished_at?: string | null;
          id?: never;
          kind: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          payload?: NonNullable<Json>;
          priority?: number;
          run_after?: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
        };
        Update: {
          attempts?: number;
          created_at?: string;
          dedupe_key?: string | null;
          finished_at?: string | null;
          id?: never;
          kind?: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          payload?: NonNullable<Json>;
          priority?: number;
          run_after?: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
        };
        Relationships: [];
      };
      media: {
        Row: {
          audio_path: string | null;
          check_id: string;
          created_at: string;
          duration_ms: number | null;
          has_video: boolean;
          height: number | null;
          poster_path: string | null;
          video_path: string | null;
          waveform: Json | null;
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          audio_path?: string | null;
          check_id: string;
          created_at?: string;
          duration_ms?: number | null;
          has_video?: boolean;
          height?: number | null;
          poster_path?: string | null;
          video_path?: string | null;
          waveform?: Json | null;
          width?: number | null;
        };
        Update: {
          audio_path?: string | null;
          check_id?: string;
          created_at?: string;
          duration_ms?: number | null;
          has_video?: boolean;
          height?: number | null;
          poster_path?: string | null;
          video_path?: string | null;
          waveform?: Json | null;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "media_check_id_fkey";
            columns: ["check_id"];
            isOneToOne: true;
            referencedRelation: "checks";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          desk_id: string | null;
          newsroom_id: string;
          role: Database["public"]["Enums"]["member_role"];
          status: Database["public"]["Enums"]["member_status"];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          desk_id?: string | null;
          newsroom_id: string;
          role?: Database["public"]["Enums"]["member_role"];
          status?: Database["public"]["Enums"]["member_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          desk_id?: string | null;
          newsroom_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          status?: Database["public"]["Enums"]["member_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_desk_id_fkey";
            columns: ["desk_id"];
            isOneToOne: false;
            referencedRelation: "desks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_newsroom_id_fkey";
            columns: ["newsroom_id"];
            isOneToOne: false;
            referencedRelation: "newsrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      model_settings: {
        Row: {
          description_ar: string | null;
          description_en: string | null;
          effort: string;
          enabled: boolean;
          escalation_model: string | null;
          max_tokens: number | null;
          model: string;
          provider: string;
          task: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          description_ar?: string | null;
          description_en?: string | null;
          effort?: string;
          enabled?: boolean;
          escalation_model?: string | null;
          max_tokens?: number | null;
          model: string;
          provider?: string;
          task: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          description_ar?: string | null;
          description_en?: string | null;
          effort?: string;
          enabled?: boolean;
          escalation_model?: string | null;
          max_tokens?: number | null;
          model?: string;
          provider?: string;
          task?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "model_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      newsrooms: {
        Row: {
          brand_isnad_note: boolean;
          created_at: string;
          default_visibility: Database["public"]["Enums"]["check_visibility"];
          escalate_on_verifier_objection: boolean;
          id: string;
          internal: boolean;
          kind: Database["public"]["Enums"]["organization_kind"];
          media_retention_days: number;
          monthly_check_limit: number | null;
          name: string;
          require_approval_for_differs: boolean;
          slug: string;
          status: string;
          telegram_enabled: boolean;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          brand_isnad_note?: boolean;
          created_at?: string;
          default_visibility?: Database["public"]["Enums"]["check_visibility"];
          escalate_on_verifier_objection?: boolean;
          id?: string;
          internal?: boolean;
          kind?: Database["public"]["Enums"]["organization_kind"];
          media_retention_days?: number;
          monthly_check_limit?: number | null;
          name: string;
          require_approval_for_differs?: boolean;
          slug: string;
          status?: string;
          telegram_enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          brand_isnad_note?: boolean;
          created_at?: string;
          default_visibility?: Database["public"]["Enums"]["check_visibility"];
          escalate_on_verifier_objection?: boolean;
          id?: string;
          internal?: boolean;
          kind?: Database["public"]["Enums"]["organization_kind"];
          media_retention_days?: number;
          monthly_check_limit?: number | null;
          name?: string;
          require_approval_for_differs?: boolean;
          slug?: string;
          status?: string;
          telegram_enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          last_newsroom_id: string | null;
          locale: Database["public"]["Enums"]["app_locale"];
          notification_prefs: NonNullable<Json>;
          platform_role: Database["public"]["Enums"]["platform_role"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          full_name?: string;
          id: string;
          last_newsroom_id?: string | null;
          locale?: Database["public"]["Enums"]["app_locale"];
          notification_prefs?: NonNullable<Json>;
          platform_role?: Database["public"]["Enums"]["platform_role"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          last_newsroom_id?: string | null;
          locale?: Database["public"]["Enums"]["app_locale"];
          notification_prefs?: NonNullable<Json>;
          platform_role?: Database["public"]["Enums"]["platform_role"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_last_newsroom_fk";
            columns: ["last_newsroom_id"];
            isOneToOne: false;
            referencedRelation: "newsrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      publications: {
        Row: {
          check_id: string;
          created_by: string | null;
          id: string;
          published_at: string;
          url: string;
        };
        ComputedFields: never;
        Insert: {
          check_id: string;
          created_by?: string | null;
          id?: string;
          published_at?: string;
          url: string;
        };
        Update: {
          check_id?: string;
          created_by?: string | null;
          id?: string;
          published_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "publications_check_id_fkey";
            columns: ["check_id"];
            isOneToOne: false;
            referencedRelation: "checks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "publications_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      segments: {
        Row: {
          check_id: string;
          created_at: string;
          edited_at: string | null;
          edited_by: string | null;
          end_ms: number | null;
          id: string;
          idx: number;
          low_confidence: boolean;
          page: number | null;
          speaker: string | null;
          start_ms: number | null;
          text: string;
          words: Json | null;
        };
        ComputedFields: never;
        Insert: {
          check_id: string;
          created_at?: string;
          edited_at?: string | null;
          edited_by?: string | null;
          end_ms?: number | null;
          id?: string;
          idx: number;
          low_confidence?: boolean;
          page?: number | null;
          speaker?: string | null;
          start_ms?: number | null;
          text: string;
          words?: Json | null;
        };
        Update: {
          check_id?: string;
          created_at?: string;
          edited_at?: string | null;
          edited_by?: string | null;
          end_ms?: number | null;
          id?: string;
          idx?: number;
          low_confidence?: boolean;
          page?: number | null;
          speaker?: string | null;
          start_ms?: number | null;
          text?: string;
          words?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "segments_check_id_fkey";
            columns: ["check_id"];
            isOneToOne: false;
            referencedRelation: "checks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "segments_edited_by_fkey";
            columns: ["edited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      source_topics: {
        Row: {
          source_id: string;
          topic_id: string;
        };
        ComputedFields: never;
        Insert: {
          source_id: string;
          topic_id: string;
        };
        Update: {
          source_id?: string;
          topic_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_topics_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "source_topics_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      sources: {
        Row: {
          access_methods: string[];
          created_at: string;
          data_url: string | null;
          description_ar: string | null;
          description_en: string | null;
          domains: string[];
          entity_id: string | null;
          health: Database["public"]["Enums"]["source_health"];
          health_note: string | null;
          homepage_url: string | null;
          id: string;
          languages: string[];
          last_fetched_at: string | null;
          name_ar: string;
          name_en: string;
          newsroom_id: string | null;
          proposal_note: string | null;
          proposed_by: string | null;
          search_text: string | null;
          slug: string;
          status: Database["public"]["Enums"]["source_status"];
          terms_url: string | null;
          tier: number;
          type: string;
          update_frequency: string | null;
          updated_at: string;
          verified_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          access_methods?: string[];
          created_at?: string;
          data_url?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          domains?: string[];
          entity_id?: string | null;
          health?: Database["public"]["Enums"]["source_health"];
          health_note?: string | null;
          homepage_url?: string | null;
          id?: string;
          languages?: string[];
          last_fetched_at?: string | null;
          name_ar: string;
          name_en: string;
          newsroom_id?: string | null;
          proposal_note?: string | null;
          proposed_by?: string | null;
          search_text?: never;
          slug: string;
          status?: Database["public"]["Enums"]["source_status"];
          terms_url?: string | null;
          tier: number;
          type?: string;
          update_frequency?: string | null;
          updated_at?: string;
          verified_at?: string | null;
        };
        Update: {
          access_methods?: string[];
          created_at?: string;
          data_url?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          domains?: string[];
          entity_id?: string | null;
          health?: Database["public"]["Enums"]["source_health"];
          health_note?: string | null;
          homepage_url?: string | null;
          id?: string;
          languages?: string[];
          last_fetched_at?: string | null;
          name_ar?: string;
          name_en?: string;
          newsroom_id?: string | null;
          proposal_note?: string | null;
          proposed_by?: string | null;
          search_text?: never;
          slug?: string;
          status?: Database["public"]["Enums"]["source_status"];
          terms_url?: string | null;
          tier?: number;
          type?: string;
          update_frequency?: string | null;
          updated_at?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sources_entity_id_fkey";
            columns: ["entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sources_newsroom_id_fkey";
            columns: ["newsroom_id"];
            isOneToOne: false;
            referencedRelation: "newsrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sources_proposed_by_fkey";
            columns: ["proposed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_link_tokens: {
        Row: {
          created_at: string;
          expires_at: string;
          token_hash: string;
          used_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          expires_at?: string;
          token_hash: string;
          used_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          token_hash?: string;
          used_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_link_tokens_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_links: {
        Row: {
          chat_id: number;
          linked_at: string;
          newsroom_id: string | null;
          telegram_user_id: number;
          telegram_username: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          chat_id: number;
          linked_at?: string;
          newsroom_id?: string | null;
          telegram_user_id: number;
          telegram_username?: string | null;
          user_id: string;
        };
        Update: {
          chat_id?: number;
          linked_at?: string;
          newsroom_id?: string | null;
          telegram_user_id?: number;
          telegram_username?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_links_newsroom_id_fkey";
            columns: ["newsroom_id"];
            isOneToOne: false;
            referencedRelation: "newsrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telegram_links_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_updates: {
        Row: {
          received_at: string;
          update_id: number;
        };
        ComputedFields: never;
        Insert: {
          received_at?: string;
          update_id: number;
        };
        Update: {
          received_at?: string;
          update_id?: number;
        };
        Relationships: [];
      };
      topics: {
        Row: {
          icon: string;
          id: string;
          name_ar: string;
          name_en: string;
          slug: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          icon?: string;
          id?: string;
          name_ar: string;
          name_en: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          icon?: string;
          id?: string;
          name_ar?: string;
          name_en?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      usage_events: {
        Row: {
          audio_seconds: number;
          cache_read_tokens: number;
          check_id: string | null;
          cost_usd: number;
          created_at: string;
          duration_ms: number | null;
          id: number;
          input_tokens: number;
          model: string | null;
          newsroom_id: string | null;
          output_tokens: number;
          provider: string;
          search_queries: number;
          task: string;
        };
        ComputedFields: never;
        Insert: {
          audio_seconds?: number;
          cache_read_tokens?: number;
          check_id?: string | null;
          cost_usd?: number;
          created_at?: string;
          duration_ms?: number | null;
          id?: never;
          input_tokens?: number;
          model?: string | null;
          newsroom_id?: string | null;
          output_tokens?: number;
          provider: string;
          search_queries?: number;
          task: string;
        };
        Update: {
          audio_seconds?: number;
          cache_read_tokens?: number;
          check_id?: string | null;
          cost_usd?: number;
          created_at?: string;
          duration_ms?: number | null;
          id?: never;
          input_tokens?: number;
          model?: string | null;
          newsroom_id?: string | null;
          output_tokens?: number;
          provider?: string;
          search_queries?: number;
          task?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usage_events_check_id_fkey";
            columns: ["check_id"];
            isOneToOne: false;
            referencedRelation: "checks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_events_newsroom_id_fkey";
            columns: ["newsroom_id"];
            isOneToOne: false;
            referencedRelation: "newsrooms";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: { Args: { raw_token: string }; Returns: string };
      add_source_document: {
        Args: {
          doc_language?: string;
          doc_title: string;
          doc_url?: string;
          published?: string;
          staging_path?: string;
          target_source: string;
        };
        Returns: number;
      };
      approve_check: { Args: { target_check: string }; Returns: undefined };
      approve_figures: { Args: { figure_ids: string[] }; Returns: number };
      approve_matches: { Args: { target_check: string }; Returns: number };
      archive_check: { Args: { target_check: string }; Returns: undefined };
      assign_indicator: {
        Args: { figure_ids: string[]; target_indicator: string };
        Returns: number;
      };
      can_decide_check: { Args: { target_check: string }; Returns: boolean };
      can_edit_check: { Args: { target_check: string }; Returns: boolean };
      can_view_check: { Args: { target_check: string }; Returns: boolean };
      cancel_job: { Args: { target_job: number }; Returns: undefined };
      console_check_costs: {
        Args: Record<PropertyKey, never>;
        Returns: {
          avg_cost: number;
          checks: number;
          input_kind: Database["public"]["Enums"]["input_kind"];
        }[];
      };
      console_job_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          jobs: number;
          kind: string;
          oldest: string;
          status: Database["public"]["Enums"]["job_status"];
        }[];
      };
      console_newsroom_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          checks_this_month: number;
          cost_this_month: number;
          media_minutes_this_month: number;
          members: number;
          newsroom_id: string;
        }[];
      };
      console_usage: {
        Args: { days?: number };
        Returns: {
          cost: number;
          day: string;
          events: number;
          input_tokens: number;
          output_tokens: number;
          task: string;
        }[];
      };
      contains_all_words: { Args: { haystack: string; words: string }; Returns: boolean };
      create_invitation: {
        Args: {
          invite_desk?: string;
          invite_email: string;
          invite_name?: string;
          invite_role?: Database["public"]["Enums"]["member_role"];
          target_newsroom: string;
        };
        Returns: string;
      };
      create_telegram_link_token: { Args: Record<PropertyKey, never>; Returns: string };
      current_platform_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["platform_role"];
      };
      decide_claim: {
        Args: {
          decision: Database["public"]["Enums"]["decision_action"];
          note?: string;
          target_claim: string;
          wording?: string;
        };
        Returns: undefined;
      };
      dismiss_alerts: { Args: { alert_ids: string[] }; Returns: number };
      dismiss_indicator_proposal: { Args: { figure_ids: string[] }; Returns: number };
      enqueue_job: {
        Args: { job_dedupe?: string; job_kind: string; job_payload: Json; job_priority?: number };
        Returns: number;
      };
      fetch_source_now: { Args: { target_source: string }; Returns: number };
      figure_excerpt: { Args: { target_figure: string }; Returns: Json };
      get_public_note: { Args: { slug: string }; Returns: Json };
      has_role: {
        Args: { roles: Database["public"]["Enums"]["member_role"][]; target_newsroom: string };
        Returns: boolean;
      };
      invitation_email: { Args: { raw_token: string }; Returns: string };
      invitation_preview: { Args: { raw_token: string }; Returns: Json };
      is_member: { Args: { target_newsroom: string }; Returns: boolean };
      is_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      join_text: { Args: { parts: string[] }; Returns: string };
      log_activity: {
        Args: {
          action_name: string;
          extra?: Json;
          target: string;
          target_kind: string;
          target_newsroom: string;
        };
        Returns: undefined;
      };
      mark_alerts_read: { Args: { alert_ids?: string[] }; Returns: number };
      my_desk: { Args: { target_newsroom: string }; Returns: string };
      newsroom_activity: {
        Args: {
          before_at?: string;
          only_user?: string;
          page_size?: number;
          target_newsroom: string;
        };
        Returns: {
          action: string;
          at: string;
          details: Json;
          target_id: string;
          target_title: string;
          target_type: string;
          user_id: string;
          user_name: string;
        }[];
      };
      newsroom_members: {
        Args: { target_newsroom: string };
        Returns: {
          desk_id: string;
          desk_name: string;
          email: string;
          full_name: string;
          joined_at: string;
          last_sign_in_at: string;
          role: Database["public"]["Enums"]["member_role"];
          status: Database["public"]["Enums"]["member_status"];
          telegram_linked: boolean;
          telegram_username: string;
          user_id: string;
        }[];
      };
      newsroom_stats: { Args: { target_newsroom: string }; Returns: Json };
      normalize_ar: { Args: { input: string }; Returns: string };
      publish_check: { Args: { target_check: string; url: string }; Returns: string };
      refresh_check_counts: { Args: { target_check: string }; Returns: undefined };
      regenerate_brief: { Args: { target_brief: string }; Returns: undefined };
      registry_search: { Args: { max_rows?: number; query: string }; Returns: Json };
      registry_stats: { Args: Record<PropertyKey, never>; Returns: Json };
      registry_topic_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          figures: number;
          fresh_sources: number;
          icon: string;
          id: string;
          indicators: number;
          last_updated_at: string;
          name_ar: string;
          name_en: string;
          slug: string;
          sort_order: number;
          sources: number;
        }[];
      };
      reject_figures: { Args: { figure_ids: string[]; note?: string }; Returns: number };
      renew_invitation: { Args: { target_invitation: string }; Returns: string };
      request_claim_search: { Args: { target_claim: string }; Returns: undefined };
      request_recheck: { Args: { target_check: string }; Returns: undefined };
      require_newsroom_admin: { Args: { target_newsroom: string }; Returns: undefined };
      require_staff: { Args: Record<PropertyKey, never>; Returns: undefined };
      retry_extraction: { Args: { target_version: string }; Returns: undefined };
      retry_job: { Args: { target_job: number }; Returns: undefined };
      review_source_proposal: {
        Args: { accept: boolean; note?: string; target_source: string };
        Returns: undefined;
      };
      revoke_invitation: { Args: { target_invitation: string }; Returns: undefined };
      send_for_review: { Args: { editor?: string; target_check: string }; Returns: undefined };
      set_member_status: {
        Args: {
          new_status: Database["public"]["Enums"]["member_status"];
          target_newsroom: string;
          target_user: string;
        };
        Returns: undefined;
      };
      shares_newsroom: { Args: { other_user: string }; Returns: boolean };
      sheet_column_index: { Args: { letters: string }; Returns: number };
      source_is_fresh: { Args: { frequency: string; last_fetched: string }; Returns: boolean };
      update_cycle_days: { Args: { frequency: string }; Returns: number };
      update_figure: {
        Args: {
          new_breakdown: string;
          new_decimals: number;
          new_entity: string;
          new_geography: string;
          new_indicator: string;
          new_measure: string;
          new_period_end: string;
          new_period_label: string;
          new_period_start: string;
          new_scale: string;
          new_status: Database["public"]["Enums"]["figure_status"];
          new_unit: string;
          new_value: number;
          target_figure: string;
        };
        Returns: undefined;
      };
      update_member: {
        Args: {
          new_desk?: string;
          new_role: Database["public"]["Enums"]["member_role"];
          target_newsroom: string;
          target_user: string;
        };
        Returns: undefined;
      };
      update_segment: { Args: { new_text: string; target_segment: string }; Returns: undefined };
      url_in_domains: { Args: { allowed: string[]; target_url: string }; Returns: boolean };
    };
    Enums: {
      alert_kind:
        | "figure_revised"
        | "new_release"
        | "new_figure"
        | "review_requested"
        | "check_ready"
        | "check_escalated";
      app_locale: "ar" | "en";
      chain_status: "connected" | "broken";
      check_stage: "queued" | "preparing" | "transcribing" | "extracting" | "checking" | "done";
      check_status:
        | "processing"
        | "awaiting_review"
        | "in_review"
        | "escalated"
        | "approved"
        | "published"
        | "archived"
        | "failed";
      check_visibility: "private" | "desk" | "newsroom";
      claim_review_state: "pending" | "approved" | "edited" | "escalated";
      decision_action:
        | "approve"
        | "edit"
        | "escalate"
        | "reopen"
        | "send_for_review"
        | "approve_check"
        | "publish"
        | "archive"
        | "recheck";
      document_kind: "pdf" | "xlsx" | "csv" | "html" | "docx" | "text";
      entity_kind:
        | "statistics_office"
        | "ministry"
        | "authority"
        | "central_bank"
        | "government_department"
        | "news_agency"
        | "media_office"
        | "open_data_portal"
        | "exchange"
        | "international_org"
        | "other";
      entity_level: "federal" | "emirate" | "international" | "other";
      extraction_status: "pending" | "extracting" | "extracted" | "failed" | "unchanged";
      fetch_origin: "upload" | "schedule" | "discovery" | "seed";
      figure_status: "preliminary" | "final" | "revised";
      follow_target: "indicator" | "entity";
      input_kind: "video" | "audio" | "document" | "text" | "link";
      intake_channel: "web" | "telegram";
      job_status: "queued" | "running" | "done" | "failed" | "cancelled";
      member_role: "journalist" | "editor" | "admin";
      member_status: "active" | "deactivated";
      organization_kind: "newsroom" | "issuer";
      platform_role: "none" | "curator" | "admin";
      review_status: "pending" | "approved" | "rejected";
      source_health: "healthy" | "warning" | "failing" | "unknown";
      source_status: "active" | "paused" | "proposed" | "rejected";
      unit_kind:
        | "count"
        | "currency"
        | "percent"
        | "ratio"
        | "index"
        | "rate"
        | "duration"
        | "area"
        | "volume"
        | "weight"
        | "energy"
        | "other";
      verdict: "match" | "context" | "differs" | "none";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      alert_kind: [
        "figure_revised",
        "new_release",
        "new_figure",
        "review_requested",
        "check_ready",
        "check_escalated",
      ],
      app_locale: ["ar", "en"],
      chain_status: ["connected", "broken"],
      check_stage: ["queued", "preparing", "transcribing", "extracting", "checking", "done"],
      check_status: [
        "processing",
        "awaiting_review",
        "in_review",
        "escalated",
        "approved",
        "published",
        "archived",
        "failed",
      ],
      check_visibility: ["private", "desk", "newsroom"],
      claim_review_state: ["pending", "approved", "edited", "escalated"],
      decision_action: [
        "approve",
        "edit",
        "escalate",
        "reopen",
        "send_for_review",
        "approve_check",
        "publish",
        "archive",
        "recheck",
      ],
      document_kind: ["pdf", "xlsx", "csv", "html", "docx", "text"],
      entity_kind: [
        "statistics_office",
        "ministry",
        "authority",
        "central_bank",
        "government_department",
        "news_agency",
        "media_office",
        "open_data_portal",
        "exchange",
        "international_org",
        "other",
      ],
      entity_level: ["federal", "emirate", "international", "other"],
      extraction_status: ["pending", "extracting", "extracted", "failed", "unchanged"],
      fetch_origin: ["upload", "schedule", "discovery", "seed"],
      figure_status: ["preliminary", "final", "revised"],
      follow_target: ["indicator", "entity"],
      input_kind: ["video", "audio", "document", "text", "link"],
      intake_channel: ["web", "telegram"],
      job_status: ["queued", "running", "done", "failed", "cancelled"],
      member_role: ["journalist", "editor", "admin"],
      member_status: ["active", "deactivated"],
      organization_kind: ["newsroom", "issuer"],
      platform_role: ["none", "curator", "admin"],
      review_status: ["pending", "approved", "rejected"],
      source_health: ["healthy", "warning", "failing", "unknown"],
      source_status: ["active", "paused", "proposed", "rejected"],
      unit_kind: [
        "count",
        "currency",
        "percent",
        "ratio",
        "index",
        "rate",
        "duration",
        "area",
        "volume",
        "weight",
        "energy",
        "other",
      ],
      verdict: ["match", "context", "differs", "none"],
    },
  },
} as const;
