import { reactive } from 'vue';
import { defineStore } from 'pinia';
import type { GraphData } from '@/api/types';

export interface MaterialItem {
  id: string;
  name: string;
  graphData: GraphData;
  createdAt: number;
}

const STORAGE_KEY = 'tu-material-library';

function loadFromStorage(): MaterialItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(items: MaterialItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

export const useMaterialLibraryStore = defineStore('materialLibrary', () => {
  const items = reactive<MaterialItem[]>(loadFromStorage());

  function addMaterial(name: string, graphData: GraphData): MaterialItem {
    const item: MaterialItem = {
      id: `mat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      graphData: JSON.parse(JSON.stringify(graphData)),
      createdAt: Date.now(),
    };
    items.push(item);
    saveToStorage([...items]);
    return item;
  }

  function removeMaterial(id: string) {
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    items.splice(idx, 1);
    saveToStorage([...items]);
  }

  function renameMaterial(id: string, name: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    item.name = name;
    saveToStorage([...items]);
  }

  return { items, addMaterial, removeMaterial, renameMaterial };
});
