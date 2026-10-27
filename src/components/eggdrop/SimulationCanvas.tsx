"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getMaterial } from "@/lib/eggdrop/materialCatalog";
import {
  EGG_HALF_HEIGHT_M,
  EGG_HALF_WIDTH_M,
  eggOutlinePoint,
  SAMPLE_COUNT,
  sampleAngleRad,
} from "@/lib/eggdrop/packageModel";
import { POSITIONS } from "@/lib/eggdrop/positions";
import { SURFACES } from "@/lib/eggdrop/defaults";
import type { SimFrame, SimulationResult } from "@/lib/eggdrop/simulation";
import type { ExperimentSetup, Material } from "@/lib/eggdrop/types";

interface SimulationCanvasProps {
  setup: ExperimentSetup;
  simResult: SimulationResult;
}

interface PlaybackState {
  sim: SimulationResult;
  time: number;
  playing: boolean;
}

/** 주어진 시각 t에 해당하는 시뮬레이션 프레임을 이진 탐색 + 선형 보간으로 구한다 */
function sampleFrameAt(frames: SimFrame[], t: number): SimFrame {
  if (frames.length === 0) {
    return { t: 0, x: 0, y: 0, theta: 0, vx: 0, vy: 0, omega: 0, force: 0, compression: null };
  }
  if (t <= frames[0].t) return frames[0];
  const last = frames[frames.length - 1];
  if (t >= last.t) return last;

  let lo = 0;
  let hi = frames.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = frames[lo];
  const b = frames[hi];
  const span = b.t - a.t;
  const alpha = span > 1e-9 ? (t - a.t) / span : 0;
  return {
    t,
    x: a.x + (b.x - a.x) * alpha,
    y: a.y + (b.y - a.y) * alpha,
    theta: a.theta + (b.theta - a.theta) * alpha,
    vx: a.vx + (b.vx - a.vx) * alpha,
    vy: a.vy + (b.vy - a.vy) * alpha,
    omega: a.omega + (b.omega - a.omega) * alpha,
    force: a.force + (b.force - a.force) * alpha,
    compression: b.compression ?? a.compression,
  };
}

/** 재료 패턴을 CanvasPattern으로 생성 */
function createLayerPattern(
  ctx: CanvasRenderingContext2D,
  color: string,
  pattern: Material["pattern"],
): CanvasPattern | string {
  if (typeof document === "undefined") return color;
  const tile = document.createElement("canvas");
  tile.width = 12;
  tile.height = 12;
  const pctx = tile.getContext("2d");
  if (!pctx) return color;

  pctx.fillStyle = color;
  pctx.fillRect(0, 0, 12, 12);
  pctx.strokeStyle = "rgba(15, 23, 42, 0.22)";
  pctx.fillStyle = "rgba(15, 23, 42, 0.18)";
  pctx.lineWidth = 1;

  switch (pattern) {
    case "dots":
      pctx.beginPath();
      pctx.arc(3, 3, 1.6, 0, Math.PI * 2);
      pctx.arc(9, 9, 1.6, 0, Math.PI * 2);
      pctx.fill();
      break;
    case "cells":
      pctx.beginPath();
      pctx.arc(4, 4, 2.3, 0, Math.PI * 2);
      pctx.arc(10, 9, 1.8, 0, Math.PI * 2);
      pctx.stroke();
      break;
    case "hatch":
      pctx.beginPath();
      pctx.moveTo(0, 12);
      pctx.lineTo(12, 0);
      pctx.stroke();
      break;
    case "cross":
      pctx.beginPath();
      pctx.moveTo(0, 12);
      pctx.lineTo(12, 0);
      pctx.moveTo(0, 0);
      pctx.lineTo(12, 12);
      pctx.stroke();
      break;
    case "wave":
      pctx.beginPath();
      pctx.moveTo(0, 6);
      pctx.quadraticCurveTo(3, 1, 6, 6);
      pctx.quadraticCurveTo(9, 11, 12, 6);
      pctx.stroke();
      break;
    case "grid":
      pctx.beginPath();
      pctx.moveTo(6, 0);
      pctx.lineTo(12, 3);
      pctx.lineTo(12, 9);
      pctx.lineTo(6, 12);
      pctx.lineTo(0, 9);
      pctx.lineTo(0, 3);
      pctx.closePath();
      pctx.stroke();
      break;
    case "fiber":
      pctx.beginPath();
      pctx.moveTo(1, 3);
      pctx.lineTo(11, 4);
      pctx.moveTo(2, 9);
      pctx.lineTo(10, 8);
      pctx.stroke();
      break;
    case "solid":
    default:
      break;
  }

  return ctx.createPattern(tile, "repeat") ?? color;
}

export function SimulationCanvas({ setup, simResult }: SimulationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>(() => ({
    sim: simResult,
    time: 0,
    playing: false,
  }));
  const [speedRate, setSpeedRate] = useState<number>(1);
  const [cameraMode, setCameraMode] = useState<"follow" | "impact">("follow");

  const currentTime = playback.sim === simResult ? playback.time : 0;
  const isPlaying = playback.sim === simResult ? playback.playing : false;

  const currentFrame = useMemo(
    () => sampleFrameAt(simResult.frames, currentTime),
    [simResult.frames, currentTime],
  );

  // 애니메이션 루프
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let prevNow = performance.now();

    const tick = (now: number) => {
      const elapsedSec = Math.min(0.05, (now - prevNow) / 1000);
      prevNow = now;

      setPlayback((prev) => {
        const baseTime = prev.sim === simResult ? prev.time : 0;
        // 충돌 구간 근처에서는 시각적 관찰이 쉽도록 살짝 감속 보정
        const nearImpact =
          simResult.firstContactTime !== null &&
          Math.abs(baseTime - simResult.firstContactTime) < 0.08 &&
          speedRate >= 1;
        const effectiveRate = nearImpact ? 0.35 : speedRate;
        const nextTime = baseTime + elapsedSec * effectiveRate;
        if (nextTime >= simResult.endTime) {
          return { sim: simResult, time: simResult.endTime, playing: false };
        }
        return { sim: simResult, time: nextTime, playing: true };
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, simResult, speedRate]);

  // 캔버스 렌더링
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const cssWidth = canvas.clientWidth || 720;
    const cssHeight = canvas.clientHeight || 460;
    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const surface = SURFACES[setup.conditions.surface];
    const dropH = simResult.summary.dropHeightM;
    const model = simResult.model;

    // 레이아웃 분할: 좌측 132px은 전체 낙하 타워 트랙, 우측은 포장 구조 및 충돌 확대 뷰
    const towerW = Math.min(136, Math.max(104, Math.round(cssWidth * 0.22)));
    const mainX = towerW + 12;
    const mainW = cssWidth - mainX;

    // 1) 좌측 낙하 타워 트랙 렌더링
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, towerW, cssHeight);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(towerW, 0);
    ctx.lineTo(towerW, cssHeight);
    ctx.stroke();

    const towerTopPad = 34;
    const towerBottomY = cssHeight - 36;
    const maxTowerMeters = Math.max(16, dropH + 1.5);
    const mToTowerY = (m: number) =>
      towerBottomY - (m / maxTowerMeters) * (towerBottomY - towerTopPad);

    // 층수 및 높이 눈금 표시
    ctx.font = "600 11px sans-serif";
    ctx.fillStyle = "#475569";
    ctx.fillText("전체 낙하 타워", 12, 20);

    for (let f = 1; f <= 5; f++) {
      const fh = f * setup.conditions.floorHeightM;
      if (fh > maxTowerMeters) continue;
      const py = mToTowerY(fh);
      ctx.strokeStyle = f === setup.conditions.floors ? "#2563eb" : "#cbd5e1";
      ctx.lineWidth = f === setup.conditions.floors ? 1.5 : 1;
      ctx.setLineDash(f === setup.conditions.floors ? [] : [3, 3]);
      ctx.beginPath();
      ctx.moveTo(12, py);
      ctx.lineTo(towerW - 12, py);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = f === setup.conditions.floors ? "#1d4ed8" : "#64748b";
      ctx.font = f === setup.conditions.floors ? "700 11px sans-serif" : "500 10px sans-serif";
      ctx.fillText(`${f}층 (${fh.toFixed(1)}m)`, 14, py - 4);
    }

    // 타워 바닥 표시
    ctx.fillStyle = surface.color;
    ctx.fillRect(10, towerBottomY, towerW - 20, 10);
    ctx.fillStyle = "#334155";
    ctx.font = "600 10px sans-serif";
    ctx.fillText(`지면 · ${surface.name}`, 14, towerBottomY + 22);

    // 낙하 궤적 점선 및 현재 위치 마커
    const startPy = mToTowerY(simResult.startY);
    const curPy = mToTowerY(Math.max(0, currentFrame.y));
    const towerCenterX = Math.round(towerW * 0.62);

    ctx.strokeStyle = "#93c5fd";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(towerCenterX, startPy);
    ctx.lineTo(towerCenterX, curPy);
    ctx.stroke();
    ctx.setLineDash([]);

    // 타워 내 소형 패키지 아이콘
    ctx.save();
    ctx.translate(towerCenterX, curPy);
    ctx.rotate(-currentFrame.theta);
    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fef08a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2) 우측 메인 확대 시뮬레이션 뷰
    ctx.save();
    ctx.beginPath();
    ctx.rect(mainX, 0, mainW, cssHeight);
    ctx.clip();

    // 배경 그리드
    const bgGrad = ctx.createLinearGradient(mainX, 0, mainX, cssHeight);
    bgGrad.addColorStop(0, "#f8fafc");
    bgGrad.addColorStop(1, "#f1f5f9");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(mainX, 0, mainW, cssHeight);

    // 스케일(픽셀/미터): 포장 구조 크기에 맞춰 자동 조정
    const scale = Math.min(1850, Math.max(950, 88 / Math.max(0.04, model.maxExtent)));
    const groundScreenBaseY = cssHeight - 64;

    // 카메라 중심 높이(m):
    // - follow 모드: 낙하 중에는 계란을 따라가고, 바닥 근처(0.25m 이하)에서는 지면이 고정되어 충돌이 선명히 보임
    // - impact 모드: 항상 지면 근처를 고정 확대
    const focusMinY = 0.14;
    const cameraWorldY =
      cameraMode === "impact" ? focusMinY : Math.max(focusMinY, currentFrame.y - 0.04);
    const cameraWorldX = currentFrame.x * 0.5;

    const worldToScreen = (wx: number, wy: number) => ({
      sx: mainX + mainW * 0.5 + (wx - cameraWorldX) * scale,
      sy: groundScreenBaseY - (wy - (cameraWorldY - focusMinY)) * scale,
    });

    // 배경 미터 격자선(낙하 속도감을 주는 기준선)
    const gridStepM = 0.05; // 5cm 간격
    const minVisibleY = cameraWorldY - focusMinY - 0.06;
    const maxVisibleY = minVisibleY + cssHeight / scale;
    const firstGridM = Math.floor(minVisibleY / gridStepM) * gridStepM;

    ctx.lineWidth = 1;
    for (let gm = firstGridM; gm <= maxVisibleY; gm += gridStepM) {
      if (gm < 0) continue;
      const { sy } = worldToScreen(0, gm);
      const isHalfMeter = Math.abs(Math.round(gm * 2) - gm * 2) < 1e-3;
      ctx.strokeStyle = isHalfMeter ? "#cbd5e1" : "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(mainX, sy);
      ctx.lineTo(mainX + mainW, sy);
      ctx.stroke();

      if (isHalfMeter) {
        ctx.fillStyle = "#64748b";
        ctx.font = "500 10px sans-serif";
        ctx.fillText(`${gm.toFixed(1)} m`, mainX + 10, sy - 4);
      }
    }

    // 지면(y <= 0) 렌더링
    const groundTop = worldToScreen(0, 0).sy;
    if (groundTop < cssHeight) {
      ctx.fillStyle = surface.color;
      ctx.fillRect(mainX, groundTop, mainW, cssHeight - groundTop);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mainX, groundTop);
      ctx.lineTo(mainX + mainW, groundTop);
      ctx.stroke();

      // 지면 해칭
      ctx.strokeStyle = "rgba(15, 23, 42, 0.18)";
      ctx.lineWidth = 1;
      for (let gx = mainX; gx < mainX + mainW + 24; gx += 16) {
        ctx.beginPath();
        ctx.moveTo(gx, groundTop);
        ctx.lineTo(gx - 10, groundTop + 14);
        ctx.stroke();
      }
    }

    // 방향별 현재 압축 비율 계산 (충돌 중 압축 + 충돌 후 비탄성 잔류 변형 반영)
    const dirDeformation = new Float32Array(SAMPLE_COUNT);
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const travel = model.directions[i].travel;
      if (travel <= 1e-6) continue;
      const activeComp = currentFrame.compression ? currentFrame.compression[i] : 0;
      const reachedMax =
        currentTime >= simResult.maxCompressionTime[i] ? simResult.maxCompression[i] : activeComp;
      const residual = reachedMax * (1 - model.directions[i].recovery);
      const effectiveComp = Math.max(activeComp, residual);
      dirDeformation[i] = Math.min(0.88, effectiveComp / Math.max(1e-6, model.directions[i].thickness));
    }

    // 계란 중심의 월드 좌표 계산 (몸체 좌표계에서 계란 중심은 (-com.x, -com.y))
    const cs = Math.cos(currentFrame.theta);
    const sn = Math.sin(currentFrame.theta);
    const eggCenterWorldX = currentFrame.x + (-model.com.x * cs - -model.com.y * sn);
    const eggCenterWorldY = currentFrame.y + (-model.com.x * sn + -model.com.y * cs);
    const eggScreen = worldToScreen(eggCenterWorldX, eggCenterWorldY);

    ctx.save();
    ctx.translate(eggScreen.sx, eggScreen.sy);
    // Canvas y축은 아래쪽이 +이므로 각도를 -theta로 회전
    ctx.rotate(-currentFrame.theta);

    // 바깥쪽 레이어부터 안쪽으로 그리거나, 안쪽-바깥쪽 도넛 다각형으로 렌더링
    for (const layer of model.layers) {
      const polyOuter: { x: number; y: number }[] = [];
      const polyInner: { x: number; y: number }[] = [];

      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const a = sampleAngleRad(i);
        const eggR = model.layers[0]?.inner[i] ?? 0.025;
        const shrink = 1 - dirDeformation[i];
        const rIn = eggR + (layer.inner[i] - eggR) * shrink;
        const rOut = eggR + (layer.outer[i] - eggR) * shrink;
        polyOuter.push({ x: rOut * Math.cos(a) * scale, y: -rOut * Math.sin(a) * scale });
        polyInner.push({ x: rIn * Math.cos(a) * scale, y: -rIn * Math.sin(a) * scale });
      }

      ctx.beginPath();
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const p = polyOuter[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      for (let i = SAMPLE_COUNT - 1; i >= 0; i--) {
        const p = polyInner[i];
        if (i === SAMPLE_COUNT - 1) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();

      ctx.fillStyle = createLayerPattern(ctx, layer.color, layer.pattern as Material["pattern"]);
      ctx.fill("evenodd");

      ctx.strokeStyle = "rgba(15, 23, 42, 0.35)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // 계란 본체(타원형 달걀 모양) 렌더링
    ctx.beginPath();
    const eggSteps = 64;
    for (let k = 0; k <= eggSteps; k++) {
      const t = (k / eggSteps) * Math.PI * 2;
      const pt = eggOutlinePoint(t);
      const px = pt.x * scale;
      const py = -pt.y * scale;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    const eggGrad = ctx.createRadialGradient(
      -EGG_HALF_WIDTH_M * scale * 0.25,
      -EGG_HALF_HEIGHT_M * scale * 0.2,
      2,
      0,
      0,
      EGG_HALF_HEIGHT_M * scale,
    );
    eggGrad.addColorStop(0, "#fffbeb");
    eggGrad.addColorStop(0.7, "#fde68a");
    eggGrad.addColorStop(1, "#f59e0b");
    ctx.fillStyle = eggGrad;
    ctx.fill();
    ctx.strokeStyle = "#b45309";
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // 내부 노른자 실루엣(단면도 표현)
    ctx.fillStyle = "rgba(245, 158, 11, 0.28)";
    ctx.beginPath();
    ctx.arc(0, 3, EGG_HALF_WIDTH_M * scale * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // 충돌 시점 이후 위험 지표에 따른 계란 껍데기 균열 시각화
    const pastPeak =
      simResult.firstContactTime !== null && currentTime >= simResult.firstContactTime + 0.001;
    if (pastPeak && simResult.loadRatio >= 0.65) {
      const severe = simResult.loadRatio >= 1.2;
      ctx.strokeStyle = severe ? "#be123c" : "#d97706";
      ctx.lineWidth = severe ? 2.2 : 1.5;
      const rW = EGG_HALF_WIDTH_M * scale;
      const rH = EGG_HALF_HEIGHT_M * scale;
      ctx.beginPath();
      ctx.moveTo(0, rH * 0.72);
      ctx.lineTo(-rW * 0.18, rH * 0.42);
      ctx.lineTo(rW * 0.12, rH * 0.18);
      ctx.lineTo(-rW * 0.08, -rH * 0.08);
      if (severe) {
        ctx.lineTo(rW * 0.22, -rH * 0.35);
        ctx.moveTo(-rW * 0.18, rH * 0.42);
        ctx.lineTo(-rW * 0.48, rH * 0.22);
        ctx.moveTo(rW * 0.12, rH * 0.18);
        ctx.lineTo(rW * 0.46, rH * 0.32);
      }
      ctx.stroke();
    }

    // 무게중심(COM) 마커 표시 (계란 중심 기준 (com.x, com.y))
    const comPx = model.com.x * scale;
    const comPy = -model.com.y * scale;
    ctx.fillStyle = "#0f172a";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(comPx, comPy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore(); // 패키지 회전 좌표계 복원

    // 바닥 충돌 시 수직 반력 화살표 표시
    if (currentFrame.force > 1) {
      const comScreen = worldToScreen(currentFrame.x, currentFrame.y);
      const arrowLen = Math.min(110, 18 + Math.log10(1 + currentFrame.force) * 28);
      ctx.strokeStyle = "#e11d48";
      ctx.fillStyle = "#e11d48";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(comScreen.sx, groundTop);
      ctx.lineTo(comScreen.sx, groundTop - arrowLen);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(comScreen.sx, groundTop - arrowLen - 6);
      ctx.lineTo(comScreen.sx - 5, groundTop - arrowLen + 3);
      ctx.lineTo(comScreen.sx + 5, groundTop - arrowLen + 3);
      ctx.closePath();
      ctx.fill();

      ctx.font = "700 11px sans-serif";
      ctx.fillText(`충격 반력 ${currentFrame.force.toFixed(0)} N`, comScreen.sx + 8, groundTop - arrowLen + 4);
    }

    // 우측 상단 범례(배치된 재료 레이어 안내)
    const legendX = mainX + 12;
    let legendY = 16;
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    const legendItems = setup.configs.slice(0, 6);
    const boxH = 26 + legendItems.length * 18;
    ctx.fillRect(legendX, legendY, 196, boxH);
    ctx.strokeRect(legendX, legendY, 196, boxH);

    ctx.fillStyle = "#0f172a";
    ctx.font = "700 11px sans-serif";
    ctx.fillText(
      legendItems.length > 0 ? "단면도 완충층 구성 (안쪽→바깥쪽)" : "완충재 없음 (맨 계란 상태)",
      legendX + 8,
      legendY + 16,
    );
    legendY += 24;

    legendItems.forEach((cfg, idx) => {
      const mat = getMaterial(cfg.materialId);
      if (!mat) return;
      const posLabel = mat.positions[cfg.position]?.label ?? POSITIONS[cfg.position].name;
      ctx.fillStyle = mat.color;
      ctx.fillRect(legendX + 8, legendY + idx * 18 - 8, 10, 10);
      ctx.strokeStyle = "#475569";
      ctx.strokeRect(legendX + 8, legendY + idx * 18 - 8, 10, 10);
      ctx.fillStyle = "#334155";
      ctx.font = "500 10.5px sans-serif";
      ctx.fillText(
        `${idx + 1}. ${mat.name} · ${posLabel} (${cfg.quantity}${mat.unit})`,
        legendX + 23,
        legendY + idx * 18,
      );
    });

    ctx.restore(); // 메인 뷰 클립 복원
    ctx.restore(); // DPR 스케일 복원
  }, [cameraMode, currentFrame, currentTime, setup.conditions, setup.configs, simResult]);

  const speedMps = Math.hypot(currentFrame.vx, currentFrame.vy);
  const tiltDeg = ((currentFrame.theta * 180) / Math.PI) % 360;
  const omegaDegS = (currentFrame.omega * 180) / Math.PI;

  const handleStartOrToggle = () => {
    if (isPlaying) {
      setPlayback({ sim: simResult, time: currentTime, playing: false });
      return;
    }
    const startFrom = currentTime >= simResult.endTime - 1e-4 ? 0 : currentTime;
    setPlayback({ sim: simResult, time: startFrom, playing: true });
  };

  const handleRestart = () => {
    setPlayback({ sim: simResult, time: 0, playing: false });
  };

  const handleJumpToImpact = () => {
    if (simResult.firstContactTime === null) return;
    setPlayback({
      sim: simResult,
      time: Math.max(0, simResult.firstContactTime - 0.015),
      playing: false,
    });
  };

  return (
    <section
      aria-label="계란 낙하 및 충돌 시뮬레이션"
      className="flex flex-col rounded-xl border border-slate-200 bg-white"
    >
      {/* 상단 컨트롤 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">낙하·충돌 물리 시뮬레이션</h2>
          <p className="text-xs text-slate-600">
            {setup.conditions.floors}층 ({simResult.summary.dropHeightM.toFixed(1)}m) · 총질량{" "}
            {simResult.summary.totalMassG.toFixed(1)}g · 무게중심 편차 (
            {(simResult.model.com.x * 1000).toFixed(1)}, {(simResult.model.com.y * 1000).toFixed(1)}) mm
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleStartOrToggle}
            className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
          >
            {isPlaying
              ? "일시정지"
              : currentTime > 0 && currentTime < simResult.endTime
                ? "계속 재생"
                : "낙하 시작"}
          </button>
          <button
            type="button"
            onClick={handleRestart}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            처음으로(재시작)
          </button>
          {simResult.firstContactTime !== null && (
            <button
              type="button"
              onClick={handleJumpToImpact}
              className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              충돌 순간 이동
            </button>
          )}
        </div>
      </div>

      {/* 재생 속도 및 카메라 모드 바 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-600">재생 배속:</span>
          {[
            { label: "1.0x 실시간", value: 1 },
            { label: "0.25x 저속", value: 0.25 },
            { label: "0.05x 충돌 초저속", value: 0.05 },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSpeedRate(opt.value)}
              className={`rounded px-2 py-0.5 font-medium transition ${
                speedRate === opt.value
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-600">카메라:</span>
          <button
            type="button"
            onClick={() => setCameraMode("follow")}
            className={`rounded px-2 py-0.5 font-medium transition ${
              cameraMode === "follow"
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            낙하 추적
          </button>
          <button
            type="button"
            onClick={() => setCameraMode("impact")}
            className={`rounded px-2 py-0.5 font-medium transition ${
              cameraMode === "impact"
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            지면 충돌 고정
          </button>
        </div>
      </div>

      {/* 캔버스 본체 */}
      <div className="relative h-[430px] w-full bg-slate-50 sm:h-[470px]">
        <canvas
          ref={canvasRef}
          className="h-full w-full block"
          aria-label="계란과 완충재의 2D 낙하 및 바닥 충돌 시뮬레이션 캔버스"
        />
      </div>

      {/* 타임라인 스크러버 */}
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <label htmlFor="sim-timeline-slider" className="text-xs font-semibold text-slate-700 shrink-0">
            시간 탐색
          </label>
          <input
            id="sim-timeline-slider"
            type="range"
            min={0}
            max={simResult.endTime}
            step={0.001}
            value={Math.min(currentTime, simResult.endTime)}
            onChange={(e) =>
              setPlayback({
                sim: simResult,
                time: Number(e.target.value),
                playing: false,
              })
            }
            className="w-full accent-blue-600"
          />
          <span className="w-24 text-right font-mono text-xs font-semibold text-slate-800 shrink-0">
            {currentTime.toFixed(3)}s / {simResult.endTime.toFixed(2)}s
          </span>
        </div>

        {/* 실시간 상태 수치 HUD */}
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          <div className="rounded border border-slate-200 bg-white px-2.5 py-1">
            <div className="text-[11px] text-slate-500">현재 높이</div>
            <div className="font-mono text-xs font-bold text-slate-900">
              {Math.max(0, currentFrame.y).toFixed(2)} m
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-white px-2.5 py-1">
            <div className="text-[11px] text-slate-500">현재 속력</div>
            <div className="font-mono text-xs font-bold text-slate-900">{speedMps.toFixed(2)} m/s</div>
          </div>
          <div className="rounded border border-slate-200 bg-white px-2.5 py-1">
            <div className="text-[11px] text-slate-500">기울기 각도</div>
            <div className="font-mono text-xs font-bold text-slate-900">{tiltDeg.toFixed(1)}°</div>
          </div>
          <div className="rounded border border-slate-200 bg-white px-2.5 py-1">
            <div className="text-[11px] text-slate-500">각속도</div>
            <div className="font-mono text-xs font-bold text-slate-900">{omegaDegS.toFixed(0)} °/s</div>
          </div>
          <div className="rounded border border-slate-200 bg-white px-2.5 py-1 col-span-2 sm:col-span-1">
            <div className="text-[11px] text-slate-500">바닥 반력</div>
            <div className="font-mono text-xs font-bold text-rose-700">{currentFrame.force.toFixed(1)} N</div>
          </div>
        </div>
      </div>
    </section>
  );
}
