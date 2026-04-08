import { useEffect, useMemo, useState } from 'react';
import { API_BASE, libraryApi, submissionsApi, usersApi } from '../api';
import { Modal, Spinner, TextPreview, useToast, fmtDateTime } from '../components/shared';
import type { KnowledgeLibraryItem } from '../types';

type ChoiceOption = {
  value: string;
  label: string;
};

const DEPARTMENT_OPTIONS = [
  { value: 'sales', label: 'Sales' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'counsellor', label: 'Counsellor' },
  { value: 'academic', label: 'Academic' },
  { value: 'founders', label: 'Founders' },
] as const;

type LibraryFormState = {
  title: string;
  section_key: string;
  section_label: string;
  description: string;
  source_file_url: string;
  content_markdown: string;
  applies_to_doc_types: string;
  applies_to_stakeholders: string;
  visible_to_departments: string;
  tags: string;
  sort_order: number;
  is_active: boolean;
};

const EMPTY_FORM: LibraryFormState = {
  title: '',
  section_key: '',
  section_label: '',
  description: '',
  source_file_url: '',
  content_markdown: '',
  applies_to_doc_types: '',
  applies_to_stakeholders: '',
  visible_to_departments: '',
  tags: '',
  sort_order: 0,
  is_active: true,
};

function csvValue(values: string[] | null | undefined) {
  return (values ?? []).join(', ');
}

function parseCsv(value: string) {
  return value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}

function badgeClass(isActive: boolean) {
  return isActive ? 'status-pill status-pill-active' : 'status-pill status-pill-inactive';
}

function formatConversationRole(role: 'user' | 'assistant') {
  return role === 'user' ? 'Founder' : 'LLM';
}

function toggleDepartmentList(current: string, department: string) {
  const values = parseCsv(current);
  return values.includes(department)
    ? values.filter(item => item !== department).join(', ')
    : [...values, department].join(', ');
}

function toggleChoiceList(current: string, choice: string) {
  const values = parseCsv(current);
  return values.includes(choice)
    ? values.filter(item => item !== choice).join(', ')
    : [...values, choice].join(', ');
}

function resolveSourceUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
    return new URL(path, API_BASE).toString();
  }
  return path;
}

export default function LibraryPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<KnowledgeLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeLibraryItem | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [wizardStep, setWizardStep] = useState<'upload' | 'metadata'>('upload');
  const [sourceMode, setSourceMode] = useState<'upload' | 'drive'>('upload');
  const [llmMode, setLlmMode] = useState<'auto' | 'guided'>('auto');
  const [llmGuidance, setLlmGuidance] = useState('');
  const [archiveSource, setArchiveSource] = useState(true);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveQuery, setDriveQuery] = useState('');
  const [driveFiles, setDriveFiles] = useState<Array<{
    id: string;
    name: string;
    mime_type: string;
    web_view_link: string | null;
    modified_time: string | null;
    size_bytes: number | null;
  }>>([]);
  const [selectedDriveFileId, setSelectedDriveFileId] = useState('');
  const [docTypeOptions, setDocTypeOptions] = useState<ChoiceOption[]>([]);
  const [stakeholderOptions, setStakeholderOptions] = useState<ChoiceOption[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [bulkDocTypes, setBulkDocTypes] = useState('');
  const [bulkStakeholders, setBulkStakeholders] = useState('');
  const [bulkDocTypeScope, setBulkDocTypeScope] = useState<'unset' | 'all' | 'selected'>('unset');
  const [bulkStakeholderScope, setBulkStakeholderScope] = useState<'unset' | 'all' | 'selected'>('unset');
  const [form, setForm] = useState<LibraryFormState>(EMPTY_FORM);

  async function load() {
    setLoading(true);
    try {
      const { data } = await libraryApi.list();
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setSelectedItemIds(prev => prev.filter(id => items.some(item => item.id === id)));
  }, [items]);

  useEffect(() => {
    submissionsApi.composeOptions()
      .then(({ data }) => {
        setDocTypeOptions(
          data.document_guidance.map(item => ({
            value: item.doc_type,
            label: item.title,
          }))
        );
        setStakeholderOptions(data.stakeholders);
      })
      .catch(() => {
        toast('error', 'Could not load library selection options');
      });
  }, []);

  useEffect(() => {
    if (!creating || wizardStep !== 'upload' || sourceMode !== 'drive') {
      return;
    }

    setDriveLoading(true);
    usersApi.googleDriveStatus()
      .then(({ data }) => {
        setDriveConnected(data.connected);
        if (!data.connected) {
          setDriveFiles([]);
          return;
        }
        return usersApi.googleDriveFiles(driveQuery.trim() || undefined).then(({ data: files }) => {
          setDriveFiles(files);
        });
      })
      .catch(() => {
        setDriveConnected(false);
        setDriveFiles([]);
      })
      .finally(() => setDriveLoading(false));
  }, [creating, wizardStep, sourceMode, driveQuery]);

  const sections = useMemo(() => {
    return Array.from(new Set(items.map(item => item.section_label))).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter(item => {
      const matchesSection = !sectionFilter || item.section_label === sectionFilter;
      const matchesStatus = !statusFilter
        || (statusFilter === 'active' ? item.is_active : !item.is_active);
      const matchesSearch = !term
        || item.title.toLowerCase().includes(term)
        || (item.description ?? '').toLowerCase().includes(term)
        || item.section_label.toLowerCase().includes(term)
        || item.section_key.toLowerCase().includes(term)
        || (item.tags ?? []).some(tag => tag.toLowerCase().includes(term));
      return matchesSection && matchesStatus && matchesSearch;
    });
  }, [items, search, sectionFilter, statusFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, KnowledgeLibraryItem[]>();
    filtered.forEach(item => {
      const key = item.section_label;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    });
    return Array.from(map.entries()).map(([section, sectionItems]) => ({
      section,
      items: sectionItems.sort((a, b) => (a.sort_order - b.sort_order) || a.title.localeCompare(b.title)),
    }));
  }, [filtered]);

  const stats = {
    total: items.length,
    active: items.filter(item => item.is_active).length,
    sections: sections.length,
    fileBacked: items.filter(item => item.source_kind !== 'manual').length,
  };

  const selectedDocTypes = useMemo(() => parseCsv(form.applies_to_doc_types), [form.applies_to_doc_types]);
  const selectedStakeholders = useMemo(() => parseCsv(form.applies_to_stakeholders), [form.applies_to_stakeholders]);
  const selectedBulkDocTypes = useMemo(() => parseCsv(bulkDocTypes), [bulkDocTypes]);
  const selectedBulkStakeholders = useMemo(() => parseCsv(bulkStakeholders), [bulkStakeholders]);

  function openCreate() {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setFile(null);
    setAnalyzing(false);
    setWizardStep('upload');
    setSourceMode('upload');
    setLlmMode('auto');
    setLlmGuidance('');
    setArchiveSource(true);
    setDriveConnected(false);
    setDriveLoading(false);
    setDriveQuery('');
    setDriveFiles([]);
    setSelectedDriveFileId('');
    setCreating(true);
  }

  function openEdit(item: KnowledgeLibraryItem) {
    setEditingItem(item);
    setCreating(false);
    setFile(null);
    setAnalyzing(false);
    setWizardStep('metadata');
    setForm({
      title: item.title,
      section_key: item.section_key,
      section_label: item.section_label,
      description: item.description ?? '',
      source_file_url: item.source_file_url ?? '',
      content_markdown: item.content_markdown,
      applies_to_doc_types: csvValue(item.applies_to_doc_types),
      applies_to_stakeholders: csvValue(item.applies_to_stakeholders),
      visible_to_departments: csvValue(item.visible_to_departments),
      tags: csvValue(item.tags),
      sort_order: item.sort_order,
      is_active: item.is_active,
    });
  }

  function toggleSelectedItem(itemId: string) {
    setSelectedItemIds(prev => (
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    ));
  }


  function closeModal() {
    setCreating(false);
    setEditingItem(null);
    setFile(null);
    setAnalyzing(false);
    setWizardStep('upload');
    setSourceMode('upload');
    setLlmMode('auto');
    setLlmGuidance('');
    setArchiveSource(true);
    setDriveConnected(false);
    setDriveLoading(false);
    setDriveQuery('');
    setDriveFiles([]);
    setSelectedDriveFileId('');
    setForm(EMPTY_FORM);
  }

  async function parseSource() {
    if (sourceMode === 'upload' && !file) {
      toast('error', 'Choose a source file before parsing');
      return;
    }
    if (sourceMode === 'drive' && !selectedDriveFileId) {
      toast('error', 'Choose a Google Drive file before parsing');
      return;
    }

    setAnalyzing(true);
    try {
      let data: KnowledgeLibraryItem;
      if (sourceMode === 'drive') {
        ({ data } = await libraryApi.importDrive({
          drive_file_id: selectedDriveFileId,
          title: form.title.trim() || null,
          description: form.description.trim() || null,
          is_active: false,
        }));
      } else {
        const fd = new FormData();
        fd.append('file', file as File);
        if (form.title.trim()) fd.append('title', form.title);
        if (form.description.trim()) fd.append('description', form.description);
        ({ data } = await libraryApi.parse(fd, { archive_source: archiveSource }));
      }
      setEditingItem(data);
      setForm({
        title: data.title,
        section_key: data.section_key,
        section_label: data.section_label,
      description: data.description ?? '',
      source_file_url: data.source_file_url ?? '',
      content_markdown: data.content_markdown,
        applies_to_doc_types: csvValue(data.applies_to_doc_types),
        applies_to_stakeholders: csvValue(data.applies_to_stakeholders),
        visible_to_departments: csvValue(data.visible_to_departments),
        tags: csvValue(data.tags),
        sort_order: data.sort_order,
        is_active: data.is_active,
      });
      setWizardStep('metadata');
      toast('success', archiveSource
        ? 'Source parsed and archived. Click to generate metadata when ready.'
        : 'Source parsed into markdown. Click to generate metadata when ready.');
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not parse source');
    } finally {
      setAnalyzing(false);
    }
  }

  async function analyzeItem(item: KnowledgeLibraryItem, options?: { founder_instructions?: string | null; auto_only?: boolean }) {
    setAnalyzing(true);
    try {
      const { data } = await libraryApi.analyze(item.id, options);
      setEditingItem(data);
      setForm({
        title: data.title,
        section_key: data.section_key,
        section_label: data.section_label,
        description: data.description ?? '',
        source_file_url: data.source_file_url ?? '',
        content_markdown: data.content_markdown,
        applies_to_doc_types: csvValue(data.applies_to_doc_types),
        applies_to_stakeholders: csvValue(data.applies_to_stakeholders),
        visible_to_departments: csvValue(data.visible_to_departments),
        tags: csvValue(data.tags),
        sort_order: data.sort_order,
        is_active: data.is_active,
      });
      await load();
      setWizardStep('metadata');
      toast('success', data.intake_analysis?.needs_clarification
        ? 'Analysis complete. Please answer the questions and re-run.'
        : 'Metadata analysis complete');
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not analyze item');
    } finally {
      setAnalyzing(false);
    }
  }

  function buildUpdatePayload() {
    return {
      title: form.title,
      section_key: form.section_key,
      section_label: form.section_label,
      description: form.description || null,
      source_file_url: form.source_file_url || null,
      content_markdown: form.content_markdown,
      applies_to_doc_types: parseCsv(form.applies_to_doc_types),
      applies_to_stakeholders: parseCsv(form.applies_to_stakeholders),
      visible_to_departments: parseCsv(form.visible_to_departments),
      tags: parseCsv(form.tags),
      sort_order: form.sort_order,
      is_active: form.is_active,
    };
  }

  async function saveCurrentEdits(item: KnowledgeLibraryItem) {
    const { data } = await libraryApi.update(item.id, buildUpdatePayload());
    setEditingItem(data);
    setForm({
      title: data.title,
      section_key: data.section_key,
      section_label: data.section_label,
      description: data.description ?? '',
      source_file_url: data.source_file_url ?? '',
      content_markdown: data.content_markdown,
      applies_to_doc_types: csvValue(data.applies_to_doc_types),
      applies_to_stakeholders: csvValue(data.applies_to_stakeholders),
      visible_to_departments: csvValue(data.visible_to_departments),
      tags: csvValue(data.tags),
      sort_order: data.sort_order,
      is_active: data.is_active,
    });
    return data;
  }

  async function regenerateFromEdits() {
    if (!editingItem) return;
    setSaving(true);
    try {
      const updated = await saveCurrentEdits(editingItem);
      toast('success', 'Changes saved. Regenerating metadata…');
      await analyzeItem(updated, llmGuidance.trim()
        ? { founder_instructions: llmGuidance.trim(), auto_only: false }
        : { auto_only: true });
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not regenerate metadata');
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!form.title.trim() || !form.section_key.trim() || !form.section_label.trim()) {
      toast('error', 'Title, section key, and section label are required');
      return;
    }
    if (!creating && !editingItem) return;
    if (creating && wizardStep === 'upload') {
      await parseSource();
      return;
    }

    setSaving(true);
    try {
      if (editingItem) {
        await libraryApi.update(editingItem.id, buildUpdatePayload());
        toast('success', 'Library item updated');
      } else if (creating) {
        const fd = new FormData();
        fd.append('title', form.title);
        fd.append('section_key', form.section_key);
        fd.append('section_label', form.section_label);
        fd.append('description', form.description);
        fd.append('source_file_url', form.source_file_url);
        fd.append('content_markdown', form.content_markdown);
        fd.append('applies_to_doc_types', form.applies_to_doc_types);
        fd.append('applies_to_stakeholders', form.applies_to_stakeholders);
        fd.append('visible_to_departments', form.visible_to_departments);
        fd.append('tags', form.tags);
        fd.append('sort_order', String(form.sort_order));
        fd.append('is_active', String(form.is_active));
        await libraryApi.create(fd);
        toast('success', 'Library item added');
      }
      closeModal();
      await load();
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not save library item');
    } finally {
      setSaving(false);
    }
  }

  async function toggleItem(item: KnowledgeLibraryItem) {
    try {
      await libraryApi.toggle(item.id);
      await load();
      toast('success', item.is_active ? 'Library item disabled' : 'Library item enabled');
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not update item status');
    }
  }

  async function deleteItem(item: KnowledgeLibraryItem) {
    const confirmed = window.confirm(
      `Delete "${item.title}" permanently? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await libraryApi.delete(item.id);
      await load();
      toast('success', 'Library item deleted permanently');
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not delete library item');
    }
  }

  async function applyBulkScope() {
    if (selectedItemIds.length === 0) {
      toast('error', 'Select one or more library items first');
      return;
    }

    setSaving(true);
    try {
      const docTypes = parseCsv(bulkDocTypes);
      const stakeholders = parseCsv(bulkStakeholders);
      const targets = items.filter(item => selectedItemIds.includes(item.id));
      await Promise.all(targets.map(item => libraryApi.update(item.id, {
        title: item.title,
        section_key: item.section_key,
        section_label: item.section_label,
        description: item.description,
        source_file_url: item.source_file_url,
        content_markdown: item.content_markdown,
        applies_to_doc_types: docTypes,
        applies_to_stakeholders: stakeholders,
        visible_to_departments: item.visible_to_departments,
        tags: item.tags,
        sort_order: item.sort_order,
        is_active: item.is_active,
      })));
      toast('success', 'Applied scope to selected library items');
      setBulkDocTypes('');
      setBulkStakeholders('');
      setBulkDocTypeScope('unset');
      setBulkStakeholderScope('unset');
      setSelectedItemIds([]);
      await load();
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not apply scope to selected items');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content">
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
            Founder Library
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: 720 }}>
            Upload source documents, convert them into prompt-ready markdown, and attach them to the drafting context
            by section, document type, and stakeholder.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          + Add to Library
        </button>
      </div>

      <div className="stats-row" style={{ marginBottom: 18 }}>
        <div className="stat-card total">
          <div className="stat-label">Total Items</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-sub">All knowledge library entries</div>
        </div>
        <div className="stat-card approved">
          <div className="stat-label">Active</div>
          <div className="stat-value">{stats.active}</div>
          <div className="stat-sub">Used in prompt assembly</div>
        </div>
        <div className="stat-card pending">
          <div className="stat-label">Sections</div>
          <div className="stat-value">{stats.sections}</div>
          <div className="stat-sub">Context buckets for matching</div>
        </div>
        <div className="stat-card rejected">
          <div className="stat-label">File-backed</div>
          <div className="stat-value">{stats.fileBacked}</div>
          <div className="stat-sub">Parsed from uploads</div>
        </div>
      </div>

      <div className="filters-row">
        <select className="filter-select" value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}>
          <option value="">All Sections</option>
          {sections.map(section => (
            <option key={section} value={section}>{section}</option>
          ))}
        </select>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div className="search-wrap">
          <span className="search-icon" style={{ fontSize: 13 }}>⌕</span>
          <input
            className="search-input"
            placeholder="Search library..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-outline btn-sm" onClick={load}>↺ Refresh</button>
      </div>

      {selectedItemIds.length > 0 && (
        <div className="table-card" style={{ marginBottom: 18 }}>
          <div className="table-header" style={{ alignItems: 'center', gap: 16 }}>
            <div>
              <div className="table-title">Bulk Scope Update</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                {selectedItemIds.length} selected item{selectedItemIds.length !== 1 ? 's' : ''}. Apply doc types and stakeholders to all selected items.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setSelectedItemIds(filtered.map(item => item.id))}
              >
                Select All Visible
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setSelectedItemIds([])}>
                Clear Selection
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 16, marginTop: 14 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Applies to Doc Types</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button"
                  className={`btn btn-outline btn-sm${bulkDocTypeScope === 'all' ? ' active' : ''}`}
                  onClick={() => {
                    setBulkDocTypes('');
                    setBulkDocTypeScope('all');
                  }}
                >
                  All
                </button>
                {docTypeOptions.map(option => {
                  const active = selectedBulkDocTypes.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`btn btn-outline btn-sm${active ? ' active' : ''}`}
                      onClick={() => {
                        setBulkDocTypes(prev => toggleChoiceList(prev, option.value));
                        setBulkDocTypeScope('selected');
                      }}
                    >
                      {active ? '✓ ' : ''}
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Applies to Stakeholders</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button"
                  className={`btn btn-outline btn-sm${bulkStakeholderScope === 'all' ? ' active' : ''}`}
                  onClick={() => {
                    setBulkStakeholders('');
                    setBulkStakeholderScope('all');
                  }}
                >
                  All
                </button>
                {stakeholderOptions.map(option => {
                  const active = selectedBulkStakeholders.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`btn btn-outline btn-sm${active ? ' active' : ''}`}
                      onClick={() => {
                        setBulkStakeholders(prev => toggleChoiceList(prev, option.value));
                        setBulkStakeholderScope('selected');
                      }}
                    >
                      {active ? '✓ ' : ''}
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={applyBulkScope} disabled={saving}>
                {saving ? 'Applying…' : 'Apply to Selected Items'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spinner dark />
        </div>
      ) : grouped.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No library items yet</div>
          <div className="empty-state-desc">Upload a source document or add a markdown knowledge item to get started.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {grouped.map(group => (
            <div key={group.section} className="table-card">
              <div className="table-header">
                <span className="table-title">{group.section}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{group.items.length} item{group.items.length !== 1 ? 's' : ''}</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 42 }}>
                      <input
                        type="checkbox"
                        checked={group.items.length > 0 && group.items.every(item => selectedItemIds.includes(item.id))}
                        onChange={() => {
                          const ids = group.items.map(item => item.id);
                          const allSelected = ids.every(id => selectedItemIds.includes(id));
                          setSelectedItemIds(prev => (
                            allSelected
                              ? prev.filter(id => !ids.includes(id))
                              : Array.from(new Set([...prev, ...ids]))
                          ));
                        }}
                        aria-label={`Select all items in ${group.section}`}
                      />
                    </th>
                    <th>Title</th>
                    <th>Scope</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map(item => (
                    <tr key={item.id}>
                      <td style={{ width: 42 }}>
                        <input
                          type="checkbox"
                          checked={selectedItemIds.includes(item.id)}
                          onChange={() => toggleSelectedItem(item.id)}
                          aria-label={`Select ${item.title}`}
                        />
                      </td>
                      <td style={{ minWidth: 260 }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{item.title}</div>
                          {item.description && (
                            <TextPreview text={item.description} maxLines={2} containerWidth={320} fontSize={12} />
                          )}
                          <TextPreview text={item.content_markdown} maxLines={2} containerWidth={320} fontSize={11} />
                        </div>
                      </td>
                      <td style={{ minWidth: 200 }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                          <div style={{ fontSize: 12.5, color: 'var(--ink-mid)' }}>
                            Doc types: {(item.applies_to_doc_types ?? []).length ? item.applies_to_doc_types?.join(', ') : 'Global'}
                          </div>
                          <div style={{ fontSize: 12.5, color: 'var(--ink-mid)' }}>
                            Stakeholders: {(item.applies_to_stakeholders ?? []).length ? item.applies_to_stakeholders?.join(', ') : 'Global'}
                          </div>
                          <div style={{ fontSize: 12.5, color: 'var(--ink-mid)' }}>
                            Departments: {(item.visible_to_departments ?? []).length ? item.visible_to_departments?.join(', ') : 'All'}
                          </div>
                          <div style={{ fontSize: 12.5, color: 'var(--ink-mid)' }}>
                            Tags: {(item.tags ?? []).length ? item.tags?.join(', ') : '—'}
                          </div>
                        </div>
                      </td>
                      <td style={{ minWidth: 180 }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                          <div style={{ fontSize: 12.5, textTransform: 'capitalize' }}>{item.source_kind}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-soft)', wordBreak: 'break-word' }}>
                            {item.source_filename ?? 'Manual entry'}
                          </div>
                          {item.source_file_url && (
                            <a href={resolveSourceUrl(item.source_file_url) ?? item.source_file_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--blue-700)' }}>
                              Open source
                            </a>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'grid', gap: 6 }}>
                          <span className={badgeClass(item.is_active)}>
                            {item.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                            {item.parser_provider ?? 'manual'} · {item.parser_status ?? 'manual'}
                          </div>
                        </div>
                      </td>
                      <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {fmtDateTime(item.updated_at)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(item)}>
                            Edit
                          </button>
                          <button className="btn btn-outline btn-sm" onClick={() => toggleItem(item)}>
                            {item.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteItem(item)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {(creating || editingItem) && (
        <Modal
          title={creating ? 'Add Library Item' : `Edit ${editingItem?.title}`}
          subtitle={creating
            ? wizardStep === 'upload'
              ? 'Upload a file first. We will convert it into markdown and store that parsed text in Postgres.'
              : 'Now fill the guided metadata form, or let the LLM refine the item classification.'
            : 'Edit the item metadata or replace the markdown copy that powers prompt assembly.'}
          onClose={closeModal}
          size="lg"
          footer={(
            <>
              <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
              {creating && wizardStep === 'upload' ? (
                <button
                  className="btn btn-primary"
                  onClick={parseSource}
                  disabled={analyzing || (sourceMode === 'upload' ? !file : !selectedDriveFileId)}
                >
                  {analyzing ? 'Parsing…' : 'Convert to .md'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={save} disabled={saving || analyzing}>
                  {saving || analyzing ? 'Working…' : 'Save Item'}
                </button>
              )}
            </>
          )}
        >
          <div style={{ display: 'grid', gap: 16 }}>
            {creating && wizardStep === 'upload' ? (
              <>
                <div className="form-group">
                  <label className="form-label">Source Type</label>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`btn btn-outline btn-sm${sourceMode === 'upload' ? ' active' : ''}`}
                      onClick={() => {
                        setSourceMode('upload');
                        setSelectedDriveFileId('');
                      }}
                    >
                      Select from local
                    </button>
                    <button
                      type="button"
                      className={`btn btn-outline btn-sm${sourceMode === 'drive' ? ' active' : ''}`}
                      onClick={() => {
                        setSourceMode('drive');
                        setFile(null);
                      }}
                    >
                      Select from Drive
                    </button>
                    {sourceMode === 'upload' && (
                      <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>
                        Default mode
                      </span>
                    )}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: 'var(--ink-mid)' }}>
                    <input
                      type="checkbox"
                      checked={archiveSource}
                      onChange={e => setArchiveSource(e.target.checked)}
                    />
                    Keep original source file as optional archive
                  </label>
                </div>
                <div className="form-group">
                  {sourceMode === 'upload' ? (
                    <>
                      <label className="form-label">Source File</label>
                      <input
                        className="form-input"
                        type="file"
                        accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                        onChange={e => setFile(e.target.files?.[0] ?? null)}
                      />
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-soft)' }}>
                        Upload your knowledge base source here. We will convert it into markdown first.
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="form-label">Google Drive File</label>
                      <div style={{ display: 'grid', gap: 10 }}>
                        {!driveConnected ? (
                          <div className="profile-note">
                            Your Google Drive is not connected yet. Connect it from Profile first, then come back here to pick a file.
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', gap: 10 }}>
                              <input
                                className="form-input"
                                placeholder="Search Drive files"
                                value={driveQuery}
                                onChange={e => setDriveQuery(e.target.value)}
                              />
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => {
                                  setDriveLoading(true);
                                  usersApi.googleDriveFiles(driveQuery.trim() || undefined)
                                    .then(({ data }) => setDriveFiles(data))
                                    .finally(() => setDriveLoading(false));
                                }}
                              >
                                Search
                              </button>
                            </div>
                            {driveLoading ? (
                              <div style={{ padding: '12px 0' }}>
                                <Spinner />
                              </div>
                            ) : driveFiles.length === 0 ? (
                              <div className="profile-note">No Drive files found.</div>
                            ) : (
                              <div style={{ display: 'grid', gap: 8, maxHeight: 240, overflow: 'auto' }}>
                                {driveFiles.map(fileItem => (
                                  <button
                                    key={fileItem.id}
                                    type="button"
                                    onClick={() => setSelectedDriveFileId(fileItem.id)}
                                    style={{
                                      textAlign: 'left',
                                      border: selectedDriveFileId === fileItem.id ? '1px solid var(--green-500)' : '1px solid var(--border)',
                                      background: 'var(--surface)',
                                      color: 'var(--ink)',
                                      borderRadius: 14,
                                      padding: '12px 14px',
                                      display: 'grid',
                                      gap: 4,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <div style={{ fontWeight: 600 }}>{fileItem.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                                      {fileItem.mime_type}
                                      {fileItem.size_bytes ? ` · ${Math.round(fileItem.size_bytes / 1024)} KB` : ''}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                            {selectedDriveFileId && (
                              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                                Selected file is ready to convert into markdown.
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Optional Title</label>
                  <input
                    className="form-input"
                    value={form.title}
                    onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g. Founder story, school proof point, policy note"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Optional Description</label>
                  <textarea
                    className="form-textarea"
                    value={form.description}
                    onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                    style={{ minHeight: 84 }}
                    placeholder="Short note about what this source contains."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Source Link</label>
                  <input
                    className="form-input"
                    type="url"
                    value={form.source_file_url}
                    onChange={e => setForm(prev => ({ ...prev, source_file_url: e.target.value }))}
                    placeholder="https://..."
                  />
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-soft)' }}>
                    Optional link so Open source works even for manually added items.
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input
                    className="form-input"
                    value={form.title}
                    onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g. Founder story or school proof point"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Section Key</label>
                    <input
                      className="form-input"
                      value={form.section_key}
                      onChange={e => setForm(prev => ({ ...prev, section_key: e.target.value }))}
                      placeholder="e.g. proof_points"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Section Label</label>
                    <input
                      className="form-input"
                      value={form.section_label}
                      onChange={e => setForm(prev => ({ ...prev, section_label: e.target.value }))}
                      placeholder="e.g. Proof Points"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-textarea"
                    value={form.description}
                    onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                    style={{ minHeight: 84 }}
                    placeholder="Short founder-facing summary of what this item contributes."
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Source Link</label>
                  <input
                    className="form-input"
                    type="url"
                    value={form.source_file_url}
                    onChange={e => setForm(prev => ({ ...prev, source_file_url: e.target.value }))}
                    placeholder="https://..."
                  />
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-soft)' }}>
                    Optional. If you paste a link, Open source will use it.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Markdown Content</label>
                  <textarea
                    className="form-textarea"
                    value={form.content_markdown}
                    onChange={e => setForm(prev => ({ ...prev, content_markdown: e.target.value }))}
                    style={{ minHeight: 220, fontFamily: 'DM Mono, monospace', fontSize: 12.5, lineHeight: 1.6 }}
                    placeholder="Parsed markdown or hand-written knowledge text."
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Applies to Doc Types</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <button
                        type="button"
                        className={`btn btn-outline btn-sm${selectedDocTypes.length === 0 ? ' active' : ''}`}
                        onClick={() => setForm(prev => ({ ...prev, applies_to_doc_types: '' }))}
                      >
                        All
                      </button>
                      {docTypeOptions.map(option => {
                        const active = selectedDocTypes.includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={`btn btn-outline btn-sm${active ? ' active' : ''}`}
                            onClick={() => setForm(prev => ({
                              ...prev,
                              applies_to_doc_types: toggleChoiceList(prev.applies_to_doc_types, option.value),
                            }))}
                          >
                            {active ? '✓ ' : ''}
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-soft)' }}>
                      Leave empty to make the item visible to all doc types.
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Applies to Stakeholders</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <button
                        type="button"
                        className={`btn btn-outline btn-sm${selectedStakeholders.length === 0 ? ' active' : ''}`}
                        onClick={() => setForm(prev => ({ ...prev, applies_to_stakeholders: '' }))}
                      >
                        All
                      </button>
                      {stakeholderOptions.map(option => {
                        const active = selectedStakeholders.includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={`btn btn-outline btn-sm${active ? ' active' : ''}`}
                            onClick={() => setForm(prev => ({
                              ...prev,
                              applies_to_stakeholders: toggleChoiceList(prev.applies_to_stakeholders, option.value),
                            }))}
                          >
                            {active ? '✓ ' : ''}
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-soft)' }}>
                      Leave empty to make the item visible to all stakeholders.
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Visible to Departments</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {DEPARTMENT_OPTIONS.map(option => {
                      const active = parseCsv(form.visible_to_departments).includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`btn btn-outline btn-sm${active ? ' active' : ''}`}
                          onClick={() => setForm(prev => ({
                            ...prev,
                            visible_to_departments: toggleDepartmentList(prev.visible_to_departments, option.value),
                          }))}
                        >
                          {active ? '✓ ' : ''}
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-soft)' }}>
                    Leave empty to make the item visible to all departments.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Tags</label>
                    <input
                      className="form-input"
                      value={form.tags}
                      onChange={e => setForm(prev => ({ ...prev, tags: e.target.value }))}
                      placeholder="fees, proof, school, credibility"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sort Order</label>
                    <input
                      className="form-input"
                      type="number"
                      value={form.sort_order}
                      onChange={e => setForm(prev => ({ ...prev, sort_order: Number(e.target.value) }))}
                    />
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-mid)' }}>
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
                  />
                  Active in prompt matching
                </label>
              </>
            )}

            {wizardStep === 'metadata' && editingItem?.intake_analysis && (
              <div style={{
                border: '1px solid var(--line)',
                borderRadius: 16,
                padding: 16,
                background: 'rgba(255, 255, 255, 0.02)',
                display: 'grid',
                gap: 12,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-soft)' }}>
                      LLM Intake Analysis
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
                      {editingItem.intake_analysis.content_kind}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    Confidence {(editingItem.intake_analysis.confidence * 100).toFixed(0)}%
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
                  {editingItem.intake_analysis.summary}
                </div>
                <div style={{ display: 'grid', gap: 8, fontSize: 13, color: 'var(--ink-mid)' }}>
                  <div><strong>Suggested title:</strong> {editingItem.intake_analysis.inferred_title ?? 'No suggestion'}</div>
                  <div><strong>Suggested section:</strong> {editingItem.intake_analysis.inferred_section_label ?? 'No suggestion'}</div>
                  <div><strong>Suggested doc types:</strong> {editingItem.intake_analysis.recommended_doc_types.join(', ') || 'None'}</div>
                  <div><strong>Suggested stakeholders:</strong> {editingItem.intake_analysis.recommended_stakeholders.join(', ') || 'None'}</div>
                  <div><strong>Suggested tags:</strong> {editingItem.intake_analysis.recommended_tags.join(', ') || 'None'}</div>
                </div>
                {editingItem.intake_analysis.clarifying_questions.length > 0 && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Clarifying questions</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-mid)', fontSize: 13, lineHeight: 1.6 }}>
                      {editingItem.intake_analysis.clarifying_questions.map(question => (
                        <li key={question}>{question}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {editingItem.intake_analysis.clarifying_questions.length > 0 && (
                  <div style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.03)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Founder answers</div>
                    <textarea
                      className="form-textarea"
                      value={llmGuidance}
                      onChange={e => setLlmGuidance(e.target.value)}
                      style={{ minHeight: 120 }}
                      placeholder="Answer the questions above, add any missing context, and explain how you want this item classified."
                    />
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        onClick={() => editingItem && analyzeItem(editingItem, { founder_instructions: llmGuidance.trim() || null, auto_only: false })}
                        disabled={analyzing}
                      >
                        {analyzing ? 'Analyzing…' : 'Apply answers & re-run'}
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        type="button"
                        onClick={() => editingItem && analyzeItem(editingItem, { auto_only: true })}
                        disabled={analyzing}
                      >
                        {analyzing ? 'Analyzing…' : 'Run automatically'}
                      </button>
                    </div>
                  </div>
                )}
                {editingItem.intake_analysis.notes && (
                  <div style={{ fontSize: 13, color: 'var(--ink-mid)' }}>
                    <strong>Notes:</strong> {editingItem.intake_analysis.notes}
                  </div>
                )}
                {editingItem.intake_conversation?.length ? (
                  <div style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.03)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Conversation history</div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {editingItem.intake_conversation.map((message, index) => (
                        <div
                          key={`${message.created_at ?? 'msg'}-${index}`}
                          style={{
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            padding: '10px 12px',
                            background: message.role === 'user' ? 'rgba(255, 105, 135, 0.05)' : 'rgba(255, 255, 255, 0.05)',
                            display: 'grid',
                            gap: 6,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-soft)' }}>
                            <strong style={{ color: 'var(--ink)' }}>{formatConversationRole(message.role)}</strong>
                            <span>{message.created_at ? fmtDateTime(message.created_at) : ''}</span>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--ink-mid)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                            {message.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.03)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Founder guidance</div>
                  <textarea
                    className="form-textarea"
                    value={llmGuidance}
                    onChange={e => setLlmGuidance(e.target.value)}
                    style={{ minHeight: 120 }}
                    placeholder="Add any fresh guidance, corrections, or classification rules you want the LLM to follow on the next pass."
                  />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() => editingItem && analyzeItem(editingItem, { founder_instructions: llmGuidance.trim() || null, auto_only: false })}
                      disabled={analyzing || !llmGuidance.trim()}
                    >
                      {analyzing ? 'Analyzing…' : 'Use my guidance'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    type="button"
                    onClick={regenerateFromEdits}
                    disabled={saving || analyzing}
                  >
                    {saving || analyzing ? 'Working…' : 'Save & regenerate'}
                  </button>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                  Use the main save action to keep your metadata changes, or rerun the analysis from the section above.
                </div>
              </div>
            )}

            {wizardStep === 'metadata' && editingItem && !editingItem.intake_analysis && (
              <div className="empty-state" style={{ marginTop: 4 }}>
                <div className="empty-state-title">Metadata not analyzed yet</div>
                <div className="empty-state-desc">Run analysis after parsing so the LLM can classify this item and suggest the right library metadata.</div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">LLM Guidance</label>
                      <textarea
                        className="form-textarea"
                        value={llmGuidance}
                        onChange={e => setLlmGuidance(e.target.value)}
                        style={{ minHeight: 120 }}
                        placeholder="Explain what this source is, what to pay attention to, what it should be classified as, or any special logic the LLM should follow."
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button className="btn btn-primary btn-sm" type="button" onClick={() => editingItem && analyzeItem(editingItem, { auto_only: true })} disabled={analyzing}>
                        {analyzing ? 'Analyzing…' : 'Run automatically'}
                      </button>
                      <button className="btn btn-outline btn-sm" type="button" onClick={() => editingItem && analyzeItem(editingItem, { founder_instructions: llmGuidance.trim() || null, auto_only: false })} disabled={analyzing}>
                        {analyzing ? 'Analyzing…' : 'Use my guidance'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
