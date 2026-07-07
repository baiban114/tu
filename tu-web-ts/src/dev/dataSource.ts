export type DataSource = 'backend' | 'mock';

const STORAGE_KEY = 'tu:data-source';
const DEFAULT_SOURCE = import.meta.env.VITE_DEFAULT_DATA_SOURCE === 'mock' ? 'mock' : 'backend';

let currentSource: DataSource = readInitialSource();

function readInitialSource(): DataSource {
  if (typeof window === 'undefined') {
    return DEFAULT_SOURCE;
  }

  const savedSource = window.localStorage.getItem(STORAGE_KEY);
  return savedSource === 'mock' || savedSource === 'backend' ? savedSource : DEFAULT_SOURCE;
}

export function getDataSource(): DataSource {
  return currentSource;
}

export function isMockDataSource(): boolean {
  return currentSource === 'mock';
}

export function setDataSource(source: DataSource): void {
  currentSource = source;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, source);
  }
}

export function getDefaultDataSource(): DataSource {
  return DEFAULT_SOURCE;
}
