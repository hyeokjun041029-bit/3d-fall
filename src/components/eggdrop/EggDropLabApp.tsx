"use client";

import React, { useMemo, useState, useSyncExternalStore } from "react";
import { ComparisonSection } from "./ComparisonSection";
import { CatalogModal, GuideModal } from "./Modals";
import { ResultsPanel } from "./ResultsPanel";
import { SetupPanel } from "./SetupPanel";
import { SimulationStage3D } from "./SimulationStage3D";
import {
  createId,
  createSampleConfigs,
  createSampleSetup,
  dropHeightM,
  FLOOR_OPTIONS,
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
import { POSITIONS } from "@/lib/eggdrop/positions";
import { simulateWithBaseline } from "@/lib/eggdrop/simulation";
import { EMPTY_EXPERIMENTS, getExperimentRepository } from "@/lib/eggdrop/storage";
import type {
  ActualRecord,
  ExperimentSetup,
  MaterialConfig,
  PositionId,
  SavedExperiment,
  SurfaceId,
} from "@/lib/eggdrop/types";

function subscribeRepo(callback: () => void) {
  return getExperimentRepository().subscribe(callback);
}

function getRepoSnapshot(): SavedExperiment[] {
  return getExperimentRepository().list();
}

function getServerRepoSnapshot(): SavedExperiment[] {
  return EMPTY_EXPERIMENTS;
}

export function EggDropLabApp() {
  const [setup, setSetup] = useState<ExperimentSetup>(createSampleSetup);
  const [draggingMaterialId, setDraggingMaterialId] = useState<string | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<"none" | "setup" | "results" | "compare">("none");
  const [guideOpen, setGuideOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [quickSaveName, setQuickSaveName] = useState("");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const savedExperiments = useSyncExternalStore(
    subscribeRepo,
    getRepoSnapshot,
    getServerRepoSnapshot,
  );

  const simResult = useMemo(() => simulateWithBaseline(setup), [setup]);
  const { conditions, configs } = setup;
  const { summary } = simResult;

  const showToast = (msg: string) => {
    setToastMsg(msg);
  };

  /**
   * 3D 드래그 앤 드롭 또는 하단 팔레트 클릭으로 재료 추가:
   * 이미 같은 재료+위치가 있으면 수량을 +1 증가시켜 3D 화면에서 즉시 더 두꺼워지거나 개수가 늘어나게 하고,
   * 없으면 새 레이어 행으로 추가한다.
   */
  const handleAddOrIncrementMaterial = (materialId: string, position?: PositionId) => {
    const mat = getMaterial(materialId);
    if (!mat) return;
    const allowed = getAllowedPositions(materialId);
    if (allowed.length === 0) return;

    const targetPos = position && allowed.includes(position) ? position : allowed[0];
    const existing = configs.find(
      (c) => c.materialId === materialId && c.position === targetPos,
    );

    if (existing) {
      if (existing.quantity >= LIMITS.quantity.max) {
        showToast(`${mat.name} (${POSITIONS[targetPos].name}) 수량이 최대(10${mat.unit})입니다.`);
        return;
      }
      const nextQty = existing.quantity + 1;
      setSetup({
        conditions,
        configs: configs.map((c) => (c.id === existing.id ? { ...c, quantity: nextQty } : c)),
      });
      const posLabel = mat.positions[targetPos]?.label ?? POSITIONS[targetPos].name;
      showToast(`${mat.name} · ${posLabel} → ${nextQty}${mat.unit} (+1 추가됨)`);
      return;
    }

    if (configs.length >= LIMITS.maxConfigs) {
      showToast(`완충재 레이어는 최대 ${LIMITS.maxConfigs}개까지 추가할 수 있습니다.`);
      return;
    }

    const nextRow: MaterialConfig = {
      id: createId("cfg"),
      materialId,
      position: targetPos,
      quantity: 1,
    };
    setSetup({ conditions, configs: [...configs, nextRow] });
    const posLabel = mat.positions[targetPos]?.label ?? POSITIONS[targetPos].name;
    showToast(`${mat.name} 1${mat.unit} → [${posLabel}] 위치에 부착됨`);
  };

  const handleRowQuantityDelta = (rowId: string, delta: number) => {
    setSetup({
      conditions,
      configs: configs.map((c) => {
        if (c.id !== rowId) return c;
        const nextQ = Math.min(LIMITS.quantity.max, Math.max(LIMITS.quantity.min, c.quantity + delta));
        return { ...c, quantity: nextQ };
      }),
    });
  };

  const handleRowPositionChange = (rowId: string, nextPos: PositionId) => {
    setSetup({
      conditions,
      configs: configs.map((c) => {
        if (c.id !== rowId) return c;
        if (!isPositionAllowed(c.materialId, nextPos)) return c;
        return { ...c, position: nextPos };
      }),
    });
  };

  const handleRowMaterialChange = (rowId: string, nextMatId: string) => {
    const allowed = getAllowedPositions(nextMatId);
    if (allowed.length === 0) return;
    setSetup({
      conditions,
      configs: configs.map((c) => {
        if (c.id !== rowId) return c;
        const validPos = isPositionAllowed(nextMatId, c.position) ? c.position : allowed[0];
        return { ...c, materialId: nextMatId, position: validPos };
      }),
    });
  };

  const handleRemoveRow = (rowId: string) => {
    setSetup({
      conditions,
      configs: configs.filter((c) => c.id !== rowId),
    });
  };

  const handleSaveExperiment = (name: string) => {
    const trimmed =
      name.trim() ||
      `${conditions.floors}층 (${dropHeightM(conditions).toFixed(0)}m) · ${summary.totalMassG.toFixed(0)}g`;
    getExperimentRepository().save({
      name: trimmed,
      setup,
      result: summary,
    });
    setQuickSaveName("");
    showToast(`'${trimmed}' 실험이 저장되었습니다.`);
  };

  const handleSaveQuickExperiment = () => {
    const idx = savedExperiments.length + 1;
    handleSaveExperiment(`실험 #${idx} (${conditions.floors}층 · ${summary.totalMassG.toFixed(0)}g)`);
  };

  const handleUpdateActual = (id: string, actual: ActualRecord | null) => {
    getExperimentRepository().updateActual(id, actual);
  };

  const handleDeleteExperiment = (id: string) => {
    getExperimentRepository().remove(id);
  };

  const handleRenameExperiment = (id: string, nextName: string) => {
    getExperimentRepository().rename(id, nextName);
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      {/* 1. 초슬림 상단 바 */}
      <header className="z-30 flex h-13 shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/95 px-3 backdrop-blur-md sm:px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 font-mono text-xs font-black text-slate-950">
            3D
          </div>
          <div>
            <span className="text-sm font-extrabold tracking-tight text-white">EggDrop Lab</span>
            <span className="ml-2 hidden text-[11px] text-slate-400 md:inline">
              재료를 드래그해 3D 계란에 붙이거나 +를 눌러 겹겹이 쌓아보세요
            </span>
          </div>
        </div>

        {/* 빠른 낙하 층수 & 바닥 선택 */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <div className="flex items-center rounded-lg border border-slate-700 bg-slate-800/90 p-0.5 text-xs">
            {FLOOR_OPTIONS.map((f) => {
              const h = (f * conditions.floorHeightM).toFixed(0);
              const active = conditions.floors === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSetup({ conditions: { ...conditions, floors: f }, configs })}
                  className={`rounded-md px-2.5 py-1 font-bold transition ${
                    active ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {f}층({h}m)
                </button>
              );
            })}
          </div>

          <select
            aria-label="바닥 재질 선택"
            value={conditions.surface}
            onChange={(e) =>
              setSetup({
                conditions: { ...conditions, surface: e.target.value as SurfaceId },
                configs,
              })
            }
            className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200"
          >
            {SURFACE_ORDER.map((sid) => (
              <option key={sid} value={sid}>
                바닥: {SURFACES[sid].name}
              </option>
            ))}
          </select>
        </div>

        {/* 우측 드로어/모달 열기 버튼들 */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === "setup" ? "none" : "setup")}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
              activeDrawer === "setup"
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
          >
            상세 조건
          </button>
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === "results" ? "none" : "results")}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
              activeDrawer === "results"
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
          >
            물리량·원리
          </button>
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === "compare" ? "none" : "compare")}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
              activeDrawer === "compare"
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
          >
            비교·실측 ({savedExperiments.length})
          </button>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="hidden rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 sm:inline-block"
          >
            안내
          </button>
        </div>
      </header>

      {/* 2. 메인 3D 스테이지 + 좌/우 미니멀 플로팅 HUD + 하단 드래그 팔레트 */}
      <div className="relative flex-1 overflow-hidden">
        <SimulationStage3D
          setup={setup}
          simResult={simResult}
          draggingMaterialId={draggingMaterialId}
          onDropMaterialAtPosition={(matId, pos) => {
            setDraggingMaterialId(null);
            handleAddOrIncrementMaterial(matId, pos);
          }}
        />

        {/* 토스트 알림 배지 */}
        {toastMsg && (
          <div className="pointer-events-none absolute top-14 left-1/2 z-30 -translate-x-1/2 rounded-full border border-emerald-400/50 bg-slate-900/95 px-4 py-1 text-xs font-semibold text-emerald-300 shadow-lg">
            {toastMsg}
          </div>
        )}

        {/* 좌측 플로팅 HUD: 현재 계란에 부착된 완충재 스택 (수량 +/- 조작 시 3D에 즉시 반영) */}
        <aside
          aria-label="부착된 완충재 레이어"
          className="pointer-events-auto absolute top-14 left-3 z-10 flex max-h-[calc(100%-210px)] w-72 flex-col rounded-2xl border border-slate-700/80 bg-slate-900/85 p-3 text-xs text-slate-100 shadow-xl backdrop-blur-md sm:w-80"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h2 className="font-bold text-white">부착된 3D 완충재 ({configs.length})</h2>
              <p className="font-mono text-[11px] text-slate-400">
                계란 {summary.eggMassG.toFixed(0)}g + 포장 {summary.packageMassG.toFixed(1)}g ={" "}
                <strong className="text-amber-300">{summary.totalMassG.toFixed(1)}g</strong>
              </p>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setSetup({ conditions, configs: createSampleConfigs() })}
                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
              >
                샘플
              </button>
              <button
                type="button"
                onClick={() => setSetup({ conditions, configs: [] })}
                className="rounded border border-rose-800/70 bg-rose-950/60 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-900/60"
              >
                비우기
              </button>
            </div>
          </div>

          {/* 레이어 리스트 */}
          <div className="mt-2 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {configs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-[11px] text-slate-400">
                아래 팔레트에서 재료를 <strong>3D 계란 위로 드래그</strong>하거나{" "}
                <strong>+ 버튼</strong>을 눌러 완충재를 붙여보세요!
              </div>
            ) : (
              configs.map((cfg, idx) => {
                const mat = getMaterial(cfg.materialId);
                const allowed = getAllowedPositions(cfg.materialId);
                if (!mat) return null;
                return (
                  <div
                    key={cfg.id}
                    className="flex flex-col gap-1.5 rounded-xl border border-slate-800 bg-slate-800/75 p-2"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-white/30"
                          style={{ backgroundColor: mat.color }}
                        />
                        <select
                          aria-label={`완충층 ${idx + 1} 재료`}
                          value={cfg.materialId}
                          onChange={(e) => handleRowMaterialChange(cfg.id, e.target.value)}
                          className="truncate rounded bg-slate-900/90 px-1.5 py-0.5 text-xs font-bold text-white"
                        >
                          {MATERIAL_CATALOG.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveRow(cfg.id)}
                        aria-label="완충재 제거"
                        className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-rose-900/50 hover:text-rose-300"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-1.5">
                      {/* 허용된 위치 드롭다운 */}
                      <select
                        aria-label={`완충층 ${idx + 1} 부착 위치`}
                        value={cfg.position}
                        onChange={(e) =>
                          handleRowPositionChange(cfg.id, e.target.value as PositionId)
                        }
                        className="flex-1 truncate rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px] text-sky-300"
                      >
                        {allowed.map((posId) => {
                          const label = mat.positions[posId]?.label ?? POSITIONS[posId].name;
                          return (
                            <option key={posId} value={posId}>
                              위치: {label}
                            </option>
                          );
                        })}
                      </select>

                      {/* 수량 - / + 버튼 (누를수록 3D 메쉬가 즉시 늘어남) */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleRowQuantityDelta(cfg.id, -1)}
                          disabled={cfg.quantity <= LIMITS.quantity.min}
                          className="flex h-6 w-6 items-center justify-center rounded bg-slate-700 font-bold text-white hover:bg-slate-600 disabled:opacity-35"
                        >
                          -
                        </button>
                        <span className="w-11 text-center font-mono text-xs font-bold text-amber-300">
                          {cfg.quantity}
                          {mat.unit}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRowQuantityDelta(cfg.id, 1)}
                          disabled={cfg.quantity >= LIMITS.quantity.max}
                          className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 font-bold text-white hover:bg-blue-500 disabled:opacity-35"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 한 줄 실험 저장 */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveExperiment(quickSaveName);
            }}
            className="mt-2 flex gap-1.5 border-t border-slate-800 pt-2"
          >
            <input
              type="text"
              value={quickSaveName}
              onChange={(e) => setQuickSaveName(e.target.value)}
              placeholder="실험 이름 (비교용 저장)"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white placeholder:text-slate-500"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-500"
            >
              저장
            </button>
          </form>
        </aside>

        {/* 우측 플로팅 HUD: 핵심 물리량 및 파손 위험 요약 */}
        <aside
          aria-label="핵심 물리 결과 요약"
          className="pointer-events-auto absolute top-14 right-3 z-10 hidden w-64 flex-col gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/85 p-3 text-xs text-slate-100 shadow-xl backdrop-blur-md lg:flex"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">예상 충격·위험 지표</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                summary.riskLevel === "low"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : summary.riskLevel === "caution"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
              }`}
            >
              위험도 {summary.riskIndex}/100
            </span>
          </div>

          {/* 위험 게이지 바 */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full transition-all ${
                summary.riskIndex >= 70
                  ? "bg-rose-500"
                  : summary.riskIndex >= 45
                    ? "bg-amber-400"
                    : "bg-emerald-400"
              }`}
              style={{ width: `${Math.max(4, Math.min(100, summary.riskIndex))}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5 font-mono">
            <div className="rounded-lg bg-slate-800/80 p-2">
              <div className="font-sans text-[10px] text-slate-400">충돌 직전 속도</div>
              <div className="text-xs font-bold text-white">{summary.impactSpeed.toFixed(2)} m/s</div>
            </div>
            <div className="rounded-lg bg-slate-800/80 p-2">
              <div className="font-sans text-[10px] text-slate-400">충돌 지속 시간</div>
              <div className="text-xs font-bold text-sky-300">
                {summary.contactDurationMs.toFixed(1)} ms
              </div>
            </div>
            <div className="rounded-lg bg-slate-800/80 p-2">
              <div className="font-sans text-[10px] text-slate-400">평균 충격력</div>
              <div className="text-xs font-bold text-rose-300">
                {summary.averageForceN.toFixed(1)} N
              </div>
            </div>
            <div className="rounded-lg bg-slate-800/80 p-2">
              <div className="font-sans text-[10px] text-slate-400">최대 압축량</div>
              <div className="text-xs font-bold text-amber-300">
                {summary.maxCompressionMm.toFixed(1)} mm
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-blue-950/60 px-2.5 py-1.5 text-[11px]">
            <span className="text-blue-200">맨 계란 대비 하중 감소</span>
            <span className="font-mono font-bold text-blue-300">
              {summary.cushionEffectPct >= 0
                ? `-${summary.cushionEffectPct.toFixed(1)}%`
                : `+${Math.abs(summary.cushionEffectPct).toFixed(1)}%`}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setActiveDrawer("results")}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 py-1.5 text-center text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
          >
            전체 물리량 · 충격량 설명 보기 →
          </button>
        </aside>

        {/* 하단 도크: 15종 완충재 드래그 앤 드롭 & 원클릭(+) 팔레트 */}
        <div
          aria-label="완충재 15종 드래그 팔레트"
          className="pointer-events-auto absolute right-0 bottom-0 left-0 z-20 border-t border-slate-800 bg-slate-900/95 px-3 py-2 backdrop-blur-md"
        >
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              <strong className="text-amber-300">완충재 15종 팔레트</strong> — 카드를{" "}
              <strong className="text-white">3D 계란 위로 드래그</strong>해 원하는 부위에 붙이거나,{" "}
              <strong className="text-white">+ 버튼</strong>을 여러 번 눌러 수량을 늘려보세요.
            </span>
            <button
              type="button"
              onClick={() => setCatalogOpen(true)}
              className="text-sky-400 hover:underline"
            >
              물성표 자세히 보기
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {MATERIAL_CATALOG.map((mat) => {
              const countOnEgg = configs
                .filter((c) => c.materialId === mat.id)
                .reduce((acc, c) => acc + c.quantity, 0);

              return (
                <div
                  key={mat.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/eggdrop-material", mat.id);
                    setDraggingMaterialId(mat.id);
                  }}
                  onDragEnd={() => setDraggingMaterialId(null)}
                  onClick={() => handleAddOrIncrementMaterial(mat.id)}
                  className="group flex shrink-0 cursor-grab items-center gap-2 rounded-xl border border-slate-700/90 bg-slate-800/90 px-2.5 py-1.5 text-left transition hover:border-sky-400 hover:bg-slate-800 active:cursor-grabbing"
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-md border border-white/30 shadow-inner"
                    style={{ backgroundColor: mat.color }}
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white">{mat.name}</span>
                      {countOnEgg > 0 && (
                        <span className="rounded-full bg-amber-400 px-1.5 py-0.2 font-mono text-[10px] font-black text-slate-950">
                          {countOnEgg}
                          {mat.unit}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400">
                      {mat.unitMassG}g/{mat.unit} · 흡수 {(mat.energyAbsorption * 100).toFixed(0)}%
                    </div>
                  </div>
                  <span className="ml-1 flex h-6 w-6 items-center justify-center rounded-lg bg-slate-700 font-bold text-white group-hover:bg-blue-600">
                    +
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 슬라이드오버 드로어: 상세 조건 / 전체 물리량 / A·B·C 비교 및 실측 기록 */}
        {activeDrawer !== "none" && (
          <div className="pointer-events-auto absolute inset-y-0 right-0 z-30 flex w-full max-w-3xl flex-col border-l border-slate-300 bg-slate-100 text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDrawer("setup")}
                  className={`rounded-lg px-3 py-1 text-xs font-bold ${
                    activeDrawer === "setup"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  상세 낙하·재료 설정
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDrawer("results")}
                  className={`rounded-lg px-3 py-1 text-xs font-bold ${
                    activeDrawer === "results"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  전체 물리량·충격량 원리
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDrawer("compare")}
                  className={`rounded-lg px-3 py-1 text-xs font-bold ${
                    activeDrawer === "compare"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  A/B/C 실험 비교·실측 기록 ({savedExperiments.length})
                </button>
              </div>
              <button
                type="button"
                onClick={() => setActiveDrawer("none")}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                ✕ 3D 화면으로 닫기
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeDrawer === "setup" && (
                <SetupPanel
                  setup={setup}
                  onChangeSetup={setSetup}
                  onSaveExperiment={handleSaveExperiment}
                  onOpenCatalogModal={() => setCatalogOpen(true)}
                />
              )}
              {activeDrawer === "results" && (
                <ResultsPanel setup={setup} simResult={simResult} />
              )}
              {activeDrawer === "compare" && (
                <ComparisonSection
                  experiments={savedExperiments}
                  onLoadSetup={(nextSetup) => {
                    setSetup(nextSetup);
                    setActiveDrawer("none");
                  }}
                  onSaveCurrentAsQuick={handleSaveQuickExperiment}
                  onUpdateActual={handleUpdateActual}
                  onDeleteExperiment={handleDeleteExperiment}
                  onRenameExperiment={handleRenameExperiment}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 안내 & 15종 물성표 모달 */}
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      <CatalogModal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onQuickAddMaterial={(matId, posId) => handleAddOrIncrementMaterial(matId, posId)}
      />
    </div>
  );
}
