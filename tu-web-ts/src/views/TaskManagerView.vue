<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  createIntegrationConnection,
  createExternalTask,
  createTaskRelation,
  deleteIntegrationConnection,
  deleteTaskRelation,
  getIntegrationConnection,
  listIntegrationConnections,
  listExternalProjects,
  listExternalTasks,
  listTaskProviders,
  listTaskRelations,
  moveExternalTask,
  testIntegrationConnection,
  updateExternalTask,
  updateIntegrationConnectionById,
  type ExternalProject,
  type ExternalProvider,
  type ExternalTask,
  type IntegrationConnection,
  type TaskRelation,
} from '@/api/taskIntegration';
import { useWorkspaceStore } from '@/stores/workspace';

const workspaceStore = useWorkspaceStore();

const providers = ref<ExternalProvider[]>([]);
const connection = ref<IntegrationConnection | null>(null);
const connections = ref<IntegrationConnection[]>([]);
const editingConnectionId = ref<string | null>(null);
const projects = ref<ExternalProject[]>([]);
const tasks = ref<ExternalTask[]>([]);
const relations = ref<TaskRelation[]>([]);
const selectedProjectId = ref('');
const selectedTaskId = ref('');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const connectionMessage = ref('');

const connectionForm = reactive({
  baseUrl: '',
  apiKey: '',
  workspaceId: '',
  adapterProfileJson: '',
  enabled: true,
});

const filters = reactive({
  status: '',
  priority: '',
});

const taskForm = reactive({
  title: '',
  description: '',
  status: 'to-do',
  priority: '',
  dueDate: '',
});

const relationForm = reactive({
  pageId: '',
  blockId: '',
  relationType: 'related',
});

const configured = computed(() => Boolean(connection.value?.enabled && connection.value.apiKeyConfigured && connection.value.baseUrl));
const selectedTask = computed(() => tasks.value.find((task) => task.externalId === selectedTaskId.value) || null);
const selectedProject = computed(() => projects.value.find((project) => project.externalId === selectedProjectId.value) || null);
const activeProvider = computed(() => providers.value.find((provider) => provider.id === 'kaneo'));

const syncConnectionForm = () => {
  connectionForm.baseUrl = connection.value?.baseUrl || 'http://localhost:11337';
  connectionForm.workspaceId = connection.value?.workspaceId || '';
  connectionForm.adapterProfileJson = connection.value?.adapterProfileJson || '';
  connectionForm.enabled = connection.value?.enabled ?? true;
  connectionForm.apiKey = '';
};

const loadConnection = async () => {
  connection.value = await getIntegrationConnection();
  connections.value = await listIntegrationConnections();
  editingConnectionId.value = connection.value?.id || null;
  syncConnectionForm();
};

const editConnection = (item: IntegrationConnection) => {
  editingConnectionId.value = item.id || null;
  connectionForm.baseUrl = item.baseUrl || 'http://localhost:11337';
  connectionForm.workspaceId = item.workspaceId || '';
  connectionForm.adapterProfileJson = item.adapterProfileJson || '';
  connectionForm.enabled = item.enabled;
  connectionForm.apiKey = '';
};

const newConnection = () => {
  editingConnectionId.value = null;
  connectionForm.baseUrl = 'http://localhost:11337';
  connectionForm.workspaceId = '';
  connectionForm.adapterProfileJson = connection.value?.adapterProfileJson || '';
  connectionForm.enabled = true;
  connectionForm.apiKey = '';
};

const saveConnection = async () => {
  saving.value = true;
  error.value = '';
  connectionMessage.value = '';
  try {
    const payload = {
      baseUrl: connectionForm.baseUrl.trim(),
      apiKey: connectionForm.apiKey.trim() || undefined,
      workspaceId: connectionForm.workspaceId.trim() || undefined,
      adapterProfileJson: connectionForm.adapterProfileJson.trim() || undefined,
      enabled: connectionForm.enabled,
    };
    connection.value = editingConnectionId.value
      ? await updateIntegrationConnectionById(editingConnectionId.value, payload)
      : await createIntegrationConnection(payload);
    await loadConnection();
    connectionMessage.value = '连接配置已保存';
    await loadProviders();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存连接配置失败';
  } finally {
    saving.value = false;
  }
};

const removeConnection = async (item: IntegrationConnection) => {
  if (!item.id) return;
  saving.value = true;
  error.value = '';
  connectionMessage.value = '';
  try {
    await deleteIntegrationConnection(item.id);
    if (editingConnectionId.value === item.id) newConnection();
    await loadConnection();
    connectionMessage.value = 'Kaneo 配置已删除';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除 Kaneo 配置失败';
  } finally {
    saving.value = false;
  }
};

const testConnection = async () => {
  saving.value = true;
  error.value = '';
  connectionMessage.value = '';
  try {
    const result = await testIntegrationConnection();
    connectionMessage.value = result.message || (result.ok ? '连接成功' : '连接失败');
    if (result.ok) {
      await loadProviders();
      await loadProjects();
      await loadTasks();
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '测试连接失败';
  } finally {
    saving.value = false;
  }
};

const loadProviders = async () => {
  providers.value = await listTaskProviders();
};

const loadProjects = async () => {
  projects.value = await listExternalProjects();
  if (!selectedProjectId.value && projects.value.length > 0) {
    selectedProjectId.value = projects.value[0].externalId;
  }
};

const loadTasks = async () => {
  if (!selectedProjectId.value) {
    tasks.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    tasks.value = await listExternalTasks(selectedProjectId.value, {
      status: filters.status,
      priority: filters.priority,
    });
    if (!tasks.value.some((task) => task.externalId === selectedTaskId.value)) {
      selectedTaskId.value = tasks.value[0]?.externalId || '';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '任务加载失败';
  } finally {
    loading.value = false;
  }
};

const loadRelations = async () => {
  if (!selectedTaskId.value) {
    relations.value = [];
    return;
  }
  relations.value = await listTaskRelations(selectedTaskId.value);
};

const resetTaskForm = () => {
  taskForm.title = '';
  taskForm.description = '';
  taskForm.status = 'to-do';
  taskForm.priority = '';
  taskForm.dueDate = '';
};

const createTask = async () => {
  if (!selectedProjectId.value || !taskForm.title.trim()) return;
  saving.value = true;
  error.value = '';
  try {
    const task = await createExternalTask(selectedProjectId.value, {
      title: taskForm.title.trim(),
      description: taskForm.description || undefined,
      status: taskForm.status || undefined,
      priority: taskForm.priority || undefined,
      dueDate: taskForm.dueDate || undefined,
    });
    resetTaskForm();
    await loadTasks();
    selectedTaskId.value = task.externalId;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '创建任务失败';
  } finally {
    saving.value = false;
  }
};

const saveSelectedTask = async () => {
  const task = selectedTask.value;
  if (!task) return;
  saving.value = true;
  error.value = '';
  try {
    await updateExternalTask(task.externalId, {
      title: task.title,
      description: task.description || undefined,
      status: task.status || undefined,
      priority: task.priority || undefined,
      dueDate: task.dueDate || undefined,
    });
    await loadTasks();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存任务失败';
  } finally {
    saving.value = false;
  }
};

const moveSelectedTask = async (status: string) => {
  const task = selectedTask.value;
  if (!task) return;
  saving.value = true;
  error.value = '';
  try {
    await moveExternalTask(task.externalId, { status });
    await loadTasks();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '移动任务失败';
  } finally {
    saving.value = false;
  }
};

const createRelation = async () => {
  if (!selectedTaskId.value || !relationForm.pageId.trim()) return;
  saving.value = true;
  error.value = '';
  try {
    await createTaskRelation(selectedTaskId.value, {
      pageId: relationForm.pageId.trim(),
      blockId: relationForm.blockId.trim() || undefined,
      relationType: relationForm.relationType.trim() || 'related',
    });
    relationForm.blockId = '';
    await loadRelations();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '创建关联失败';
  } finally {
    saving.value = false;
  }
};

const removeRelation = async (relation: TaskRelation) => {
  if (!selectedTaskId.value) return;
  saving.value = true;
  error.value = '';
  try {
    await deleteTaskRelation(selectedTaskId.value, relation.id);
    await loadRelations();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除关联失败';
  } finally {
    saving.value = false;
  }
};

const bootstrap = async () => {
  loading.value = true;
  error.value = '';
  try {
    await loadConnection();
    await loadProviders();
    if (configured.value) {
      await loadProjects();
      await loadTasks();
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '任务集成初始化失败';
  } finally {
    loading.value = false;
  }
};

watch(selectedProjectId, () => {
  void loadTasks();
});

watch(selectedTaskId, () => {
  void loadRelations();
});

onMounted(() => {
  relationForm.pageId = workspaceStore.currentPageId || '';
  void bootstrap();
});
</script>

<template>
  <main class="task-page">
    <header class="task-header">
      <div>
        <h1>任务管理</h1>
        <p>Kaneo 项目与任务接入，支持读写外部任务并关联 tu 页面或块。</p>
      </div>
      <div class="task-header__actions">
        <span class="task-header__status" :class="{ 'task-header__status--ok': configured }">
          {{ activeProvider?.name || 'Kaneo' }} · {{ configured ? '已连接' : '未连接' }}
        </span>
        <RouterLink class="task-header__link" to="/">返回工作区</RouterLink>
      </div>
    </header>

    <section class="task-panel integration-panel">
      <div class="integration-panel__title">
        <div>
          <h2>集成连接</h2>
          <p>API Key 只会保存到 tu-backend，页面不会回显明文。</p>
        </div>
        <span class="integration-panel__status" :class="{ 'integration-panel__status--ok': configured }">
          {{ configured ? '已配置' : '未配置' }}
        </span>
      </div>
      <div class="connection-list">
        <article
          v-for="item in connections"
          :key="item.id || item.baseUrl"
          class="connection-row"
          :class="{ 'connection-row--active': item.id === editingConnectionId }"
        >
          <button type="button" class="connection-row__main" @click="editConnection(item)">
            <span>{{ item.workspaceId || '未配置 workspace' }}</span>
            <small>{{ item.baseUrl }} · {{ item.enabled ? '启用' : '停用' }} · {{ item.apiKeyConfigured ? 'Key 已配置' : 'Key 未配置' }}</small>
          </button>
          <button type="button" class="button-secondary" :disabled="saving || !item.id" @click="removeConnection(item)">删除</button>
        </article>
        <p v-if="connections.length === 0" class="task-empty">暂无 Kaneo 配置</p>
      </div>
      <form class="integration-form" @submit.prevent="saveConnection">
        <label>
          Kaneo 地址
          <input v-model="connectionForm.baseUrl" placeholder="http://localhost:11337" required />
        </label>
        <label>
          API Key
          <input v-model="connectionForm.apiKey" type="password" :placeholder="connection?.apiKeyConfigured ? '留空则保留当前 Key' : '粘贴 Kaneo API Key'" />
        </label>
        <label>
          Workspace ID
          <input v-model="connectionForm.workspaceId" placeholder="可选" />
        </label>
        <label class="integration-form__profile">
          Adapter Profile JSON
          <textarea v-model="connectionForm.adapterProfileJson" rows="8" placeholder="声明式 REST 适配配置 JSON" />
        </label>
        <label class="integration-form__enabled">
          <input v-model="connectionForm.enabled" type="checkbox" />
          启用
        </label>
        <button type="submit" :disabled="saving">{{ editingConnectionId ? '保存配置' : '创建配置' }}</button>
        <button type="button" class="button-secondary" :disabled="saving" @click="newConnection">新增配置</button>
        <button type="button" class="button-secondary" :disabled="saving || !connection?.apiKeyConfigured" @click="testConnection">测试连接</button>
      </form>
      <p v-if="connectionMessage" class="task-message">{{ connectionMessage }}</p>
    </section>

    <section v-if="!configured" class="task-alert">
      请先保存 Kaneo 地址和 API Key。你也可以继续使用环境变量作为部署兜底，但本页面配置会优先生效。
    </section>
    <section v-if="error" class="task-alert task-alert--error">{{ error }}</section>

    <section class="task-toolbar">
      <label>
        项目
        <select v-model="selectedProjectId">
          <option v-for="project in projects" :key="project.externalId" :value="project.externalId">
            {{ project.name }}
          </option>
        </select>
      </label>
      <label>
        状态
        <input v-model="filters.status" placeholder="to-do / in-progress / done" @keyup.enter="loadTasks" />
      </label>
      <label>
        优先级
        <input v-model="filters.priority" placeholder="high / medium / low" @keyup.enter="loadTasks" />
      </label>
      <button type="button" @click="loadTasks" :disabled="loading || !selectedProjectId">刷新</button>
    </section>

    <section class="task-layout">
      <aside class="task-panel task-panel--create">
        <h2>新建任务</h2>
        <form @submit.prevent="createTask">
          <input v-model="taskForm.title" placeholder="任务标题" required />
          <textarea v-model="taskForm.description" placeholder="任务描述" rows="5" />
          <input v-model="taskForm.status" placeholder="状态" />
          <input v-model="taskForm.priority" placeholder="优先级" />
          <el-date-picker v-model="taskForm.dueDate" type="date" placeholder="截止日期" value-format="YYYY-MM-DD" />
          <button type="submit" :disabled="saving || !selectedProjectId">创建</button>
        </form>
      </aside>

      <section class="task-panel task-list">
        <div class="task-list__header">
          <h2>{{ selectedProject?.name || '任务列表' }}</h2>
          <span>{{ tasks.length }} 项</span>
        </div>
        <button
          v-for="task in tasks"
          :key="task.externalId"
          type="button"
          class="task-row"
          :class="{ 'task-row--active': task.externalId === selectedTaskId }"
          @click="selectedTaskId = task.externalId"
        >
        <span class="task-row__title">{{ task.title }}</span>
          <span class="task-row__meta">
            <span>{{ task.status || '未分组' }}</span>
            <span>{{ task.priority || '无优先级' }}</span>
            <span v-if="task.dueDate">{{ task.dueDate }}</span>
          </span>
        </button>
        <p v-if="!loading && tasks.length === 0" class="task-empty">暂无任务</p>
      </section>

      <aside class="task-panel task-detail">
        <template v-if="selectedTask">
          <h2>任务详情</h2>
          <input v-model="selectedTask.title" />
          <textarea v-model="selectedTask.description" rows="6" />
          <input v-model="selectedTask.status" placeholder="状态" />
          <input v-model="selectedTask.priority" placeholder="优先级" />
          <el-date-picker v-model="selectedTask.dueDate" type="date" placeholder="截止日期" value-format="YYYY-MM-DD" />
          <div class="task-detail__actions">
            <button type="button" @click="saveSelectedTask" :disabled="saving">保存</button>
            <button type="button" class="button-secondary" @click="moveSelectedTask('to-do')" :disabled="saving">To-do</button>
            <button type="button" class="button-secondary" @click="moveSelectedTask('in-progress')" :disabled="saving">In progress</button>
            <button type="button" class="button-secondary" @click="moveSelectedTask('done')" :disabled="saving">Done</button>
          </div>
          <a v-if="selectedTask.sourceUrl" :href="selectedTask.sourceUrl" target="_blank" rel="noreferrer">打开 Kaneo</a>

          <div class="task-relations">
            <h3>关联</h3>
            <form @submit.prevent="createRelation">
              <input v-model="relationForm.pageId" placeholder="pageId" required />
              <input v-model="relationForm.blockId" placeholder="blockId，可选" />
              <input v-model="relationForm.relationType" placeholder="relationType" />
              <button type="submit" :disabled="saving">关联</button>
            </form>
            <article v-for="relation in relations" :key="relation.id" class="task-relation-row">
              <span>{{ relation.pageId }} / {{ relation.blockId }}</span>
              <button type="button" @click="removeRelation(relation)" :disabled="saving">删除</button>
            </article>
          </div>
        </template>
        <p v-else class="task-empty">选择一个任务查看详情</p>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.task-page {
  height: 100vh;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 20px;
  background: #f5f7fa;
  color: #1f2933;
}

.task-header,
.task-toolbar,
.task-panel,
.task-alert {
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #fff;
}

.task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
}

.task-header__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.task-header__status {
  padding: 5px 9px;
  border-radius: 999px;
  background: #fef2f2;
  color: #991b1b;
  font-size: 12px;
  font-weight: 600;
}

.task-header__status--ok {
  background: #ecfdf3;
  color: #166534;
}

.task-header h1,
.task-panel h2,
.task-relations h3 {
  margin: 0;
}

.task-header p,
.integration-panel p {
  margin: 6px 0 0;
  color: #64748b;
}

.task-header__link {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #1677ff;
  text-decoration: none;
}

.task-alert {
  margin-top: 12px;
  padding: 12px 14px;
  color: #7c2d12;
  background: #fff7ed;
}

.task-alert--error {
  color: #991b1b;
  background: #fef2f2;
}

.integration-panel {
  margin-top: 14px;
}

.connection-list {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.connection-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
}

.connection-row button:last-child {
  align-self: stretch;
}

.connection-row--active {
  border-color: #1677ff;
  background: #eff6ff;
}

.connection-row__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  border: 0;
  padding: 0;
  color: #1f2933;
  background: transparent;
  text-align: left;
}

.connection-row__main small {
  overflow: hidden;
  color: #64748b;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.integration-panel__title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.integration-panel__status {
  padding: 4px 8px;
  border-radius: 999px;
  background: #fee2e2;
  color: #991b1b;
  font-size: 12px;
  font-weight: 600;
}

.integration-panel__status--ok {
  background: #dcfce7;
  color: #166534;
}

.integration-form,
.task-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
}

.task-toolbar {
  margin-top: 14px;
  padding: 14px;
  position: sticky;
  top: 0;
  z-index: 5;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
}

.task-toolbar label,
.integration-form label,
.task-panel form,
.task-detail,
.task-relations {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-toolbar label,
.integration-form label {
  min-width: 180px;
  font-size: 12px;
  color: #64748b;
}

.integration-form__enabled {
  min-width: 72px !important;
  flex-direction: row !important;
  align-items: center;
}

.integration-form__profile {
  flex-basis: 100%;
}

.integration-form__profile textarea {
  min-height: 160px;
  font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
}

.integration-form__enabled input {
  width: auto;
}

input,
select,
textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px 10px;
  font: inherit;
  background: #fff;
  color: #1f2933;
}

button {
  border: 1px solid #1677ff;
  border-radius: 6px;
  padding: 8px 12px;
  color: #fff;
  background: #1677ff;
  cursor: pointer;
  font-weight: 600;
}

.button-secondary {
  border-color: #cbd5e1;
  color: #334155;
  background: #fff;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.task-message {
  margin: 10px 0 0;
  color: #166534;
  font-size: 13px;
}

.task-layout {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(360px, 1fr) minmax(320px, 380px);
  gap: 14px;
  margin-top: 14px;
  min-height: 0;
  align-items: start;
  padding-bottom: 24px;
}

.task-panel {
  min-width: 0;
  padding: 14px;
}

.task-panel--create,
.task-list,
.task-detail {
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}

.task-panel--create form {
  margin-top: 12px;
}

.task-list__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.task-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  margin-bottom: 8px;
  border-color: #e2e8f0;
  color: #1f2933;
  background: #fff;
  text-align: left;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.task-row:hover {
  border-color: #93c5fd;
  background: #f8fbff;
}

.task-row--active {
  border-color: #1677ff;
  background: #eff6ff;
}

.task-row__title {
  font-weight: 600;
}

.task-row__meta,
.task-empty {
  color: #64748b;
  font-size: 13px;
}

.task-row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.task-row__meta span {
  max-width: 100%;
  overflow: hidden;
  padding: 2px 7px;
  border-radius: 999px;
  background: #f1f5f9;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-detail__actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.task-detail a {
  color: #1677ff;
  text-decoration: none;
}

.task-relations {
  margin-top: 18px;
}

.task-relation-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid #e2e8f0;
}

.task-relation-row button {
  border-color: #cbd5e1;
  color: #475569;
  background: #fff;
}

@media (max-width: 1080px) {
  .task-page {
    padding: 14px;
  }

  .task-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .task-header__actions {
    justify-content: flex-start;
  }

  .task-toolbar {
    position: static;
  }

  .task-layout {
    grid-template-columns: 1fr;
    height: auto;
  }

  .task-panel--create,
  .task-list,
  .task-detail {
    max-height: none;
  }
}
</style>
