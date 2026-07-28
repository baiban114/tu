<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, Teleport } from 'vue';
import type { CSSProperties } from 'vue';
import { resolvePreferBottomLeftPanelPosition } from '@/utils/viewportPanel';

interface HoverHandleItem {
  key: string;
  label?: string;
  icon?: string;
  danger?: boolean;
  divider?: boolean;
}

interface Props {
  items: HoverHandleItem[];
  visible?: boolean;
  dragCursor?: boolean;
  autoPosition?: boolean;
  preventMouseDown?: boolean;
  menuMinWidth?: string;
  menuMaxWidth?: string;
  menuGap?: number;
  viewportPadding?: number;
  /**
   * `block-top`: purple grip for tall markdown shells (blockquote…),
   * distinct color from blue paragraph/section handles (Yuque-style top-left).
   */
  variant?: 'default' | 'block-top';
}

const props = withDefaults(defineProps<Props>(), {
  visible: true,
  dragCursor: false,
  autoPosition: true,
  preventMouseDown: false,
  menuMinWidth: '170px',
  menuMaxWidth: 'min(260px, calc(100vw - 24px))',
  menuGap: 8,
  viewportPadding: 12,
  variant: 'default',
});

/** Match slash-command menu max height (closest editor floating action panel). */
const MENU_MAX_HEIGHT_PX = 360

const emit = defineEmits<{
  (e: 'select', key: string): void;
  (e: 'menu-visibility-change', visible: boolean): void;
  (e: 'grip-enter'): void;
  (e: 'grip-leave', event: MouseEvent): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const menuVisible = ref(false);
const menuPositioned = ref(false);
const autoMenuStyle = ref<CSSProperties>({});
let scheduledSyncFrame = 0;
let hideTimeoutId: ReturnType<typeof setTimeout> | undefined;

const menuStyle = computed<CSSProperties>(() => ({
  minWidth: props.menuMinWidth,
  maxWidth: props.menuMaxWidth,
  ...autoMenuStyle.value,
}));

const cancelScheduledSync = () => {
  if (scheduledSyncFrame) {
    window.cancelAnimationFrame(scheduledSyncFrame);
    scheduledSyncFrame = 0;
  }
};

const syncMenuPosition = () => {
  if (!props.autoPosition || !rootRef.value || !menuRef.value) return;

  // Use the grip dot — not the wide gutter trigger strip — as the anchor.
  const dotEl = rootRef.value.querySelector('.hover-handle__dot');
  const handleRect = (dotEl instanceof HTMLElement ? dotEl : rootRef.value).getBoundingClientRect();
  const menuRect = menuRef.value.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxHeight = Math.min(MENU_MAX_HEIGHT_PX, viewportHeight - props.viewportPadding * 2);
  const menuHeight = Math.min(menuRect.height, Math.max(140, maxHeight));
  const menuWidth = menuRect.width;
  const contentLeft = resolveDocumentContentLeft(rootRef.value);
  const { left, top } = resolvePreferBottomLeftPanelPosition(
    handleRect,
    menuWidth,
    menuHeight,
    props.menuGap,
    props.viewportPadding,
    viewportWidth,
    viewportHeight,
    contentLeft ?? undefined,
  );

  autoMenuStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    right: 'auto',
    transform: 'none',
    marginLeft: '0',
    maxHeight: `${Math.max(140, maxHeight)}px`,
    overflowY: 'auto',
  };

  menuPositioned.value = true;
};

/** Left edge of the editor text column — not the full page / gutter. */
function resolveDocumentContentLeft(handleEl: HTMLElement): number | null {
  const wrapper = handleEl.closest('.tu-editor-wrapper');
  const content = wrapper?.querySelector('.tu-editor-content');
  if (content instanceof HTMLElement) return content.getBoundingClientRect().left;
  if (wrapper instanceof HTMLElement) return wrapper.getBoundingClientRect().left;
  const nested = handleEl.closest('.tu-editor-content');
  if (nested instanceof HTMLElement) return nested.getBoundingClientRect().left;
  return null;
}

const scheduleMenuPosition = () => {
  cancelScheduledSync();
  scheduledSyncFrame = window.requestAnimationFrame(() => {
    scheduledSyncFrame = 0;
    syncMenuPosition();
  });
};

const setMenuVisible = (visible: boolean) => {
  emit('menu-visibility-change', visible);

  if (visible) {
    menuPositioned.value = false;
    autoMenuStyle.value = {};
    menuVisible.value = true;
    nextTick(() => {
      syncMenuPosition();
    });
    return;
  }

  menuVisible.value = false;
  menuPositioned.value = false;
  autoMenuStyle.value = {};
};

const cancelHide = () => {
  if (hideTimeoutId !== undefined) {
    clearTimeout(hideTimeoutId);
    hideTimeoutId = undefined;
  }
};

const handleMouseEnter = () => {
  if (!props.visible) return;
  cancelHide();
  setMenuVisible(true);
};

const handleMouseLeave = () => {
  cancelHide();
  hideTimeoutId = setTimeout(() => {
    hideTimeoutId = undefined;
    setMenuVisible(false);
  }, 200);
};

const handleMenuMouseEnter = () => {
  cancelHide();
};

const handleMenuMouseLeave = () => {
  cancelHide();
  setMenuVisible(false);
};

const handleMouseDown = (event: MouseEvent) => {
  if (props.preventMouseDown) {
    event.preventDefault();
  }
};

const handleItemClick = (item: HoverHandleItem) => {
  if (item.divider) return;
  emit('select', item.key);
  setMenuVisible(false);
};

const handleViewportChange = () => {
  if (!menuVisible.value) return;
  scheduleMenuPosition();
};

watch(
  () => props.visible,
  (visible) => {
    if (!visible && menuVisible.value) {
      setMenuVisible(false);
    }
  }
);

onMounted(() => {
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleViewportChange, true);
});

onBeforeUnmount(() => {
  cancelScheduledSync();
  cancelHide();
  window.removeEventListener('resize', handleViewportChange);
  window.removeEventListener('scroll', handleViewportChange, true);
});
</script>

<template>
  <div
    ref="rootRef"
    class="hover-handle"
    :class="{ 'hover-handle--block-top': variant === 'block-top' }"
    @click.stop
    @mousedown="handleMouseDown"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div
      class="handle-dot hover-handle__dot"
      :class="{ 'hover-handle__dot--drag': dragCursor }"
      @mouseenter="emit('grip-enter')"
      @mouseleave="(event: MouseEvent) => emit('grip-leave', event)"
    ></div>

    <Teleport to="body">
      <div
        v-if="menuVisible"
        ref="menuRef"
        class="handle-menu hover-handle__menu"
        :class="{ 'hover-handle__menu--visible': menuVisible && menuPositioned }"
        :style="menuStyle"
        @mouseenter="handleMenuMouseEnter"
        @mouseleave="handleMenuMouseLeave"
      >
        <template v-for="item in items" :key="item.key">
          <div v-if="item.divider" class="handle-menu-divider hover-handle__divider">
            <span v-if="item.label" class="hover-handle__divider-label">{{ item.label }}</span>
          </div>
          <div
            v-else
            class="handle-menu-item hover-handle__item"
            :class="{
              'handle-menu-item--danger': item.danger,
              'hover-handle__item--danger': item.danger,
              delete: item.danger,
            }"
            @click="handleItemClick(item)"
          >
            <span v-if="item.icon">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.hover-handle {
  position: absolute;
  left: var(--hover-handle-left, 50%);
  top: var(--hover-handle-top, 0);
  transform: var(--hover-handle-transform, translate(-50%, -50%));
  z-index: 25;
  width: 28px;
  height: var(--hover-handle-height, 28px);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.hover-handle__dot {
  position: absolute;
  left: var(--hover-handle-dot-left, 50%);
  top: 50%;
  transform: translate(-50%, -50%);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  cursor: pointer;
  box-shadow: none;
  flex-shrink: 0;
}

.hover-handle__dot::after {
  content: '';
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--hover-handle-dot-bg, #1890ff);
  box-shadow: var(--hover-handle-dot-shadow, 0 2px 4px rgba(24, 144, 255, 0.3));
  transition: transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
}

.hover-handle__dot--drag {
  cursor: grab;
}

.hover-handle__dot--drag:active {
  cursor: grabbing;
}

.hover-handle:hover .hover-handle__dot::after,
.hover-handle__dot:hover::after {
  transform: scale(1.08);
  background: var(--hover-handle-dot-hover-bg, #40a9ff);
}

/* Markdown block shells (blockquote etc.): purple grip; position is top-left for all handles */
.hover-handle--block-top {
  --hover-handle-dot-bg: #9333ea;
  --hover-handle-dot-hover-bg: #a855f7;
  --hover-handle-dot-shadow: 0 2px 4px rgba(147, 51, 234, 0.32);
}

.hover-handle__menu {
  position: fixed;
  top: 0;
  left: 0;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.14);
  padding: 6px;
  /* Align with slash-command-menu (closest editor floating action panel). */
  max-height: min(360px, calc(100vh - 24px));
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s ease, visibility 0.15s ease;
  z-index: 1000002;
  overflow-y: auto;
  overscroll-behavior: contain;
  box-sizing: border-box;
}

.hover-handle__menu--visible {
  opacity: 1;
  visibility: visible;
}

.hover-handle__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 14px;
  color: #1f2937;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.hover-handle__item:hover {
  background: var(--hover-handle-item-hover-bg, #f0f7ff);
  color: var(--hover-handle-item-hover-color, #1677ff);
}

.hover-handle__item--danger:hover {
  background: var(--hover-handle-danger-hover-bg, #fff1f0);
  color: var(--hover-handle-danger-hover-color, #ff4d4f);
}

.hover-handle__divider {
  height: auto;
  min-height: 1px;
  margin: 4px 0;
  background: linear-gradient(#e8e8e8, #e8e8e8) center / 100% 1px no-repeat;
}

.hover-handle__divider-label {
  display: inline-flex;
  margin-left: 10px;
  padding: 0 6px;
  background: #fff;
  color: #8c8c8c;
  font-size: 11px;
  line-height: 18px;
}
</style>
