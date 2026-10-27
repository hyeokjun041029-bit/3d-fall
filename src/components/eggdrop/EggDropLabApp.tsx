"use client";

import React, { useMemo, useState, useSyncExternalStore } from "react";
import { ComparisonSection } from "./ComparisonSection";
import { CatalogModal, GuideModal } from "./Modals";
import { ResultsPanel } from "./ResultsPanel";
import { SetupPanel } from "./SetupPanel";
import { SimulationCanvas } from "./SimulationCanvas";
import {
  createId,
  createSampleSetup,
  DEFAULT_CONDITIONS,
  LIMITS,
} from "@/lib/eggdrop/defaults";
import { simulateWithBaseline } from "@/lib/eggdrop/simulation";
import { EMPTY_EXPERIMENTS, getExperimentRepository } from "@/lib/eggdrop/storage";
import type {
  ActualRecord,
  ExperimentSetup,
  PositionId,
  SavedExperiment,
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
  const [guideOpen, setGuideOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const savedExperiments = useSyncExternalStore(
    subscribeRepo,
    getRepoSnapshot,
    getServerRepoSnapshot,
  );

  // 설정이 바뀔 때마다 즉시 물리 시뮬레이션 및 기준선 비교 계산
  const simResult = useMemo(() => simulateWithBaseline(setup), [setup]);

  const handleNewExperiment = () => {
    setSetup(createSampleSetup());
  };

  const handleSaveExperiment = (name: string) => {
    getExperimentRepository().save({
      name,
      setup,
      result: simResult.summary,
    });
  };

  const handleSaveQuickExperiment = () => {
    const idx = savedExperiments.length + 1;
    const defaultName = `실험 #${idx} (${setup.conditions.floors}층 · ${simResult.summary.totalMassG.toFixed(0)}g)`;
    getExperimentRepository().save({
      name: defaultName,
      setup,
      result: simResult.summary,
    });
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

  const handleQuickAddMaterial = (materialId: string, position: PositionId) => {
    if (setup.configs.length >= LIMITS.maxConfigs) return;
    setSetup({
      ...setup,
      configs: [
        ...setup.configs,
        {
          id: createId("cfg"),
          materialId,
          position,
          quantity: 2,
        },
      ],
    });
  };

  const applyPreset = (presetKey: "sample" | "bare" | "heavy-cushion" | "asymmetric") => {
    if (presetKey === "sample") {
      setSetup(createSampleSetup());
      return;
    }
    if (presetKey === "bare") {
      setSetup({
        conditions: { ...DEFAULT_CONDITIONS, floors: 2 },
        configs: [],
      });
      return;
    }
    if (presetKey === "heavy-cushion") {
      setSetup({
        conditions: { ...DEFAULT_CONDITIONS, floors: 4, initialTiltDeg: 8 },
        configs: [
          { id: createId("cfg"), materialId: "sponge", position: "wrap", quantity: 4 },
          { id: createId("cfg"), materialId: "air-cushion", position: "bottom", quantity: 3 },
          { id: createId("cfg"), materialId: "corrugated", position: "frame", quantity: 3 },
        ],
      });
      return;
    }
    if (presetKey === "asymmetric") {
      setSetup({
        conditions: {
          ...DEFAULT_CONDITIONS,
          floors: 3,
          initialTiltDeg: 28,
          initialAngularVelocityDegS: 60,
        },
        configs: [
          { id: createId("cfg"), materialId: "paper-cup", position: "cradle", quantity: 2 },
          { id: createId("cfg"), materialId: "bubble-wrap", position: "top", quantity: 4 },
        ],
      });
    }
  };

  const scrollToComparison = () => {
    if (typeof document === "undefined") return;
    document.getElementById("comparison-section")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* 1. 상단 헤더 */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 font-mono text-sm font-extrabold text-amber-300">
              EGG
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold tracking-tight text-slate-950">
                  EggDrop Lab
                </h1>
                <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                  계란 낙하 물리 실험 시뮬레이터
                </span>
              </div>
              <p className="text-xs text-slate-600">
                15종 완충재의 위치·수량 배치에 따른 낙하 운동, 회전, 충격력 및 완충 효과 비교 실험실
              </p>
            </div>
          </div>

          <nav aria-label="주요 메뉴" className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleNewExperiment}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              새 실험 (샘플 초기화)
            </button>
            <button
              type="button"
              onClick={scrollToComparison}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100"
            >
              저장된 실험 ({savedExperiments.length})
            </button>
            <button
              type="button"
              onClick={() => setCatalogOpen(true)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              완충재 15종 카탈로그
            </button>
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              사용 안내 · 안전 수칙
            </button>
          </nav>
        </div>
      </header>

      {/* 메인 컨테이너 */}
      <main className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6">
        {/* 샘플 프리셋 빠른 전환 바 */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-slate-800">빠른 실험 시나리오 불러오기:</span>
            <button
              type="button"
              onClick={() => applyPreset("sample")}
              className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-800 hover:bg-slate-100"
            >
              기본 샘플 (2층 · 뽁뽁이+스펀지)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("bare")}
              className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-800 hover:bg-slate-100"
            >
              대조군 (2층 · 맨 계란 무포장)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("heavy-cushion")}
              className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-800 hover:bg-slate-100"
            >
              고층 다중 완충 (4층 · 스펀지+에어쿠션+골판지 프레임)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("asymmetric")}
              className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-800 hover:bg-slate-100"
            >
              비대칭 회전 실험 (3층 · 기울기 28° + 종이컵 받침)
            </button>
          </div>
          <span className="text-[11px] text-slate-500">
            조건이나 재료를 변경하면 시뮬레이션 궤적과 물리량이 즉시 재계산됩니다.
          </span>
        </div>

        {/* 3단 메인 실험 레이아웃 (데스크톱 12컬럼 / 모바일 세로 배치) */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {/* 왼쪽 패널: 낙하 조건 및 재료 구성 설정 */}
          <div className="xl:col-span-4">
            <SetupPanel
              setup={setup}
              onChangeSetup={setSetup}
              onSaveExperiment={handleSaveExperiment}
              onOpenCatalogModal={() => setCatalogOpen(true)}
            />
          </div>

          {/* 중앙 패널: 계란 낙하와 충돌 애니메이션 */}
          <div className="xl:col-span-5">
            <SimulationCanvas setup={setup} simResult={simResult} />
          </div>

          {/* 오른쪽 패널: 예상 물리량, 완충 효과 및 파손 위험 지표 */}
          <div className="xl:col-span-3">
            <ResultsPanel setup={setup} simResult={simResult} />
          </div>
        </div>

        {/* 하단 영역: 여러 실험의 비교 결과, 차트, 실제 실험 결과 기록 */}
        <ComparisonSection
          experiments={savedExperiments}
          onLoadSetup={setSetup}
          onSaveCurrentAsQuick={handleSaveQuickExperiment}
          onUpdateActual={handleUpdateActual}
          onDeleteExperiment={handleDeleteExperiment}
          onRenameExperiment={handleRenameExperiment}
        />
      </main>

      {/* 모달 */}
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      <CatalogModal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onQuickAddMaterial={handleQuickAddMaterial}
      />
    </div>
  );
}
