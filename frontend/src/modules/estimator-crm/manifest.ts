// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
// Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { Calculator } from 'lucide-react';
import type { ModuleManifest } from '../_types';

// Estimator CRM — супер-упрощённое рабочее место сметчика.
// Проекты → Файлы → Смета. Движок (takeoff/dwg/boq/costs) не трогаем.
const EstimatorCrmPage = lazy(
  () => import('./EstimatorCrmPage'),
) as unknown as LazyExoticComponent<ComponentType<unknown>>;

// internal build lineage: ddc-lineage:estimator-crm-01
export const manifest: ModuleManifest = {
  id: 'estimator-crm',
  name: 'Estimator CRM',
  description: 'Супер-упрощённое рабочее место сметчика: проекты → файлы → смета',
  version: '1.0.0',
  icon: Calculator,
  category: 'estimation',
  defaultEnabled: true,
  routes: [
    {
      path: '/estimator',
      title: 'Estimator CRM',
      component: EstimatorCrmPage,
    },
  ],
  navItems: [
    {
      labelKey: 'estimator_crm.title',
      to: '/estimator',
      icon: Calculator,
      group: 'grp_estimating',
    },
  ],
  searchEntries: [
    {
      label: 'Estimator CRM',
      path: '/estimator',
      keywords: ['смета', 'сметчик', 'estimate', 'estimator', 'crm', 'ведомость', 'boq'],
    },
  ],
  translations: {
    ru: {
      'estimator_crm.title': 'Сметчик',
      'estimator_crm.subtitle': 'Рабочее место сметчика',
    },
    en: {
      'estimator_crm.title': 'Estimator',
      'estimator_crm.subtitle': 'Estimator workspace',
    },
  },
};
