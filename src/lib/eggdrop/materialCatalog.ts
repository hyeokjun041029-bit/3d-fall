import type { Material, MaterialPositionRule, PositionId } from "./types";

/**
 * 완충재 카탈로그(15종).
 *
 * ⚠️ 모든 물성값은 실제 측정값이 아니라 교육용 예시(모델 가정값)이다.
 * 재료 비교 경향을 보여주기 위한 상대적인 값이며, 실험 결과에 맞춰 조정할 수 있다.
 *
 * - stiffnessNPerM: 계란 크기의 접촉면에서 단위 1개(1층)를 눌렀을 때의 근사 강성
 * - compressibility: 두께 중 실제로 압축될 수 있는 비율(나머지는 완전히 눌린 뒤 남는 두께)
 * - energyAbsorption: 1회 압축-복원 동안 흡수되는 에너지 비율(감쇠로 변환됨)
 * - restitution: 흡수율에서 유도한 반발 계수 e = √(1 − 흡수율)
 * - recovery: 충돌 후 형상 회복률(골판지·종이컵처럼 찌그러지는 재료는 낮음)
 */

type MaterialInput = Omit<Material, "restitution">;

function defineMaterial(input: MaterialInput): Material {
  const restitution = Math.sqrt(Math.max(0, 1 - input.energyAbsorption));
  return { ...input, restitution: Math.round(restitution * 1000) / 1000 };
}

const SOFT_LAYER_POSITIONS: Partial<Record<PositionId, MaterialPositionRule>> = {
  wrap: {},
  band: {},
  bottom: {},
  top: {},
  side: {},
};

export const MATERIAL_CATALOG: Material[] = [
  defineMaterial({
    id: "bubble-wrap",
    name: "뽁뽁이(에어캡)",
    description: "공기 방울이 눌리며 충격을 흡수하는 포장재. 얇지만 겹쳐 쓰기 쉽다.",
    unitMassG: 1.2,
    unit: "겹",
    unitThicknessMm: 4,
    compressibility: 0.8,
    stiffnessNPerM: 9000,
    energyAbsorption: 0.6,
    recovery: 0.85,
    color: "#7dd3fc",
    pattern: "dots",
    positions: { ...SOFT_LAYER_POSITIONS },
  }),
  defineMaterial({
    id: "sponge",
    name: "스펀지",
    description: "기공이 많은 탄성 폼. 두껍고 부드러워 압축 거리가 길다.",
    unitMassG: 2,
    unit: "개",
    unitThicknessMm: 20,
    compressibility: 0.75,
    stiffnessNPerM: 2500,
    energyAbsorption: 0.55,
    recovery: 0.95,
    color: "#fde047",
    pattern: "cells",
    positions: { ...SOFT_LAYER_POSITIONS },
  }),
  defineMaterial({
    id: "eva-foam",
    name: "EVA 폼 시트",
    description: "치밀한 발포 시트. 단단한 편이며 형상이 잘 회복된다.",
    unitMassG: 3,
    unit: "장",
    unitThicknessMm: 5,
    compressibility: 0.5,
    stiffnessNPerM: 30000,
    energyAbsorption: 0.5,
    recovery: 0.95,
    color: "#c4b5fd",
    pattern: "solid",
    positions: { ...SOFT_LAYER_POSITIONS },
  }),
  defineMaterial({
    id: "corrugated",
    name: "골판지",
    description: "골 구조가 찌그러지며 에너지를 흡수한다. 판·프레임 구조에 적합하다.",
    unitMassG: 4,
    unit: "장",
    unitThicknessMm: 5,
    compressibility: 0.6,
    stiffnessNPerM: 40000,
    energyAbsorption: 0.8,
    recovery: 0.3,
    color: "#d6a76c",
    pattern: "wave",
    positions: {
      wrap: { label: "전체 보호 구조" },
      band: { label: "중간 보강" },
      bottom: { label: "아래 플랫폼" },
      top: { label: "위 덮개" },
      side: { label: "옆면 보호대" },
      frame: { label: "외부 프레임", unitThicknessMm: 12 },
    },
  }),
  defineMaterial({
    id: "newspaper",
    name: "구긴 신문지",
    description: "구겨진 종이 뭉치가 눌리며 충격을 분산한다. 가볍고 부피가 크다.",
    unitMassG: 5,
    unit: "뭉치",
    unitThicknessMm: 15,
    compressibility: 0.8,
    stiffnessNPerM: 2200,
    energyAbsorption: 0.75,
    recovery: 0.4,
    color: "#d4d4d8",
    pattern: "cross",
    positions: {
      wrap: { label: "주변 채움" },
      bottom: { label: "아래 완충" },
      top: { label: "위 완충" },
      side: { label: "옆면 채움" },
      fill: {},
    },
  }),
  defineMaterial({
    id: "paper-towel",
    name: "키친타월(종이타월)",
    description: "얇은 종이를 여러 겹 감아 쓰는 재료. 한 겹의 완충 효과는 작다.",
    unitMassG: 1.5,
    unit: "장",
    unitThicknessMm: 1.2,
    compressibility: 0.6,
    stiffnessNPerM: 40000,
    energyAbsorption: 0.6,
    recovery: 0.5,
    color: "#fbcfe8",
    pattern: "fiber",
    positions: { ...SOFT_LAYER_POSITIONS },
  }),
  defineMaterial({
    id: "cotton",
    name: "솜",
    description: "섬유가 엉킨 매우 부드러운 재료. 압축 거리가 길지만 쉽게 바닥까지 눌린다.",
    unitMassG: 1,
    unit: "줌",
    unitThicknessMm: 15,
    compressibility: 0.9,
    stiffnessNPerM: 900,
    energyAbsorption: 0.7,
    recovery: 0.7,
    color: "#f1f5f9",
    pattern: "fiber",
    positions: {
      wrap: { label: "전체 채움" },
      bottom: { label: "아래 완충" },
      top: { label: "위 완충" },
      side: { label: "옆면 채움" },
    },
  }),
  defineMaterial({
    id: "felt",
    name: "헝겊/펠트",
    description: "섬유를 압착한 천. 얇지만 고르게 하중을 분산한다.",
    unitMassG: 2,
    unit: "장",
    unitThicknessMm: 3,
    compressibility: 0.6,
    stiffnessNPerM: 20000,
    energyAbsorption: 0.65,
    recovery: 0.8,
    color: "#fca5a5",
    pattern: "fiber",
    positions: { ...SOFT_LAYER_POSITIONS },
  }),
  defineMaterial({
    id: "paper-cup",
    name: "종이컵",
    description: "컵 벽이 찌그러지며 충격을 흡수하는 구조물. 받침이나 용기로 쓴다.",
    unitMassG: 5,
    unit: "개",
    unitThicknessMm: 35,
    compressibility: 0.7,
    stiffnessNPerM: 6000,
    energyAbsorption: 0.85,
    recovery: 0.15,
    color: "#fef3c7",
    pattern: "hatch",
    positions: {
      cradle: { label: "알 받침" },
      bottom: { label: "아래 받침" },
      wrap: { label: "용기형 보호 구조", unitThicknessMm: 25 },
    },
  }),
  defineMaterial({
    id: "paper-straw",
    name: "종이 빨대 묶음",
    description: "빨대 여러 개를 묶은 기둥 구조. 좌굴되며 충격을 흡수한다.",
    unitMassG: 4,
    unit: "묶음",
    unitThicknessMm: 30,
    compressibility: 0.55,
    stiffnessNPerM: 9000,
    energyAbsorption: 0.8,
    recovery: 0.25,
    color: "#86efac",
    pattern: "hatch",
    positions: {
      bottom: { label: "아래 지지대" },
      side: { label: "옆면 보호대" },
      frame: { label: "외부 프레임", unitThicknessMm: 35 },
      top: { label: "위쪽 지지대" },
    },
  }),
  defineMaterial({
    id: "honeycomb",
    name: "벌집형 종이 완충재",
    description: "육각 셀 구조의 종이. 셀이 순차적으로 무너지며 힘을 일정하게 유지한다.",
    unitMassG: 3,
    unit: "장",
    unitThicknessMm: 12,
    compressibility: 0.8,
    stiffnessNPerM: 8000,
    energyAbsorption: 0.8,
    recovery: 0.3,
    color: "#fdba74",
    pattern: "grid",
    positions: {
      wrap: {},
      band: {},
      bottom: { label: "아래 완충" },
      top: { label: "위 완충" },
      side: { label: "옆면 보호대" },
    },
  }),
  defineMaterial({
    id: "air-cushion",
    name: "공기 완충 쿠션",
    description: "공기를 채운 비닐 쿠션. 두껍고 부드럽지만 반발이 큰 편이다.",
    unitMassG: 2,
    unit: "개",
    unitThicknessMm: 25,
    compressibility: 0.85,
    stiffnessNPerM: 2000,
    energyAbsorption: 0.4,
    recovery: 0.95,
    color: "#a5f3fc",
    pattern: "solid",
    positions: {
      bottom: { label: "아래 완충" },
      top: { label: "위 완충" },
      side: { label: "옆면 완충" },
      wrap: { label: "주변 완충" },
    },
  }),
  defineMaterial({
    id: "packing-peanut",
    name: "포장용 완충 충전재",
    description: "스티로폼·전분 알갱이 충전재. 빈 공간을 채워 움직임을 줄인다.",
    unitMassG: 1.5,
    unit: "줌",
    unitThicknessMm: 18,
    compressibility: 0.75,
    stiffnessNPerM: 1800,
    energyAbsorption: 0.65,
    recovery: 0.6,
    color: "#e9d5ff",
    pattern: "cells",
    positions: {
      fill: {},
      bottom: { label: "아래 채움" },
      top: { label: "위 채움" },
      side: { label: "옆면 채움" },
    },
  }),
  defineMaterial({
    id: "cork",
    name: "코르크 시트",
    description: "천연 코르크 판. 얇고 단단하며 압축량이 작다.",
    unitMassG: 3,
    unit: "장",
    unitThicknessMm: 3,
    compressibility: 0.35,
    stiffnessNPerM: 45000,
    energyAbsorption: 0.55,
    recovery: 0.85,
    color: "#b45309",
    pattern: "dots",
    positions: { ...SOFT_LAYER_POSITIONS },
  }),
  defineMaterial({
    id: "nonwoven",
    name: "부직포",
    description: "섬유를 얽어 만든 얇은 천. 가볍지만 한 겹의 완충 효과는 작다.",
    unitMassG: 0.8,
    unit: "장",
    unitThicknessMm: 1,
    compressibility: 0.6,
    stiffnessNPerM: 25000,
    energyAbsorption: 0.55,
    recovery: 0.7,
    color: "#e2e8f0",
    pattern: "fiber",
    positions: { ...SOFT_LAYER_POSITIONS },
  }),
];

const MATERIAL_MAP = new Map(MATERIAL_CATALOG.map((m) => [m.id, m]));

export function getMaterial(id: string): Material | undefined {
  return MATERIAL_MAP.get(id);
}

export function getAllowedPositions(materialId: string): PositionId[] {
  const m = getMaterial(materialId);
  if (!m) return [];
  return Object.keys(m.positions) as PositionId[];
}

export function isPositionAllowed(materialId: string, position: PositionId): boolean {
  return getAllowedPositions(materialId).includes(position);
}

/** 해당 재료·위치에서 단위 수량당 두께(mm) */
export function getUnitThicknessMm(materialId: string, position: PositionId): number {
  const m = getMaterial(materialId);
  if (!m) return 0;
  return m.positions[position]?.unitThicknessMm ?? m.unitThicknessMm;
}

/** 감쇠비 ζ: 선형 스프링-감쇠기의 반발 계수 e로부터 ζ = −ln e / √(π² + ln² e) */
export function dampingRatioFromRestitution(e: number): number {
  const clamped = Math.min(0.99, Math.max(0.02, e));
  const l = Math.log(clamped);
  return -l / Math.sqrt(Math.PI * Math.PI + l * l);
}
