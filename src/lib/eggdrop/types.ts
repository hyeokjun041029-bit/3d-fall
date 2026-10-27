/**
 * EggDrop Lab 공용 타입 정의.
 * 모든 물리량은 내부적으로 SI 단위(m, kg, s, N)를 사용하고,
 * UI 표시 단계에서만 g, mm, ms 등으로 변환한다.
 */

/** 완충재 부착 위치 ID */
export type PositionId =
  | "wrap" // 전체 감싸기
  | "band" // 중간 띠
  | "bottom" // 아래 덧대기
  | "top" // 위 덧대기
  | "side" // 옆면 완충
  | "fill" // 내부 채움
  | "cradle" // 알 받침
  | "frame"; // 외부 프레임

/** 재료별 위치 적용 정보(라벨/두께 재정의 가능) */
export interface MaterialPositionRule {
  /** 해당 재료에 맞춘 위치 표시 이름(없으면 기본 위치 이름 사용) */
  label?: string;
  /** 이 위치에서 단위 수량당 두께(mm) 재정의 */
  unitThicknessMm?: number;
}

export interface Material {
  id: string;
  name: string;
  description: string;
  /** 단위 수량당 질량(g) — 교육용 가정값 */
  unitMassG: number;
  /** 수량 단위(장, 개, 겹, 묶음 등) */
  unit: string;
  /** 단위 수량당 두께(mm) */
  unitThicknessMm: number;
  /** 압축 가능한 정도(0~1): 두께 중 실제로 눌릴 수 있는 비율 */
  compressibility: number;
  /** 단위 1개(1층) 기준 접촉 강성(N/m) — 상대 강성/변형 저항 */
  stiffnessNPerM: number;
  /** 에너지 흡수 계수(0~1): 1회 압축-복원 시 흡수되는 에너지 비율 */
  energyAbsorption: number;
  /** 반발 계수(0~1): energyAbsorption에서 유도 e = √(1 − 흡수율) */
  restitution: number;
  /** 형상 회복률(0~1): 1이면 완전히 복원, 0이면 눌린 채로 남음 */
  recovery: number;
  /** 시각화 색상 */
  color: string;
  /** 시각화 패턴 */
  pattern: "dots" | "hatch" | "cross" | "wave" | "grid" | "solid" | "fiber" | "cells";
  /** 적용 가능한 부착 위치 규칙 */
  positions: Partial<Record<PositionId, MaterialPositionRule>>;
}

/** 재료 구성 한 행 */
export interface MaterialConfig {
  id: string;
  materialId: string;
  position: PositionId;
  quantity: number;
}

export type SurfaceId = "concrete" | "wood" | "grass" | "mat";

export interface SurfaceModel {
  id: SurfaceId;
  name: string;
  description: string;
  /** 바닥 접촉 강성(N/m) — 완충재와 직렬로 결합 */
  stiffnessNPerM: number;
  /** 바닥이 반발에 곱해지는 계수(0~1) */
  restitutionFactor: number;
  /** 마찰 계수 */
  friction: number;
  color: string;
}

export interface DropConditions {
  floors: 2 | 3 | 4 | 5;
  floorHeightM: number;
  eggMassG: number;
  initialTiltDeg: number;
  initialAngularVelocityDegS: number;
  gravity: number;
  airResistance: boolean;
  surface: SurfaceId;
  /** 모델의 계란 껍데기 기준 하중(N) — 교육용 가정값 */
  shellReferenceLoadN: number;
}

export interface ExperimentSetup {
  conditions: DropConditions;
  configs: MaterialConfig[];
}

export type ActualOutcome = "intact" | "cracked" | "broken";

export interface ActualRecord {
  outcome: ActualOutcome;
  memo: string;
  date: string; // YYYY-MM-DD
  actualHeightM: number | null;
  materialsNote: string;
  recordedAt: string;
}

export interface ResultSummary {
  totalMassG: number;
  eggMassG: number;
  packageMassG: number;
  dropHeightM: number;
  impactSpeed: number;
  idealImpactSpeed: number;
  momentum: number;
  kineticEnergy: number;
  contactDurationMs: number;
  averageForceN: number;
  modelPeakForceN: number;
  eggPeakLoadN: number;
  maxCompressionMm: number;
  bottomedOut: boolean;
  reboundSpeed: number;
  maxTiltDeg: number;
  /** 첫 충돌 순간의 기울기(°) */
  impactTiltDeg: number;
  totalRotationDeg: number;
  riskIndex: number;
  riskLevel: RiskLevel;
  cushionEffectPct: number;
}

export type RiskLevel = "low" | "caution" | "high" | "severe";

export interface SavedExperiment {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  setup: ExperimentSetup;
  result: ResultSummary;
  actual: ActualRecord | null;
}
