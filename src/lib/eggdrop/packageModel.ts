import { dampingRatioFromRestitution, getMaterial, getUnitThicknessMm, isPositionAllowed } from "./materialCatalog";
import { positionCoverage, positionCoverageFraction } from "./positions";
import type { MaterialConfig, PositionId } from "./types";

/**
 * 포장 구조(계란 + 완충재)의 2D 측면도 모델.
 *
 * 계란 둘레를 N개의 방향으로 나누고, 각 방향마다 재료 구성 행을
 * 안쪽(먼저 추가한 행)부터 바깥쪽으로 쌓아 두께·강성·감쇠·질량 분포를 계산한다.
 * 이 결과는 시뮬레이션(접촉점)과 렌더링(층 모양)에서 모두 사용된다.
 */

export const SAMPLE_COUNT = 48;
export const EGG_HALF_WIDTH_M = 0.022; // 계란 폭 44mm
export const EGG_HALF_HEIGHT_M = 0.0285; // 계란 높이 57mm
/** 계란 껍데기와 바닥이 직접 닿을 때의 접촉 강성(N/m) — 교육용 가정값 */
export const SHELL_STIFFNESS = 120_000;
/** 계란 껍데기 직접 충돌 반발 계수 — 교육용 가정값 */
export const SHELL_RESTITUTION = 0.3;

export function sampleAngleRad(i: number): number {
  return (i / SAMPLE_COUNT) * Math.PI * 2;
}

/** 달걀 모양 윤곽(매개변수 t ∈ [0, 2π)): 아래가 넓고 위가 약간 뾰족하다 */
export function eggOutlinePoint(t: number): { x: number; y: number } {
  const s = Math.sin(t);
  return {
    x: EGG_HALF_WIDTH_M * Math.cos(t) * (1 - 0.1 * s),
    y: EGG_HALF_HEIGHT_M * s,
  };
}

const EGG_RADII: number[] = (() => {
  // 방향 각도 α에서 계란 윤곽까지의 거리(극좌표 반지름)를 수치적으로 구한다.
  const dense = 1440;
  const pts: { a: number; r: number }[] = [];
  for (let k = 0; k < dense; k++) {
    const p = eggOutlinePoint((k / dense) * Math.PI * 2);
    let a = Math.atan2(p.y, p.x);
    if (a < 0) a += Math.PI * 2;
    pts.push({ a, r: Math.hypot(p.x, p.y) });
  }
  pts.sort((p, q) => p.a - q.a);
  const radii: number[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const target = sampleAngleRad(i);
    let best = pts[0];
    let bestD = Infinity;
    for (const p of pts) {
      const d = Math.abs(p.a - target);
      const dd = Math.min(d, Math.PI * 2 - d);
      if (dd < bestD) {
        bestD = dd;
        best = p;
      }
    }
    radii.push(best.r);
  }
  return radii;
})();

export function eggRadiusAt(i: number): number {
  return EGG_RADII[((i % SAMPLE_COUNT) + SAMPLE_COUNT) % SAMPLE_COUNT];
}

export interface LayerGeometry {
  configId: string;
  materialId: string;
  position: PositionId;
  color: string;
  pattern: string;
  /** 각 방향의 안쪽/바깥쪽 반지름(m, 계란 중심 기준) */
  inner: number[];
  outer: number[];
}

export interface DirectionProfile {
  /** 방향별 총 완충 두께(m) */
  thickness: number;
  /** 방향별 압축 가능한 거리(m) */
  travel: number;
  /** 방향별 직렬 결합 강성(N/m). 완충재가 없으면 0 */
  stiffness: number;
  /** 압축 거리 가중 평균 반발 계수 */
  restitution: number;
  /** 압축 거리 가중 평균 형상 회복률 */
  recovery: number;
}

export interface PackageModel {
  eggMassKg: number;
  packageMassKg: number;
  totalMassKg: number;
  /** 계란 중심 기준 무게중심(m) */
  com: { x: number; y: number };
  /** 무게중심 기준 관성모멘트(kg·m²) */
  inertia: number;
  directions: DirectionProfile[];
  layers: LayerGeometry[];
  /** 계란 중심 기준 바깥 윤곽 반지름(m) */
  outerRadius: number[];
  /** 몸체 좌표계(무게중심 기준) 바깥 윤곽 점 */
  contactPoints: { x: number; y: number }[];
  /** 몸체 좌표계(무게중심 기준) 계란 껍데기 점 */
  shellPoints: { x: number; y: number }[];
  /** 기하 중심(공기 저항 작용점, 무게중심 기준) */
  centerOfPressure: { x: number; y: number };
  /** 회전축 방향 깊이(m) — 축대칭 가정으로 몸체 폭과 같다고 근사 */
  depth: number;
  maxExtent: number;
}

export interface ConfigSummary {
  configId: string;
  massG: number;
  thicknessMm: number;
  volumeCm3: number;
  valid: boolean;
}

const EGG_SURFACE_AREA_CM2 = 68; // 계란 표면적 근사

/** 재료 구성 1행의 질량·두께·부피(교육용 근사) */
export function summarizeConfig(cfg: MaterialConfig): ConfigSummary {
  const m = getMaterial(cfg.materialId);
  const valid = !!m && isPositionAllowed(cfg.materialId, cfg.position) && cfg.quantity >= 1;
  if (!m || !valid) return { configId: cfg.id, massG: 0, thicknessMm: 0, volumeCm3: 0, valid: false };
  const thicknessMm = getUnitThicknessMm(cfg.materialId, cfg.position) * cfg.quantity;
  const volumeCm3 = EGG_SURFACE_AREA_CM2 * positionCoverageFraction(cfg.position) * (thicknessMm / 10);
  return {
    configId: cfg.id,
    massG: m.unitMassG * cfg.quantity,
    thicknessMm,
    volumeCm3: Math.round(volumeCm3 * 10) / 10,
    valid: true,
  };
}

export function buildPackageModel(configs: MaterialConfig[], eggMassG: number): PackageModel {
  const eggMassKg = eggMassG / 1000;
  const n = SAMPLE_COUNT;
  const cursor = EGG_RADII.slice(); // 방향별 현재 바깥 반지름
  const compliance = new Array<number>(n).fill(0);
  const travel = new Array<number>(n).fill(0);
  const thickness = new Array<number>(n).fill(0);
  const restW = new Array<number>(n).fill(0);
  const recW = new Array<number>(n).fill(0);
  const layers: LayerGeometry[] = [];
  const massPoints: { x: number; y: number; m: number }[] = [];
  let packageMassKg = 0;

  for (const cfg of configs) {
    const mat = getMaterial(cfg.materialId);
    if (!mat || !isPositionAllowed(cfg.materialId, cfg.position)) continue;
    const q = Math.max(1, Math.min(10, Math.round(cfg.quantity)));
    const unitT = getUnitThicknessMm(cfg.materialId, cfg.position) / 1000;
    const inner = cursor.slice();
    const outer = cursor.slice();
    const weights: number[] = [];
    let wSum = 0;
    for (let i = 0; i < n; i++) {
      const w = positionCoverage(cfg.position, (sampleAngleRad(i) * 180) / Math.PI);
      weights.push(w);
      if (w < 0.01) continue;
      const t = unitT * q * w;
      const s = t * mat.compressibility;
      // 동일 재료 q층 직렬 → 강성 k/q, 가장자리(얇은 부분)는 상대적으로 단단해짐
      const k = mat.stiffnessNPerM / Math.max(0.15, q * w);
      compliance[i] += 1 / k;
      travel[i] += s;
      thickness[i] += t;
      restW[i] += mat.restitution * s;
      recW[i] += mat.recovery * s;
      outer[i] = cursor[i] + t;
      cursor[i] = outer[i];
      wSum += w;
    }
    const massKg = (mat.unitMassG * q) / 1000;
    packageMassKg += massKg;
    if (wSum > 0) {
      for (let i = 0; i < n; i++) {
        if (weights[i] < 0.01) continue;
        const a = sampleAngleRad(i);
        const r = (inner[i] + outer[i]) / 2;
        massPoints.push({ x: r * Math.cos(a), y: r * Math.sin(a), m: (massKg * weights[i]) / wSum });
      }
    }
    layers.push({
      configId: cfg.id,
      materialId: mat.id,
      position: cfg.position,
      color: mat.color,
      pattern: mat.pattern,
      inner,
      outer,
    });
  }

  const totalMassKg = eggMassKg + packageMassKg;
  let cx = 0;
  let cy = 0;
  for (const p of massPoints) {
    cx += p.m * p.x;
    cy += p.m * p.y;
  }
  cx /= totalMassKg;
  cy /= totalMassKg;

  // 관성모멘트: 계란(타원체 근사) + 완충재 질점, 무게중심 기준
  let inertia =
    (eggMassKg * (EGG_HALF_WIDTH_M ** 2 + EGG_HALF_HEIGHT_M ** 2)) / 5 + eggMassKg * (cx * cx + cy * cy);
  for (const p of massPoints) inertia += p.m * ((p.x - cx) ** 2 + (p.y - cy) ** 2);

  const directions: DirectionProfile[] = [];
  for (let i = 0; i < n; i++) {
    directions.push({
      thickness: thickness[i],
      travel: travel[i],
      stiffness: compliance[i] > 0 ? 1 / compliance[i] : 0,
      restitution: travel[i] > 0 ? restW[i] / travel[i] : SHELL_RESTITUTION,
      recovery: travel[i] > 0 ? recW[i] / travel[i] : 1,
    });
  }

  const outerRadius = cursor;
  const contactPoints = outerRadius.map((r, i) => ({
    x: r * Math.cos(sampleAngleRad(i)) - cx,
    y: r * Math.sin(sampleAngleRad(i)) - cy,
  }));
  const shellPoints = EGG_RADII.map((r, i) => ({
    x: r * Math.cos(sampleAngleRad(i)) - cx,
    y: r * Math.sin(sampleAngleRad(i)) - cy,
  }));

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = sampleAngleRad(i);
    const x = outerRadius[i] * Math.cos(a);
    const y = outerRadius[i] * Math.sin(a);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const centerOfPressure = { x: (minX + maxX) / 2 - cx, y: (minY + maxY) / 2 - cy };
  const depth = maxX - minX;
  const maxExtent = Math.max(...outerRadius);

  return {
    eggMassKg,
    packageMassKg,
    totalMassKg,
    com: { x: cx, y: cy },
    inertia,
    directions,
    layers,
    outerRadius,
    contactPoints,
    shellPoints,
    centerOfPressure,
    depth,
    maxExtent,
  };
}

export { dampingRatioFromRestitution };
