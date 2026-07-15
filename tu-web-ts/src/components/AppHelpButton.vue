<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElButton, ElDialog, ElTag } from 'element-plus'
import type { PageType } from '@/api/types'
import { resolvePageHelp } from '@/help/pageHelp'

const props = defineProps<{
  /** Workspace page type when on `/`; omit on other routes. */
  pageType?: PageType | null
  /** Visual variant for embedding in different headers. */
  variant?: 'topbar' | 'plain'
}>()

const route = useRoute()
const visible = ref(false)

const help = computed(() => resolvePageHelp(route, props.pageType))

function openHelp() {
  visible.value = true
}
</script>

<template>
  <button
    v-if="variant === 'topbar'"
    type="button"
    class="app-help-btn app-help-btn--topbar"
    @click="openHelp"
  >
    帮助
  </button>
  <ElButton v-else class="app-help-btn" @click="openHelp">
    帮助
  </ElButton>

  <ElDialog
    v-model="visible"
    :title="help.title"
    width="520px"
    append-to-body
    destroy-on-close
    class="tu-dialog-viewport app-help-dialog"
  >
    <div class="app-help-dialog__body">
      <p class="app-help-dialog__summary">{{ help.summary }}</p>

      <section class="app-help-dialog__section">
        <h3 class="app-help-dialog__heading">功能说明</h3>
        <ul class="app-help-dialog__list">
          <li v-for="(item, index) in help.features" :key="index">{{ item }}</li>
        </ul>
      </section>

      <section class="app-help-dialog__section">
        <h3 class="app-help-dialog__heading">接入子系统</h3>
        <ul class="app-help-dialog__subsystems">
          <li v-for="sub in help.subsystems" :key="sub.name" class="app-help-dialog__subsystem">
            <ElTag size="small" type="info" effect="plain">{{ sub.name }}</ElTag>
            <span class="app-help-dialog__subsystem-role">{{ sub.role }}</span>
          </li>
        </ul>
      </section>
    </div>
  </ElDialog>
</template>

<style scoped>
.app-help-btn--topbar {
  padding: 6px 10px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  color: #1f2933;
  font: inherit;
  font-size: 13px;
  background: #fff;
  cursor: pointer;
}

.app-help-btn--topbar:hover {
  border-color: #1677ff;
  color: #1677ff;
}

.app-help-dialog__body {
  max-height: min(480px, calc(100dvh - 160px));
  overflow-y: auto;
  padding-right: 4px;
}

.app-help-dialog__summary {
  margin: 0 0 16px;
  font-size: 14px;
  line-height: 1.6;
  color: #374151;
}

.app-help-dialog__section {
  margin-bottom: 16px;
}

.app-help-dialog__section:last-child {
  margin-bottom: 0;
}

.app-help-dialog__heading {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.app-help-dialog__list {
  margin: 0;
  padding-left: 1.2em;
  font-size: 13px;
  line-height: 1.65;
  color: #4b5563;
}

.app-help-dialog__list li + li {
  margin-top: 4px;
}

.app-help-dialog__subsystems {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.app-help-dialog__subsystem {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.app-help-dialog__subsystem-role {
  font-size: 13px;
  line-height: 1.5;
  color: #4b5563;
}
</style>
