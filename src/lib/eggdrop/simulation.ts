import { dropHeightM, SURFACES } from "./defaults";
import {
  buildPackageModel,
  dampingRatioFromRestitution,
  SAMPLE_COUNT,
  SHELL_RESTITUTION,
  SHELL_STIFFNESS,
  type PackageModel,
} from "./packageModel";
import type { ExperimentSetup, ResultSummary, RiskLevel } from "./types";

/**
 * EggDrop Lab 2D 강체 낙하 시뮬레이션(교육용 근사 모델).
 *
 * - 상태: 무게중심 위치(x, y), 회전각 θ, 속도(vx, vy), 각속도 ω
 * - 적분: 반암시적(심플렉틱) 오일러, 비행 중 1ms / 바닥 근처 20µs 고정 간격 → 같은 입력이면 항상 같은 결과
 * - 공기 저항: F = ½ρC_dA|v|v, 작용선은 진행 방향 투영 단면의 중앙(무게중심과 어긋나면 회전 토크 발생)
 * - 접촉: 바깥 윤곽의 48개 점마다 비선형 스프링-감쇠기(완충재) + 바닥 강성 직렬 결합,
 *         압축 한계를 넘으면 껍데기 강성으로 급격히 단단해짐(바닥 닿음), 쿨롱 마찰 근사
 * - 계란 하중: 강체 가정에서 계란이 받는 힘 = (계란 질량 / 총질량) × 바닥 접촉력
 */

export const AIR_DENSITY = 1.2;
export const DRAG_COEFFICIENT = 0.6;
const PITCH_DAMPING = 0.1;
const DT_FLIGHT = 1e-3;
const DT_CONTACT = 2e-5;
const MAX_AFTER_CONTACT_S = 2.0;
const MAX_FLIGHT_S = 30;
const FRAME_INTERVAL_FLIGHT = 1 / 240;
const FRAME_INTERVAL_IMPACT = 0.0005;
const IMPACT_FRAME_WINDOW_S = 0.25;

export interface SimFrame {
  t: number;
  x: number;
  y: number;
  theta: number;
  vx: number;
  vy: number;
  omega: number;
  /** 바닥 접촉력(수직 성분, N) */
  force: number;
  /** 방향별 압축량(m). 접촉이 없으면 null */
  compression: Float32Array | null;
}

export interface SimulationResult {
  model: PackageModel;
  frames: SimFrame[];
  summary: ResultSummary;
  firstContactTime: number | null;
  contactEndTime: number | null;
  peakTime: number | null;
  endTime: number;
  /** 시작 시 무게중심 높이(m) */
  startY: number;
  /** 방향별 최대 압축량과 도달 시각(형상 회복 시각화용) */
  maxCompression: Float32Array;
  maxCompressionTime: Float32Array;
  /** 계란 하중/기준 하중 비율 */
  loadRatio: number;
}

interface ContactParams {
  /** 바닥 직렬 결합 후 완충 강성 */
  kCushion: number;
  /** 바닥 직렬 결합 후 껍데기(바닥 닿음) 강성 */
  kShell: number;
  /** 바닥 변형까지 포함한 유효 압축 한계 */
  travelEff: number;
  /** 실제 완충재 압축 한계(표시용) */
  travel: number;
  zeta: number;
  forceAtLimit: number;
}

function series(a: number, b: number): number {
  return (a * b) / (a + b);
}

function buildContactParams(model: PackageModel, surfaceKey: ExperimentSetup["conditions"]["surface"]) {
  const surface = SURFACES[surfaceKey];
  const kf = surface.stiffnessNPerM;
  const kShell = series(SHELL_STIFFNESS, kf);
  return model.directions.map<ContactParams>((d) => {
    if (d.stiffness <= 0 || d.travel <= 0) {
      return {
        kCushion: 0,
        kShell,
        travelEff: 0,
        travel: 0,
        zeta: dampingRatioFromRestitution(SHELL_RESTITUTION * surface.restitutionFactor),
        forceAtLimit: 0,
      };
    }
    const kc = series(d.stiffness, kf);
    const travelEff = d.travel + (d.stiffness * d.travel) / kf;
    return {
      kCushion: kc,
      kShell,
      travelEff,
      travel: d.travel,
      zeta: dampingRatioFromRestitution(d.restitution * surface.restitutionFactor),
      forceAtLimit: kc * travelEff * 2.5,
    };
  });
}

/** 압축량 d에서의 스프링 힘과 접선 강성(완충재는 압축될수록 단단해짐) */
function springForce(p: ContactParams, d: number): { f: number; k: number } {
  if (p.travelEff <= 0) return { f: p.kShell * d, k: p.kShell };
  if (d <= p.travelEff) {
    const r = d / p.travelEff;
    return { f: p.kCushion * d * (1 + 1.5 * r * r * r), k: p.kCushion * (1 + 6 * r * r * r) };
  }
  return { f: p.forceAtLimit + p.kShell * (d - p.travelEff), k: p.kShell };
}

export function riskFromRatio(ratio: number): { index: number; level: RiskLevel } {
  const index = ratio <= 0 ? 0 : Math.max(0, Math.min(100, 50 + 40 * Math.log10(ratio)));
  let level: RiskLevel = "low";
  if (ratio >= 2) level = "severe";
  else if (ratio >= 1) level = "high";
  else if (ratio >= 0.6) level = "caution";
  return { index: Math.round(index), level };
}

export interface SimulateOptions {
  /** 프레임 기록 여부(기준 비교용 계산에서는 끔) */
  record?: boolean;
}

export function simulate(setup: ExperimentSetup, options: SimulateOptions = {}): SimulationResult {
  const record = options.record ?? true;
  const c = setup.conditions;
  const model = buildPackageModel(setup.configs, c.eggMassG);
  const params = buildContactParams(model, c.surface);
  const surface = SURFACES[c.surface];
  const M = model.totalMassKg;
  const I = model.inertia;
  const g = c.gravity;
  const h = dropHeightM(c);
  const n = SAMPLE_COUNT;
  const pts = model.contactPoints;

  // 초기 상태: 기울어진 상태에서 가장 낮은 점이 낙하 높이 h에 오도록 배치
  let theta = (c.initialTiltDeg * Math.PI) / 180;
  let omega = (c.initialAngularVelocityDegS * Math.PI) / 180;
  let x = 0;
  let vx = 0;
  let vy = 0;
  let lowest = Infinity;
  {
    const cs = Math.cos(theta);
    const sn = Math.sin(theta);
    for (const p of pts) lowest = Math.min(lowest, p.x * sn + p.y * cs);
  }
  let y = h - lowest;
  const startY = y;

  const frames: SimFrame[] = [];
  const maxComp = new Float32Array(n);
  const maxCompTime = new Float32Array(n);
  const compNow = new Float32Array(n);

  let t = 0;
  let firstContact: number | null = null;
  let impactSpeed = 0;
  let impactTilt = 0;
  let contactEnd: number | null = null;
  let impulse = 0;
  let peakForce = 0;
  let peakTime: number | null = null;
  let peakForceVec = 0;
  let firstPhaseDone = false;
  let reboundSpeed = 0;
  let maxTilt = Math.abs(theta);
  let totalRotation = 0;
  let maxCushionComp = 0;
  let bottomedOut = false;
  let settledFor = 0;
  let nextFrameT = 0;
  let lastForce = 0;
  let inContactNow = false;

  const pushFrame = (force: number, contact: boolean) => {
    frames.push({
      t,
      x,
      y,
      theta,
      vx,
      vy,
      omega,
      force,
      compression: contact ? new Float32Array(compNow) : null,
    });
  };

  if (record) pushFrame(0, false);

  for (;;) {
    const cs = Math.cos(theta);
    const sn = Math.sin(theta);
    // 가장 낮은 점 높이로 시간 간격 결정
    let minY = Infinity;
    for (let i = 0; i < n; i++) {
      const wy = y + pts[i].x * sn + pts[i].y * cs;
      if (wy < minY) minY = wy;
    }
    const nearGround = minY < 0.03 + Math.abs(vy) * 1.5 * DT_FLIGHT || firstContact !== null;
    const dt = nearGround ? DT_CONTACT : DT_FLIGHT;

    let fx = 0;
    let fy = -M * g;
    let torque = 0;
    let contactFy = 0;
    let contactFx = 0;
    let anyContact = false;

    // 공기 저항
    if (c.airResistance) {
      const speed = Math.hypot(vx, vy);
      if (speed > 1e-6) {
        // 진행 방향에 수직인 투영 폭 계산
        const ux = -vy / speed;
        const uy = vx / speed;
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i < n; i += 2) {
          const wx = pts[i].x * cs - pts[i].y * sn;
          const wy = pts[i].x * sn + pts[i].y * cs;
          const proj = wx * ux + wy * uy;
          if (proj < lo) lo = proj;
          if (proj > hi) hi = proj;
        }
        // 단면을 타원으로 근사: A = π/4 × 투영 폭 × 깊이
        const area = (Math.PI / 4) * (hi - lo) * model.depth;
        const fd = 0.5 * AIR_DENSITY * DRAG_COEFFICIENT * area * speed;
        const dfx = -fd * vx;
        const dfy = -fd * vy;
        fx += dfx;
        fy += dfy;
        // 항력 작용선은 투영 단면의 중앙을 지난다고 근사 → 무게중심과 어긋나면 회전 토크
        const mid = (lo + hi) / 2;
        torque += mid * ux * dfy - mid * uy * dfx;
        // 회전 감쇠(피치 댐핑 근사): 낙하 속도가 빠를수록 회전이 잘 줄어든다
        const L = model.maxExtent * 2;
        torque += -PITCH_DAMPING * AIR_DENSITY * speed * area * L * L * omega;
      }
    }

    // 바닥 접촉
    if (minY < 0) {
      for (let i = 0; i < n; i++) {
        const rx = pts[i].x * cs - pts[i].y * sn;
        const ry = pts[i].x * sn + pts[i].y * cs;
        const d = -(y + ry);
        if (d <= 0) {
          compNow[i] = 0;
          continue;
        }
        anyContact = true;
        const p = params[i];
        const pvx = vx - omega * ry;
        const pvy = vy + omega * rx;
        const sp = springForce(p, d);
        const cDamp = 2 * p.zeta * Math.sqrt(sp.k * M);
        let fn = sp.f - cDamp * pvy;
        if (fn < 0) fn = 0;
        const ft = -surface.friction * fn * Math.max(-1, Math.min(1, pvx / 0.05));
        fx += ft;
        fy += fn;
        contactFx += ft;
        contactFy += fn;
        torque += rx * fn - ry * ft;
        // 구름 저항(근사)
        torque += -0.004 * fn * Math.max(-1, Math.min(1, omega / 0.5));

        const cushion = p.travelEff > 0 ? (Math.min(d, p.travelEff) * p.travel) / p.travelEff : 0;
        compNow[i] = p.travelEff > 0 ? cushion : 0;
        if (cushion > maxCushionComp) maxCushionComp = cushion;
        if (p.travelEff > 0 && d > p.travelEff) bottomedOut = true;
        if (p.travelEff <= 0) bottomedOut = true;
        if (compNow[i] > maxComp[i]) {
          maxComp[i] = compNow[i];
          maxCompTime[i] = t;
        }
      }
    }
    inContactNow = anyContact;

    if (anyContact && firstContact === null) {
      firstContact = t;
      impactSpeed = Math.hypot(vx, vy);
      impactTilt = Math.abs(Math.atan2(Math.sin(theta), Math.cos(theta)));
    }

    const fMag = Math.hypot(contactFx, contactFy);
    if (fMag > peakForceVec) {
      peakForceVec = fMag;
      peakTime = t;
    }

    // 1차 충돌 구간 분석
    if (firstContact !== null && !firstPhaseDone) {
      impulse += contactFy * dt;
      if (contactFy > peakForce) peakForce = contactFy;
      const elapsed = t - firstContact;
      const afterPeak = peakForce > 0 && contactFy < peakForce * 0.5;
      const liftOff = !anyContact && elapsed > 0;
      const quasiRest = afterPeak && contactFy < 1.2 * M * g && vy > -0.05;
      if (liftOff || quasiRest || elapsed > 0.5) {
        firstPhaseDone = true;
        contactEnd = t;
      }
    }

    // 적분(반암시적 오일러)
    vx += (fx / M) * dt;
    vy += (fy / M) * dt;
    omega += (torque / I) * dt;
    x += vx * dt;
    y += vy * dt;
    theta += omega * dt;
    t += dt;
    lastForce = contactFy;

    totalRotation += Math.abs(omega) * dt;
    const tilt = Math.abs(Math.atan2(Math.sin(theta), Math.cos(theta)));
    if (tilt > maxTilt) maxTilt = tilt;

    if (firstContact !== null && t - firstContact < 0.4 && vy > reboundSpeed) reboundSpeed = vy;

    if (record) {
      const inImpactWindow = firstContact !== null && t - firstContact < IMPACT_FRAME_WINDOW_S;
      const interval = inImpactWindow || (nearGround && firstContact === null) ? FRAME_INTERVAL_IMPACT : FRAME_INTERVAL_FLIGHT;
      if (t >= nextFrameT) {
        pushFrame(contactFy, anyContact);
        nextFrameT = t + interval;
      }
    }

    // 종료 조건
    if (firstContact !== null) {
      const still = Math.hypot(vx, vy) < 0.02 && Math.abs(omega) < 0.1;
      settledFor = still ? settledFor + dt : 0;
      if ((settledFor > 0.25 && firstPhaseDone) || t - firstContact > MAX_AFTER_CONTACT_S) break;
    } else if (t > MAX_FLIGHT_S) {
      break;
    }
  }
  if (record) pushFrame(lastForce, inContactNow);
  if (contactEnd === null && firstContact !== null) contactEnd = t;

  const idealImpactSpeed = Math.sqrt(2 * g * h);
  const duration = firstContact !== null && contactEnd !== null ? contactEnd - firstContact : 0;
  const averageForce = duration > 0 ? impulse / duration : 0;
  const eggPeakLoad = (model.eggMassKg / M) * peakForceVec;
  const loadRatio = eggPeakLoad / c.shellReferenceLoadN;
  const risk = riskFromRatio(loadRatio);

  const summary: ResultSummary = {
    totalMassG: M * 1000,
    eggMassG: model.eggMassKg * 1000,
    packageMassG: model.packageMassKg * 1000,
    dropHeightM: h,
    impactSpeed,
    idealImpactSpeed,
    momentum: M * impactSpeed,
    kineticEnergy: 0.5 * M * impactSpeed * impactSpeed,
    contactDurationMs: duration * 1000,
    averageForceN: averageForce,
    modelPeakForceN: peakForceVec,
    eggPeakLoadN: eggPeakLoad,
    maxCompressionMm: maxCushionComp * 1000,
    bottomedOut,
    reboundSpeed: Math.max(0, reboundSpeed),
    maxTiltDeg: (maxTilt * 180) / Math.PI,
    impactTiltDeg: (impactTilt * 180) / Math.PI,
    totalRotationDeg: (totalRotation * 180) / Math.PI,
    riskIndex: risk.index,
    riskLevel: risk.level,
    cushionEffectPct: 0,
  };

  return {
    model,
    frames,
    summary,
    firstContactTime: firstContact,
    contactEndTime: contactEnd,
    peakTime,
    endTime: t,
    startY,
    maxCompression: maxComp,
    maxCompressionTime: maxCompTime,
    loadRatio,
  };
}

/**
 * 완충재 없이(맨 계란) 같은 조건으로 계산한 결과와 비교해
 * 계란 최대 하중 감소율(%)을 구한다.
 */
export function simulateWithBaseline(setup: ExperimentSetup): SimulationResult {
  const result = simulate(setup, { record: true });
  const baseline = simulate({ conditions: setup.conditions, configs: [] }, { record: false });
  const base = baseline.summary.eggPeakLoadN;
  const pct = base > 0 ? (1 - result.summary.eggPeakLoadN / base) * 100 : 0;
  result.summary.cushionEffectPct = Math.round(pct * 10) / 10;
  return result;
}
