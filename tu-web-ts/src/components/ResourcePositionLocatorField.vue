<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElInput, ElOption, ElSelect } from 'element-plus'
import {
  buildResourcePositionLocator,
  defaultPositionKindForResourceType,
  positionKindLabel,
  positionKindsForResourceType,
  resourcePositionDisplay,
  resourcePositionValuePlaceholder,
  splitResourcePositionLocator,
  normalizeResourcePositionLocator,
  type ResourcePositionKind,
} from '@/utils/resourcePositionLocator'

const props = withDefaults(defineProps<{
  modelValue: string
  resourceTypeCode?: string | null
  disabled?: boolean
}>(), {
  resourceTypeCode: null,
  disabled: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const positionKind = ref<ResourcePositionKind>(defaultPositionKindForResourceType(props.resourceTypeCode))
const positionValue = ref('')

const kindOptions = computed(() => positionKindsForResourceType(props.resourceTypeCode))

const displayPreview = computed(() => {
  const built = buildResourcePositionLocator(positionKind.value, positionValue.value)
  return built ? resourcePositionDisplay(built) : ''
})

function syncFromModel(value: string) {
  const normalized = normalizeResourcePositionLocator(value)
  if (normalized && normalized !== value.trim()) {
    emit('update:modelValue', normalized)
    return
  }
  const split = splitResourcePositionLocator(normalized || value, props.resourceTypeCode)
  positionKind.value = split.kind === 'legacy'
    ? defaultPositionKindForResourceType(props.resourceTypeCode)
    : split.kind
  positionValue.value = split.kind === 'legacy' ? (split.value || value) : split.value
}

function emitCanonical() {
  if (positionKind.value === 'legacy') {
    emit('update:modelValue', positionValue.value.trim())
    return
  }
  emit('update:modelValue', buildResourcePositionLocator(positionKind.value, positionValue.value))
}

watch(
  () => [props.modelValue, props.resourceTypeCode] as const,
  ([value]) => syncFromModel(value),
  { immediate: true },
)

watch([positionKind, positionValue], () => emitCanonical())
</script>

<template>
  <div class="resource-position-locator">
    <div class="resource-position-locator__row">
      <ElSelect
        v-model="positionKind"
        class="resource-position-locator__kind"
        :disabled="disabled"
        placeholder="定位类型"
      >
        <ElOption
          v-for="kind in kindOptions"
          :key="kind"
          :label="positionKindLabel(kind)"
          :value="kind"
        />
      </ElSelect>
      <ElInput
        v-model="positionValue"
        class="resource-position-locator__value"
        :disabled="disabled"
        :placeholder="resourcePositionValuePlaceholder(positionKind)"
        maxlength="255"
        clearable
      />
    </div>
    <p v-if="displayPreview" class="resource-position-locator__preview">
      预览：{{ displayPreview }}
    </p>
  </div>
</template>

<style scoped>
.resource-position-locator {
  display: grid;
  gap: 6px;
  width: 100%;
}

.resource-position-locator__row {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.resource-position-locator__preview {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}
</style>
