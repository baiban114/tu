<script setup lang="ts">
import { computed } from 'vue'
import { ElButton, ElDivider } from 'element-plus'
import {
  availableLinkPresentationModes,
  disabledLinkPresentationModes,
  linkPresentationModeLabel,
} from '@/editor/linkPresentation'
import type { UrlDisplayMode } from '@/utils/urlDisplay'

const props = withDefaults(defineProps<{
  href: string
  currentMode: UrlDisplayMode
  /** Modes that need async work (e.g. resolving PDF). */
  loadingMode?: UrlDisplayMode | null
  /** Extra modes to disable (merged with presentation defaults). */
  disabledModes?: UrlDisplayMode[]
}>(), {
  loadingMode: null,
  disabledModes: () => [],
})

const emit = defineEmits<{
  (e: 'select-mode', mode: UrlDisplayMode): void
}>()

const modes = computed(() => availableLinkPresentationModes(props.href, props.currentMode))

const disabledSet = computed(() => new Set([
  ...disabledLinkPresentationModes(props.href, props.currentMode),
  ...props.disabledModes,
]))

function isDisabled(mode: UrlDisplayMode): boolean {
  return disabledSet.value.has(mode)
}
</script>

<template>
  <div class="link-presentation-modes">
    <template v-for="(mode, index) in modes" :key="mode">
      <ElDivider
        v-if="index > 0"
        direction="vertical"
        class="link-presentation-modes__divider"
      />
      <ElButton
        size="small"
        text
        :loading="loadingMode === mode"
        :disabled="isDisabled(mode)"
        :type="currentMode === mode ? 'primary' : 'default'"
        class="link-presentation-modes__btn"
        @mousedown.prevent.stop
        @click="emit('select-mode', mode)"
      >
        {{ linkPresentationModeLabel(mode) }}
      </ElButton>
    </template>
  </div>
</template>

<style scoped>
.link-presentation-modes {
  display: flex;
  align-items: center;
  gap: 0;
}

.link-presentation-modes__btn {
  margin: 0;
  height: 24px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 2px;
}

.link-presentation-modes__divider {
  height: 14px;
  margin: 0 1px;
}
</style>
