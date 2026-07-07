<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface Props {
  message: string;
  duration?: number;
}

const props = withDefaults(defineProps<Props>(), {
  duration: 3000
});

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const isVisible = ref(false);
const progress = ref(100);

onMounted(() => {
  isVisible.value = true;
  
  const startTime = Date.now();
  const interval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, props.duration - elapsed);
    progress.value = (remaining / props.duration) * 100;
    
    if (remaining <= 0) {
      clearInterval(interval);
      close();
    }
  }, 50);
});

const close = () => {
  isVisible.value = false;
  setTimeout(() => {
    emit('close');
  }, 300);
};
</script>

<template>
  <div v-if="isVisible" class="toast-container">
    <div class="toast-content">
      <div class="toast-message">{{ message }}</div>
      <div class="toast-progress" :style="{ width: `${progress}%` }"></div>
      <button class="toast-close" @click="close">×</button>
    </div>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
}

.toast-content {
  position: relative;
  background: rgba(0, 0, 0, 0.85);
  color: white;
  padding: 12px 40px 12px 16px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 200px;
  max-width: 400px;
  animation: slideIn 0.3s ease-out;
  backdrop-filter: blur(10px);
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.toast-message {
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background: linear-gradient(90deg, #1890ff, #40a9ff);
  border-radius: 0 0 8px 8px;
  transition: width 0.05s linear;
}

.toast-close {
  position: absolute;
  top: 8px;
  right: 8px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.toast-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}
</style>
