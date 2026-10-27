import { describe, expect, it } from "vitest";
import { createSampleSetup, DEFAULT_CONDITIONS, dropHeightM } from "./defaults";
import { getAllowedPositions, getMaterial, isPositionAllowed, MATERIAL_CATALOG } from "./materialCatalog";
import { buildPackageModel, summarizeConfig } from "./packageModel";
import { simulate, simulateWithBaseline } from "./simulation";
import { createLocalRepository } from "./storage";
import { fromSupabaseRow, getSupabaseEnvStatus, toSupabaseRowPayload } from "./supabaseAdapter";
import type { ExperimentSetup, MaterialConfig } from "./types";

describe("완충재 카탈로그 15종 및 부착 위치 규칙 (시나리오 4, 5, 6, 15)", () => {
  it("15종의 완충재가 고유 ID와 유효한 물성값으로 정의되어 있다", () => {
    expect(MATERIAL_CATALOG).toHaveLength(15);
    const ids = new Set(MATERIAL_CATALOG.map((m) => m.id));
    expect(ids.size).toBe(15);

    for (const mat of MATERIAL_CATALOG) {
      expect(mat.name.length).toBeGreaterThan(0);
      expect(mat.unitMassG).toBeGreaterThan(0);
      expect(mat.unitThicknessMm).toBeGreaterThan(0);
      expect(mat.compressibility).toBeGreaterThan(0);
      expect(mat.compressibility).toBeLessThanOrEqual(1);
      expect(mat.stiffnessNPerM).toBeGreaterThan(0);
      expect(mat.energyAbsorption).toBeGreaterThan(0);
      expect(mat.energyAbsorption).toBeLessThan(1);
      expect(mat.restitution).toBeGreaterThan(0);
      expect(mat.restitution).toBeLessThan(1);
      const allowed = getAllowedPositions(mat.id);
      expect(allowed.length).toBeGreaterThan(0);
    }
  });

  it("특정 재료를 선택하면 허용된 부착 위치만 반환하고 비허용 위치는 차단한다", () => {
    // 뽁뽁이: 전체 감싸기(wrap), 중간 띠(band), 아래 덧대기(bottom), 위 덧대기(top), 옆면 완충(side) 허용
    expect(getAllowedPositions("bubble-wrap")).toEqual(["wrap", "band", "bottom", "top", "side"]);
    expect(isPositionAllowed("bubble-wrap", "wrap")).toBe(true);
    expect(isPositionAllowed("bubble-wrap", "bottom")).toBe(true);
    expect(isPositionAllowed("bubble-wrap", "frame")).toBe(false);

    // 종이컵: 알 받침(cradle), 아래 받침(bottom), 용기형(wrap)만 허용
    expect(getAllowedPositions("paper-cup")).toEqual(["cradle", "bottom", "wrap"]);
    expect(isPositionAllowed("paper-cup", "side")).toBe(false);

    // 골판지: 외부 프레임(frame) 허용, 알 받침(cradle) 비허용
    expect(isPositionAllowed("corrugated", "frame")).toBe(true);
    expect(isPositionAllowed("corrugated", "cradle")).toBe(false);

    // 잘못된 조합(비허용 위치 또는 0 이하 수량) 처리 검증
    const invalidPosSummary = summarizeConfig({
      id: "inv-pos",
      materialId: "paper-cup",
      position: "side",
      quantity: 3,
    });
    expect(invalidPosSummary.valid).toBe(false);
    expect(invalidPosSummary.massG).toBe(0);

    const invalidQtySummary = summarizeConfig({
      id: "inv-qty",
      materialId: "bubble-wrap",
      position: "wrap",
      quantity: 0,
    });
    expect(invalidQtySummary.valid).toBe(false);

    // buildPackageModel에서도 수량이 1~10 범위를 벗어나면 안전하게 클램핑 처리
    const clampedModel = buildPackageModel(
      [{ id: "over", materialId: "sponge", position: "wrap", quantity: 99 }],
      60,
    );
    expect(clampedModel.packageMassKg * 1000).toBeCloseTo(getMaterial("sponge")!.unitMassG * 10, 5);
  });
});

describe("낙하 높이, 질량 분포 및 포장 구조 모델 (시나리오 1, 2, 4, 6, 7)", () => {
  it("2층과 5층 전환 및 층고 변경에 따라 총 낙하 높이가 다시 계산된다", () => {
    expect(dropHeightM({ floors: 2, floorHeightM: 3.0 })).toBe(6);
    expect(dropHeightM({ floors: 5, floorHeightM: 3.0 })).toBe(15);
    expect(dropHeightM({ floors: 2, floorHeightM: 3.5 })).toBe(7);
    expect(dropHeightM({ floors: 4, floorHeightM: 3.2 })).toBeCloseTo(12.8, 5);

    const sim2F = simulate({
      conditions: { ...DEFAULT_CONDITIONS, floors: 2, floorHeightM: 3.0 },
      configs: [],
    });
    const sim5F = simulate({
      conditions: { ...DEFAULT_CONDITIONS, floors: 5, floorHeightM: 3.0 },
      configs: [],
    });
    expect(sim2F.summary.dropHeightM).toBe(6);
    expect(sim5F.summary.dropHeightM).toBe(15);
    expect(sim5F.summary.impactSpeed).toBeGreaterThan(sim2F.summary.impactSpeed);
  });

  it("뽁뽁이를 전체 감싸기(2겹)와 아래 덧대기(3겹) 두 위치에 각각 설정하고 추가·삭제 시 총질량이 갱신된다", () => {
    const configs: MaterialConfig[] = [
      { id: "c1", materialId: "bubble-wrap", position: "wrap", quantity: 2 },
      { id: "c2", materialId: "bubble-wrap", position: "bottom", quantity: 3 },
      { id: "c3", materialId: "sponge", position: "side", quantity: 2 },
    ];
    const bubbleMass = getMaterial("bubble-wrap")!.unitMassG;
    const spongeMass = getMaterial("sponge")!.unitMassG;
    const expectedPackageG = bubbleMass * 2 + bubbleMass * 3 + spongeMass * 2;

    const model = buildPackageModel(configs, 60);
    expect(model.packageMassKg * 1000).toBeCloseTo(expectedPackageG, 5);
    expect(model.totalMassKg * 1000).toBeCloseTo(60 + expectedPackageG, 5);

    // 스펀지 행 삭제 시 총질량 감소
    const afterDelete = buildPackageModel(configs.slice(0, 2), 60);
    expect(afterDelete.totalMassKg * 1000).toBeCloseTo(60 + bubbleMass * 5, 5);
  });

  it("아래쪽에만 재료를 배치하면 무게중심(COM)이 아래(-y)로 이동한다", () => {
    const symmetric = buildPackageModel(
      [{ id: "s1", materialId: "sponge", position: "wrap", quantity: 4 }],
      60,
    );
    const bottomHeavy = buildPackageModel(
      [{ id: "b1", materialId: "sponge", position: "bottom", quantity: 6 }],
      60,
    );
    expect(bottomHeavy.com.y).toBeLessThan(symmetric.com.y);
  });
});

describe("2D 강체 낙하 및 충돌 물리 시뮬레이션 (시나리오 3, 8, 9, 10)", () => {
  it("시뮬레이션 실행 시 시작 높이에서 출발해 낙하, 바닥 접촉(압축), 반발, 안정화까지 프레임이 생성된다", () => {
    const sim = simulateWithBaseline(createSampleSetup());
    expect(sim.frames.length).toBeGreaterThan(50);
    expect(sim.frames[0].t).toBe(0);
    expect(sim.frames[0].y).toBeGreaterThan(5.9);
    expect(sim.firstContactTime).not.toBeNull();
    expect(sim.summary.maxCompressionMm).toBeGreaterThan(0);
    const lastFrame = sim.frames[sim.frames.length - 1];
    expect(lastFrame.y).toBeLessThan(0.2);
  });

  it("공기 저항을 끄면 충돌 직전 속도가 이론값 sqrt(2gh)에 근접하고, 켜면 그보다 작다", () => {
    const configs: MaterialConfig[] = [
      { id: "c1", materialId: "sponge", position: "wrap", quantity: 3 },
    ];
    const noAir = simulate({
      conditions: { ...DEFAULT_CONDITIONS, floors: 3, airResistance: false, initialTiltDeg: 0 },
      configs,
    });
    const withAir = simulate({
      conditions: { ...DEFAULT_CONDITIONS, floors: 3, airResistance: true, initialTiltDeg: 0 },
      configs,
    });

    expect(noAir.summary.impactSpeed).toBeCloseTo(noAir.summary.idealImpactSpeed, 1);
    expect(withAir.summary.impactSpeed).toBeLessThan(withAir.summary.idealImpactSpeed);
  });

  it("계란 질량을 바꾸면 총질량, 운동량, 운동에너지가 일관되게 갱신된다", () => {
    const configs: MaterialConfig[] = [
      { id: "c1", materialId: "bubble-wrap", position: "wrap", quantity: 3 },
    ];
    const light = simulate({
      conditions: { ...DEFAULT_CONDITIONS, eggMassG: 45 },
      configs,
    });
    const heavy = simulate({
      conditions: { ...DEFAULT_CONDITIONS, eggMassG: 75 },
      configs,
    });

    expect(heavy.summary.totalMassG).toBeCloseTo(light.summary.totalMassG + 30, 5);
    expect(heavy.summary.momentum).toBeGreaterThan(light.summary.momentum);
    expect(heavy.summary.kineticEnergy).toBeGreaterThan(light.summary.kineticEnergy);
  });

  it("재료 조합을 변경하면 충돌 지속 시간, 압축량, 평균 충격력, 파손 위험 지표가 다시 계산된다", () => {
    const bare = simulateWithBaseline({
      conditions: { ...DEFAULT_CONDITIONS, floors: 2 },
      configs: [],
    });
    const cushioned = simulateWithBaseline({
      conditions: { ...DEFAULT_CONDITIONS, floors: 2 },
      configs: [
        { id: "c1", materialId: "sponge", position: "wrap", quantity: 5 },
        { id: "c2", materialId: "air-cushion", position: "bottom", quantity: 3 },
      ],
    });

    expect(cushioned.summary.contactDurationMs).toBeGreaterThan(bare.summary.contactDurationMs);
    expect(cushioned.summary.maxCompressionMm).toBeGreaterThan(bare.summary.maxCompressionMm);
    expect(cushioned.summary.averageForceN).toBeLessThan(bare.summary.averageForceN);
    expect(cushioned.summary.riskIndex).toBeLessThan(bare.summary.riskIndex);
    expect(cushioned.summary.cushionEffectPct).toBeGreaterThan(80);
  });

  it("초기 기울기와 비대칭 배치에 따라 회전 각도가 달라지며, 같은 조건에서는 항상 동일한 결과를 재현한다", () => {
    const uprightSetup: ExperimentSetup = {
      conditions: { ...DEFAULT_CONDITIONS, initialTiltDeg: 0, initialAngularVelocityDegS: 0 },
      configs: [{ id: "c1", materialId: "sponge", position: "wrap", quantity: 4 }],
    };
    const tiltedSetup: ExperimentSetup = {
      conditions: { ...DEFAULT_CONDITIONS, initialTiltDeg: 35, initialAngularVelocityDegS: 90 },
      configs: [{ id: "c1", materialId: "sponge", position: "bottom", quantity: 4 }],
    };

    const upright = simulate(uprightSetup);
    const tilted1 = simulate(tiltedSetup);
    const tilted2 = simulate(tiltedSetup);

    expect(tilted1.summary.totalRotationDeg).toBeGreaterThan(upright.summary.totalRotationDeg);
    expect(tilted1.summary).toEqual(tilted2.summary);
    expect(tilted1.frames.length).toBe(tilted2.frames.length);
  });
});

describe("실험 저장, 비교 및 실제 실험 기록 분리 (시나리오 11, 12, 13)", () => {
  it("여러 실험(A/B)을 저장·비교하고, 실제 실험 기록을 예측치와 별도로 저장·유지할 수 있다", () => {
    const mem = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    };

    const repo1 = createLocalRepository(() => fakeStorage);
    const simA = simulateWithBaseline({
      conditions: DEFAULT_CONDITIONS,
      configs: [{ id: "c1", materialId: "bubble-wrap", position: "wrap", quantity: 2 }],
    });
    const simB = simulateWithBaseline({
      conditions: DEFAULT_CONDITIONS,
      configs: [{ id: "c1", materialId: "sponge", position: "wrap", quantity: 5 }],
    });

    const savedA = repo1.save({
      name: "실험 A - 뽁뽁이 2겹",
      setup: {
        conditions: DEFAULT_CONDITIONS,
        configs: [{ id: "c1", materialId: "bubble-wrap", position: "wrap", quantity: 2 }],
      },
      result: simA.summary,
    });
    const savedB = repo1.save({
      name: "실험 B - 스펀지 5개",
      setup: {
        conditions: DEFAULT_CONDITIONS,
        configs: [{ id: "c1", materialId: "sponge", position: "wrap", quantity: 5 }],
      },
      result: simB.summary,
    });

    expect(savedA.actual).toBeNull();
    expect(savedB.actual).toBeNull();

    repo1.updateActual(savedA.id, {
      outcome: "cracked",
      memo: "미세 균열 발생",
      date: "2026-10-27",
      actualHeightM: 2.0,
      materialsNote: "뽁뽁이 전체 2겹",
      recordedAt: "2026-10-27T12:00:00.000Z",
    });

    // 새로고침(새 저장소 인스턴스) 후에도 두 실험과 실측 기록이 그대로 유지됨
    const repo2 = createLocalRepository(() => fakeStorage);
    const list = repo2.list();
    expect(list).toHaveLength(2);
    expect(list[0].actual?.outcome).toBe("cracked");
    expect(list[0].actual?.actualHeightM).toBe(2.0);
    expect(list[0].result.dropHeightM).toBe(6);
    expect(list[1].actual).toBeNull();

    // Supabase Row 변환 어댑터 검증
    const rowPayload = toSupabaseRowPayload(list[0], "user-uuid-123");
    expect(rowPayload.user_id).toBe("user-uuid-123");
    const restored = fromSupabaseRow({
      ...rowPayload,
      created_at: list[0].createdAt,
      updated_at: list[0].updatedAt,
    });
    expect(restored.name).toBe("실험 A - 뽁뽁이 2겹");
    expect(getSupabaseEnvStatus().configured).toBe(false);
  });
});
