<script setup lang="ts">
withDefaults(defineProps<{
  collapsed?: boolean
  size?: number
}>(), {
  collapsed: false,
  size: 10,
})
</script>

<template>
  <svg
    class="tu-fold-chevron"
    :class="{ 'tu-fold-chevron--collapsed': collapsed }"
    :width="size"
    :height="size"
    viewBox="0 0 12 12"
    aria-hidden="true"
  >
    <path
      d="M3 4.5L6 7.5L9 4.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
