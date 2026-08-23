/**
 * Hand-written mirror of supabase/migrations/20260823000100_init.sql.
 *
 * Regenerate with `npm run gen:types` once the project is linked; until then
 * this file is the contract. If you change a migration, change this too — the
 * schema test in src/lib/domain/__tests__ only checks the shapes the app uses,
 * not that they match the database.
 */

export type Goal = "muscle" | "fat" | "strength" | "endurance" | "general";
export type Level = "beginner" | "intermediate" | "advanced";
export type Kit = "bw" | "dbbw";
export type PrefTime = "morning" | "lunch" | "evening";
export type SessionLen = 10 | 20 | 30 | 45 | 60;
export type MuscleKey =
  | "chest"
  | "back"
  | "legs"
  | "shoulders"
  | "arms"
  | "core"
  | "full";
export type DietaryKey = "veg" | "lf" | "gf" | "nf";
export type InjuryKey = "knee" | "shoulder" | "back" | "wrist";
export type EventType =
  | "Workout"
  | "Walk"
  | "Ride"
  | "Run"
  | "Swim"
  | "Squash"
  | "Tennis"
  | "Other sport";
export type EventSource = "manual" | "app" | "health_connect" | "healthkit";
export type FriendshipStatus = "pending" | "accepted" | "blocked";

export type ProfileRow = {
  id: string;
  display_name: string | null;
  handle: string | null;
  goal: Goal;
  muscles: MuscleKey[];
  level: Level;
  kit: Kit;
  session_len: SessionLen;
  avail_days: number[];
  pref_time: PrefTime;
  dietary: DietaryKey[];
  injuries: InjuryKey[];
  height_cm: number | null;
  age: number | null;
  sex: "m" | "f" | null;
  mobility: boolean[];
  disclaimer_accepted_at: string | null;
  disclaimer_version: string | null;
  intake_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EventRow = {
  id: string;
  user_id: string;
  date: string;
  type: EventType;
  minutes: number;
  avg_hr: number | null;
  distance_km: number | null;
  source: EventSource;
  external_id: string | null;
  created_at: string;
};

export type CheckinRow = {
  user_id: string;
  date: string;
  sleep: number;
  stress: number;
  energy: number;
};

export type WeightRow = {
  user_id: string;
  date: string;
  kg: number;
  source: EventSource;
};

export type HydrationRow = {
  user_id: string;
  date: string;
  ml: number;
};

export type FriendshipRow = {
  requester: string;
  addressee: string;
  status: FriendshipStatus;
  created_at: string;
};

export type ChallengeRow = {
  id: string;
  week_start: string;
  metric: string;
  target: number;
};

export type ChallengeMemberRow = {
  challenge_id: string;
  user_id: string;
  joined_at: string;
};

export type SearchProfileResult = {
  id: string;
  display_name: string | null;
  handle: string | null;
};

export type LeaderboardRow = {
  user_id: string;
  display_name: string | null;
  handle: string | null;
  minutes: number;
};

type Table<Row, Insert = Row, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        Partial<ProfileRow> & { id: string },
        Partial<ProfileRow>
      >;
      events: Table<
        EventRow,
        Omit<EventRow, "created_at"> & { created_at?: string }
      >;
      checkins: Table<CheckinRow>;
      weights: Table<WeightRow, Omit<WeightRow, "source"> & { source?: string }>;
      hydration: Table<HydrationRow>;
      friendships: Table<
        FriendshipRow,
        Omit<FriendshipRow, "created_at" | "status"> & {
          created_at?: string;
          status?: FriendshipStatus;
        }
      >;
      challenges: Table<ChallengeRow>;
      challenge_members: Table<
        ChallengeMemberRow,
        Omit<ChallengeMemberRow, "joined_at"> & { joined_at?: string }
      >;
    };
    Views: {
      weekly_active_minutes: {
        Row: { user_id: string; week_start: string; minutes: number };
        Relationships: [];
      };
    };
    Functions: {
      search_profiles: {
        Args: { q: string };
        Returns: SearchProfileResult[];
      };
      friend_leaderboard: {
        Args: { week_start: string };
        Returns: LeaderboardRow[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
