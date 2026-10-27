import type { ActualRecord, ExperimentSetup, ResultSummary, SavedExperiment } from "./types";

/**
 * 실험 저장소 추상화.
 *
 * 현재 프로젝트에는 인증 시스템이 없으므로 기본 구현은 브라우저 localStorage이다.
 * 인증이 추가되면 같은 인터페이스로 Supabase 구현(supabase/migrations 참고)을 만들어
 * `setExperimentRepository()`로 교체하면 된다. 인증 없는 공개 읽기/쓰기 DB 정책은 사용하지 않는다.
 */
export interface ExperimentRepository {
  list(): SavedExperiment[];
  save(input: { name: string; setup: ExperimentSetup; result: ResultSummary }): SavedExperiment;
  rename(id: string, name: string): void;
  updateActual(id: string, actual: ActualRecord | null): void;
  remove(id: string): void;
  subscribe(listener: () => void): () => void;
}

export const STORAGE_KEY = "eggdrop-lab:experiments:v1";
export const EMPTY_EXPERIMENTS: SavedExperiment[] = [];

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isSavedExperiment(v: unknown): v is SavedExperiment {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.createdAt === "string" &&
    !!o.setup &&
    typeof o.setup === "object" &&
    !!o.result &&
    typeof o.result === "object"
  );
}

export function parseStoredExperiments(raw: string | null): SavedExperiment[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(isSavedExperiment);
  } catch {
    return [];
  }
}

export function createLocalRepository(
  storage: () => KeyValueStorage | null,
  now: () => Date = () => new Date(),
  makeId: () => string = () => `exp-${now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
): ExperimentRepository {
  const listeners = new Set<() => void>();
  let cacheRaw: string | null | undefined;
  let cache: SavedExperiment[] = [];

  const read = (): SavedExperiment[] => {
    const s = storage();
    const raw = s ? s.getItem(STORAGE_KEY) : null;
    if (raw !== cacheRaw) {
      cacheRaw = raw;
      cache = parseStoredExperiments(raw);
    }
    return cache;
  };

  const write = (items: SavedExperiment[]) => {
    const s = storage();
    if (!s) return;
    s.setItem(STORAGE_KEY, JSON.stringify(items));
    listeners.forEach((l) => l());
  };

  return {
    list: read,
    save({ name, setup, result }) {
      const ts = now().toISOString();
      const item: SavedExperiment = {
        id: makeId(),
        name: name.trim() || "이름 없는 실험",
        createdAt: ts,
        updatedAt: ts,
        setup: JSON.parse(JSON.stringify(setup)),
        result: { ...result },
        actual: null,
      };
      write([...read(), item]);
      return item;
    },
    rename(id, name) {
      const ts = now().toISOString();
      write(read().map((e) => (e.id === id ? { ...e, name: name.trim() || e.name, updatedAt: ts } : e)));
    },
    updateActual(id, actual) {
      const ts = now().toISOString();
      write(read().map((e) => (e.id === id ? { ...e, actual, updatedAt: ts } : e)));
    },
    remove(id) {
      write(read().filter((e) => e.id !== id));
    },
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (ev: StorageEvent) => {
        if (ev.key === STORAGE_KEY) listener();
      };
      if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },
  };
}

let repository: ExperimentRepository = createLocalRepository(() =>
  typeof window !== "undefined" ? window.localStorage : null,
);

export function getExperimentRepository(): ExperimentRepository {
  return repository;
}

/** 인증 기반 저장소(예: Supabase)로 교체할 때 사용 */
export function setExperimentRepository(repo: ExperimentRepository): void {
  repository = repo;
}
