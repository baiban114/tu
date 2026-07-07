<script setup lang="ts">
import { ref } from 'vue';
import { ElButton, ElDialog, ElInput, ElMessage } from 'element-plus';
import { useWorkspaceStore } from '@/stores/workspace';
import type { ImportRoadmapPayload } from '@/api/types';

const store = useWorkspaceStore();

const visible = ref(false);
const importing = ref(false);
const kbName = ref('');
const jsonText = ref('');

function openDialog() {
  kbName.value = '';
  jsonText.value = '';
  visible.value = true;
}

function buildPayload(parsed: unknown): ImportRoadmapPayload {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      name: kbName.value.trim() || undefined,
      roadmap: parsed,
    };
  }

  const record = parsed as ImportRoadmapPayload;
  if (record.root || record.pages || record.roadmap) {
    return {
      ...record,
      name: kbName.value.trim() || record.name,
    };
  }

  return {
    name: kbName.value.trim() || record.name,
    roadmap: record,
  };
}

async function onImport() {
  const raw = jsonText.value.trim();
  if (!raw) return;

  importing.value = true;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = await store.importRoadmapJson(buildPayload(parsed));
    visible.value = false;
    ElMessage.success(`已生成知识库，共 ${result.pageCount} 个页面`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入 roadmap JSON 失败';
    ElMessage.error(message);
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <div class="roadmap-import">
    <el-button
      link
      size="small"
      title="根据 JSON Roadmap 生成知识库"
      :disabled="importing"
      @click.stop="openDialog"
    >
      Roadmap
    </el-button>

    <el-dialog v-model="visible" title="导入 Roadmap JSON" width="560px" @click.stop>
      <el-input
        v-model="kbName"
        placeholder="知识库名称，可留空使用根节点标题"
        class="roadmap-import__name"
      />
      <el-input
        v-model="jsonText"
        type="textarea"
        :autosize="{ minRows: 12, maxRows: 20 }"
        placeholder='支持 {"title":"Java","children":[...]}、{"name":"Java","pages":[...]} 或数组结构'
      />

      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="importing" :disabled="!jsonText.trim()" @click="onImport">
          生成
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.roadmap-import {
  display: inline-flex;
}

.roadmap-import__name {
  margin-bottom: 10px;
}
</style>
