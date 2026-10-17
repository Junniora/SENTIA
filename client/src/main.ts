import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { Quasar, Notify, Dialog, ClosePopup, QBadge, QCard, QForm, QInput, QBanner, QBtn, QLayout, QHeader, QToolbar, QBreadcrumbs, QBreadcrumbsEl, QSpace, QSeparator, QAvatar, QDrawer, QList, QItem, QItemSection, QIcon, QPageContainer, QPage, QLinearProgress, QToggle, QMarkupTable, QSelect, QDialog, QCardSection } from 'quasar';
import 'quasar/dist/quasar.css';
import '@quasar/extras/material-icons/material-icons.css';
import './style.css';
import App from './App.vue';
import { router } from './router';

createApp(App)
  .use(createPinia())
  .use(router)
  .use(Quasar, {
    components: { QBadge, QCard, QForm, QInput, QBanner, QBtn, QLayout, QHeader, QToolbar, QBreadcrumbs, QBreadcrumbsEl, QSpace, QSeparator, QAvatar, QDrawer, QList, QItem, QItemSection, QIcon, QPageContainer, QPage, QLinearProgress, QToggle, QMarkupTable, QSelect, QDialog, QCardSection },
    directives: { ClosePopup },
    plugins: { Notify, Dialog },
    config: { brand: { primary: '#7755e8', secondary: '#182443' } }
  })
  .mount('#app');
