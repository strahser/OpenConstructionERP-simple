// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
// Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
/**
 * Estimator CRM — супер-упрощённое рабочее место сметчика.
 *
 * 3 шага, максимально просто:
 *   1. ПРОЕКТЫ   — выберите проект (или создайте быстрый локальный).
 *   2. ДАННЫЕ    — загрузите PDF/DWG и выберите стандарт
 *                  (сметно-нормативная база × раздел проекта).
 *   3. СМЕТА     — простая таблица: позиция | ед. | кол-во | расценка | сумма.
 *
 * Движок (takeoff / dwg_takeoff / boq / costs) НЕ трогаем — этот модуль
 * тонкий клиент поверх него; здесь только локальная работа сметчика,
 * без обращения к API (подключение к движку — следующий шаг).
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  FolderOpen,
  Upload,
  Calculator,
  Plus,
  Trash2,
  Download,
  FileText,
  File as FileIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Ruler,
} from 'lucide-react';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Button } from '@/shared/ui';
import { EmptyState } from '@/shared/ui';

/* ── Данные (локальные, localStorage) ─────────────────────────────── */

const LS_PROJECTS = 'estimator_crm_projects';
const LS_CURRENT = 'estimator_crm_current';

interface EstProject {
  id: string;
  name: string;
  code?: string;
}

interface EstFile {
  id: string;
  name: string;
  kind: 'pdf' | 'dwg' | 'other';
}

interface EstLine {
  id: string;
  position: string;   // поз.
  name: string;
  unit: string;
  qty: number;
  rate: number;       // расценка
  note?: string;
}

interface EstStandard {
  base: string;       // ФЕР / ГЭСН / ТСН / ФСНБ
  section: string;    // АР / КМ / КЖ / ЭО / ОВ / ВК
}

interface EstSession {
  projectId?: string;
  files: EstFile[];
  standard?: EstStandard;
  lines: EstLine[];
}

const BASES = ['ФЕР', 'ГЭСН', 'ТСН', 'ФСНБ'];
const SECTIONS = ['АР', 'КМ', 'КЖ', 'ЭО', 'ОВ', 'ВК'];

function readProjects(): EstProject[] {
  try {
    const raw = localStorage.getItem(LS_PROJECTS);
    return raw ? (JSON.parse(raw) as EstProject[]) : [];
  } catch {
    return [];
  }
}

function readSession(): EstSession {
  try {
    const raw = localStorage.getItem(LS_CURRENT);
    return raw ? (JSON.parse(raw) as EstSession) : { files: [], lines: [] };
  } catch {
    return { files: [], lines: [] };
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function fmt(n: number): string {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/* ── Страница ─────────────────────────────────────────────────────── */

export default function EstimatorCrmPage() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<EstProject[]>(readProjects);
  const [session, setSession] = useState<EstSession>(readSession);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [newProject, setNewProject] = useState('');

  const currentProject = useMemo(
    () => projects.find((p) => p.id === session.projectId),
    [projects, session.projectId],
  );

  const persistSession = (next: EstSession) => {
    setSession(next);
    localStorage.setItem(LS_CURRENT, JSON.stringify(next));
  };

  const persistProjects = (next: EstProject[]) => {
    setProjects(next);
    localStorage.setItem(LS_PROJECTS, JSON.stringify(next));
  };

  /* ── Шаг 1: проекты ── */
  const addProject = () => {
    const name = newProject.trim();
    if (!name) return;
    const p: EstProject = { id: uid(), name };
    persistProjects([...projects, p]);
    setNewProject('');
  };

  const pickProject = (id: string) => {
    persistSession({ ...session, projectId: id, files: [], lines: [] });
    setStep(2);
  };

  /* ── Шаг 2: файлы + стандарт ── */
  const addFiles = (names: string[]) => {
    const files: EstFile[] = names.map((name) => {
      const lower = name.toLowerCase();
      const kind: EstFile['kind'] = lower.endsWith('.pdf')
        ? 'pdf'
        : lower.endsWith('.dwg') || lower.endsWith('.dxf')
          ? 'dwg'
          : 'other';
      return { id: uid(), name, kind };
    });
    persistSession({ ...session, files: [...session.files, ...files] });
  };

  const removeFile = (id: string) => {
    persistSession({ ...session, files: session.files.filter((f) => f.id !== id) });
  };

  const setStandard = (base: string, section: string) => {
    persistSession({ ...session, standard: { base, section } });
  };

  const nextFromData = () => {
    if (!session.standard) return;
    setStep(3);
  };

  /* ── Шаг 3: смета ── */
  const addLine = () => {
    const line: EstLine = {
      id: uid(),
      position: `П${session.lines.length + 1}`,
      name: '',
      unit: 'шт',
      qty: 1,
      rate: 0,
    };
    persistSession({ ...session, lines: [...session.lines, line] });
  };

  const updateLine = (id: string, patch: Partial<EstLine>) => {
    persistSession({
      ...session,
      lines: session.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });
  };

  const removeLine = (id: string) => {
    persistSession({ ...session, lines: session.lines.filter((l) => l.id !== id) });
  };

  const total = session.lines.reduce((sum, l) => sum + (l.qty || 0) * (l.rate || 0), 0);

  const exportCsv = () => {
    const header = 'Позиция;Наименование;Ед.;Кол-во;Расценка;Сумма';
    const rows = session.lines.map(
      (l) =>
        `${l.position};${l.name};${l.unit};${fmt(l.qty)};${fmt(l.rate)};${fmt((l.qty || 0) * (l.rate || 0))}`,
    );
    const csv = [header, ...rows, `;;ИТОГО;;;${fmt(total)}`].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smeta_${currentProject?.name ?? 'project'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasData = session.files.length > 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader
        subtitle={t('estimator_crm.subtitle', { defaultValue: 'Рабочее место сметчика' })}
      />

      {/* ── Степпер ── */}
      <div className="mb-6 flex items-center gap-1 rounded-xl border border-border-light bg-surface-primary p-1.5 shadow-sm">
        {(
          [
            { n: 1, label: 'Проекты', icon: FolderOpen },
            { n: 2, label: 'Данные и стандарт', icon: Upload },
            { n: 3, label: 'Смета', icon: Calculator },
          ] as const
        ).map((s, i) => (
          <div key={s.n} className="flex flex-1 items-center gap-1">
            {i > 0 && <ChevronRight size={14} className="shrink-0 text-content-quaternary" />}
            <button
              type="button"
              onClick={() => setStep(s.n)}
              className={clsx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors',
                step === s.n
                  ? 'bg-oe-blue/10 text-oe-blue'
                  : 'text-content-tertiary hover:bg-surface-secondary hover:text-content-primary',
              )}
            >
              <s.icon size={14} strokeWidth={2} />
              <span className="hidden sm:inline">{s.label}</span>
              {s.n === 3 && currentProject && (
                <Check size={12} className="text-emerald-500" />
              )}
            </button>
          </div>
        ))}
      </div>

      {/* ── ШАГ 1: ПРОЕКТЫ ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addProject()}
              placeholder="Название проекта (напр. Коровник №4, АР)"
              className="flex-1 rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm text-content-primary placeholder:text-content-quaternary focus:border-oe-blue focus:outline-none"
            />
            <Button onClick={addProject}>
              <Plus size={14} /> Добавить
            </Button>
          </div>

          {projects.length === 0 ? (
            <EmptyState
              icon={<FolderOpen size={20} />}
              title="Пока нет проектов"
              description="Создайте первый проект — далее добавьте чертежи и составьте смету."
            />
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickProject(p.id)}
                  className={clsx(
                    'group flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                    session.projectId === p.id
                      ? 'border-oe-blue bg-oe-blue/5'
                      : 'border-border-light bg-surface-primary hover:border-oe-blue/40 hover:shadow-sm',
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-oe-blue/10 text-oe-blue">
                    <FolderOpen size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-content-primary">
                      {p.name}
                    </span>
                    {p.code && (
                      <span className="block text-xs text-content-tertiary">{p.code}</span>
                    )}
                  </span>
                  <ChevronRight
                    size={16}
                    className="shrink-0 text-content-quaternary transition-transform group-hover:translate-x-0.5"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ШАГ 2: ФАЙЛЫ + СТАНДАРТ ── */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Файлы */}
          <section className="rounded-xl border border-border-light bg-surface-primary p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-content-primary">
              <Upload size={15} className="text-oe-blue" /> Чертежи и документы
            </h3>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-light bg-surface-secondary/30 px-4 py-8 text-center transition-colors hover:border-oe-blue/50 hover:bg-oe-blue/5">
              <FileText size={22} className="text-content-tertiary" />
              <span className="text-sm text-content-secondary">
                Перетащите сюда или нажмите — PDF / DWG / DXF
              </span>
              <input
                type="file"
                multiple
                accept=".pdf,.dwg,.dxf"
                className="hidden"
                onChange={(e) => {
                  const names = Array.from(e.target.files ?? []).map((f) => f.name);
                  if (names.length) addFiles(names);
                  e.target.value = '';
                }}
              />
            </label>

            {session.files.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {session.files.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-2.5 rounded-lg border border-border-light bg-surface-secondary/40 px-3 py-2"
                  >
                    {f.kind === 'pdf' ? (
                      <FileText size={14} className="shrink-0 text-rose-500" />
                    ) : f.kind === 'dwg' ? (
                      <Layers size={14} className="shrink-0 text-sky-500" />
                    ) : (
                      <FileIcon size={14} className="shrink-0 text-content-tertiary" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-content-primary">
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(f.id)}
                      className="shrink-0 rounded-md p-1 text-content-tertiary hover:bg-surface-primary hover:text-rose-500"
                      aria-label="Удалить файл"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Стандарт: база × раздел */}
          <section className="rounded-xl border border-border-light bg-surface-primary p-4">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-content-primary">
              <Ruler size={15} className="text-oe-blue" /> Стандарт сметы
            </h3>
            <p className="mb-3 text-xs text-content-tertiary">
              Выберите сметно-нормативную базу и раздел проекта — смета будет
              готовиться по этим правилам.
            </p>
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 text-xs font-medium text-content-secondary">
                  Сметно-нормативная база
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {BASES.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() =>
                        setStandard(b, session.standard?.section ?? SECTIONS[0]!)
                      }
                      className={clsx(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                        session.standard?.base === b
                          ? 'border-oe-blue bg-oe-blue/10 text-oe-blue'
                          : 'border-border-light bg-surface-secondary/40 text-content-secondary hover:border-oe-blue/40 hover:text-content-primary',
                      )}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium text-content-secondary">
                  Раздел проекта
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SECTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        setStandard(session.standard?.base ?? BASES[0]!, s)
                      }
                      className={clsx(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                        session.standard?.section === s
                          ? 'border-oe-blue bg-oe-blue/10 text-oe-blue'
                          : 'border-border-light bg-surface-secondary/40 text-content-secondary hover:border-oe-blue/40 hover:text-content-primary',
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ChevronLeft size={14} /> Проекты
            </Button>
            <Button
              onClick={nextFromData}
              disabled={!session.standard}
              title={!session.standard ? 'Сначала выберите стандарт' : undefined}
            >
              К смете <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ── ШАГ 3: СМЕТА ── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-content-primary">
                {currentProject?.name ?? 'Проект'}
              </div>
              <div className="text-xs text-content-tertiary">
                {session.standard
                  ? `${session.standard.base} · ${session.standard.section}`
                  : 'Стандарт не выбран'}
                {hasData && ` · файлов: ${session.files.length}`}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep(2)}>
                <ChevronLeft size={14} /> Данные
              </Button>
              <Button onClick={exportCsv} disabled={session.lines.length === 0}>
                <Download size={14} /> Экспорт CSV
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border-light bg-surface-primary">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-light bg-surface-secondary/40 text-left text-xs text-content-tertiary">
                  <th className="w-20 px-3 py-2 font-medium">Поз.</th>
                  <th className="px-2 py-2 font-medium">Наименование</th>
                  <th className="w-20 px-2 py-2 font-medium">Ед.</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">Кол-во</th>
                  <th className="w-32 px-2 py-2 text-right font-medium">Расценка</th>
                  <th className="w-32 px-3 py-2 text-right font-medium">Сумма</th>
                  <th className="w-10 px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {session.lines.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8">
                      <EmptyState
                        icon={<Calculator size={20} />}
                        title="Смета пуста"
                        description="Добавьте первую позицию — наименование, объём и расценку."
                      />
                    </td>
                  </tr>
                )}
                {session.lines.map((l) => (
                  <tr key={l.id} className="border-b border-border-light/60">
                    <td className="px-3 py-1.5">
                      <input
                        value={l.position}
                        onChange={(e) => updateLine(l.id, { position: e.target.value })}
                        className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs focus:border-oe-blue/40 focus:bg-surface-secondary/40 focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={l.name}
                        onChange={(e) => updateLine(l.id, { name: e.target.value })}
                        placeholder="Наименование работ / материала"
                        className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm focus:border-oe-blue/40 focus:bg-surface-secondary/40 focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={l.unit}
                        onChange={(e) => updateLine(l.id, { unit: e.target.value })}
                        className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs focus:border-oe-blue/40 focus:bg-surface-secondary/40 focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        value={l.qty}
                        min={0}
                        onChange={(e) => updateLine(l.id, { qty: Number(e.target.value) })}
                        className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right text-xs tabular-nums focus:border-oe-blue/40 focus:bg-surface-secondary/40 focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        value={l.rate}
                        min={0}
                        onChange={(e) => updateLine(l.id, { rate: Number(e.target.value) })}
                        className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right text-xs tabular-nums focus:border-oe-blue/40 focus:bg-surface-secondary/40 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums text-content-primary">
                      {fmt((l.qty || 0) * (l.rate || 0))}
                    </td>
                    <td className="px-1 py-1.5">
                      <button
                        type="button"
                        onClick={() => removeLine(l.id)}
                        className="rounded-md p-1 text-content-quaternary hover:text-rose-500"
                        aria-label="Удалить позицию"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-secondary/40">
                  <td colSpan={5} className="px-3 py-2.5 text-right text-sm font-semibold text-content-primary">
                    ИТОГО
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-bold tabular-nums text-oe-blue">
                    {fmt(total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <Button variant="secondary" onClick={addLine}>
            <Plus size={14} /> Добавить позицию
          </Button>
        </div>
      )}
    </div>
  );
}
