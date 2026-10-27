"use client";

import React from "react";
import { getAllowedPositions, MATERIAL_CATALOG } from "@/lib/eggdrop/materialCatalog";
import { POSITIONS } from "@/lib/eggdrop/positions";
import type { PositionId } from "@/lib/eggdrop/types";

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
}

export function GuideModal({ open, onClose }: GuideModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h2 id="guide-modal-title" className="text-base font-bold text-slate-900">
            EggDrop Lab 사용 안내 및 실험 안전 수칙
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            닫기
          </button>
        </div>

        <div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-700">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h3 className="font-bold text-slate-900">1. 실험 진행 순서</h3>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4">
              <li>
                <strong>낙하 조건 설정 (왼쪽 패널):</strong> 낙하 층수(2~5층), 가정 층고(기본 3.0m), 계란 질량(기본 60g), 초기 기울기 및 각속도, 바닥 재질을 선택합니다.
              </li>
              <li>
                <strong>완충재 배치 조합 (왼쪽 패널):</strong> 15종 완충재를 원하는 위치(전체 감싸기, 아래 덧대기, 옆면 완충, 외부 프레임 등)와 수량(1~10)으로 조합합니다. 각 재료가 실제로 적용 가능한 위치만 선택 메뉴에 표시됩니다.
              </li>
              <li>
                <strong>낙하 애니메이션 관찰 (중앙 패널):</strong> <strong>낙하 시작</strong>을 눌러 낙하 가속, 공력 회전, 바닥 충돌 시 완충재 압축 및 반발 과정을 관찰합니다. <code>0.05x 충돌 초저속</code> 모드로 충돌 순간을 정밀하게 살펴볼 수 있습니다.
              </li>
              <li>
                <strong>물리량 분석 및 비교 (오른쪽·하단 패널):</strong> 예상 충돌 지속 시간, 평균 충격력, 상대 파손 위험 지표를 확인하고 여러 구성을 저장해 A/B/C 비교 차트로 대조합니다.
              </li>
            </ol>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
            <h3 className="font-bold">2. 실제 실험 안전 수칙 (필독)</h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>
                본 시뮬레이터의 2층~5층(6m~15m) 선택은 <strong>가상 물리 시뮬레이션 전용 기능</strong>입니다.
              </li>
              <li>
                <strong>고층 건물 창문, 베란다, 옥상 등에서 실제 낙하 실험을 절대 수행하지 마세요.</strong>
              </li>
              <li>
                실제 실험을 진행할 때는 반드시 <strong>낮은 높이의 통제된 장소</strong>에서 바닥 보호 매트를 깔고, 주변 사람과 충분한 안전거리를 확보한 뒤 <strong>교사 또는 성인의 감독</strong> 아래 수행하세요.
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h3 className="font-bold text-slate-900">3. 물리 모델 가정과 한계</h3>
            <p className="mt-1">
              시뮬레이션에 사용된 15종 재료의 강성·압축률·에너지 흡수율은 검증된 표준 측정값이 아닌
              <strong> 교육용 예시 가정값</strong>입니다. 또한 계란의 파손 위험 지표(0~100)는 모델 내 기준 하중과 비교한
              <strong> 상대적 비교 지수</strong>이며 실제 파손 확률(%)을 의미하지 않습니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CatalogModalProps {
  open: boolean;
  onClose: () => void;
  onQuickAddMaterial: (materialId: string, position: PositionId) => void;
}

export function CatalogModal({ open, onClose, onQuickAddMaterial }: CatalogModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h2 id="catalog-modal-title" className="text-base font-bold text-slate-900">
              완충재 카탈로그 15종 물성 및 허용 위치 규칙표
            </h2>
            <p className="text-xs text-slate-600">
              ※ 아래 물성값은 교육용 비교 모델의 가정값이며 실제 실험 조건에 따라 달라질 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            닫기
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <th className="py-2 px-2.5 font-bold">재료명</th>
                <th className="py-2 px-2.5 font-bold text-right">단위 질량</th>
                <th className="py-2 px-2.5 font-bold text-right">단위 두께</th>
                <th className="py-2 px-2.5 font-bold text-right">압축률</th>
                <th className="py-2 px-2.5 font-bold text-right">상대 강성</th>
                <th className="py-2 px-2.5 font-bold text-right">에너지 흡수</th>
                <th className="py-2 px-2.5 font-bold">적용 가능한 부착 위치 (클릭 시 바로 추가)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {MATERIAL_CATALOG.map((mat) => {
                const allowed = getAllowedPositions(mat.id);
                return (
                  <tr key={mat.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-2.5">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900">
                        <span
                          className="inline-block h-3 w-3 rounded-sm border border-slate-400"
                          style={{ backgroundColor: mat.color }}
                        />
                        <span>{mat.name}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{mat.description}</div>
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono">
                      {mat.unitMassG}g / {mat.unit}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono">{mat.unitThicknessMm}mm</td>
                    <td className="py-2.5 px-2.5 text-right font-mono">
                      {(mat.compressibility * 100).toFixed(0)}%
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono">
                      {(mat.stiffnessNPerM / 1000).toFixed(1)} kN/m
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono">
                      {(mat.energyAbsorption * 100).toFixed(0)}%
                    </td>
                    <td className="py-2.5 px-2.5">
                      <div className="flex flex-wrap gap-1">
                        {allowed.map((posId) => {
                          const custom = mat.positions[posId]?.label;
                          const label = custom ?? POSITIONS[posId].name;
                          return (
                            <button
                              key={posId}
                              type="button"
                              onClick={() => {
                                onQuickAddMaterial(mat.id, posId);
                                onClose();
                              }}
                              className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-900 hover:bg-blue-100"
                            >
                              + {label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
