import React from 'react';
import { X } from 'lucide-react';
import { DebouncedSearchInput, FilterSelect } from '../../components/ui/data';
import { STATUSES, PRIORITIES, TEST_TYPES, EXECUTION_LABEL } from './model';

// Seçili koşumdaki sonuca göre süzme
const RUN_RESULTS = [['Failed', 'Kaldı'], ['Passed', 'Geçti'], ['Skipped', 'Atlandı']];

/** runOptions: son koşumlar (null = koşum filtresi gösterilmez) */
const CaseFilters = ({ query, projects, tags, searchRef, runOptions, bugFilter }) => {
  const { q, filters, setQ, setFilter, clearFilters, hasFilter } = query;
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
      <DebouncedSearchInput ref={searchRef} value={q} onChange={setQ} shortcut="/"
        placeholder="Başlık, TC-ID, etiket veya adım ara" className="lg:w-80" />
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect label="Proje" value={filters.project} onChange={v => setFilter('project', v)}
          options={projects.map(p => [p.id, p.name])} />
        <FilterSelect label="Son sonuç" value={filters.status} onChange={v => setFilter('status', v)}
          options={STATUSES.map(s => [s, s])} />
        <FilterSelect label="Öncelik" value={filters.priority} onChange={v => setFilter('priority', v)}
          options={PRIORITIES.map(p => [p, p])} />
        <FilterSelect label="Yürütme" value={filters.exec} onChange={v => setFilter('exec', v)}
          options={Object.entries(EXECUTION_LABEL)} />
        <FilterSelect label="Tür" value={filters.type} onChange={v => setFilter('type', v)}
          options={TEST_TYPES.map(t => [t, t])} />
        {tags.length > 0 && (
          <FilterSelect label="Etiket" value={filters.tag} onChange={v => setFilter('tag', v)}
            options={tags.map(t => [t, t])} />
        )}
        {bugFilter && (
          <FilterSelect label="Bug" value={filters.bug} onChange={v => setFilter('bug', v)}
            options={[['open', "Açık bug'ı var", 'açık var'], ['none', "Açık bug'ı yok", 'yok']]} />
        )}
        {runOptions && (runOptions.length > 0 || filters.run) && (
          <FilterSelect label="Koşum" value={filters.run} onChange={v => setFilter('run', v)} options={runOptions} />
        )}
        {runOptions && filters.run && (
          <FilterSelect label="Koşumda" value={filters.runres} onChange={v => setFilter('runres', v)} options={RUN_RESULTS} />
        )}
        {hasFilter && (
          <button type="button" onClick={clearFilters}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100">
            <X size={14} /> Temizle
          </button>
        )}
      </div>
    </div>
  );
};

export default CaseFilters;
