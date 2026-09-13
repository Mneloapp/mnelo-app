export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          created_at: string;
          error_code: string | null;
          id: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          error_code?: string | null;
          id?: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          error_code?: string | null;
          id?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'account_deletion_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      avatar_uploads: {
        Row: {
          completed_at: string | null;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'avatar_uploads_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      blocks: {
        Row: {
          blocked_user_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          blocked_user_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          blocked_user_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blocks_blocked_user_id_fkey';
            columns: ['blocked_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      call_sessions: {
        Row: {
          accepted_at: string | null;
          caller_id: string | null;
          caller_seen_at: string | null;
          caller_session_id: string | null;
          client_id: string;
          conversation_id: string;
          created_at: string;
          ended_at: string | null;
          expires_at: string;
          id: string;
          media: string;
          observed_at: string | null;
          recipient_id: string | null;
          recipient_seen_at: string | null;
          recipient_session_id: string | null;
          room_ready: boolean;
          status: string;
        };
        Insert: {
          accepted_at?: string | null;
          caller_id?: string | null;
          caller_seen_at?: string | null;
          caller_session_id?: string | null;
          client_id?: string;
          conversation_id: string;
          created_at?: string;
          ended_at?: string | null;
          expires_at?: string;
          id?: string;
          media: string;
          observed_at?: string | null;
          recipient_id?: string | null;
          recipient_seen_at?: string | null;
          recipient_session_id?: string | null;
          room_ready?: boolean;
          status?: string;
        };
        Update: {
          accepted_at?: string | null;
          caller_id?: string | null;
          caller_seen_at?: string | null;
          caller_session_id?: string | null;
          client_id?: string;
          conversation_id?: string;
          created_at?: string;
          ended_at?: string | null;
          expires_at?: string;
          id?: string;
          media?: string;
          observed_at?: string | null;
          recipient_id?: string | null;
          recipient_seen_at?: string | null;
          recipient_session_id?: string | null;
          room_ready?: boolean;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'call_sessions_caller_id_fkey';
            columns: ['caller_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'call_sessions_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'call_sessions_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      connection_completions: {
        Row: {
          connection_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          connection_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          connection_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'connection_completions_connection_id_fkey';
            columns: ['connection_id'];
            isOneToOne: false;
            referencedRelation: 'connections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'connection_completions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      connection_requests: {
        Row: {
          client_id: string | null;
          context: string;
          created_at: string;
          expires_at: string;
          id: string;
          matching_request_id: string | null;
          message: string;
          recipient_id: string;
          responded_at: string | null;
          sender_id: string;
          status: string;
        };
        Insert: {
          client_id?: string | null;
          context: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          matching_request_id?: string | null;
          message?: string;
          recipient_id: string;
          responded_at?: string | null;
          sender_id: string;
          status?: string;
        };
        Update: {
          client_id?: string | null;
          context?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          matching_request_id?: string | null;
          message?: string;
          recipient_id?: string;
          responded_at?: string | null;
          sender_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'connection_requests_matching_request_id_fkey';
            columns: ['matching_request_id'];
            isOneToOne: false;
            referencedRelation: 'matching_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'connection_requests_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'connection_requests_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      connections: {
        Row: {
          completed_at: string | null;
          context: string;
          created_at: string;
          id: string;
          interaction_type: string;
          request_id: string | null;
          user_high: string;
          user_low: string;
        };
        Insert: {
          completed_at?: string | null;
          context?: string;
          created_at?: string;
          id?: string;
          interaction_type?: string;
          request_id?: string | null;
          user_high: string;
          user_low: string;
        };
        Update: {
          completed_at?: string | null;
          context?: string;
          created_at?: string;
          id?: string;
          interaction_type?: string;
          request_id?: string | null;
          user_high?: string;
          user_low?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'connections_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: true;
            referencedRelation: 'connection_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'connections_user_high_fkey';
            columns: ['user_high'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'connections_user_low_fkey';
            columns: ['user_low'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_members: {
        Row: {
          conversation_id: string;
          id: string;
          joined_at: string;
          last_read_at: string;
          last_read_message_id: string | null;
          left_at: string | null;
          role: string;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          id?: string;
          joined_at?: string;
          last_read_at?: string;
          last_read_message_id?: string | null;
          left_at?: string | null;
          role?: string;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          id?: string;
          joined_at?: string;
          last_read_at?: string;
          last_read_message_id?: string | null;
          left_at?: string | null;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_members_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_members_last_read_message_id_fkey';
            columns: ['last_read_message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          avatar_attachment_id: string | null;
          avatar_path: string | null;
          client_id: string | null;
          connection_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          kind: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          avatar_attachment_id?: string | null;
          avatar_path?: string | null;
          client_id?: string | null;
          connection_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind: string;
          title?: string;
          updated_at?: string;
        };
        Update: {
          avatar_attachment_id?: string | null;
          avatar_path?: string | null;
          client_id?: string | null;
          connection_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_avatar_attachment_id_fkey';
            columns: ['avatar_attachment_id'];
            isOneToOne: false;
            referencedRelation: 'message_attachments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_connection_id_fkey';
            columns: ['connection_id'];
            isOneToOne: true;
            referencedRelation: 'connections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      devices: {
        Row: {
          auth_session_id: string;
          created_at: string;
          device_name: string;
          id: string;
          last_active_at: string;
          locale: string;
          os_version: string;
          platform: string;
          revoked_at: string | null;
          user_id: string;
        };
        Insert: {
          auth_session_id: string;
          created_at?: string;
          device_name: string;
          id?: string;
          last_active_at?: string;
          locale?: string;
          os_version: string;
          platform: string;
          revoked_at?: string | null;
          user_id: string;
        };
        Update: {
          auth_session_id?: string;
          created_at?: string;
          device_name?: string;
          id?: string;
          last_active_at?: string;
          locale?: string;
          os_version?: string;
          platform?: string;
          revoked_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'devices_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      matching_candidates: {
        Row: {
          candidate_id: string;
          created_at: string;
          evaluated_at: string;
          expires_at: string;
          id: string;
          matcher_version: string;
          rank_label: string;
          request_id: string;
          score: number;
        };
        Insert: {
          candidate_id: string;
          created_at?: string;
          evaluated_at?: string;
          expires_at?: string;
          id?: string;
          matcher_version?: string;
          rank_label: string;
          request_id: string;
          score: number;
        };
        Update: {
          candidate_id?: string;
          created_at?: string;
          evaluated_at?: string;
          expires_at?: string;
          id?: string;
          matcher_version?: string;
          rank_label?: string;
          request_id?: string;
          score?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'matching_candidates_candidate_id_fkey';
            columns: ['candidate_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'matching_candidates_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'matching_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      matching_reasons: {
        Row: {
          candidate_id: string;
          fact: string;
          id: string;
          signal: string;
          source_id: string | null;
          value_count: number | null;
          value_number: number | null;
        };
        Insert: {
          candidate_id: string;
          fact: string;
          id?: string;
          signal: string;
          source_id?: string | null;
          value_count?: number | null;
          value_number?: number | null;
        };
        Update: {
          candidate_id?: string;
          fact?: string;
          id?: string;
          signal?: string;
          source_id?: string | null;
          value_count?: number | null;
          value_number?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'matching_reasons_candidate_id_fkey';
            columns: ['candidate_id'];
            isOneToOne: false;
            referencedRelation: 'matching_candidates';
            referencedColumns: ['id'];
          },
        ];
      };
      matching_requests: {
        Row: {
          capability_term: string;
          client_id: string | null;
          coarse_area: string;
          confirmed_area: string | null;
          confirmed_capability: string | null;
          created_at: string;
          detail_text: string;
          id: string;
          intent_type: string;
          interpreter_version: string;
          match_key: string;
          mode: string;
          needed_on: string | null;
          raw_text: string;
          request_fingerprint: string | null;
          status: string;
          time_zone: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          capability_term: string;
          client_id?: string | null;
          coarse_area?: string;
          confirmed_area?: string | null;
          confirmed_capability?: string | null;
          created_at?: string;
          detail_text?: string;
          id?: string;
          intent_type: string;
          interpreter_version?: string;
          match_key: string;
          mode: string;
          needed_on?: string | null;
          raw_text: string;
          request_fingerprint?: string | null;
          status?: string;
          time_zone?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          capability_term?: string;
          client_id?: string | null;
          coarse_area?: string;
          confirmed_area?: string | null;
          confirmed_capability?: string | null;
          created_at?: string;
          detail_text?: string;
          id?: string;
          intent_type?: string;
          interpreter_version?: string;
          match_key?: string;
          mode?: string;
          needed_on?: string | null;
          raw_text?: string;
          request_fingerprint?: string | null;
          status?: string;
          time_zone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'matching_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      message_attachments: {
        Row: {
          byte_size: number;
          client_id: string | null;
          conversation_id: string;
          created_at: string;
          duration_seconds: number | null;
          file_name: string;
          id: string;
          mime_type: string;
          object_path: string;
          processing_started_at: string | null;
          processing_token: string | null;
          purpose: string;
          status: string;
          user_id: string;
        };
        Insert: {
          byte_size: number;
          client_id?: string | null;
          conversation_id: string;
          created_at?: string;
          duration_seconds?: number | null;
          file_name: string;
          id?: string;
          mime_type: string;
          object_path: string;
          processing_started_at?: string | null;
          processing_token?: string | null;
          purpose?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          byte_size?: number;
          client_id?: string | null;
          conversation_id?: string;
          created_at?: string;
          duration_seconds?: number | null;
          file_name?: string;
          id?: string;
          mime_type?: string;
          object_path?: string;
          processing_started_at?: string | null;
          processing_token?: string | null;
          purpose?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_attachments_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_attachments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      message_contacts: {
        Row: {
          id: string;
          message_id: string;
          profile_id: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          profile_id: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_contacts_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: true;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_contacts_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      message_locations: {
        Row: {
          id: string;
          label: string;
          latitude: number;
          longitude: number;
          message_id: string;
        };
        Insert: {
          id?: string;
          label?: string;
          latitude: number;
          longitude: number;
          message_id: string;
        };
        Update: {
          id?: string;
          label?: string;
          latitude?: number;
          longitude?: number;
          message_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_locations_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: true;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
        ];
      };
      message_reactions: {
        Row: {
          active: boolean;
          conversation_id: string;
          created_at: string;
          emoji: string;
          id: string;
          message_id: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          conversation_id: string;
          created_at?: string;
          emoji: string;
          id?: string;
          message_id: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          conversation_id?: string;
          created_at?: string;
          emoji?: string;
          id?: string;
          message_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_reactions_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_reactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reaction_message_conversation';
            columns: ['message_id', 'conversation_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id', 'conversation_id'];
          },
        ];
      };
      messages: {
        Row: {
          attachment_id: string | null;
          body: string;
          call_session_id: string | null;
          client_id: string;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          kind: string;
          reply_to: string | null;
          sender_id: string | null;
        };
        Insert: {
          attachment_id?: string | null;
          body?: string;
          call_session_id?: string | null;
          client_id: string;
          conversation_id: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          kind: string;
          reply_to?: string | null;
          sender_id?: string | null;
        };
        Update: {
          attachment_id?: string | null;
          body?: string;
          call_session_id?: string | null;
          client_id?: string;
          conversation_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          kind?: string;
          reply_to?: string | null;
          sender_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'message_attachment_conversation';
            columns: ['attachment_id', 'conversation_id'];
            isOneToOne: false;
            referencedRelation: 'message_attachments';
            referencedColumns: ['id', 'conversation_id'];
          },
          {
            foreignKeyName: 'messages_attachment_fk';
            columns: ['attachment_id'];
            isOneToOne: true;
            referencedRelation: 'message_attachments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_call_session_id_fkey';
            columns: ['call_session_id'];
            isOneToOne: true;
            referencedRelation: 'call_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_reply_to_conversation_id_fkey';
            columns: ['reply_to', 'conversation_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id', 'conversation_id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_preferences: {
        Row: {
          calls: boolean;
          id: string;
          matches: boolean;
          messages: boolean;
          previews: boolean;
          requests: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          calls?: boolean;
          id?: string;
          matches?: boolean;
          messages?: boolean;
          previews?: boolean;
          requests?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          calls?: boolean;
          id?: string;
          matches?: boolean;
          messages?: boolean;
          previews?: boolean;
          requests?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      privacy_settings: {
        Row: {
          discoverability: string;
          exact_location: string;
          id: string;
          phone_visibility: string;
          request_audience: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          discoverability?: string;
          exact_location?: string;
          id?: string;
          phone_visibility?: string;
          request_audience?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          discoverability?: string;
          exact_location?: string;
          id?: string;
          phone_visibility?: string;
          request_audience?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'privacy_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profile_languages: {
        Row: {
          id: string;
          language_code: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          language_code: string;
          user_id: string;
        };
        Update: {
          id?: string;
          language_code?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profile_languages_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          available_today: boolean;
          available_until: string | null;
          avatar_path: string | null;
          bio: string;
          coarse_area: string;
          created_at: string;
          display_name: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          available_today?: boolean;
          available_until?: string | null;
          avatar_path?: string | null;
          bio?: string;
          coarse_area?: string;
          created_at?: string;
          display_name: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          available_today?: boolean;
          available_until?: string | null;
          avatar_path?: string | null;
          bio?: string;
          coarse_area?: string;
          created_at?: string;
          display_name?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          created_at: string;
          device_id: string;
          disabled_at: string | null;
          id: string;
          token: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device_id: string;
          disabled_at?: string | null;
          id?: string;
          token: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          device_id?: string;
          disabled_at?: string | null;
          id?: string;
          token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_token_device_owner';
            columns: ['device_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'push_tokens_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: true;
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'push_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      reports: {
        Row: {
          client_id: string | null;
          created_at: string;
          detail: string;
          id: string;
          message_id: string | null;
          reason: string;
          reporter_id: string;
          status: string;
          subject_id: string;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          detail?: string;
          id?: string;
          message_id?: string | null;
          reason: string;
          reporter_id: string;
          status?: string;
          subject_id: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          detail?: string;
          id?: string;
          message_id?: string | null;
          reason?: string;
          reporter_id?: string;
          status?: string;
          subject_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_subject_id_fkey';
            columns: ['subject_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      reserved_usernames: {
        Row: {
          created_at: string;
          id: string;
          reason: string;
          username: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          reason: string;
          username: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          reason?: string;
          username?: string;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          author_id: string;
          comment: string;
          connection_id: string;
          created_at: string;
          id: string;
          rating: number;
          status: string;
          subject_id: string;
        };
        Insert: {
          author_id: string;
          comment?: string;
          connection_id: string;
          created_at?: string;
          id?: string;
          rating: number;
          status?: string;
          subject_id: string;
        };
        Update: {
          author_id?: string;
          comment?: string;
          connection_id?: string;
          created_at?: string;
          id?: string;
          rating?: number;
          status?: string;
          subject_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reviews_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_connection_id_fkey';
            columns: ['connection_id'];
            isOneToOne: false;
            referencedRelation: 'connections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_subject_id_fkey';
            columns: ['subject_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_access_state: {
        Row: {
          id: string;
          revision: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          revision?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_access_state_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_capabilities: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          match_key: string;
          normalized_term: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          id?: string;
          match_key: string;
          normalized_term: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          match_key?: string;
          normalized_term?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_capabilities_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_needs: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          matching_request_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          id?: string;
          matching_request_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          matching_request_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_needs_matching_request_id_fkey';
            columns: ['matching_request_id'];
            isOneToOne: true;
            referencedRelation: 'matching_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_needs_request_owner';
            columns: ['matching_request_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'matching_requests';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'user_needs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_offers: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          matching_request_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          id?: string;
          matching_request_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          matching_request_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_offers_matching_request_id_fkey';
            columns: ['matching_request_id'];
            isOneToOne: true;
            referencedRelation: 'matching_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_offers_request_owner';
            columns: ['matching_request_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'matching_requests';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'user_offers_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      usernames: {
        Row: {
          created_at: string;
          id: string;
          user_id: string;
          username: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          user_id: string;
          username: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          user_id?: string;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'usernames_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      verification_status: {
        Row: {
          expires_at: string | null;
          id: string;
          user_id: string;
          verification_type: string;
          verified_at: string;
        };
        Insert: {
          expires_at?: string | null;
          id?: string;
          user_id: string;
          verification_type: string;
          verified_at: string;
        };
        Update: {
          expires_at?: string | null;
          id?: string;
          user_id?: string;
          verification_type?: string;
          verified_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'verification_status_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      account_deletion_ready: {
        Args: { job: string; lease: string };
        Returns: boolean;
      };
      active_call_rooms: {
        Args: never;
        Returns: {
          caller_id: string;
          id: string;
          recipient_id: string;
        }[];
      };
      add_group_member: {
        Args: { conversation: string; target: string };
        Returns: undefined;
      };
      begin_account_deletion: {
        Args: { receipt_hash: string };
        Returns: string;
      };
      block_user: { Args: { target: string }; Returns: undefined };
      call_token_context: {
        Args: { call: string };
        Returns: {
          actor_id: string;
          id: string;
          media: string;
        }[];
      };
      claim_account_deletion: {
        Args: never;
        Returns: {
          id: string;
          lease: string;
          user_id: string;
        }[];
      };
      claim_attachment: {
        Args: { actor: string; attachment: string };
        Returns: {
          byte_size: number;
          client_id: string | null;
          conversation_id: string;
          created_at: string;
          duration_seconds: number | null;
          file_name: string;
          id: string;
          mime_type: string;
          object_path: string;
          processing_started_at: string | null;
          processing_token: string | null;
          purpose: string;
          status: string;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'message_attachments';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      claim_call_cleanup: {
        Args: never;
        Returns: {
          call_id: string;
          caller_id: string;
          id: string;
          lease: string;
          recipient_id: string;
        }[];
      };
      claim_push_work: {
        Args: never;
        Returns: {
          delivery_id: string;
          event_type: string;
          lease: string;
          locale: string;
          target_id: string;
          ticket_id: string;
          token: string;
          ttl: number;
        }[];
      };
      complete_attachment: {
        Args: {
          actor: string;
          actual_bytes: number;
          actual_duration?: number;
          actual_mime: string;
          attachment: string;
          claim: string;
        };
        Returns: undefined;
      };
      complete_avatar: {
        Args: { actor: string; reservation: string };
        Returns: string;
      };
      completed_connections: {
        Args: { before_id?: string; before_time?: string };
        Returns: {
          comment: string;
          completed_at: string;
          confirmed_by_me: boolean;
          confirmed_by_peer: boolean;
          context: string;
          conversation_id: string;
          display_name: string;
          id: string;
          interaction_type: string;
          peer_id: string;
          rating: number;
          review_id: string;
          username: string;
        }[];
      };
      confirm_connection_completion: {
        Args: { connection: string };
        Returns: undefined;
      };
      connection_details: {
        Args: { conversation: string };
        Returns: {
          comment: string;
          completed_at: string;
          confirmed_by_me: boolean;
          confirmed_by_peer: boolean;
          context: string;
          conversation_id: string;
          display_name: string;
          id: string;
          interaction_type: string;
          peer_id: string;
          rating: number;
          review_id: string;
          username: string;
        }[];
      };
      connection_state: {
        Args: { matching_request?: string; target: string };
        Returns: {
          can_request: boolean;
          connected: boolean;
          context: string;
          conversation_id: string;
          incoming: boolean;
          pending_request_id: string;
        }[];
      };
      consume_connect_attempt: { Args: never; Returns: undefined };
      create_group: {
        Args: { client_id: string; members: string[]; name: string };
        Returns: string;
      };
      current_device: {
        Args: never;
        Returns: {
          created_at: string;
          id: string;
          is_current: boolean;
          label: string;
          last_active_at: string;
          os_version: string;
          platform: string;
        }[];
      };
      defer_account_deletion: {
        Args: { job: string; lease: string };
        Returns: undefined;
      };
      delete_own_message: { Args: { message: string }; Returns: undefined };
      deletion_objects: {
        Args: { job: string; lease: string };
        Returns: {
          bucket: string;
          id: string;
          object_path: string;
        }[];
      };
      deletion_receipt_status: {
        Args: { receipt_hash: string };
        Returns: string;
      };
      deletion_retention_objects: {
        Args: never;
        Returns: {
          bucket: string;
          job_id: string;
          object_path: string;
        }[];
      };
      direct_conversation: { Args: { target: string }; Returns: string };
      disable_current_push: { Args: never; Returns: undefined };
      find_matches: {
        Args: { request: string };
        Returns: {
          candidate_id: string;
          fact: string;
          profile: Database['public']['CompositeTypes']['profile_summary'];
          rank_label: string;
          signal: string;
          value_count: number;
          value_number: number;
        }[];
      };
      finish_account_deletion: {
        Args: { completed: boolean; job: string; lease: string };
        Returns: undefined;
      };
      finish_call_cleanup: {
        Args: { lease: string; work: string };
        Returns: undefined;
      };
      finish_push_work: {
        Args: {
          delivery: string;
          lease: string;
          outcome: string;
          ticket?: string;
        };
        Returns: undefined;
      };
      forward_structured_message: {
        Args: { client_id: string; destination: string; source: string };
        Returns: {
          attachment_id: string | null;
          body: string;
          call_session_id: string | null;
          client_id: string;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          kind: string;
          reply_to: string | null;
          sender_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      get_call: {
        Args: { call: string };
        Returns: {
          accepted_at: string;
          can_join: boolean;
          conversation_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          incoming: boolean;
          media: string;
          peer_id: string;
          peer_name: string;
          status: string;
        }[];
      };
      get_conversation: {
        Args: { conversation: string };
        Returns: {
          id: string;
          kind: string;
          last_message_kind: string;
          member_ids: string[];
          preview: string;
          title: string;
          unread_count: number;
          updated_at: string;
        }[];
      };
      get_group: {
        Args: { conversation: string };
        Returns: {
          avatar_attachment_id: string;
          display_name: string;
          id: string;
          joined_at: string;
          member_id: string;
          role: string;
          title: string;
          username: string;
        }[];
      };
      get_message_contacts: {
        Args: { message_ids: string[] };
        Returns: {
          display_name: string;
          message_id: string;
          username: string;
        }[];
      };
      get_message_reactions: {
        Args: { message_ids: string[] };
        Returns: {
          message_id: string;
          reactions: Json;
        }[];
      };
      get_messages: {
        Args: { before_id?: string; before_time?: string; conversation: string };
        Returns: {
          attachment_id: string | null;
          body: string;
          call_session_id: string | null;
          client_id: string;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          kind: string;
          reply_to: string | null;
          sender_id: string | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_profile: {
        Args: { target: string };
        Returns: Database['public']['CompositeTypes']['profile_summary'][];
        SetofOptions: {
          from: '*';
          to: 'profile_summary';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_profile_intents: {
        Args: { target: string };
        Returns: {
          capability: string;
          coarse_area: string;
          id: string;
          mode: string;
          needed_on: string;
        }[];
      };
      incoming_call: { Args: never; Returns: string };
      leave_group: { Args: { conversation: string }; Returns: undefined };
      list_blocked_profiles: {
        Args: { before_id?: string; before_time?: string };
        Returns: {
          created_at: string;
          display_name: string;
          id: string;
          user_id: string;
          username: string;
        }[];
      };
      list_connection_requests: {
        Args: { before_id?: string; before_time?: string };
        Returns: {
          client_id: string | null;
          context: string;
          created_at: string;
          expires_at: string;
          id: string;
          matching_request_id: string | null;
          message: string;
          recipient_id: string;
          responded_at: string | null;
          sender_id: string;
          status: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'connection_requests';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      list_connections: {
        Args: { query?: string };
        Returns: Database['public']['CompositeTypes']['profile_summary'][];
        SetofOptions: {
          from: '*';
          to: 'profile_summary';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      list_conversations: {
        Args: { before_id?: string; before_time?: string };
        Returns: {
          id: string;
          kind: string;
          last_message_kind: string;
          member_ids: string[];
          preview: string;
          title: string;
          unread_count: number;
          updated_at: string;
        }[];
      };
      list_devices: {
        Args: { before_id?: string; before_time?: string };
        Returns: {
          created_at: string;
          id: string;
          is_current: boolean;
          label: string;
          last_active_at: string;
          os_version: string;
          platform: string;
        }[];
      };
      list_my_needs: {
        Args: { before_id?: string; before_time?: string };
        Returns: {
          capability_term: string;
          client_id: string | null;
          coarse_area: string;
          confirmed_area: string | null;
          confirmed_capability: string | null;
          created_at: string;
          detail_text: string;
          id: string;
          intent_type: string;
          interpreter_version: string;
          match_key: string;
          mode: string;
          needed_on: string | null;
          raw_text: string;
          request_fingerprint: string | null;
          status: string;
          time_zone: string;
          updated_at: string;
          user_id: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'matching_requests';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      manage_group_member: {
        Args: { action: string; conversation: string; target: string };
        Returns: undefined;
      };
      mark_call_room_ready: { Args: { call: string }; Returns: boolean };
      mark_conversation_read: {
        Args: { conversation: string; through_message: string };
        Returns: undefined;
      };
      mark_deletion_objects: {
        Args: { job: string; lease: string; objects: string[] };
        Returns: undefined;
      };
      observe_call_participants: {
        Args: { call: string; identities: string[] };
        Returns: undefined;
      };
      prepare_account_deletion: {
        Args: { job: string; lease: string };
        Returns: boolean;
      };
      profile_phone: { Args: { target: string }; Returns: string };
      profile_reviews: {
        Args: { before_id?: string; before_time?: string; target: string };
        Returns: {
          comment: string;
          created_at: string;
          id: string;
          interaction_type: string;
          own: boolean;
          rating: number;
        }[];
      };
      profile_verifications: {
        Args: { target: string };
        Returns: {
          expires_at: string;
          verification_type: string;
          verified_at: string;
        }[];
      };
      publish_matching_request: {
        Args: {
          actor: string;
          capability_term: string;
          client_id: string;
          coarse_area: string;
          confirmed_area?: string;
          confirmed_capability?: string;
          detail_text: string;
          fingerprint: string;
          intent_type: string;
          mode: string;
          needed_on: string;
          raw_text: string;
          time_zone: string;
        };
        Returns: {
          capability_term: string;
          client_id: string | null;
          coarse_area: string;
          confirmed_area: string | null;
          confirmed_capability: string | null;
          created_at: string;
          detail_text: string;
          id: string;
          intent_type: string;
          interpreter_version: string;
          match_key: string;
          mode: string;
          needed_on: string | null;
          raw_text: string;
          request_fingerprint: string | null;
          status: string;
          time_zone: string;
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'matching_requests';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      purge_deletion_receipts: { Args: never; Returns: undefined };
      push_payload: {
        Args: { delivery: string; lease: string };
        Returns: string;
      };
      register_device: {
        Args: {
          device_name: string;
          locale?: string;
          os_version: string;
          platform: string;
        };
        Returns: string;
      };
      register_push_token: {
        Args: { device: string; push_token: string };
        Returns: undefined;
      };
      release_attachment_claim: {
        Args: { actor: string; attachment: string; claim: string };
        Returns: undefined;
      };
      rename_group: {
        Args: { conversation: string; name: string };
        Returns: undefined;
      };
      reserve_attachment: {
        Args: {
          byte_size: number;
          client_id: string;
          conversation: string;
          duration_seconds?: number;
          file_name: string;
          mime_type: string;
        };
        Returns: {
          byte_size: number;
          client_id: string | null;
          conversation_id: string;
          created_at: string;
          duration_seconds: number | null;
          file_name: string;
          id: string;
          mime_type: string;
          object_path: string;
          processing_started_at: string | null;
          processing_token: string | null;
          purpose: string;
          status: string;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'message_attachments';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reserve_avatar: { Args: never; Returns: string };
      resolve_notification: {
        Args: { notification: string };
        Returns: {
          event_type: string;
          target_id: string;
        }[];
      };
      resolve_report: {
        Args: { actor_reference: string; outcome: string; report: string };
        Returns: undefined;
      };
      respond_call: {
        Args: { action: string; call: string };
        Returns: undefined;
      };
      respond_connection_request: {
        Args: { action: string; request: string };
        Returns: string;
      };
      save_profile: {
        Args: {
          bio?: string;
          capabilities?: string[];
          coarse_area?: string;
          display_name: string;
          username: string;
        };
        Returns: string;
      };
      search_profiles: {
        Args: { query: string };
        Returns: Database['public']['CompositeTypes']['profile_summary'][];
        SetofOptions: {
          from: '*';
          to: 'profile_summary';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      send_attachment_message: {
        Args: { attachment: string; caption: string; client_id: string };
        Returns: {
          attachment_id: string | null;
          body: string;
          call_session_id: string | null;
          client_id: string;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          kind: string;
          reply_to: string | null;
          sender_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      send_connection_request: {
        Args: {
          client_id?: string;
          context: string;
          matching_request?: string;
          message?: string;
          target: string;
        };
        Returns: string;
      };
      send_contact_message: {
        Args: { client_id: string; contact: string; conversation: string };
        Returns: {
          attachment_id: string | null;
          body: string;
          call_session_id: string | null;
          client_id: string;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          kind: string;
          reply_to: string | null;
          sender_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      send_location_message: {
        Args: {
          client_id: string;
          conversation: string;
          label: string;
          latitude: number;
          longitude: number;
        };
        Returns: {
          attachment_id: string | null;
          body: string;
          call_session_id: string | null;
          client_id: string;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          kind: string;
          reply_to: string | null;
          sender_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      send_text_message: {
        Args: {
          client_id: string;
          conversation: string;
          reply_to?: string;
          text_body: string;
        };
        Returns: {
          attachment_id: string | null;
          body: string;
          call_session_id: string | null;
          client_id: string;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          kind: string;
          reply_to: string | null;
          sender_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      session_active: { Args: never; Returns: boolean };
      set_group_avatar: {
        Args: { attachment?: string; conversation: string };
        Returns: undefined;
      };
      set_need_status: {
        Args: { request: string; status: string };
        Returns: undefined;
      };
      start_call: {
        Args: { client_id: string; conversation: string; media: string };
        Returns: string;
      };
      submit_connection_review: {
        Args: { comment?: string; connection: string; rating: number };
        Returns: string;
      };
      submit_report: {
        Args: {
          client_id?: string;
          detail?: string;
          message?: string;
          reason: string;
          target: string;
        };
        Returns: string;
      };
      toggle_message_reaction: {
        Args: { emoji: string; message: string };
        Returns: undefined;
      };
      unblock_user: { Args: { target: string }; Returns: undefined };
      update_notification_preferences: {
        Args: {
          calls: boolean;
          matches: boolean;
          messages: boolean;
          requests: boolean;
        };
        Returns: undefined;
      };
      update_privacy: {
        Args: {
          discoverability: string;
          phone_visibility: string;
          request_audience: string;
        };
        Returns: undefined;
      };
      update_profile_preferences: {
        Args: {
          available_today: boolean;
          languages: string[];
          time_zone?: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      profile_summary: {
        id: string | null;
        display_name: string | null;
        username: string | null;
        bio: string | null;
        coarse_area: string | null;
        avatar_path: string | null;
        available_today: boolean | null;
        capabilities: string[] | null;
        languages: string[] | null;
        verified: boolean | null;
        review_count: number | null;
        average_rating: number | null;
      };
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
