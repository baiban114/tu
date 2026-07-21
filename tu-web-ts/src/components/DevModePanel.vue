<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  ElButton,
  ElCard,
  ElDrawer,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElTag,
} from 'element-plus';
import { getDataSource, getDefaultDataSource, setDataSource, type DataSource } from '@/dev/dataSource';
import {
  productFeatureCatalog,
  productFeatureStatuses,
  type ProductFeature,
  type ProductFeatureStatus,
} from '@/dev/productFeatures';
import { resetMockState } from '@/mock/store';
import { useWorkspaceStore } from '@/stores/workspace';

const STORAGE_KEY = 'tu:dev:product-features';
const COLLAPSED_STORAGE_KEY = 'tu:dev:panel-collapsed';

type FeatureDraft = Pick<ProductFeature, 'name' | 'module' | 'description' | 'status' | 'owner' | 'note'>;

const workspaceStore = useWorkspaceStore();
const switching = ref(false);
const currentSource = ref<DataSource>(getDataSource());
const currentEditor = ref<'tiptap'>('tiptap');
const featureDrawerVisible = ref(false);
const statusFilter = ref<ProductFeatureStatus | 'all'>('all');
const moduleFilter = ref('all');
const keyword = ref('');
const features = ref<ProductFeature[]>(loadFeatures());
const collapsed = ref(loadCollapsed());
const draft = reactive<FeatureDraft>({
  name: '',
  module: '',
  description: '',
  status: 'idea',
  owner: '',
  note: '',
});
const editingFeatureId = ref('');

const isDev = import.meta.env.DEV;

const sourceLabel = computed(() => (currentSource.value === 'mock' ? 'Mock' : 'Backend'));
const sourceTagType = computed(() => (currentSource.value === 'mock' ? 'warning' : 'success'));

const statusMetaMap = computed(() => new Map(productFeatureStatuses.map((status) => [status.value, status])));
const modules = computed(() => Array.from(new Set(features.value.map((feature) => feature.module))).sort());
const releasedCount = computed(() => features.value.filter((feature) => feature.status === 'released').length);
const activeCount = computed(() =>
  features.value.filter((feature) => ['design', 'development', 'testing'].includes(feature.status)).length,
);

const statusSummary = computed(() =>
  productFeatureStatuses.map((status) => ({
    ...status,
    count: features.value.filter((feature) => feature.status === status.value).length,
  })),
);

const filteredFeatures = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  return features.value.filter((feature) => {
    const matchesStatus = statusFilter.value === 'all' || feature.status === statusFilter.value;
    const matchesModule = moduleFilter.value === 'all' || feature.module === moduleFilter.value;
    const matchesText =
      !text ||
      [feature.name, feature.module, feature.description, feature.owner, feature.note]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(text));

    return matchesStatus && matchesModule && matchesText;
  });
});

watch(
  features,
  (value) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  },
  { deep: true },
);

watch(collapsed, (value) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(COLLAPSED_STORAGE_KEY, value ? '1' : '0');
});

function loadCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function setCollapsed(value: boolean) {
  collapsed.value = value;
}

function loadFeatures(): ProductFeature[] {
  if (typeof window === 'undefined') return productFeatureCatalog.map((feature) => ({ ...feature }));

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return productFeatureCatalog.map((feature) => ({ ...feature }));

    const savedFeatures = JSON.parse(saved) as ProductFeature[];
    const savedMap = new Map(savedFeatures.map((feature) => [feature.id, feature]));
    const mergedCatalog = productFeatureCatalog.map((feature) => ({ ...feature, ...savedMap.get(feature.id) }));
    const customFeatures = savedFeatures.filter((feature) => !productFeatureCatalog.some((item) => item.id === feature.id));
    return [...mergedCatalog, ...customFeatures];
  } catch {
    return productFeatureCatalog.map((feature) => ({ ...feature }));
  }
}

function getStatusLabel(status: ProductFeatureStatus) {
  return statusMetaMap.value.get(status)?.label || status;
}

function getStatusTone(status: ProductFeatureStatus) {
  return statusMetaMap.value.get(status)?.tone || 'info';
}

function loadEditorType(): 'tiptap' {
  return 'tiptap'
}

function applyEditor(_type: 'tiptap') {
}

async function applySource(source: DataSource) {
  if (source === currentSource.value) return;

  const previousSource = currentSource.value;
  switching.value = true;
  try {
    setDataSource(source);
    currentSource.value = source;
    await workspaceStore.reloadWorkspace();
    ElMessage.success(`已切换到${source === 'mock' ? '本地 Mock' : '后端'}数据源`);
  } catch (error) {
    setDataSource(previousSource);
    currentSource.value = previousSource;
    ElMessage.error(error instanceof Error ? error.message : '切换数据源失败');
  } finally {
    switching.value = false;
  }
}

async function resetMock() {
  switching.value = true;
  try {
    resetMockState();
    if (currentSource.value === 'mock') {
      await workspaceStore.reloadWorkspace();
    }
    ElMessage.success('本地 Mock 数据已重置');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '重置 Mock 数据失败');
  } finally {
    switching.value = false;
  }
}

function resetDraft() {
  editingFeatureId.value = '';
  Object.assign(draft, {
    name: '',
    module: '',
    description: '',
    status: 'idea',
    owner: '',
    note: '',
  });
}

function editFeature(feature: ProductFeature) {
  editingFeatureId.value = feature.id;
  Object.assign(draft, {
    name: feature.name,
    module: feature.module,
    description: feature.description,
    status: feature.status,
    owner: feature.owner || '',
    note: feature.note || '',
  });
}

function saveFeature() {
  if (!draft.name.trim() || !draft.module.trim() || !draft.description.trim()) {
    ElMessage.warning('请填写功能名称、模块和说明');
    return;
  }

  if (editingFeatureId.value) {
    features.value = features.value.map((feature) =>
      feature.id === editingFeatureId.value
        ? {
            ...feature,
            name: draft.name.trim(),
            module: draft.module.trim(),
            description: draft.description.trim(),
            status: draft.status,
            owner: draft.owner?.trim(),
            note: draft.note?.trim(),
          }
        : feature,
    );
    ElMessage.success('功能状态已更新');
  } else {
    features.value = [
      {
        id: `local-${Date.now()}`,
        name: draft.name.trim(),
        module: draft.module.trim(),
        description: draft.description.trim(),
        status: draft.status,
        owner: draft.owner?.trim(),
        note: draft.note?.trim(),
        source: 'local',
      },
      ...features.value,
    ];
    ElMessage.success('功能已加入目录');
  }

  resetDraft();
}

function resetFeatureCatalog() {
  features.value = productFeatureCatalog.map((feature) => ({ ...feature }));
  resetDraft();
  ElMessage.success('功能目录已恢复为内置清单');
}
</script>

<template>
  <div v-if="isDev" class="dev-mode-panel">
    <button
      v-if="collapsed"
      type="button"
      class="dev-mode-panel__fab"
      :title="`开发者模式（${sourceLabel}）`"
      @click="setCollapsed(false)"
    >
      Dev
      <el-tag size="small" :type="sourceTagType" class="dev-mode-panel__fab-tag">{{ sourceLabel }}</el-tag>
    </button>

    <el-card v-else shadow="always" class="dev-mode-panel__card">
      <div class="dev-mode-panel__header">
        <span class="dev-mode-panel__title">Developer Mode</span>
        <div class="dev-mode-panel__header-actions">
          <el-tag size="small" :type="sourceTagType">{{ sourceLabel }}</el-tag>
          <button
            type="button"
            class="dev-mode-panel__hide"
            title="隐藏开发者模式"
            @click="setCollapsed(true)"
          >
            隐藏
          </button>
        </div>
      </div>

      <div class="dev-mode-panel__body">
        <el-radio-group
          :model-value="currentSource"
          size="small"
          @update:model-value="(value: string) => applySource(value as DataSource)"
        >
          <el-radio-button label="backend">Backend</el-radio-button>
          <el-radio-button label="mock">Mock</el-radio-button>
        </el-radio-group>

        <div class="dev-mode-panel__actions">
          <el-button size="small" :loading="switching" @click="resetMock">Reset Mock</el-button>
          <el-button size="small" type="primary" @click="featureDrawerVisible = true">产品功能</el-button>
        </div>

        <div class="dev-mode-panel__hint">
          默认来源: {{ getDefaultDataSource() }}
        </div>
      </div>
    </el-card>

    <el-drawer
      v-model="featureDrawerVisible"
      title="产品设计 / 功能管理"
      direction="rtl"
      size="720px"
      class="feature-drawer"
    >
      <section class="feature-overview">
        <div class="feature-overview__item">
          <span class="feature-overview__value">{{ features.length }}</span>
          <span class="feature-overview__label">全部功能</span>
        </div>
        <div class="feature-overview__item">
          <span class="feature-overview__value">{{ releasedCount }}</span>
          <span class="feature-overview__label">已发布</span>
        </div>
        <div class="feature-overview__item">
          <span class="feature-overview__value">{{ activeCount }}</span>
          <span class="feature-overview__label">进行中</span>
        </div>
      </section>

      <section class="status-summary">
        <button
          v-for="status in statusSummary"
          :key="status.value"
          type="button"
          class="status-summary__item"
          :class="{ 'status-summary__item--active': statusFilter === status.value }"
          @click="statusFilter = status.value"
        >
          <span>{{ status.label }}</span>
          <strong>{{ status.count }}</strong>
        </button>
      </section>

      <section class="feature-filters">
        <el-input v-model="keyword" clearable placeholder="搜索功能、模块、说明" />
        <el-select v-model="moduleFilter" placeholder="模块">
          <el-option label="全部模块" value="all" />
          <el-option v-for="module in modules" :key="module" :label="module" :value="module" />
        </el-select>
        <el-select v-model="statusFilter" placeholder="状态">
          <el-option label="全部状态" value="all" />
          <el-option
            v-for="status in productFeatureStatuses"
            :key="status.value"
            :label="status.label"
            :value="status.value"
          />
        </el-select>
      </section>

      <section class="feature-layout">
        <div class="feature-list">
          <article v-for="feature in filteredFeatures" :key="feature.id" class="feature-item">
            <div class="feature-item__main">
              <div class="feature-item__title">
                <strong>{{ feature.name }}</strong>
                <el-tag size="small" :type="getStatusTone(feature.status)">
                  {{ getStatusLabel(feature.status) }}
                </el-tag>
              </div>
              <div class="feature-item__meta">
                {{ feature.module }}
                <span v-if="feature.owner"> · {{ feature.owner }}</span>
              </div>
              <p>{{ feature.description }}</p>
              <div v-if="feature.note" class="feature-item__note">{{ feature.note }}</div>
            </div>
            <el-button size="small" @click="editFeature(feature)">编辑</el-button>
          </article>

          <el-empty v-if="!filteredFeatures.length" description="没有匹配的功能" :image-size="72" />
        </div>

        <aside class="feature-editor">
          <h3>{{ editingFeatureId ? '编辑功能状态' : '新增功能' }}</h3>
          <el-form label-position="top" @submit.prevent>
            <el-form-item label="功能名称">
              <el-input v-model="draft.name" maxlength="40" />
            </el-form-item>
            <el-form-item label="模块">
              <el-input v-model="draft.module" maxlength="30" placeholder="例如：编辑器" />
            </el-form-item>
            <el-form-item label="流程状态">
              <el-select v-model="draft.status">
                <el-option
                  v-for="status in productFeatureStatuses"
                  :key="status.value"
                  :label="status.label"
                  :value="status.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="负责人">
              <el-input v-model="draft.owner" maxlength="30" />
            </el-form-item>
            <el-form-item label="功能说明">
              <el-input v-model="draft.description" type="textarea" :rows="3" maxlength="160" show-word-limit />
            </el-form-item>
            <el-form-item label="流程备注">
              <el-input v-model="draft.note" type="textarea" :rows="3" maxlength="160" show-word-limit />
            </el-form-item>
            <div class="feature-editor__actions">
              <el-button type="primary" @click="saveFeature">{{ editingFeatureId ? '保存' : '添加' }}</el-button>
              <el-button @click="resetDraft">清空</el-button>
            </div>
          </el-form>

          <el-button class="feature-editor__reset" text type="danger" @click="resetFeatureCatalog">
            恢复内置功能清单
          </el-button>
        </aside>
      </section>
    </el-drawer>
  </div>
</template>

<style scoped>
.dev-mode-panel {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 3000;
}

.dev-mode-panel__fab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid rgba(24, 119, 255, 0.28);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
}

.dev-mode-panel__fab:hover {
  border-color: rgba(24, 119, 255, 0.5);
  color: #0958d9;
}

.dev-mode-panel__fab-tag {
  margin-left: 0;
}

.dev-mode-panel__card {
  width: 300px;
  border-radius: 8px;
  border: 1px solid rgba(24, 119, 255, 0.18);
  backdrop-filter: blur(14px);
  background: rgba(255, 255, 255, 0.92);
}

.dev-mode-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.dev-mode-panel__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dev-mode-panel__hide {
  padding: 0;
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 12px;
  cursor: pointer;
}

.dev-mode-panel__hide:hover {
  color: #0958d9;
}

.dev-mode-panel__title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: #4b5563;
}

.dev-mode-panel__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dev-mode-panel__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dev-mode-panel__label {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.dev-mode-panel__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dev-mode-panel__hint {
  font-size: 12px;
  color: #6b7280;
}

.feature-overview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.feature-overview__item {
  padding: 12px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #f8fafc;
}

.feature-overview__value {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
}

.feature-overview__label {
  font-size: 12px;
  color: #667085;
}

.status-summary,
.feature-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.status-summary__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #fff;
  color: #1f2937;
  cursor: pointer;
}

.status-summary__item--active {
  border-color: #1677ff;
  background: #eff6ff;
  color: #0958d9;
}

.feature-filters {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 140px 140px;
}

.feature-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 16px;
  align-items: start;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.feature-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #fff;
}

.feature-item__main {
  min-width: 0;
}

.feature-item__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.feature-item__meta,
.feature-item__note {
  font-size: 12px;
  color: #667085;
}

.feature-item p {
  margin: 6px 0 0;
  color: #344054;
  line-height: 1.5;
}

.feature-item__note {
  margin-top: 8px;
  padding: 8px;
  border-radius: 6px;
  background: #f8fafc;
}

.feature-editor {
  position: sticky;
  top: 0;
  padding: 14px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #fff;
}

.feature-editor h3 {
  margin: 0 0 12px;
  font-size: 15px;
}

.feature-editor__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.feature-editor__reset {
  margin-top: 10px;
  padding-left: 0;
}

@media (max-width: 860px) {
  .feature-filters,
  .feature-layout,
  .feature-overview {
    grid-template-columns: 1fr;
  }

  .feature-editor {
    position: static;
  }
}
</style>
