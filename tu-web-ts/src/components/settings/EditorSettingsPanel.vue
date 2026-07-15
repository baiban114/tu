<script setup lang="ts">
import { onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useEditorPreferencesStore } from '@/stores/editorPreferences'

const editorPreferences = useEditorPreferencesStore()

onMounted(() => {
  void editorPreferences.load()
})

async function onSelectionToolbarChange(value: string | number | boolean) {
  const enabled = Boolean(value)
  try {
    await editorPreferences.setSelectionToolbarEnabled(enabled)
    ElMessage.success(enabled ? '已开启文本选择工具栏' : '已关闭文本选择工具栏')
  } catch {
    ElMessage.error('保存设置失败，请稍后重试')
  }
}
</script>

<template>
  <div class="editor-panel">
    <section class="settings-panel">
      <div class="settings-panel__title">
        <div>
          <h2>编辑器</h2>
          <p>调整富文本编辑器的显示与交互行为。</p>
        </div>
      </div>

      <el-form class="settings-form" label-position="top">
        <el-form-item>
          <template #label>
            <span class="settings-form__label">文本选择工具栏</span>
          </template>
          <div class="settings-form__row">
            <el-switch
              :model-value="editorPreferences.selectionToolbarEnabled"
              :loading="editorPreferences.loading"
              @change="onSelectionToolbarChange"
            />
            <span class="settings-form__hint">
              {{ editorPreferences.selectionToolbarEnabled ? '开启：选中文本时显示浮动工具栏' : '关闭：选中文本时不再弹出工具栏' }}
            </span>
          </div>
        </el-form-item>
      </el-form>
    </section>
  </div>
</template>

<style scoped>
.editor-panel {
  display: grid;
  gap: 20px;
}

.settings-panel {
  display: grid;
  gap: 18px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  padding: 20px;
  background: #fff;
}

.settings-panel__title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.settings-panel__title h2 {
  margin: 0 0 6px;
  font-size: 18px;
}

.settings-panel__title p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.settings-form {
  display: grid;
  gap: 14px;
}

.settings-form__label {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.settings-form__row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.settings-form__hint {
  color: #64748b;
  font-size: 13px;
}
</style>
