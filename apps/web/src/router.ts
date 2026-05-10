import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/:city(palu|donggala)',
    name: 'city',
    component: () => import('@/views/CityView.vue'),
    props: true,
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: { name: 'home' },
  },
]

export default createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})
