import type { SavedExperiment } from "./types";

/**
 * Supabase 연동 상태 및 인증 기반 원격 저장소 어댑터.
 *
 * 설계 원칙:
 * 1. 현재 저장소에는 기존 Supabase 클라이언트나 인증 세션이 없으므로 기본 저장소는 브라우저 `localStorage`이다.
 * 2. 인증 없이 모든 사용자에게 DB 읽기/쓰기를 허용하는 정책(`anon` 전체 허용)은 만들지 않는다.
 * 3. 향후 Supabase Auth가 활성화되어 `accessToken`이 제공되면 이 어댑터를 통해
 *    `public.eggdrop_experiments` 테이블(RLS: `auth.uid() = user_id`)과 동기화할 수 있다.
 */

export interface SupabaseEnvStatus {
  configured: boolean;
  url: string | null;
  hasAnonKey: boolean;
  modeLabel: string;
}

export function getSupabaseEnvStatus(): SupabaseEnvStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    null;
  const configured = Boolean(url && anonKey);
  return {
    configured,
    url,
    hasAnonKey: Boolean(anonKey),
    modeLabel: configured
      ? "브라우저 저장소 활성 (Supabase 환경변수 감지됨 · 인증 세션 대기)"
      : "브라우저 로컬 저장소 (localStorage)",
  };
}

export interface SupabaseExperimentRow {
  id: string;
  user_id: string;
  name: string;
  floors: number;
  floor_height_m: number;
  drop_height_m: number;
  egg_mass_g: number;
  conditions: SavedExperiment["setup"]["conditions"];
  configs: SavedExperiment["setup"]["configs"];
  result: SavedExperiment["result"];
  actual: SavedExperiment["actual"];
  created_at: string;
  updated_at: string;
}

export function toSupabaseRowPayload(exp: SavedExperiment, userId: string): Omit<SupabaseExperimentRow, "created_at" | "updated_at"> {
  return {
    id: exp.id,
    user_id: userId,
    name: exp.name,
    floors: exp.setup.conditions.floors,
    floor_height_m: exp.setup.conditions.floorHeightM,
    drop_height_m: exp.result.dropHeightM,
    egg_mass_g: exp.setup.conditions.eggMassG,
    conditions: exp.setup.conditions,
    configs: exp.setup.configs,
    result: exp.result,
    actual: exp.actual,
  };
}

export function fromSupabaseRow(row: SupabaseExperimentRow): SavedExperiment {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    setup: {
      conditions: row.conditions,
      configs: row.configs,
    },
    result: row.result,
    actual: row.actual,
  };
}
