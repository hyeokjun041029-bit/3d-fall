import type { DropConditions, ExperimentSetup, MaterialConfig, SurfaceId, SurfaceModel } from "./types";

/** 바닥 재질 모델 — 교육용 가정값 */
export const SURFACES: Record<SurfaceId, SurfaceModel> = {
  concrete: {
    id: "concrete",
    name: "콘크리트",
    description: "매우 단단해 거의 변형되지 않는 바닥",
    stiffnessNPerM: 5_000_000,
    restitutionFactor: 1,
    friction: 0.6,
    color: "#a8a29e",
  },
  wood: {
    id: "wood",
    name: "나무 마루",
    description: "약간 탄성이 있는 단단한 바닥",
    stiffnessNPerM: 1_200_000,
    restitutionFactor: 0.95,
    friction: 0.45,
    color: "#c08a52",
  },
  grass: {
    id: "grass",
    name: "잔디·흙",
    description: "눌리면서 에너지를 흡수하는 부드러운 지면",
    stiffnessNPerM: 60_000,
    restitutionFactor: 0.55,
    friction: 0.7,
    color: "#65a30d",
  },
  mat: {
    id: "mat",
    name: "체육 매트",
    description: "두꺼운 폼 매트(실제 실험 시 권장 바닥)",
    stiffnessNPerM: 15_000,
    restitutionFactor: 0.5,
    friction: 0.8,
    color: "#2563eb",
  },
};

export const SURFACE_ORDER: SurfaceId[] = ["concrete", "wood", "grass", "mat"];

export const FLOOR_OPTIONS = [2, 3, 4, 5] as const;

/** 입력 범위(검증용) */
export const LIMITS = {
  floorHeightM: { min: 2.4, max: 4.5, step: 0.1 },
  eggMassG: { min: 40, max: 80, step: 1 },
  initialTiltDeg: { min: -90, max: 90, step: 1 },
  initialAngularVelocityDegS: { min: -720, max: 720, step: 10 },
  gravity: { min: 1, max: 25, step: 0.01 },
  shellReferenceLoadN: { min: 5, max: 200, step: 1 },
  quantity: { min: 1, max: 10, step: 1 },
  maxConfigs: 12,
} as const;

export const GRAVITY_PRESETS = [
  { label: "지구", value: 9.81 },
  { label: "화성", value: 3.71 },
  { label: "달", value: 1.62 },
];

export const DEFAULT_CONDITIONS: DropConditions = {
  floors: 2,
  floorHeightM: 3.0,
  eggMassG: 60,
  initialTiltDeg: 10,
  initialAngularVelocityDegS: 0,
  gravity: 9.81,
  airResistance: true,
  surface: "concrete",
  shellReferenceLoadN: 35,
};

let idCounter = 100;
/** 재료 구성 행 ID 생성(결정론적 카운터 기반 — SSR/프리렌더링 안전) */
export function createId(prefix = "cfg"): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** 초기 화면 샘플 실험 구성 */
export function createSampleConfigs(): MaterialConfig[] {
  return [
    { id: "sample-1", materialId: "bubble-wrap", position: "wrap", quantity: 2 },
    { id: "sample-2", materialId: "bubble-wrap", position: "bottom", quantity: 3 },
    { id: "sample-3", materialId: "sponge", position: "side", quantity: 2 },
  ];
}

export function createSampleSetup(): ExperimentSetup {
  return { conditions: { ...DEFAULT_CONDITIONS }, configs: createSampleConfigs() };
}

export function dropHeightM(c: Pick<DropConditions, "floors" | "floorHeightM">): number {
  return Math.round(c.floors * c.floorHeightM * 1000) / 1000;
}
