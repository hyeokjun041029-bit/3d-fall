import type { PositionId } from "./types";

export interface PositionDefinition {
  id: PositionId;
  name: string;
  description: string;
  /**
   * 측면도(2D) 기준으로 덮는 방향.
   * 각도는 몸체 좌표계 기준(0° = 오른쪽, 90° = 위, 180° = 왼쪽, 270° = 아래).
   * null이면 전 방향을 덮는다.
   */
  arcs: { centerDeg: number; halfWidthDeg: number }[] | null;
}

export const POSITIONS: Record<PositionId, PositionDefinition> = {
  wrap: {
    id: "wrap",
    name: "전체 감싸기",
    description: "계란의 둘레를 전체적으로 감싸는 구조",
    arcs: null,
  },
  band: {
    id: "band",
    name: "중간 띠",
    description: "계란의 중간 부분만 띠 형태로 감싸는 구조",
    arcs: [
      { centerDeg: 0, halfWidthDeg: 32 },
      { centerDeg: 180, halfWidthDeg: 32 },
    ],
  },
  bottom: {
    id: "bottom",
    name: "아래 덧대기",
    description: "계란 밑부분에 완충층 추가",
    arcs: [{ centerDeg: 270, halfWidthDeg: 60 }],
  },
  top: {
    id: "top",
    name: "위 덧대기",
    description: "계란 위쪽에 완충층 추가",
    arcs: [{ centerDeg: 90, halfWidthDeg: 60 }],
  },
  side: {
    id: "side",
    name: "옆면 완충",
    description: "측면 충돌을 완화하는 구조",
    arcs: [
      { centerDeg: 0, halfWidthDeg: 55 },
      { centerDeg: 180, halfWidthDeg: 55 },
    ],
  },
  fill: {
    id: "fill",
    name: "내부 채움",
    description: "보호 용기 안의 빈 공간을 채우는 구조",
    arcs: null,
  },
  cradle: {
    id: "cradle",
    name: "알 받침",
    description: "계란을 아래에서 지지하거나 고정하는 받침 구조",
    arcs: [{ centerDeg: 270, halfWidthDeg: 75 }],
  },
  frame: {
    id: "frame",
    name: "외부 프레임",
    description: "계란 주변에 별도 보호 프레임을 만드는 구조",
    arcs: null,
  },
};

export const POSITION_ORDER: PositionId[] = [
  "wrap",
  "band",
  "bottom",
  "top",
  "side",
  "fill",
  "cradle",
  "frame",
];

const TAPER_DEG = 14;

function angleDiffDeg(a: number, b: number): number {
  let d = (((a - b) % 360) + 360) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * 주어진 방향(몸체 좌표계, 도)에 대해 해당 위치가 덮는 비율(0~1).
 * 가장자리는 부드럽게 줄어들도록 코사인 테이퍼를 적용한다.
 */
export function positionCoverage(position: PositionId, angleDeg: number): number {
  const def = POSITIONS[position];
  if (!def.arcs) return 1;
  let best = 0;
  for (const arc of def.arcs) {
    const d = angleDiffDeg(angleDeg, arc.centerDeg);
    const inner = arc.halfWidthDeg - TAPER_DEG;
    let c = 0;
    if (d <= inner) c = 1;
    else if (d < arc.halfWidthDeg) c = 0.5 * (1 + Math.cos((Math.PI * (d - inner)) / TAPER_DEG));
    if (c > best) best = c;
  }
  return best;
}

/** 위치가 덮는 전체 둘레 비율(0~1) */
export function positionCoverageFraction(position: PositionId): number {
  const n = 360;
  let s = 0;
  for (let i = 0; i < n; i++) s += positionCoverage(position, i);
  return s / n;
}
