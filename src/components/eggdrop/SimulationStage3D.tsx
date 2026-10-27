"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getAllowedPositions, getMaterial } from "@/lib/eggdrop/materialCatalog";
import {
  EGG_HALF_HEIGHT_M,
  EGG_HALF_WIDTH_M,
  SAMPLE_COUNT,
} from "@/lib/eggdrop/packageModel";
import { POSITIONS } from "@/lib/eggdrop/positions";
import { SURFACES } from "@/lib/eggdrop/defaults";
import type { SimFrame, SimulationResult } from "@/lib/eggdrop/simulation";
import type { ExperimentSetup, MaterialConfig, PositionId } from "@/lib/eggdrop/types";

interface SimulationStage3DProps {
  setup: ExperimentSetup;
  simResult: SimulationResult;
  draggingMaterialId: string | null;
  onDropMaterialAtPosition: (materialId: string, position: PositionId) => void;
}

interface PlaybackState {
  sim: SimulationResult;
  time: number;
  playing: boolean;
}

/** 주어진 시각 t의 프레임을 보간 */
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

/**
 * 3D 공간 스케일:
 * 실제 계란 반높이(0.0285m = 2.85cm)를 조립/시각화에서 잘 보이도록
 * 1m = 10 Three.js 월드 단위로 변환하고, 패키지 본체는 시각적 가독성을 위해
 * 별도 배율(PACKAGE_VISUAL_SCALE)로 렌더링한다.
 */
const WORLD_SCALE = 1.0; // 1 unit = 1 meter
const EGG_VISUAL_MULT = 12; // 계란을 3D 공간에서 선명히 관찰할 수 있도록 12배 스케일링

/** 달걀 3D LatheGeometry 생성 */
function createEggGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    // u: -π/2 (바닥) ~ +π/2 (꼭대기)
    const u = -Math.PI / 2 + (i / steps) * Math.PI;
    const s = Math.sin(u);
    const r = Math.max(0.0001, EGG_HALF_WIDTH_M * Math.cos(u) * (1 - 0.1 * s) * EGG_VISUAL_MULT);
    const y = EGG_HALF_HEIGHT_M * s * EGG_VISUAL_MULT;
    points.push(new THREE.Vector2(r, y));
  }
  const geo = new THREE.LatheGeometry(points, 36);
  geo.computeVertexNormals();
  return geo;
}

/** 의사 난수(결정론적 배치용) */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * 각 재료 구성 행(cfg)과 누적 레이어 순서(layerIndex)에 맞춰
 * 수량(quantity = 1..10)이 늘어날수록 3D 메쉬 개수가 실제로 늘어나는 3D 그룹 생성
 */
function buildMaterialLayer3D(cfg: MaterialConfig, layerIndex: number): THREE.Group {
  const group = new THREE.Group();
  const matInfo = getMaterial(cfg.materialId);
  if (!matInfo) return group;

  const q = Math.max(1, Math.min(10, Math.round(cfg.quantity)));
  const baseRx = EGG_HALF_WIDTH_M * EGG_VISUAL_MULT;
  const baseRy = EGG_HALF_HEIGHT_M * EGG_VISUAL_MULT;
  const layerOffset = layerIndex * 0.042;
  const color = new THREE.Color(matInfo.color);

  // 위치별 각도 범위 (phi: 극각 0=위, π=아래)
  const getPhiRange = (pos: PositionId): [number, number] => {
    switch (pos) {
      case "top":
        return [0.05, Math.PI * 0.38];
      case "bottom":
        return [Math.PI * 0.62, Math.PI * 0.96];
      case "cradle":
        return [Math.PI * 0.56, Math.PI * 0.98];
      case "band":
        return [Math.PI * 0.38, Math.PI * 0.62];
      case "side":
        return [Math.PI * 0.25, Math.PI * 0.75];
      case "wrap":
      case "fill":
      case "frame":
      default:
        return [0.08, Math.PI * 0.92];
    }
  };

  const [phiStart, phiEnd] = getPhiRange(cfg.position);

  // 1) 뽁뽁이(에어캡): 수량(겹)만큼 반투명 쉘 + 입체 공기방울 구체들이 겹겹이 추가됨
  if (cfg.materialId === "bubble-wrap") {
    const bubbleMat = new THREE.MeshPhysicalMaterial({
      color,
      transparent: true,
      opacity: 0.52,
      roughness: 0.2,
      metalness: 0.05,
      clearcoat: 0.8,
    });
    const bumpGeo = new THREE.SphereGeometry(0.022, 10, 10);

    for (let layer = 0; layer < q; layer++) {
      const rScale = 1.06 + layerOffset / baseRx + layer * 0.055;
      // 반투명 베이스 막
      const shellGeo = new THREE.SphereGeometry(
        baseRx * rScale,
        24,
        18,
        0,
        Math.PI * 2,
        phiStart,
        phiEnd - phiStart,
      );
      shellGeo.scale(1, baseRy / baseRx, 1);
      const shellMesh = new THREE.Mesh(shellGeo, bubbleMat);
      group.add(shellMesh);

      // 에어캡 볼록 공기방울들
      const rings = Math.max(2, Math.round(((phiEnd - phiStart) / Math.PI) * 7));
      for (let ri = 0; ri < rings; ri++) {
        const phi = phiStart + ((ri + 0.5) / rings) * (phiEnd - phiStart);
        const ringCount = Math.max(6, Math.round(14 * Math.sin(phi)));
        for (let ci = 0; ci < ringCount; ci++) {
          const theta = (ci / ringCount) * Math.PI * 2 + layer * 0.3;
          const x = baseRx * rScale * Math.sin(phi) * Math.cos(theta);
          const y = baseRy * rScale * Math.cos(phi);
          const z = baseRx * rScale * Math.sin(phi) * Math.sin(theta);
          const bump = new THREE.Mesh(bumpGeo, bubbleMat);
          bump.position.set(x, y, z);
          group.add(bump);
        }
      }
    }
    return group;
  }

  // 2) 종이컵: 실제 원뿔대(Frustum) 3D 컵 메쉬가 수량만큼 중첩되거나 둘레에 배치됨
  if (cfg.materialId === "paper-cup") {
    const cupMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.75,
      side: THREE.DoubleSide,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#f59e0b"),
      roughness: 0.5,
    });

    for (let i = 0; i < q; i++) {
      const cupH = 0.28;
      const topR = baseRx * (1.08 + i * 0.04);
      const botR = baseRx * (0.78 + i * 0.03);
      const cupGeo = new THREE.CylinderGeometry(topR, botR, cupH, 24, 1, true);
      const cupMesh = new THREE.Mesh(cupGeo, cupMat);

      const rimGeo = new THREE.TorusGeometry(topR, 0.012, 8, 24);
      rimGeo.rotateX(Math.PI / 2);
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      rimMesh.position.y = cupH / 2;
      cupMesh.add(rimMesh);

      const baseDisk = new THREE.Mesh(new THREE.CircleGeometry(botR, 24), cupMat);
      baseDisk.rotation.x = Math.PI / 2;
      baseDisk.position.y = -cupH / 2;
      cupMesh.add(baseDisk);

      if (cfg.position === "wrap" && i % 2 === 1) {
        // 용기형 보호 구조일 때 짝수 번째는 위쪽 덮개 컵으로 배치
        cupMesh.rotation.z = Math.PI;
        cupMesh.position.y = baseRy * 0.55 + Math.floor(i / 2) * 0.055;
      } else {
        // 알 받침 / 아래 받침: 아래로 겹겹이 스택
        cupMesh.position.y = -baseRy * 0.62 - i * 0.052 - layerOffset * 0.4;
      }
      group.add(cupMesh);
    }
    return group;
  }

  // 3) 종이 빨대 묶음: 수량(묶음)마다 입체 원통형 빨대 기둥/외부 프레임 구조물이 하나씩 추가됨
  if (cfg.materialId === "paper-straw") {
    const strawMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.45,
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#16a34a"),
      roughness: 0.45,
    });

    const strawLen = 0.56;
    const strawR = 0.014;
    const strawGeo = new THREE.CylinderGeometry(strawR, strawR, strawLen, 10);
    const bandGeo = new THREE.TorusGeometry(strawR * 2.4, 0.006, 8, 16);
    bandGeo.rotateX(Math.PI / 2);

    // 한 묶음 = 빨대 3개 + 묶음 링
    const createStrawBundle = () => {
      const b = new THREE.Group();
      const offsets = [
        [0, 0.014],
        [-0.013, -0.008],
        [0.013, -0.008],
      ];
      for (const [ox, oz] of offsets) {
        const s = new THREE.Mesh(strawGeo, strawMat);
        s.position.set(ox, 0, oz);
        b.add(s);
      }
      const tie1 = new THREE.Mesh(bandGeo, stripeMat);
      tie1.position.y = strawLen * 0.28;
      const tie2 = new THREE.Mesh(bandGeo, stripeMat);
      tie2.position.y = -strawLen * 0.28;
      b.add(tie1, tie2);
      return b;
    };

    for (let i = 0; i < q; i++) {
      const bundle = createStrawBundle();
      const rDist = baseRx * 1.28 + layerOffset;
      if (cfg.position === "bottom") {
        const angle = (i / Math.max(1, q)) * Math.PI * 2;
        const spread = q === 1 ? 0 : baseRx * 0.55;
        bundle.rotation.z = Math.PI / 2;
        bundle.rotation.y = angle;
        bundle.position.set(
          Math.cos(angle) * spread * 0.4,
          -baseRy * 1.05 - i * 0.032,
          Math.sin(angle) * spread * 0.4,
        );
      } else if (cfg.position === "top") {
        const angle = (i / Math.max(1, q)) * Math.PI * 2;
        bundle.rotation.z = Math.PI / 2;
        bundle.rotation.y = angle;
        bundle.position.set(0, baseRy * 1.05 + i * 0.032, 0);
      } else {
        // side 또는 frame: 계란 주변에 텐세그리티/기둥 형태로 둘러 배치
        const angle = (i / q) * Math.PI * 2 + layerIndex * 0.4;
        bundle.position.set(Math.cos(angle) * rDist, 0, Math.sin(angle) * rDist);
        bundle.rotation.z = cfg.position === "frame" ? (i % 2 === 0 ? 0.35 : -0.35) : 0.1;
        bundle.rotation.y = -angle;
      }
      group.add(bundle);
    }
    return group;
  }

  // 4) 골판지: 외부 프레임(케이지 박스/리브) 또는 골판지 적층 패드
  if (cfg.materialId === "corrugated") {
    const cardMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#92400e"),
      roughness: 0.85,
    });

    for (let i = 0; i < q; i++) {
      if (cfg.position === "frame" || cfg.position === "wrap") {
        // 수량이 늘어날수록 골판지 보호 링/프레임 격자가 여러 각도로 추가됨
        const ringR = baseRy * (1.18 + Math.floor(i / 3) * 0.08) + layerOffset;
        const frameGeo = new THREE.TorusGeometry(ringR, 0.024, 6, 8);
        const frameMesh = new THREE.Mesh(frameGeo, cardMat);
        frameMesh.rotation.y = (i / q) * Math.PI;
        if (i % 3 === 2) frameMesh.rotation.x = Math.PI / 2;
        group.add(frameMesh);
      } else if (cfg.position === "bottom" || cfg.position === "top") {
        const sign = cfg.position === "top" ? 1 : -1;
        const diskR = baseRx * 1.22;
        const diskGeo = new THREE.CylinderGeometry(diskR, diskR, 0.028, 8);
        const disk = new THREE.Mesh(diskGeo, i % 2 === 0 ? cardMat : edgeMat);
        disk.position.y = sign * (baseRy * 1.02 + i * 0.034 + layerOffset);
        group.add(disk);
      } else {
        // side / band
        const angle = (i / q) * Math.PI * 2;
        const rDist = baseRx * 1.15 + layerOffset;
        const plateGeo = new THREE.BoxGeometry(0.03, baseRy * 1.1, 0.22);
        const plate = new THREE.Mesh(plateGeo, cardMat);
        plate.position.set(Math.cos(angle) * rDist, 0, Math.sin(angle) * rDist);
        plate.rotation.y = -angle;
        group.add(plate);
      }
    }
    return group;
  }

  // 5) 스펀지 / 공기 완충 쿠션: 두툼한 입체 쿠션 블록/에어필로우가 수량(개)만큼 추가됨
  if (cfg.materialId === "sponge" || cfg.materialId === "air-cushion") {
    const isAir = cfg.materialId === "air-cushion";
    const blockMat = new THREE.MeshPhysicalMaterial({
      color,
      roughness: isAir ? 0.18 : 0.85,
      transparent: isAir,
      opacity: isAir ? 0.68 : 0.96,
      clearcoat: isAir ? 0.9 : 0,
    });

    for (let i = 0; i < q; i++) {
      const pieceGeo = isAir
        ? new THREE.CapsuleGeometry(0.085, 0.12, 10, 16)
        : new THREE.BoxGeometry(0.16, 0.11, 0.16);

      const mesh = new THREE.Mesh(pieceGeo, blockMat);

      if (cfg.position === "bottom" || cfg.position === "top") {
        const sign = cfg.position === "top" ? 1 : -1;
        // 수량이 늘어나면 아래/위에 두툼하게 층층이 쌓이거나 꽃무늬처럼 넓게 받쳐줌
        const layerIdx = Math.floor(i / 3);
        const subIdx = i % 3;
        const offsetR = i === 0 ? 0 : 0.095;
        const angle = (subIdx / 3) * Math.PI * 2 + layerIdx * 0.5;
        if (isAir) mesh.rotation.z = Math.PI / 2;
        mesh.position.set(
          Math.cos(angle) * offsetR,
          sign * (baseRy * 1.04 + layerIdx * 0.095 + (i === 0 ? 0 : 0.03) + layerOffset),
          Math.sin(angle) * offsetR,
        );
      } else {
        // side, band, wrap: 둘레를 따라 쿠션 패드가 하나씩 추가됨
        const angle = (i / q) * Math.PI * 2 + layerIndex * 0.35;
        const ringLayer = Math.floor(i / 6);
        const rDist = baseRx * (1.18 + ringLayer * 0.16) + layerOffset;
        const yOff =
          cfg.position === "wrap" ? ((i % 3) - 1) * baseRy * 0.48 : 0;
        mesh.position.set(Math.cos(angle) * rDist, yOff, Math.sin(angle) * rDist);
        mesh.lookAt(0, yOff, 0);
      }
      group.add(mesh);
    }
    return group;
  }

  // 6) 솜 / 구긴 신문지 / 포장용 완충 충전재: 수량(줌/뭉치)을 늘릴수록 입체 덩어리들이 풍성하게 증식
  if (
    cfg.materialId === "cotton" ||
    cfg.materialId === "newspaper" ||
    cfg.materialId === "packing-peanut"
  ) {
    const isCotton = cfg.materialId === "cotton";
    const isPaper = cfg.materialId === "newspaper";
    const puffMat = new THREE.MeshStandardMaterial({
      color,
      roughness: isCotton ? 0.95 : 0.75,
      flatShading: isPaper,
    });

    const blobsPerUnit = 5;
    const totalBlobs = q * blobsPerUnit;
    const blobGeo = isPaper
      ? new THREE.IcosahedronGeometry(0.068, 0)
      : isCotton
        ? new THREE.SphereGeometry(0.065, 12, 12)
        : new THREE.CapsuleGeometry(0.032, 0.055, 6, 10);

    for (let k = 0; k < totalBlobs; k++) {
      const r1 = seededRandom(k * 3 + layerIndex * 17 + 1);
      const r2 = seededRandom(k * 7 + layerIndex * 31 + 2);
      const r3 = seededRandom(k * 11 + layerIndex * 43 + 3);
      const phi = phiStart + r1 * (phiEnd - phiStart);
      const theta = r2 * Math.PI * 2;
      const radialLayer = 1.08 + (k / totalBlobs) * 0.28 + layerOffset / baseRx;

      const x = baseRx * radialLayer * Math.sin(phi) * Math.cos(theta);
      const y = baseRy * radialLayer * Math.cos(phi);
      const z = baseRx * radialLayer * Math.sin(phi) * Math.sin(theta);

      const blob = new THREE.Mesh(blobGeo, puffMat);
      blob.position.set(x, y, z);
      blob.rotation.set(r1 * Math.PI, r2 * Math.PI, r3 * Math.PI);
      const s = 0.8 + r3 * 0.45;
      blob.scale.set(s, s, s);
      group.add(blob);
    }
    return group;
  }

  // 7) 그 외 시트/패브릭류 (EVA 폼, 키친타월, 헝겊/펠트, 벌집형 종이, 코르크 시트, 부직포):
  // 수량(장)이 늘어날수록 계란의 해당 부위에 곡면 시트 레이어가 한 겹씩 두껍게 적층됨
  const isHoneycomb = cfg.materialId === "honeycomb";
  const sheetMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.65,
    wireframe: false,
    side: THREE.DoubleSide,
  });
  const wireMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#7c2d12"),
    wireframe: true,
    transparent: true,
    opacity: isHoneycomb ? 0.35 : 0.12,
  });

  for (let layer = 0; layer < q; layer++) {
    const rScale = 1.05 + layerOffset / baseRx + layer * 0.042;
    const sheetGeo = new THREE.SphereGeometry(
      baseRx * rScale,
      24,
      16,
      0,
      Math.PI * 2,
      phiStart,
      phiEnd - phiStart,
    );
    sheetGeo.scale(1, baseRy / baseRx, 1);
    const mesh = new THREE.Mesh(sheetGeo, sheetMat);
    group.add(mesh);

    if (isHoneycomb || layer === q - 1) {
      const wire = new THREE.Mesh(sheetGeo, wireMat);
      group.add(wire);
    }
  }

  return group;
}

const DROP_ZONE_CARDS: { id: PositionId; label: string; relX: number; relY: number }[] = [
  { id: "top", label: "위 덧대기", relX: 0, relY: -135 },
  { id: "wrap", label: "전체 감싸기", relX: -145, relY: -82 },
  { id: "frame", label: "외부 프레임", relX: 145, relY: -82 },
  { id: "side", label: "옆면 완충", relX: -155, relY: 0 },
  { id: "band", label: "중간 띠", relX: 0, relY: 0 },
  { id: "fill", label: "내부 채움", relX: 155, relY: 0 },
  { id: "cradle", label: "알 받침", relX: -115, relY: 115 },
  { id: "bottom", label: "아래 덧대기", relX: 65, relY: 125 },
];

export function SimulationStage3D({
  setup,
  simResult,
  draggingMaterialId,
  onDropMaterialAtPosition,
}: SimulationStage3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const packageRootRef = useRef<THREE.Group | null>(null);
  const materialsGroupRef = useRef<THREE.Group | null>(null);
  const crackGroupRef = useRef<THREE.Group | null>(null);
  const comMarkerRef = useRef<THREE.Mesh | null>(null);
  const impactRingRef = useRef<THREE.Mesh | null>(null);
  const floorMeshRef = useRef<THREE.Mesh | null>(null);
  const towerHighlightRef = useRef<THREE.Mesh | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const [playback, setPlayback] = useState<PlaybackState>(() => ({
    sim: simResult,
    time: 0,
    playing: false,
  }));
  const [speedRate, setSpeedRate] = useState<number>(1);
  const [viewMode, setViewMode] = useState<"workbench" | "follow" | "impact">("workbench");
  const [xrayEgg, setXrayEgg] = useState<boolean>(false);
  const [hoveredZone, setHoveredZone] = useState<PositionId | null>(null);

  const currentTime = playback.sim === simResult ? playback.time : 0;
  const isPlaying = playback.sim === simResult ? playback.playing : false;

  const currentFrame = useMemo(
    () => sampleFrameAt(simResult.frames, currentTime),
    [simResult.frames, currentTime],
  );

  // 재생 루프
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let prevNow = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - prevNow) / 1000);
      prevNow = now;

      setPlayback((prev) => {
        const baseTime = prev.sim === simResult ? prev.time : 0;
        const nearImpact =
          simResult.firstContactTime !== null &&
          Math.abs(baseTime - simResult.firstContactTime) < 0.08 &&
          speedRate >= 1;
        const effRate = nearImpact ? 0.35 : speedRate;
        const nextTime = baseTime + dt * effRate;
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

  // 1) Three.js 기본 씬, 카메라, 조명, 빌딩 타워, 계란 메쉬 초기화
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0f172a");
    scene.fog = new THREE.FogExp2("#0f172a", 0.022);

    const camera = new THREE.PerspectiveCamera(
      45,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.05,
      120,
    );
    camera.position.set(0, 1.3, 2.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.65;
    controls.maxDistance = 28;
    controls.target.set(0, 1.0, 0);
    controlsRef.current = controls;

    // 조명
    const hemiLight = new THREE.HemisphereLight("#e2e8f0", "#1e293b", 1.15);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight("#ffffff", 1.6);
    dirLight.position.set(5, 18, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    scene.add(dirLight);

    const rimLight = new THREE.PointLight("#38bdf8", 1.2, 12);
    rimLight.position.set(-2.5, 2.2, -2.0);
    scene.add(rimLight);

    // 바닥 그리드 및 충격 패드
    const grid = new THREE.GridHelper(24, 24, "#334155", "#1e293b");
    grid.position.y = 0.002;
    scene.add(grid);

    const floorGeo = new THREE.CylinderGeometry(2.6, 2.8, 0.16, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: "#a8a29e",
      roughness: 0.7,
      metalness: 0.1,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.08;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);
    floorMeshRef.current = floorMesh;

    // 바닥 과녁 링
    const targetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.38, 36),
      new THREE.MeshBasicMaterial({ color: "#38bdf8", side: THREE.DoubleSide, transparent: true, opacity: 0.45 }),
    );
    targetRing.rotation.x = -Math.PI / 2;
    targetRing.position.y = 0.005;
    scene.add(targetRing);

    // 충격 파동 링
    const impactRing = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.55, 36),
      new THREE.MeshBasicMaterial({ color: "#f43f5e", side: THREE.DoubleSide, transparent: true, opacity: 0 }),
    );
    impactRing.rotation.x = -Math.PI / 2;
    impactRing.position.y = 0.01;
    scene.add(impactRing);
    impactRingRef.current = impactRing;

    // 3D 낙하 실험 타워 (뒤쪽 z = -1.35 에 배치된 1~5층 구조물)
    const towerGroup = new THREE.Group();
    towerGroup.position.set(0, 0, -1.4);
    const pillarMat = new THREE.MeshStandardMaterial({ color: "#334155", metalness: 0.5, roughness: 0.4 });
    const pillarGeo = new THREE.BoxGeometry(0.12, 16.5, 0.12);
    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(-0.9, 8.25, 0);
    const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.set(0.9, 8.25, 0);
    towerGroup.add(leftPillar, rightPillar);

    // 각 층 발코니 플랫폼 (1층~5층)
    const slabGeo = new THREE.BoxGeometry(1.9, 0.08, 0.7);
    const slabMat = new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.6 });
    for (let f = 1; f <= 5; f++) {
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set(0, f * 3.0, 0.25);
      towerGroup.add(slab);
    }

    // 현재 선택된 층 하이라이트 빔
    const highlightSlab = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.11, 0.9),
      new THREE.MeshBasicMaterial({ color: "#3b82f6", transparent: true, opacity: 0.55 }),
    );
    highlightSlab.position.set(0, 6.0, 0.3);
    towerGroup.add(highlightSlab);
    towerHighlightRef.current = highlightSlab;
    scene.add(towerGroup);

    // 패키지 루트 그룹 (계란 + 완충재 레이어들 + 균열 + 무게중심 마커)
    const packageRoot = new THREE.Group();
    packageRoot.position.set(0, 1.0, 0);
    scene.add(packageRoot);
    packageRootRef.current = packageRoot;

    // 3D 계란 본체
    const eggGeo = createEggGeometry();
    const eggMat = new THREE.MeshPhysicalMaterial({
      color: "#fde68a",
      roughness: 0.32,
      metalness: 0.02,
      clearcoat: 0.35,
      transparent: true,
      opacity: 1.0,
    });
    const eggMesh = new THREE.Mesh(eggGeo, eggMat);
    eggMesh.name = "egg-shell-mesh";
    eggMesh.castShadow = true;
    packageRoot.add(eggMesh);

    // 내부 노른자 (투시 모드에서 보임)
    const yolkMesh = new THREE.Mesh(
      new THREE.SphereGeometry(EGG_HALF_WIDTH_M * EGG_VISUAL_MULT * 0.48, 24, 24),
      new THREE.MeshStandardMaterial({
        color: "#f59e0b",
        emissive: "#d97706",
        emissiveIntensity: 0.25,
        roughness: 0.3,
      }),
    );
    yolkMesh.position.y = -0.03;
    packageRoot.add(yolkMesh);

    // 3D 균열 라인 그룹
    const crackGroup = new THREE.Group();
    const crackMat = new THREE.LineBasicMaterial({ color: "#dc2626", linewidth: 2 });
    const rW = EGG_HALF_WIDTH_M * EGG_VISUAL_MULT * 1.015;
    const rH = EGG_HALF_HEIGHT_M * EGG_VISUAL_MULT * 1.015;
    for (let c = 0; c < 4; c++) {
      const ang = (c / 4) * Math.PI * 2 + 0.4;
      const pts = [
        new THREE.Vector3(0, -rH * 0.95, 0),
        new THREE.Vector3(Math.cos(ang) * rW * 0.55, -rH * 0.55, Math.sin(ang) * rW * 0.55),
        new THREE.Vector3(Math.cos(ang + 0.25) * rW * 0.85, -rH * 0.15, Math.sin(ang + 0.25) * rW * 0.85),
        new THREE.Vector3(Math.cos(ang - 0.15) * rW * 0.75, rH * 0.25, Math.sin(ang - 0.15) * rW * 0.75),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      crackGroup.add(new THREE.Line(lineGeo, crackMat));
    }
    crackGroup.visible = false;
    packageRoot.add(crackGroup);
    crackGroupRef.current = crackGroup;

    // 무게중심(COM) 3D 마커
    const comMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 16, 16),
      new THREE.MeshBasicMaterial({ color: "#ef4444" }),
    );
    packageRoot.add(comMarker);
    comMarkerRef.current = comMarker;

    // 완충재 그룹
    const materialsGroup = new THREE.Group();
    packageRoot.add(materialsGroup);
    materialsGroupRef.current = materialsGroup;

    // 리사이즈 대응
    const handleResize = () => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // 렌더 루프
    let animId = 0;
    const renderLoop = () => {
      controls.update();
      renderer.render(scene, camera);
      animId = requestAnimationFrame(renderLoop);
    };
    animId = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // 2) 재료 구성(configs)이나 투시 모드가 바뀔 때마다 3D 완충재 메쉬 즉시 갱신
  useEffect(() => {
    const matGroup = materialsGroupRef.current;
    const pkgRoot = packageRootRef.current;
    if (!matGroup || !pkgRoot) return;

    // 기존 메쉬 정리
    while (matGroup.children.length > 0) {
      const child = matGroup.children[0];
      matGroup.remove(child);
    }

    // 각 구성 행을 순서대로 3D 메쉬로 생성해 부착
    setup.configs.forEach((cfg, idx) => {
      const layer3D = buildMaterialLayer3D(cfg, idx);
      matGroup.add(layer3D);
    });

    // 계란 껍데기 투시 여부 반영
    const eggShell = pkgRoot.getObjectByName("egg-shell-mesh") as THREE.Mesh | undefined;
    if (eggShell && eggShell.material instanceof THREE.MeshPhysicalMaterial) {
      eggShell.material.opacity = xrayEgg ? 0.38 : 1.0;
    }

    // 무게중심 마커 위치 갱신
    if (comMarkerRef.current) {
      comMarkerRef.current.position.set(
        simResult.model.com.x * EGG_VISUAL_MULT,
        simResult.model.com.y * EGG_VISUAL_MULT,
        0,
      );
    }

    // 바닥 색상 및 타워 층수 하이라이트 갱신
    if (floorMeshRef.current && floorMeshRef.current.material instanceof THREE.MeshStandardMaterial) {
      const surf = SURFACES[setup.conditions.surface];
      floorMeshRef.current.material.color.set(surf.color);
    }
    if (towerHighlightRef.current) {
      towerHighlightRef.current.position.y =
        setup.conditions.floors * setup.conditions.floorHeightM * WORLD_SCALE;
    }
  }, [setup.configs, setup.conditions.floors, setup.conditions.floorHeightM, setup.conditions.surface, simResult.model.com, xrayEgg]);

  // 3) 현재 시뮬레이션 프레임(위치, 회전각, 바닥 충돌 압축 변형, 균열)을 3D 객체에 실시간 반영
  useEffect(() => {
    const pkgRoot = packageRootRef.current;
    const matGroup = materialsGroupRef.current;
    const crackGroup = crackGroupRef.current;
    const impactRing = impactRingRef.current;
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!pkgRoot || !matGroup) return;

    // 조립 뷰(workbench)이고 정지(t=0) 상태면 눈높이(y=1.0m)에 띄워 360도 돌려보며 재료를 붙이기 쉽게 함
    const inWorkbenchIdle = viewMode === "workbench" && !isPlaying && currentTime === 0;
    const baseRadiusWorld = simResult.model.maxExtent * EGG_VISUAL_MULT;

    const targetY = inWorkbenchIdle
      ? 1.0
      : Math.max(baseRadiusWorld * 0.68, currentFrame.y * WORLD_SCALE);
    const targetX = inWorkbenchIdle ? 0 : currentFrame.x * WORLD_SCALE * 3;

    pkgRoot.position.set(targetX, targetY, 0);
    pkgRoot.rotation.set(0, 0, currentFrame.theta);

    // 충돌 시 완충재 3D 압축(Squash & Stretch) 표현
    let maxCompRatio = 0;
    if (currentFrame.compression) {
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const thick = simResult.model.directions[i].thickness;
        if (thick > 1e-6) {
          const r = currentFrame.compression[i] / thick;
          if (r > maxCompRatio) maxCompRatio = r;
        }
      }
    }
    const squash = Math.min(0.42, maxCompRatio * 0.55);
    matGroup.scale.set(1 + squash * 0.45, 1 - squash, 1 + squash * 0.45);

    // 충격 파동 링 표시
    if (impactRing && impactRing.material instanceof THREE.MeshBasicMaterial) {
      if (currentFrame.force > 2) {
        const fNorm = Math.min(1, Math.log10(1 + currentFrame.force) / 3);
        impactRing.material.opacity = fNorm * 0.85;
        const s = 0.8 + fNorm * 2.2;
        impactRing.scale.set(s, s, 1);
      } else {
        impactRing.material.opacity = 0;
      }
    }

    // 껍데기 균열 표시
    if (crackGroup) {
      const pastImpact =
        simResult.firstContactTime !== null && currentTime >= simResult.firstContactTime + 0.001;
      crackGroup.visible = pastImpact && simResult.loadRatio >= 0.65;
    }

    // 카메라 추적 모드
    if (controls && camera) {
      if (viewMode === "follow" || isPlaying) {
        const camTargetY = Math.max(0.6, targetY);
        controls.target.lerp(new THREE.Vector3(targetX, camTargetY, 0), 0.25);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, camTargetY + 0.5, 0.2);
      } else if (viewMode === "impact") {
        controls.target.lerp(new THREE.Vector3(0, 0.45, 0), 0.2);
      } else if (inWorkbenchIdle) {
        controls.target.lerp(new THREE.Vector3(0, 1.0, 0), 0.15);
      }
    }
  }, [currentFrame, currentTime, isPlaying, simResult, viewMode]);

  const switchViewMode = (nextMode: "workbench" | "follow" | "impact") => {
    setViewMode(nextMode);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    if (nextMode === "workbench") {
      setPlayback({ sim: simResult, time: 0, playing: false });
      camera.position.set(0, 1.25, 2.0);
      controls.target.set(0, 1.0, 0);
    } else if (nextMode === "follow") {
      const h = simResult.summary.dropHeightM;
      camera.position.set(1.6, h * 0.85, 4.8);
      controls.target.set(0, h * 0.75, 0);
    } else {
      camera.position.set(0, 0.8, 2.3);
      controls.target.set(0, 0.35, 0);
    }
  };

  const handleStartOrPause = () => {
    if (isPlaying) {
      setPlayback({ sim: simResult, time: currentTime, playing: false });
      return;
    }
    const startFrom = currentTime >= simResult.endTime - 1e-4 ? 0 : currentTime;
    if (startFrom === 0 && viewMode === "workbench") {
      setViewMode("follow");
      if (cameraRef.current && controlsRef.current) {
        const h = simResult.summary.dropHeightM;
        cameraRef.current.position.set(1.2, h, 3.8);
        controlsRef.current.target.set(0, h, 0);
      }
    }
    setPlayback({ sim: simResult, time: startFrom, playing: true });
  };

  const handleReset = () => {
    setPlayback({ sim: simResult, time: 0, playing: false });
    switchViewMode("workbench");
  };

  const allowedForDragging = useMemo(
    () => (draggingMaterialId ? getAllowedPositions(draggingMaterialId) : []),
    [draggingMaterialId],
  );
  const draggingMat = draggingMaterialId ? getMaterial(draggingMaterialId) : undefined;

  // 3D 캔버스 영역에 직접 드롭했을 때 마우스 위치에 가장 가까운 허용 위치로 자동 부착
  const handleCanvasDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const matId = e.dataTransfer.getData("text/eggdrop-material") || draggingMaterialId;
    if (!matId) return;
    const allowed = getAllowedPositions(matId);
    if (allowed.length === 0) return;

    if (hoveredZone && allowed.includes(hoveredZone)) {
      onDropMaterialAtPosition(matId, hoveredZone);
      setHoveredZone(null);
      return;
    }

    // 캔버스 중심 기준 상/하/좌/우 위치로 가장 자연스러운 허용 위치 선택
    const rect = e.currentTarget.getBoundingClientRect();
    const dy = e.clientY - (rect.top + rect.height * 0.45);
    const dx = e.clientX - (rect.left + rect.width * 0.5);

    let preferred: PositionId = "wrap";
    if (dy > 55 && allowed.includes("bottom")) preferred = "bottom";
    else if (dy > 55 && allowed.includes("cradle")) preferred = "cradle";
    else if (dy < -55 && allowed.includes("top")) preferred = "top";
    else if (Math.abs(dx) > 65 && allowed.includes("side")) preferred = "side";
    else if (allowed.includes("wrap")) preferred = "wrap";
    else preferred = allowed[0];

    onDropMaterialAtPosition(matId, preferred);
    setHoveredZone(null);
  };

  const speedMps = Math.hypot(currentFrame.vx, currentFrame.vy);
  const tiltDeg = ((currentFrame.theta * 180) / Math.PI) % 360;

  return (
    <div
      className="relative h-full w-full select-none overflow-hidden bg-slate-950"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleCanvasDrop}
    >
      {/* 3D WebGL 캔버스 마운트 */}
      <div ref={mountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

      {/* 드래그 중일 때 3D 계란 주변에 뜨는 부착 위치 드롭존 타겟 오버레이 */}
      {draggingMaterialId && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/35 backdrop-blur-[1px]">
          <div className="relative flex h-80 w-80 items-center justify-center rounded-full border-2 border-dashed border-sky-400/60">
            <div className="rounded-full bg-slate-900/90 px-3 py-1 text-xs font-bold text-sky-300 shadow">
              {draggingMat?.name} 부착 위치를 선택해 놓으세요
            </div>

            {DROP_ZONE_CARDS.map((zone) => {
              const isAllowed = allowedForDragging.includes(zone.id);
              const customLabel =
                draggingMat?.positions[zone.id]?.label ?? POSITIONS[zone.id].name;
              const isHovered = hoveredZone === zone.id;
              return (
                <div
                  key={zone.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (isAllowed) setHoveredZone(zone.id);
                  }}
                  onDragLeave={() => setHoveredZone(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isAllowed && draggingMaterialId) {
                      onDropMaterialAtPosition(draggingMaterialId, zone.id);
                    }
                    setHoveredZone(null);
                  }}
                  style={{
                    transform: `translate(${zone.relX}px, ${zone.relY}px)`,
                  }}
                  className={`pointer-events-auto absolute rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                    !isAllowed
                      ? "cursor-not-allowed border-slate-700 bg-slate-900/60 text-slate-500 opacity-45"
                      : isHovered
                        ? "scale-110 border-amber-300 bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/30"
                        : "cursor-pointer border-sky-400 bg-slate-900/90 text-white hover:scale-105 hover:bg-sky-600"
                  }`}
                >
                  {isAllowed ? `+ ${customLabel}` : `${zone.label} (불가)`}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 상단 중앙 미니멀 카메라/시점 & 실시간 텔레메트리 HUD */}
      <div className="pointer-events-none absolute top-3 left-1/2 z-10 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 px-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-700/80 bg-slate-900/85 p-1 text-xs text-slate-200 backdrop-blur-md">
          <button
            type="button"
            onClick={() => switchViewMode("workbench")}
            className={`rounded-full px-3 py-1 font-semibold transition ${
              viewMode === "workbench"
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            3D 조립 뷰
          </button>
          <button
            type="button"
            onClick={() => switchViewMode("follow")}
            className={`rounded-full px-3 py-1 font-semibold transition ${
              viewMode === "follow"
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            낙하 타워 추적
          </button>
          <button
            type="button"
            onClick={() => switchViewMode("impact")}
            className={`rounded-full px-3 py-1 font-semibold transition ${
              viewMode === "impact"
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            충돌 지면 클로즈업
          </button>
          <button
            type="button"
            onClick={() => setXrayEgg((v) => !v)}
            className={`rounded-full px-3 py-1 font-semibold transition ${
              xrayEgg ? "bg-amber-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            내부 투시
          </button>
        </div>

        {/* 실시간 낙하 상태 미니 배지 */}
        <div className="flex items-center gap-3 rounded-full border border-slate-700/80 bg-slate-900/85 px-3.5 py-1.5 font-mono text-xs text-slate-200 backdrop-blur-md">
          <span>높이 {Math.max(0, currentFrame.y).toFixed(2)}m</span>
          <span className="text-slate-600">|</span>
          <span>속력 {speedMps.toFixed(2)}m/s</span>
          <span className="text-slate-600">|</span>
          <span>기울기 {tiltDeg.toFixed(0)}°</span>
          <span className="text-slate-600">|</span>
          <span className={currentFrame.force > 1 ? "font-bold text-rose-400" : "text-slate-400"}>
            충격력 {currentFrame.force.toFixed(0)}N
          </span>
        </div>
      </div>

      {/* 중앙 하단 재생 컨트롤 바 */}
      <div className="pointer-events-auto absolute bottom-32 left-1/2 z-10 flex w-[92%] max-w-2xl -translate-x-1/2 flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/90 px-4 py-2 text-xs text-white shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleStartOrPause}
            className="rounded-xl bg-blue-600 px-4 py-1.5 font-bold text-white transition hover:bg-blue-500"
          >
            {isPlaying
              ? "⏸ 일시정지"
              : currentTime > 0 && currentTime < simResult.endTime
                ? "▶ 계속 재생"
                : "▶ 3D 낙하 시작"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-700"
          >
            ↺ 조립 위치로
          </button>
        </div>

        {/* 타임라인 슬라이더 */}
        <div className="flex flex-1 items-center gap-2 min-w-[160px]">
          <input
            type="range"
            aria-label="시뮬레이션 시간 탐색"
            min={0}
            max={simResult.endTime}
            step={0.001}
            value={Math.min(currentTime, simResult.endTime)}
            onChange={(e) => {
              const t = Number(e.target.value);
              if (t > 0 && viewMode === "workbench") setViewMode("follow");
              setPlayback({ sim: simResult, time: t, playing: false });
            }}
            className="w-full accent-blue-500"
          />
          <span className="w-14 text-right font-mono text-[11px] text-slate-300">
            {currentTime.toFixed(2)}s
          </span>
        </div>

        {/* 배속 버튼 */}
        <div className="flex items-center gap-1">
          {[
            { label: "1x", value: 1 },
            { label: "0.25x", value: 0.25 },
            { label: "0.05x", value: 0.05 },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSpeedRate(opt.value)}
              className={`rounded-lg px-2 py-1 font-mono text-[11px] font-bold transition ${
                speedRate === opt.value
                  ? "bg-amber-400 text-slate-950"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
