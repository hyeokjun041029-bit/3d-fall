"use client";

import React, { useState } from "react";
import {
  createId,
  createSampleConfigs,
  DEFAULT_CONDITIONS,
  dropHeightM,
  FLOOR_OPTIONS,
  GRAVITY_PRESETS,
  LIMITS,
  SURFACE_ORDER,
  SURFACES,
} from "@/lib/eggdrop/defaults";
import {
  getAllowedPositions,
  getMaterial,
  isPositionAllowed,
  MATERIAL_CATALOG,
} from "@/lib/eggdrop/materialCatalog";
import { summarizeConfig } from "@/lib/eggdrop/packageModel";
import { POSITIONS } from "@/lib/eggdrop/positions";
import type {
  DropConditions,
  ExperimentSetup,
  MaterialConfig,
  PositionId,
  SurfaceId,
} from "@/lib/eggdrop/types";

interface SetupPanelProps {
  setup: ExperimentSetup;
  onChangeSetup: (next: ExperimentSetup) => void;
  onSaveExperiment: (name: string) => void;
  onOpenCatalogModal: () => void;
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function SetupPanel({
  setup,
  onChangeSetup,
  onSaveExperiment,
  onOpenCatalogModal,
}: SetupPanelProps) {
  const { conditions, configs } = setup;
  const [experimentName, setExperimentName] = useState("2층 뽁뽁이·스펀지 복합 실험");
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const totalHeightM = dropHeightM(conditions);

  // 각 행의 요약 및 전체 질량·수량 합산 (입력 변경 즉시 갱신)
  const rowSummaries = configs.map((cfg) => summarizeConfig(cfg));
  const packageMassG = rowSummaries.reduce((acc, s) => acc + s.massG, 0);
  const totalMassG = conditions.eggMassG + packageMassG;
  const totalQuantity = configs.reduce((acc, c) => acc + c.quantity, 0);

  const updateConditions = (patch: Partial<DropConditions>) => {
    onChangeSetup({
      conditions: { ...conditions, ...patch },
      configs,
    });
  };

  const handleMaterialChange = (rowId: string, nextMaterialId: string) => {
    const allowed = getAllowedPositions(nextMaterialId);
    if (allowed.length === 0) return;

    const nextConfigs = configs.map((cfg) => {
      if (cfg.id !== rowId) return cfg;
      // 기존 부착 위치가 새 재료에서 허용되지 않으면 첫 번째 허용 위치로 자동 변경
      const nextPos: PositionId = isPositionAllowed(nextMaterialId, cfg.position)
        ? cfg.position
        : allowed[0];
      if (nextPos !== cfg.position) {
        const mat = getMaterial(nextMaterialId);
        const posLabel = mat?.positions[nextPos]?.label ?? POSITIONS[nextPos].name;
        setValidationNotice(
          `'${mat?.name}' 재료는 기존 부착 위치를 지원하지 않아 '${posLabel}' 위치로 자동 조정되었습니다.`,
        );
      } else {
        setValidationNotice(null);
      }
      return { ...cfg, materialId: nextMaterialId, position: nextPos };
    });

    onChangeSetup({ conditions, configs: nextConfigs });
  };

  const handlePositionChange = (rowId: string, nextPosition: PositionId) => {
    const nextConfigs = configs.map((cfg) => {
      if (cfg.id !== rowId) return cfg;
      if (!isPositionAllowed(cfg.materialId, nextPosition)) return cfg;
      return { ...cfg, position: nextPosition };
    });
    setValidationNotice(null);
    onChangeSetup({ conditions, configs: nextConfigs });
  };

  const handleQuantityChange = (rowId: string, rawVal: string | number) => {
    const parsed = typeof rawVal === "number" ? rawVal : Number.parseInt(rawVal, 10);
    if (!Number.isFinite(parsed)) {
      setValidationNotice("수량은 1에서 10 사이의 정수로 입력해 주세요.");
      return;
    }
    if (parsed < LIMITS.quantity.min || parsed > LIMITS.quantity.max) {
      setValidationNotice(
        `수량은 ${LIMITS.quantity.min}~${LIMITS.quantity.max} 범위만 허용되어 자동 보정되었습니다.`,
      );
    } else {
      setValidationNotice(null);
    }
    const clamped = clampNumber(
      Math.round(parsed),
      LIMITS.quantity.min,
      LIMITS.quantity.max,
      1,
    );
    onChangeSetup({
      conditions,
      configs: configs.map((cfg) => (cfg.id === rowId ? { ...cfg, quantity: clamped } : cfg)),
    });
  };

  const handleAddConfig = () => {
    if (configs.length >= LIMITS.maxConfigs) {
      setValidationNotice(`재료 구성 행은 최대 ${LIMITS.maxConfigs}개까지 추가할 수 있습니다.`);
      return;
    }
    // 기본 추가 재료: 아직 사용되지 않은 위치나 스펀지/뽁뽁이 등을 편리하게 추가
    const defaultMat = MATERIAL_CATALOG[0];
    const allowed = getAllowedPositions(defaultMat.id);
    const nextRow: MaterialConfig = {
      id: createId("cfg"),
      materialId: defaultMat.id,
      position: allowed[0] ?? "wrap",
      quantity: 2,
    };
    setValidationNotice(null);
    onChangeSetup({ conditions, configs: [...configs, nextRow] });
  };

  const handleDuplicateRow = (row: MaterialConfig) => {
    if (configs.length >= LIMITS.maxConfigs) {
      setValidationNotice(`재료 구성 행은 최대 ${LIMITS.maxConfigs}개까지 추가할 수 있습니다.`);
      return;
    }
    // 같은 재료를 다른 허용 위치에 배치하기 쉽도록 미사용 허용 위치를 우선 제안
    const allowed = getAllowedPositions(row.materialId);
    const usedPositionsForMat = new Set(
      configs.filter((c) => c.materialId === row.materialId).map((c) => c.position),
    );
    const suggestedPos = allowed.find((p) => !usedPositionsForMat.has(p)) ?? row.position;
    const copy: MaterialConfig = {
      ...row,
      id: createId("cfg"),
      position: suggestedPos,
    };
    setValidationNotice(null);
    onChangeSetup({ conditions, configs: [...configs, copy] });
  };

  const handleRemoveRow = (rowId: string) => {
    setValidationNotice(null);
    onChangeSetup({
      conditions,
      configs: configs.filter((cfg) => cfg.id !== rowId),
    });
  };

  const handleClearConfigs = () => {
    setValidationNotice(null);
    onChangeSetup({ conditions, configs: [] });
  };

  const handleResetSampleConfigs = () => {
    setValidationNotice(null);
    onChangeSetup({ conditions, configs: createSampleConfigs() });
  };

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = experimentName.trim() || `${conditions.floors}층 실험 (${totalMassG.toFixed(0)}g)`;
    onSaveExperiment(trimmed);
    setSaveFeedback(`'${trimmed}' 구성이 비교 목록에 저장되었습니다.`);
  };

  return (
    <aside
      aria-label="낙하 조건 및 완충재 구성 설정"
      className="flex flex-col gap-4"
    >
      {/* 1. 낙하 높이 및 초기 조건 카드 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div>
            <h2 className="text-base font-bold text-slate-900">1. 낙하 높이 및 초기 조건</h2>
            <p className="text-xs text-slate-600">층수·층고 및 초기 운동 상태를 설정합니다.</p>
          </div>
          <button
            type="button"
            onClick={() => onChangeSetup({ conditions: { ...DEFAULT_CONDITIONS }, configs })}
            className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            조건 초기화
          </button>
        </div>

        {/* 낙하 층수 선택 */}
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-slate-800">낙하 층수 선택 (가상 시뮬레이션)</span>
            <span className="font-mono text-sm font-bold text-blue-700">
              {conditions.floors}층 · 총 {totalHeightM.toFixed(1)} m
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {FLOOR_OPTIONS.map((f) => {
              const h = (f * conditions.floorHeightM).toFixed(1);
              const selected = conditions.floors === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => updateConditions({ floors: f })}
                  className={`flex flex-col items-center rounded-lg border py-2 text-xs transition ${
                    selected
                      ? "border-blue-600 bg-blue-600 text-white font-bold"
                      : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <span>{f}층</span>
                  <span className={`font-mono text-[11px] ${selected ? "text-blue-100" : "text-slate-500"}`}>
                    {h}m
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 층고 설정 및 안내 */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="input-floor-height" className="block text-xs font-semibold text-slate-700">
              1개 층고 가정 (m)
            </label>
            <input
              id="input-floor-height"
              type="number"
              min={LIMITS.floorHeightM.min}
              max={LIMITS.floorHeightM.max}
              step={LIMITS.floorHeightM.step}
              value={conditions.floorHeightM}
              onChange={(e) => {
                const v = clampNumber(
                  Number.parseFloat(e.target.value),
                  LIMITS.floorHeightM.min,
                  LIMITS.floorHeightM.max,
                  3.0,
                );
                updateConditions({ floorHeightM: v });
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900"
            />
          </div>
          <div>
            <label htmlFor="input-egg-mass" className="block text-xs font-semibold text-slate-700">
              계란 질량 (g, 기본 60g)
            </label>
            <input
              id="input-egg-mass"
              type="number"
              min={LIMITS.eggMassG.min}
              max={LIMITS.eggMassG.max}
              step={LIMITS.eggMassG.step}
              value={conditions.eggMassG}
              onChange={(e) => {
                const v = clampNumber(
                  Number.parseFloat(e.target.value),
                  LIMITS.eggMassG.min,
                  LIMITS.eggMassG.max,
                  60,
                );
                updateConditions({ eggMassG: v });
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900"
            />
          </div>
        </div>

        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-2 text-[11px] leading-relaxed text-amber-950">
          <strong>층고 및 실제 실험 안전 안내:</strong> 기본 층고는 3.0m로 가정하며 실제 건물의 층고는 구조마다 다릅니다.
          2~5층 선택은 <strong>가상 시뮬레이션 전용 기능</strong>입니다. 실제 낙하 실험을 고층 건물이나 베란다에서 수행하지 마시고,
          낮은 높이의 통제된 장소에서 주변 사람과 충분한 안전거리를 확보한 뒤 교사 또는 성인의 감독 아래 진행하세요.
        </p>

        {/* 기울기, 초기 각속도, 중력, 바닥 재질 */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="input-tilt" className="block text-xs font-semibold text-slate-700">
              초기 기울기 (°: -90~90)
            </label>
            <input
              id="input-tilt"
              type="number"
              min={LIMITS.initialTiltDeg.min}
              max={LIMITS.initialTiltDeg.max}
              step={LIMITS.initialTiltDeg.step}
              value={conditions.initialTiltDeg}
              onChange={(e) => {
                const v = clampNumber(
                  Number.parseFloat(e.target.value),
                  LIMITS.initialTiltDeg.min,
                  LIMITS.initialTiltDeg.max,
                  0,
                );
                updateConditions({ initialTiltDeg: v });
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900"
            />
          </div>
          <div>
            <label htmlFor="input-omega" className="block text-xs font-semibold text-slate-700">
              초기 회전 각속도 (°/s)
            </label>
            <input
              id="input-omega"
              type="number"
              min={LIMITS.initialAngularVelocityDegS.min}
              max={LIMITS.initialAngularVelocityDegS.max}
              step={LIMITS.initialAngularVelocityDegS.step}
              value={conditions.initialAngularVelocityDegS}
              onChange={(e) => {
                const v = clampNumber(
                  Number.parseFloat(e.target.value),
                  LIMITS.initialAngularVelocityDegS.min,
                  LIMITS.initialAngularVelocityDegS.max,
                  0,
                );
                updateConditions({ initialAngularVelocityDegS: v });
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900"
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="input-gravity" className="text-xs font-semibold text-slate-700">
                중력 가속도 (m/s²)
              </label>
              <div className="flex gap-1">
                {GRAVITY_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => updateConditions({ gravity: p.value })}
                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              id="input-gravity"
              type="number"
              min={LIMITS.gravity.min}
              max={LIMITS.gravity.max}
              step={LIMITS.gravity.step}
              value={conditions.gravity}
              onChange={(e) => {
                const v = clampNumber(
                  Number.parseFloat(e.target.value),
                  LIMITS.gravity.min,
                  LIMITS.gravity.max,
                  9.81,
                );
                updateConditions({ gravity: v });
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="select-surface" className="block text-xs font-semibold text-slate-700">
              바닥 재질 (충돌 표면)
            </label>
            <select
              id="select-surface"
              value={conditions.surface}
              onChange={(e) => updateConditions({ surface: e.target.value as SurfaceId })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
            >
              {SURFACE_ORDER.map((sid) => (
                <option key={sid} value={sid}>
                  {SURFACES[sid].name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 공기 저항 체크박스 및 기준 하중 조정 */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={conditions.airResistance}
              onChange={(e) => updateConditions({ airResistance: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 accent-blue-600"
            />
            공기 저항 및 공력 회전 감쇠 반영
          </label>

          <div className="flex items-center gap-1.5 text-xs">
            <label htmlFor="input-shell-ref" className="text-slate-600">
              껍데기 기준 하중(가정값):
            </label>
            <input
              id="input-shell-ref"
              type="number"
              min={LIMITS.shellReferenceLoadN.min}
              max={LIMITS.shellReferenceLoadN.max}
              value={conditions.shellReferenceLoadN}
              onChange={(e) => {
                const v = clampNumber(
                  Number.parseFloat(e.target.value),
                  LIMITS.shellReferenceLoadN.min,
                  LIMITS.shellReferenceLoadN.max,
                  35,
                );
                updateConditions({ shellReferenceLoadN: v });
              }}
              className="w-14 rounded border border-slate-300 px-1.5 py-0.5 font-mono text-xs text-slate-900"
            />
            <span className="text-slate-500">N</span>
          </div>
        </div>
      </div>

      {/* 2. 질량 구분 요약 및 완충재 조합 설정 카드 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div>
            <h2 className="text-base font-bold text-slate-900">2. 완충재 배치 및 수량 구성 (15종)</h2>
            <p className="text-xs text-slate-600">
              동일 재료를 여러 위치에 다른 수량(1~10)으로 조합할 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenCatalogModal}
            className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100"
          >
            15종 물성표 보기
          </button>
        </div>

        {/* 질량 구분 표시 바: 계란 질량 / 포장재 질량 / 총질량 / 총수량 */}
        <div className="mt-3 grid grid-cols-4 gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
          <div>
            <div className="text-[11px] text-slate-500">계란 질량</div>
            <div className="font-mono text-xs font-bold text-slate-900">
              {conditions.eggMassG.toFixed(1)} g
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">포장재 질량</div>
            <div className="font-mono text-xs font-bold text-blue-700">
              {packageMassG.toFixed(1)} g
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">구조 총질량</div>
            <div className="font-mono text-xs font-bold text-slate-950">
              {totalMassG.toFixed(1)} g
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">총 재료 수량</div>
            <div className="font-mono text-xs font-bold text-slate-800">
              {configs.length}행 · {totalQuantity}단위
            </div>
          </div>
        </div>

        {/* 액션 버튼 모음 */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleAddConfig}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            + 재료 구성 추가
          </button>
          <button
            type="button"
            onClick={handleResetSampleConfigs}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            샘플 구성 불러오기
          </button>
          <button
            type="button"
            onClick={handleClearConfigs}
            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100"
          >
            모두 비우기(맨 계란)
          </button>
        </div>

        {validationNotice && (
          <div
            role="status"
            className="mt-2.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-900"
          >
            {validationNotice}
          </div>
        )}

        {/* 재료 구성 행 목록 */}
        <div className="mt-3 space-y-2.5">
          {configs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-600">
              현재 완충재가 없는 <strong>맨 계란</strong> 상태입니다. 위의{" "}
              <strong>+ 재료 구성 추가</strong> 또는 <strong>샘플 구성 불러오기</strong>를 눌러 완충재를 배치하세요.
            </div>
          ) : (
            configs.map((cfg, index) => {
              const mat = getMaterial(cfg.materialId);
              const allowedPositions = getAllowedPositions(cfg.materialId);
              const summary = rowSummaries[index];
              if (!mat) return null;

              return (
                <div
                  key={cfg.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-3 w-3 rounded-sm border border-slate-400"
                        style={{ backgroundColor: mat.color }}
                      />
                      <span className="text-xs font-bold text-slate-800">
                        완충층 #{index + 1}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        ({summary.massG.toFixed(1)}g · 두께 {summary.thicknessMm.toFixed(1)}mm)
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDuplicateRow(cfg)}
                        title="이 재료 행을 다른 위치에 복제"
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                      >
                        복제
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(cfg.id)}
                        title="이 재료 행 삭제"
                        className="rounded border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
                      >
                        삭제
                      </button>
                    </div>
                  </div>

                  {/* 재료 선택 & 허용된 부착 위치 선택 */}
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`mat-select-${cfg.id}`}
                        className="block text-[11px] font-semibold text-slate-600"
                      >
                        재료 선택
                      </label>
                      <select
                        id={`mat-select-${cfg.id}`}
                        value={cfg.materialId}
                        onChange={(e) => handleMaterialChange(cfg.id, e.target.value)}
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-900"
                      >
                        {MATERIAL_CATALOG.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.unitMassG}g/{m.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor={`pos-select-${cfg.id}`}
                        className="block text-[11px] font-semibold text-slate-600"
                      >
                        부착 위치 (해당 재료 허용 위치만 표시)
                      </label>
                      <select
                        id={`pos-select-${cfg.id}`}
                        value={cfg.position}
                        onChange={(e) =>
                          handlePositionChange(cfg.id, e.target.value as PositionId)
                        }
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-900"
                      >
                        {allowedPositions.map((posId) => {
                          const customLabel = mat.positions[posId]?.label;
                          const baseName = POSITIONS[posId].name;
                          const display =
                            customLabel && customLabel !== baseName
                              ? `${baseName} (${customLabel})`
                              : baseName;
                          return (
                            <option key={posId} value={posId}>
                              {display}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  {/* 수량 조절 (- / 직접 입력 / +) 및 단위·물성 요약 */}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-600">수량:</span>
                      <button
                        type="button"
                        aria-label="수량 감소"
                        disabled={cfg.quantity <= LIMITS.quantity.min}
                        onClick={() => handleQuantityChange(cfg.id, cfg.quantity - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        aria-label="수량 직접 입력"
                        min={LIMITS.quantity.min}
                        max={LIMITS.quantity.max}
                        value={cfg.quantity}
                        onChange={(e) => handleQuantityChange(cfg.id, e.target.value)}
                        className="h-7 w-14 rounded border border-slate-300 bg-white text-center font-mono text-xs font-bold text-slate-900"
                      />
                      <button
                        type="button"
                        aria-label="수량 증가"
                        disabled={cfg.quantity >= LIMITS.quantity.max}
                        onClick={() => handleQuantityChange(cfg.id, cfg.quantity + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                      >
                        +
                      </button>
                      <span className="text-xs font-semibold text-slate-700">{mat.unit}</span>
                    </div>

                    <span className="text-[11px] text-slate-500">
                      흡수율 {(mat.energyAbsorption * 100).toFixed(0)}% · 압축률{" "}
                      {(mat.compressibility * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 재료 배치 요약 텍스트 */}
        {configs.length > 0 && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">현재 배치 요약: </span>
            {configs
              .map((cfg) => {
                const m = getMaterial(cfg.materialId);
                if (!m) return "";
                const posLabel = m.positions[cfg.position]?.label ?? POSITIONS[cfg.position].name;
                return `${m.name} ${cfg.quantity}${m.unit}(${posLabel})`;
              })
              .filter(Boolean)
              .join(" + ")}
          </div>
        )}

        {/* 현재 구성을 이름을 붙여 저장 */}
        <form onSubmit={handleSaveSubmit} className="mt-3 border-t border-slate-100 pt-3">
          <label htmlFor="save-exp-name" className="block text-xs font-semibold text-slate-800">
            현재 실험 구성 저장 (하단 A/B/C 비교에 추가)
          </label>
          <div className="mt-1.5 flex gap-1.5">
            <input
              id="save-exp-name"
              type="text"
              value={experimentName}
              onChange={(e) => setExperimentName(e.target.value)}
              placeholder="예: 2층 뽁뽁이 전체+아래 보강"
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              실험 저장
            </button>
          </div>
          {saveFeedback && (
            <p className="mt-1.5 text-[11px] font-medium text-emerald-700">{saveFeedback}</p>
          )}
        </form>
      </div>
    </aside>
  );
}
