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
/** 正在从 model 同步到控件时，禁止反向 emit，避免误清空已保存定位 */
let syncingFromModel = false

const kindOptions = computed(() => {
  const base = positionKindsForResourceType(props.resourceTypeCode)
  if (positionKind.value === 'legacy' && !base.includes('legacy')) {
    return [...base, 'legacy' as const]
  }
  return base
})

const displayPreview = computed(() => {
  const draft = positionKind.value === 'legacy'
    ? positionValue.value.trim()
    : buildResourcePositionLocator(positionKind.value, positionValue.value)
  if (draft) return resourcePositionDisplay(draft) || draft
  // 切换类型等导致草稿暂时无效时，仍展示已绑定（上次保存）的定位
  const saved = props.modelValue?.trim()
  if (!saved) return ''
  return resourcePositionDisplay(saved) || saved
})

function syncFromModel(value: string) {
  syncingFromModel = true
  try {
    const normalized = normalizeResourcePositionLocator(value)
    if (normalized && normalized !== value.trim()) {
      emit('update:modelValue', normalized)
      return
    }
    const split = splitResourcePositionLocator(normalized || value, props.resourceTypeCode)
    // 保留 legacy，勿强行改成 page/anchor 再 emit 成空串
    positionKind.value = split.kind
    positionValue.value = split.value
  } finally {
    syncingFromModel = false
  }
}

function emitCanonical() {
  if (syncingFromModel) return

  if (positionKind.value === 'legacy') {
    emit('update:modelValue', positionValue.value.trim())
    return
  }

  const trimmed = positionValue.value.trim()
  // 用户清空输入：允许清空
  if (!trimmed) {
    emit('update:modelValue', '')
    return
  }

  const built = buildResourcePositionLocator(positionKind.value, trimmed)
  // 定位类型切换中、当前值尚不符合新类型格式：保留 model 中上次保存的定位，不写入空串
  if (!built) return

  emit('update:modelValue', built)
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
