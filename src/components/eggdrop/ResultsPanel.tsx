"use client";

import React from "react";
import { SURFACES } from "@/lib/eggdrop/defaults";
import type { SimulationResult } from "@/lib/eggdrop/simulation";
import type { ExperimentSetup, RiskLevel } from "@/lib/eggdrop/types";

interface ResultsPanelProps {
  setup: ExperimentSetup;
  simResult: SimulationResult;
}

const RISK_META: Record<
  RiskLevel,
  { label: string; badgeClass: string; barClass: string; desc: string }
> = {
  low: {
    label: "낮음 (양호)",
    badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
    barClass: "bg-emerald-600",
    desc: "모델 기준 하중보다 계란 전달 하중이 낮게 추정된 구간입니다.",
  },
  caution: {
    label: "주의 (중간 위험)",
    badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
    barClass: "bg-amber-500",
    desc: "모델 기준 하중에 근접하여 낙하 자세나 충돌 부위에 따라 균열 위험이 커질 수 있는 구간입니다.",
  },
  high: {
    label: "높음 (파손 주의)",
    badgeClass: "bg-orange-100 text-orange-900 border-orange-300",
    barClass: "bg-orange-600",
    desc: "모델 기준 하중을 초과하여 완충 두께 보강이나 에너지 흡수율 개선이 권장되는 구간입니다.",
  },
  severe: {
    label: "매우 높음 (심각)",
    badgeClass: "bg-rose-100 text-rose-900 border-rose-300",
    barClass: "bg-rose-600",
    desc: "모델 기준 하중의 2배 이상이거나 완충재가 끝까지 눌려(바닥 닿음) 큰 충격이 전달되는 구간입니다.",
  },
};

export function ResultsPanel({ setup, simResult }: ResultsPanelProps) {
  const { summary } = simResult;
  const riskMeta = RISK_META[summary.riskLevel];
  const surface = SURFACES[setup.conditions.surface];

  return (
    <section
      aria-label="예상 물리량 및 완충 효과 분석"
      className="flex flex-col gap-4"
    >
      {/* 1. 상대 파손 위험 지표 & 완충 효과 요약 카드 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div>
            <h2 className="text-base font-bold text-slate-900">예상 물리량 및 완충 지표</h2>
            <p className="text-xs text-slate-600">
              {setup.conditions.floors}층({summary.dropHeightM.toFixed(1)}m) · {surface.name} 바닥 기준
            </p>
          </div>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${riskMeta.badgeClass}`}
          >
            위험 지표: {riskMeta.label}
          </span>
        </div>

        {/* 상대 파손 위험 지수 게이지 */}
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-slate-800">
              추정 파손 위험 지표 (상대 비교 지수 0~100)
            </span>
            <span className="font-mono text-lg font-extrabold text-slate-900">
              {summary.riskIndex} <span className="text-xs font-normal text-slate-500">/ 100</span>
            </span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full transition-all ${riskMeta.barClass}`}
              style={{ width: `${Math.min(100, Math.max(2, summary.riskIndex))}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
            {riskMeta.desc}{" "}
            <span className="text-slate-500">
              (※ 이 값은 실제 파손 확률(%)이 아니라, 모델의 기준 하중({setup.conditions.shellReferenceLoadN}N) 대비 상대 비교 지표입니다.)
            </span>
          </p>

          {summary.bottomedOut && (
            <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-900">
              <strong>완충 한계 도달(Bottom-out) 감지:</strong> 충돌 방향의 완충재가 최대 압축 한계까지 눌려
              껍데기 강성 구간으로 직접 충격이 전달되었습니다. 충돌 방향(예: 아래 덧대기·전체 감싸기)의 두께나 수량을 늘려 보세요.
            </div>
          )}
        </div>

        {/* 완충 효과 비교 지표 */}
        <div className="mt-2.5 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2">
          <div>
            <div className="text-xs font-bold text-blue-950">맨 계란 대비 완충 효과 지표</div>
            <div className="text-[11px] text-blue-800">
              동일 조건 무포장 낙하 대비 계란 전달 최대 하중 감소율
            </div>
          </div>
          <div className="font-mono text-base font-extrabold text-blue-700">
            {summary.cushionEffectPct >= 0 ? `-${summary.cushionEffectPct.toFixed(1)}%` : `+${Math.abs(summary.cushionEffectPct).toFixed(1)}%`}
          </div>
        </div>

        {/* 핵심 물리량 2열 그리드 */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="text-[11px] text-slate-500">총질량 (계란 + 포장재)</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-slate-900">
              {summary.totalMassG.toFixed(1)} g
            </div>
            <div className="text-[10.5px] text-slate-500">
              계란 {summary.eggMassG.toFixed(1)}g + 포장재 {summary.packageMassG.toFixed(1)}g
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="text-[11px] text-slate-500">실제 낙하 높이</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-slate-900">
              {summary.dropHeightM.toFixed(2)} m
            </div>
            <div className="text-[10.5px] text-slate-500">
              {setup.conditions.floors}층 × 층고 {setup.conditions.floorHeightM.toFixed(1)}m
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="text-[11px] text-slate-500">충돌 직전 속도</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-slate-900">
              {summary.impactSpeed.toFixed(2)} m/s
            </div>
            <div className="text-[10.5px] text-slate-500">
              무저항 이론값 √(2gh) = {summary.idealImpactSpeed.toFixed(2)} m/s
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="text-[11px] text-slate-500">충돌 직전 운동량 · 운동에너지</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-slate-900">
              {summary.momentum.toFixed(3)} kg·m/s
            </div>
            <div className="text-[10.5px] text-slate-500">
              운동에너지 E_k = {summary.kineticEnergy.toFixed(2)} J
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="text-[11px] text-slate-500">예상 1차 충돌 지속 시간 (Δt)</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-blue-700">
              {summary.contactDurationMs.toFixed(2)} ms
            </div>
            <div className="text-[10.5px] text-slate-500">
              최초 접촉부터 1차 충격 종료까지
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="text-[11px] text-slate-500">평균 충격력 추정치 (F_avg)</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-rose-700">
              {summary.averageForceN.toFixed(1)} N
            </div>
            <div className="text-[10.5px] text-slate-500">
              1차 충돌 충격량 ∫Fdt / Δt
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="text-[11px] text-slate-500">완충재 최대 압축량</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-slate-900">
              {summary.maxCompressionMm.toFixed(1)} mm
            </div>
            <div className="text-[10.5px] text-slate-500">
              {summary.bottomedOut ? "압축 한계 도달 (바닥 닿음)" : "완충 허용 범위 내 압축"}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="text-[11px] text-slate-500">충돌 후 반발 속도</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-slate-900">
              {summary.reboundSpeed.toFixed(2)} m/s
            </div>
            <div className="text-[10.5px] text-slate-500">
              1차 충돌 직후 최대 상승 속도
            </div>
          </div>

          <div className="col-span-2 rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[11px] text-slate-500">기울기 및 회전 각도 (자세 변화)</div>
                <div className="mt-0.5 font-mono text-xs font-bold text-slate-900">
                  충돌 순간 기울기 {summary.impactTiltDeg.toFixed(1)}° · 최대 기울기{" "}
                  {summary.maxTiltDeg.toFixed(1)}° · 누적 회전 {summary.totalRotationDeg.toFixed(1)}°
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-slate-500">모델 내 계란 최대 하중 추정치</div>
                <div className="font-mono text-xs font-bold text-slate-800">
                  {summary.eggPeakLoadN.toFixed(1)} N (바닥 최대 반력 {summary.modelPeakForceN.toFixed(0)} N)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 충격량-충격력 관계 및 계산 모델 한계 안내 카드 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-700">
        <h3 className="text-sm font-bold text-slate-900">
          충격량과 충격력의 관계 및 모델 한계 안내
        </h3>
        <div className="mt-2 space-y-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <p className="font-semibold text-slate-900">
              1) 충격량(Impulse)과 평균 충격력(F_avg)
            </p>
            <p className="mt-1 text-[11.5px] text-slate-600">
              바닥과 충돌할 때 운동량 변화량(Δp = m·v_후 - m·v_전)은 충격량 J = ∫F(t)dt = F_avg · Δt 와 같습니다.
              완충재가 두껍고 적절히 압축되면 <strong>충돌 지속 시간(Δt)과 제동 거리</strong>가 길어지므로,
              같은 운동량을 멈추더라도 <strong>평균 충격력(F_avg = Δp / Δt)</strong>이 크게 줄어듭니다.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <p className="font-semibold text-slate-900">
              2) 평균 충격력과 순간 최대 하중의 구분
            </p>
            <p className="mt-1 text-[11.5px] text-slate-600">
              충돌 중 힘은 일정하지 않고 완충재가 가장 많이 눌리는 순간에 커집니다.{" "}
              <strong>평균 충격력({summary.averageForceN.toFixed(1)}N)</strong>은 1차 충돌 시간 동안의 평균값이며,
              실제 센서로 측정한 순간 최대 충격력과 혼동해서는 안 됩니다. 함께 표시된{" "}
              <strong>모델 내 최대 하중({summary.eggPeakLoadN.toFixed(1)}N)</strong> 또한 본 시뮬레이터의 비선형 스프링-감쇠 방정식에서 계산된 모델 내부 추정치입니다.
            </p>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-[11.5px] text-amber-950">
            <p className="font-semibold">3) 단순화한 교육용 모델의 한계</p>
            <p className="mt-0.5">
              본 시뮬레이터는 2D 강체 운동과 방향별 스프링-감쇠기를 결합한 <strong>교육용 근사 모델</strong>입니다.
              15종 완충재의 강성·흡수율과 계란 껍데기 기준 하중은 상대적인 비교를 위한 가정값이며,
              실제 계란의 깨짐 여부를 확정적으로 예측하거나 파손 확률(%)을 보증하지 않습니다.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
