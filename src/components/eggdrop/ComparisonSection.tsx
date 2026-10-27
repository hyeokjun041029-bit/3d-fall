"use client";

import React, { useState } from "react";
import { getMaterial } from "@/lib/eggdrop/materialCatalog";
import { POSITIONS } from "@/lib/eggdrop/positions";
import { getSupabaseEnvStatus } from "@/lib/eggdrop/supabaseAdapter";
import type {
  ActualOutcome,
  ActualRecord,
  ExperimentSetup,
  SavedExperiment,
} from "@/lib/eggdrop/types";

interface ComparisonSectionProps {
  experiments: SavedExperiment[];
  onLoadSetup: (setup: ExperimentSetup) => void;
  onSaveCurrentAsQuick: () => void;
  onUpdateActual: (id: string, actual: ActualRecord | null) => void;
  onDeleteExperiment: (id: string) => void;
  onRenameExperiment: (id: string, nextName: string) => void;
}

const OUTCOME_LABELS: Record<ActualOutcome, { label: string; badgeClass: string }> = {
  intact: {
    label: "깨지지 않음 (온전함)",
    badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  cracked: {
    label: "균열만 발생함",
    badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
  },
  broken: {
    label: "완전히 깨짐",
    badgeClass: "bg-rose-100 text-rose-900 border-rose-300",
  },
};

function summarizeMaterialsText(setup: ExperimentSetup): string {
  if (setup.configs.length === 0) return "완충재 없음 (맨 계란)";
  return setup.configs
    .map((cfg) => {
      const m = getMaterial(cfg.materialId);
      if (!m) return "";
      const posLabel = m.positions[cfg.position]?.label ?? POSITIONS[cfg.position].name;
      return `${m.name} ${cfg.quantity}${m.unit}(${posLabel})`;
    })
    .filter(Boolean)
    .join(", ");
}

export function ComparisonSection({
  experiments,
  onLoadSetup,
  onSaveCurrentAsQuick,
  onUpdateActual,
  onDeleteExperiment,
  onRenameExperiment,
}: ComparisonSectionProps) {
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [selectedExpIdForActual, setSelectedExpIdForActual] = useState<string>("");
  const [outcome, setOutcome] = useState<ActualOutcome>("intact");
  const [date, setDate] = useState<string>("2026-10-27");
  const [actualHeightStr, setActualHeightStr] = useState<string>("");
  const [materialsNote, setMaterialsNote] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState<string>("");
  const [recordFeedback, setRecordFeedback] = useState<string | null>(null);

  const supabaseStatus = getSupabaseEnvStatus();

  const comparedExperiments = experiments.filter((e) => !excludedIds.includes(e.id));
  const activeActualTarget =
    experiments.find((e) => e.id === selectedExpIdForActual) ?? experiments[0] ?? null;

  const toggleCompareSelection = (id: string) => {
    setExcludedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSelectTargetExperiment = (exp: SavedExperiment) => {
    setSelectedExpIdForActual(exp.id);
    if (exp.actual) {
      setOutcome(exp.actual.outcome);
      setDate(exp.actual.date);
      setActualHeightStr(
        exp.actual.actualHeightM !== null ? String(exp.actual.actualHeightM) : "",
      );
      setMaterialsNote(exp.actual.materialsNote);
      setMemo(exp.actual.memo);
    } else {
      setOutcome("intact");
      setActualHeightStr("");
      setMaterialsNote(summarizeMaterialsText(exp.setup));
      setMemo("");
    }
    setRecordFeedback(null);
  };

  const handleSaveActualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeActualTarget) return;

    const parsedH = actualHeightStr.trim() ? Number.parseFloat(actualHeightStr) : null;
    const validH = parsedH !== null && Number.isFinite(parsedH) && parsedH > 0 ? parsedH : null;

    const record: ActualRecord = {
      outcome,
      date: date.trim() || "2026-10-27",
      actualHeightM: validH,
      materialsNote: materialsNote.trim() || summarizeMaterialsText(activeActualTarget.setup),
      memo: memo.trim(),
      recordedAt: new Date().toISOString(),
    };

    onUpdateActual(activeActualTarget.id, record);
    setRecordFeedback(`'${activeActualTarget.name}'의 실제 실험 기록이 저장되었습니다.`);
  };

  const handleClearActual = () => {
    if (!activeActualTarget) return;
    onUpdateActual(activeActualTarget.id, null);
    setRecordFeedback(`'${activeActualTarget.name}'의 실제 실험 기록이 삭제되었습니다.`);
  };

  // 차트 최대값 계산 (실제 저장된 계산값 기반)
  const maxMass = Math.max(100, ...comparedExperiments.map((e) => e.result.totalMassG));
  const maxAvgForce = Math.max(50, ...comparedExperiments.map((e) => e.result.averageForceN));
  const maxDuration = Math.max(10, ...comparedExperiments.map((e) => e.result.contactDurationMs));

  return (
    <section
      id="comparison-section"
      aria-label="실험 비교 차트 및 실제 실험 결과 기록"
      className="mt-6 space-y-6"
    >
      {/* 1. 실험 A/B/C 비교 및 차트 영역 */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              실험 구성 A/B/C 비교 및 시뮬레이션-실측 대조
            </h2>
            <p className="text-xs text-slate-600">
              저장된 실험들의 시뮬레이션 예측 수치와 실제 실험 기록을 분리하여 나란히 비교합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
              저장소: {supabaseStatus.modeLabel}
            </span>
            <button
              type="button"
              onClick={onSaveCurrentAsQuick}
              className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              + 현재 실험 구성 바로 저장
            </button>
          </div>
        </div>

        {experiments.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="text-sm font-semibold text-slate-800">
              아직 비교 목록에 저장된 실험이 없습니다.
            </p>
            <p className="mt-1 text-xs text-slate-600">
              왼쪽 패널 하단의 <strong>실험 저장</strong> 버튼이나 우측 상단의{" "}
              <strong>+ 현재 실험 구성 바로 저장</strong>을 눌러 여러 실험(A/B/C)을 저장하고 비교해 보세요.
            </p>
          </div>
        ) : (
          <>
            {/* 비교 대상 선택 칩 바 */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">비교 대상 선택:</span>
              {experiments.map((exp, idx) => {
                const checked = !excludedIds.includes(exp.id);
                const code = String.fromCharCode(65 + (idx % 26));
                return (
                  <label
                    key={exp.id}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      checked
                        ? "border-blue-600 bg-blue-50 text-blue-950"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCompareSelection(exp.id)}
                      className="h-3.5 w-3.5 accent-blue-600"
                    />
                    <span className="font-mono font-bold text-blue-700">[{code}]</span>
                    <span>{exp.name}</span>
                  </label>
                );
              })}
            </div>

            {/* 비교 차트 4종 + 실제 실험 파손 여부 요약 */}
            {comparedExperiments.length > 0 && (
              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* 차트 1: 총질량 (g) */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-900">
                      비교 차트 1 · 총질량 (계란 + 포장재, g)
                    </h3>
                    <span className="text-[11px] text-slate-500">시뮬레이션 계산값</span>
                  </div>
                  <div className="mt-2.5 space-y-2">
                    {comparedExperiments.map((exp, idx) => {
                      const code = String.fromCharCode(65 + (idx % 26));
                      const pct = Math.min(100, (exp.result.totalMassG / maxMass) * 100);
                      return (
                        <div key={exp.id} className="text-xs">
                          <div className="flex justify-between font-medium text-slate-800">
                            <span className="truncate pr-2">
                              [{code}] {exp.name}
                            </span>
                            <span className="font-mono font-bold">
                              {exp.result.totalMassG.toFixed(1)} g
                            </span>
                          </div>
                          <div className="mt-1 h-2.5 w-full overflow-hidden rounded bg-slate-200">
                            <div
                              className="h-full bg-slate-800"
                              style={{ width: `${Math.max(3, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 차트 2: 평균 충격력 추정치 (N) */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-900">
                      비교 차트 2 · 평균 충격력 추정치 (N, 낮을수록 유리)
                    </h3>
                    <span className="text-[11px] text-slate-500">시뮬레이션 예측</span>
                  </div>
                  <div className="mt-2.5 space-y-2">
                    {comparedExperiments.map((exp, idx) => {
                      const code = String.fromCharCode(65 + (idx % 26));
                      const pct = Math.min(100, (exp.result.averageForceN / maxAvgForce) * 100);
                      return (
                        <div key={exp.id} className="text-xs">
                          <div className="flex justify-between font-medium text-slate-800">
                            <span className="truncate pr-2">
                              [{code}] {exp.name}
                            </span>
                            <span className="font-mono font-bold text-rose-700">
                              {exp.result.averageForceN.toFixed(1)} N
                            </span>
                          </div>
                          <div className="mt-1 h-2.5 w-full overflow-hidden rounded bg-slate-200">
                            <div
                              className="h-full bg-rose-600"
                              style={{ width: `${Math.max(3, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 차트 3: 1차 충돌 지속 시간 추정치 (ms) */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-900">
                      비교 차트 3 · 충돌 지속 시간 추정치 (ms, 길수록 완충 유리)
                    </h3>
                    <span className="text-[11px] text-slate-500">시뮬레이션 예측</span>
                  </div>
                  <div className="mt-2.5 space-y-2">
                    {comparedExperiments.map((exp, idx) => {
                      const code = String.fromCharCode(65 + (idx % 26));
                      const pct = Math.min(
                        100,
                        (exp.result.contactDurationMs / maxDuration) * 100,
                      );
                      return (
                        <div key={exp.id} className="text-xs">
                          <div className="flex justify-between font-medium text-slate-800">
                            <span className="truncate pr-2">
                              [{code}] {exp.name}
                            </span>
                            <span className="font-mono font-bold text-blue-700">
                              {exp.result.contactDurationMs.toFixed(2)} ms
                            </span>
                          </div>
                          <div className="mt-1 h-2.5 w-full overflow-hidden rounded bg-slate-200">
                            <div
                              className="h-full bg-blue-600"
                              style={{ width: `${Math.max(3, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 차트 4: 상대 파손 위험 지표 (0~100) 및 실제 실험 파손 여부 */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-900">
                      비교 차트 4 · 상대 파손 위험 지표 (0~100) 및 실측 결과
                    </h3>
                    <span className="text-[11px] text-slate-500">예측 지수 vs 실측 기록</span>
                  </div>
                  <div className="mt-2.5 space-y-2">
                    {comparedExperiments.map((exp, idx) => {
                      const code = String.fromCharCode(65 + (idx % 26));
                      const pct = Math.min(100, exp.result.riskIndex);
                      return (
                        <div key={exp.id} className="text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-1 font-medium text-slate-800">
                            <span className="truncate pr-2">
                              [{code}] {exp.name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold">
                                위험 지수 {exp.result.riskIndex}
                              </span>
                              {exp.actual ? (
                                <span
                                  className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                                    OUTCOME_LABELS[exp.actual.outcome].badgeClass
                                  }`}
                                >
                                  실측: {OUTCOME_LABELS[exp.actual.outcome].label}
                                </span>
                              ) : (
                                <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400">
                                  실측 미기록
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-1 h-2.5 w-full overflow-hidden rounded bg-slate-200">
                            <div
                              className={`h-full ${
                                exp.result.riskIndex >= 70
                                  ? "bg-rose-600"
                                  : exp.result.riskIndex >= 45
                                    ? "bg-amber-500"
                                    : "bg-emerald-600"
                              }`}
                              style={{ width: `${Math.max(3, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 상세 비교 표 */}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                    <th className="py-2.5 px-3 font-bold">구분 / 실험 이름</th>
                    <th className="py-2.5 px-3 font-bold">낙하 조건</th>
                    <th className="py-2.5 px-3 font-bold">완충재 배치 요약</th>
                    <th className="py-2.5 px-3 font-bold text-right">총질량</th>
                    <th className="py-2.5 px-3 font-bold text-right">충돌 시간</th>
                    <th className="py-2.5 px-3 font-bold text-right">평균 충격력</th>
                    <th className="py-2.5 px-3 font-bold text-right">위험 지표</th>
                    <th className="py-2.5 px-3 font-bold">실제 실험 기록 (예측과 별도)</th>
                    <th className="py-2.5 px-3 font-bold text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {experiments.map((exp, idx) => {
                    const code = String.fromCharCode(65 + (idx % 26));
                    const isEditing = editingNameId === exp.id;
                    return (
                      <tr key={exp.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-blue-700">[{code}]</span>
                            {isEditing ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  onRenameExperiment(exp.id, editingNameValue);
                                  setEditingNameId(null);
                                }}
                                className="flex items-center gap-1"
                              >
                                <input
                                  type="text"
                                  value={editingNameValue}
                                  onChange={(e) => setEditingNameValue(e.target.value)}
                                  className="w-32 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                                />
                                <button
                                  type="submit"
                                  className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white"
                                >
                                  확인
                                </button>
                              </form>
                            ) : (
                              <span>{exp.name}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">
                          {exp.setup.conditions.floors}층 ({exp.result.dropHeightM.toFixed(1)}m)
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-xs">
                          {summarizeMaterialsText(exp.setup)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                          {exp.result.totalMassG.toFixed(1)}g
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-blue-700">
                          {exp.result.contactDurationMs.toFixed(2)}ms
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-rose-700">
                          {exp.result.averageForceN.toFixed(1)}N
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                          {exp.result.riskIndex} / 100
                        </td>
                        <td className="py-2.5 px-3">
                          {exp.actual ? (
                            <div className="space-y-0.5">
                              <span
                                className={`inline-block rounded border px-1.5 py-0.5 text-[10.5px] font-bold ${
                                  OUTCOME_LABELS[exp.actual.outcome].badgeClass
                                }`}
                              >
                                {OUTCOME_LABELS[exp.actual.outcome].label}
                              </span>
                              <div className="text-[11px] text-slate-600">
                                {exp.actual.date}
                                {exp.actual.actualHeightM !== null
                                  ? ` · 실측 높이 ${exp.actual.actualHeightM}m`
                                  : ""}
                                {exp.actual.memo ? ` · "${exp.actual.memo}"` : ""}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">기록 없음</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => onLoadSetup(exp.setup)}
                              className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
                            >
                              시뮬레이터로 불러오기
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectTargetExperiment(exp)}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                            >
                              실측 기록
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNameId(exp.id);
                                setEditingNameValue(exp.name);
                              }}
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
                            >
                              이름변경
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteExperiment(exp.id)}
                              className="rounded border border-rose-200 bg-white px-2 py-1 text-[11px] text-rose-700 hover:bg-rose-50"
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* 2. 실제 실험 결과 기록 폼 (시뮬레이션 예측과 구분된 별도 섹션) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="border-b border-slate-200 pb-3">
          <h2 className="text-base font-bold text-slate-900">
            실제 실험 결과 기록장 (시뮬레이션 예측과 별도 관리)
          </h2>
          <p className="text-xs text-slate-600">
            실제 통제된 안전 환경에서 실험을 수행한 경우, 관찰된 계란 상태와 실제 낙하 높이를 기록하여 시뮬레이션 예측과 비교합니다.
            실제 기록이 없는 실험에는 임의의 결과를 표시하지 않습니다.
          </p>
        </div>

        {experiments.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            먼저 실험 구성을 하나 이상 저장하면 해당 실험에 대한 실제 실험 결과를 기록할 수 있습니다.
          </p>
        ) : (
          <form onSubmit={handleSaveActualSubmit} className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label
                  htmlFor="actual-target-exp"
                  className="block text-xs font-semibold text-slate-700"
                >
                  기록할 대상 실험 선택
                </label>
                <select
                  id="actual-target-exp"
                  value={activeActualTarget?.id ?? ""}
                  onChange={(e) => {
                    const found = experiments.find((item) => item.id === e.target.value);
                    if (found) handleSelectTargetExperiment(found);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900"
                >
                  {experiments.map((exp, idx) => (
                    <option key={exp.id} value={exp.id}>
                      [{String.fromCharCode(65 + (idx % 26))}] {exp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="actual-date" className="block text-xs font-semibold text-slate-700">
                  실험 날짜
                </label>
                <input
                  id="actual-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="actual-height"
                  className="block text-xs font-semibold text-slate-700"
                >
                  사용자가 기록한 실제 낙하 높이 (m)
                </label>
                <input
                  id="actual-height"
                  type="number"
                  min={0.1}
                  max={30}
                  step={0.1}
                  value={actualHeightStr}
                  onChange={(e) => setActualHeightStr(e.target.value)}
                  placeholder="예: 1.8 (안전한 낮은 높이 권장)"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900"
                />
              </div>
            </div>

            {/* 실제 계란 파손 여부 3단계 라디오 */}
            <div>
              <span className="block text-xs font-semibold text-slate-700">
                실제 계란 파손 결과 선택
              </span>
              <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(["intact", "cracked", "broken"] as ActualOutcome[]).map((key) => {
                  const selected = outcome === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setOutcome(key)}
                      className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                        selected
                          ? `${OUTCOME_LABELS[key].badgeClass} ring-2 ring-blue-500/40`
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {OUTCOME_LABELS[key].label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label
                  htmlFor="actual-materials-note"
                  className="block text-xs font-semibold text-slate-700"
                >
                  실제 사용 재료 및 배치 기록
                </label>
                <input
                  id="actual-materials-note"
                  type="text"
                  value={materialsNote}
                  onChange={(e) => setMaterialsNote(e.target.value)}
                  placeholder={
                    activeActualTarget
                      ? summarizeMaterialsText(activeActualTarget.setup)
                      : "예: 뽁뽁이 2겹 전체 감싸기 + 종이컵 받침"
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>

              <div>
                <label htmlFor="actual-memo" className="block text-xs font-semibold text-slate-700">
                  실제 관찰 메모 (착지 자세, 찌그러짐 등)
                </label>
                <input
                  id="actual-memo"
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="예: 옆면으로 착지했으나 스펀지가 충격을 흡수해 온전함"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  실제 실험 기록 저장
                </button>
                {activeActualTarget?.actual && (
                  <button
                    type="button"
                    onClick={handleClearActual}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                  >
                    실측 기록 삭제
                  </button>
                )}
              </div>
              {recordFeedback && (
                <span className="text-xs font-medium text-emerald-700">{recordFeedback}</span>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
