/**
 * Hand-written mirror of supabase/migrations/20260823000100_gymapp_init.sql.
 *
 * Everything lives in the `gymapp` schema, not `public` — the target project's
 * public schema is shared with three unrelated apps and already has its own
 * `profiles` table. The clients are constructed with `db: { schema: "gymapp" }`
 * and the schema must be in the project's PostgREST exposed schemas.
 *
 * Regenerate with `npm run gen:types` once the project is linked; until then
 * this file is the contract. If you change a migration, change this too.
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
  | "Other sport"
  // M7 / C31. Counts toward the streak and toward the weekly challenge —
  // `weekly_active_minutes` applies no type filter, which was the decision.
  | "Mobility";
export type EventSource = "manual" | "app" | "health_connect" | "healthkit";
export type FriendshipStatus = "pending" | "accepted" | "blocked";

/**
 * M6 — condition-aware programming.
 *
 * These are branched on directly rather than inferred from `sex`: surgical
 * menopause, hysterectomy and trans users all break a sex gate. `sex` decides
 * which questions intake offers; these decide what the plan does.
 *
 * `null` on any of them means "not asked yet", which is deliberately distinct
 * from an explicit "none" — an untested 54-year-old is not the same as one who
 * has been scanned and is clear.
 */
export type MenopauseStage = "pre" | "peri" | "post" | "undisclosed";
export type BoneHealth = "none" | "osteopenia" | "osteoporosis" | "untested";
export type PelvicFloor = "none" | "occasional" | "diagnosed";

/** Medical states. Distinct from `injuries`, which is only a joint filter. */
export type ConditionKey =
  | "hypertension"
  | "type2_diabetes"
  | "oa_knee"
  | "oa_hip"
  | "frozen_shoulder"
  | "tendinopathy";

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
  menopause_stage: MenopauseStage | null;
  bone_health: BoneHealth | null;
  pelvic_floor: PelvicFloor | null;
  conditions: ConditionKey[];
  /** Condition-specific programming is gated on this being set. */
  clinician_cleared_at: string | null;
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
  /** Perimenopause symptom tracking; null when not tracked. */
  flushes: number | null;
  mood: number | null;
};

export type WeightRow = {
  user_id: string;
  date: string;
  kg: number;
  source: EventSource;
  /** Tracks the visceral shift around menopause that BMI cannot see. */
  waist_cm: number | null;
  /** M6 / C25 — function tests. Null means "not measured that day". */
  grip_kg: number | null;
  sit_to_stand: number | null;
  balance_sec: number | null;
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
  gymapp: {
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
};

/** The schema every table and RPC in this app lives in. */
export const DB_SCHEMA = "gymapp" as const;
export type DbSchema = typeof DB_SCHEMA;
