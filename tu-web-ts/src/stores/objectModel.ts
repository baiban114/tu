import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';

export interface UmlClassDefinition {
  id: string;
  name: string;
  attributes: string[];
  methods: string[];
  nodeId?: string;
}

export interface UmlObjectDefinition {
  id: string;
  name: string;
  classId: string;
  propertyValues: Record<string, string>;
}

export interface UmlModel {
  classes: UmlClassDefinition[];
  objects: UmlObjectDefinition[];
}

const STORAGE_KEY = 'tu-object-model';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function normalizeModel(value: unknown): UmlModel {
  const source = isPlainObject(value) ? value : {};
  const classes = Array.isArray(source.classes)
    ? source.classes.map((item: any) => ({
      id: typeof item.id === 'string' ? item.id : createId('uml-class'),
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Class',
      attributes: Array.isArray(item.attributes) ? item.attributes.filter((line: unknown): line is string => typeof line === 'string') : [],
      methods: Array.isArray(item.methods) ? item.methods.filter((line: unknown): line is string => typeof line === 'string') : [],
      nodeId: typeof item.nodeId === 'string' ? item.nodeId : undefined,
    }))
    : [];
  const classIds = new Set(classes.map((item) => item.id));
  const objects = Array.isArray(source.objects)
    ? source.objects
      .map((item: any) => ({
        id: typeof item.id === 'string' ? item.id : createId('uml-object'),
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'object',
        classId: typeof item.classId === 'string' ? item.classId : '',
        propertyValues: isPlainObject(item.propertyValues) ? item.propertyValues as Record<string, string> : {},
      }))
      .filter((item) => classIds.has(item.classId))
    : [];
  return { classes, objects };
}

export const useObjectModelStore = defineStore('objectModel', () => {
  const model = ref<UmlModel>(normalizeModel(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')));

  const classes = computed(() => model.value.classes);
  const objects = computed(() => model.value.objects);

  watch(
    model,
    (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value)),
    { deep: true },
  );

  function upsertClass(input: Omit<UmlClassDefinition, 'id'> & { id?: string }) {
    const definition: UmlClassDefinition = {
      id: input.id || createId('uml-class'),
      name: input.name.trim() || 'Class',
      attributes: input.attributes,
      methods: input.methods,
      nodeId: input.nodeId,
    };
    const exists = model.value.classes.some((item) => item.id === definition.id);
    model.value = {
      ...model.value,
      classes: exists
        ? model.value.classes.map((item) => item.id === definition.id ? definition : item)
        : [...model.value.classes, definition],
    };
    return definition;
  }

  function deleteClass(id: string) {
    model.value = {
      classes: model.value.classes.filter((item) => item.id !== id),
      objects: model.value.objects.filter((item) => item.classId !== id),
    };
  }

  function upsertObject(input: Omit<UmlObjectDefinition, 'id'> & { id?: string }) {
    const objectDefinition: UmlObjectDefinition = {
      id: input.id || createId('uml-object'),
      name: input.name.trim() || 'object',
      classId: input.classId,
      propertyValues: input.propertyValues,
    };
    const exists = model.value.objects.some((item) => item.id === objectDefinition.id);
    model.value = {
      ...model.value,
      objects: exists
        ? model.value.objects.map((item) => item.id === objectDefinition.id ? objectDefinition : item)
        : [...model.value.objects, objectDefinition],
    };
    return objectDefinition;
  }

  function deleteObject(id: string) {
    model.value = {
      ...model.value,
      objects: model.value.objects.filter((item) => item.id !== id),
    };
  }

  function replaceModel(nextModel: unknown) {
    model.value = normalizeModel(nextModel);
  }

  return {
    model,
    classes,
    objects,
    upsertClass,
    deleteClass,
    upsertObject,
    deleteObject,
    replaceModel,
  };
});
