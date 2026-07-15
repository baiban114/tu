<script setup lang="ts">
import { ref } from 'vue'
import { Document, ChatDotRound } from '@element-plus/icons-vue'
import AiSettingsPanel from '@/components/settings/AiSettingsPanel.vue'
import EditorSettingsPanel from '@/components/settings/EditorSettingsPanel.vue'

type SettingsModule = 'editor' | 'ai'

const activeModule = ref<SettingsModule>('editor')

function onMenuSelect(key: string) {
  if (key === 'editor' || key === 'ai') {
    activeModule.value = key
  }
}
</script>

<template>
  <main class="settings-page">
    <header class="settings-page__header">
      <h1>系统设置</h1>
      <RouterLink to="/">返回工作区</RouterLink>
    </header>

    <div class="settings-layout">
      <aside class="settings-layout__aside">
        <el-menu
          :default-active="activeModule"
          class="settings-menu"
          @select="onMenuSelect"
        >
          <el-menu-item index="editor">
            <el-icon><Document /></el-icon>
            <span>编辑器</span>
          </el-menu-item>
          <el-menu-item index="ai">
            <el-icon><ChatDotRound /></el-icon>
            <span>AI</span>
          </el-menu-item>
        </el-menu>
      </aside>

      <section class="settings-layout__content">
        <EditorSettingsPanel v-if="activeModule === 'editor'" />
        <AiSettingsPanel v-else-if="activeModule === 'ai'" />
      </section>
    </div>
  </main>
</template>

<style scoped>
.settings-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 28px;
  background: #f8fafc;
  color: #0f172a;
  overflow: hidden;
}

.settings-page__header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 1080px;
  width: 100%;
  margin: 0 auto 20px;
}

.settings-page__header h1 {
  margin: 0;
  font-size: 28px;
}

.settings-page__header a {
  color: #1677ff;
  text-decoration: none;
}

.settings-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 20px;
  max-width: 1080px;
  width: 100%;
  margin: 0 auto;
}

.settings-layout__aside {
  flex: none;
  width: 200px;
}

.settings-menu {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}

.settings-layout__content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}
</style>
