import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },

    {
      path: '/knowledge-chat',
      name: 'knowledge-chat',
      component: () => import('../views/KnowledgeChatView.vue'),
    },
    {
      path: '/resources',
      name: 'resources',
      component: () => import('../views/ResourceManagerView.vue'),
    },
    {
      path: '/tasks',
      name: 'tasks',
      component: () => import('../views/TaskManagerView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
    },
  ],
})

export default router
