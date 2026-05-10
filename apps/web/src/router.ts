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
  // TJ-style mobile flow. Lives under the city slug so URLs stay
  // shareable (`/palu/routes/K1`) and the city store can sync from
  // the route. Desktop users can still hit these — they're just laid
  // out for portrait viewports.
  {
    path: '/:city(palu|donggala)/routes',
    name: 'routes-index',
    component: () => import('@/views/RoutesIndexView.vue'),
    props: true,
  },
  {
    path: '/:city(palu|donggala)/routes/:kor',
    name: 'route-detail',
    component: () => import('@/views/RouteDetailView.vue'),
    props: true,
  },
  {
    path: '/:city(palu|donggala)/routes/:kor/map',
    name: 'route-map',
    component: () => import('@/views/RouteMapView.vue'),
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
