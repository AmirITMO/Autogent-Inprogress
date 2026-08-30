import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { StoredLead } from '../types';
import styles from './MyLeadsPage.module.css';

export default function MyLeadsPage() {
  const [leads, setLeads] = useState<StoredLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [importMsg, setImportMsg] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    setLoading(true);
    try {
      const r = await api('/api/my-leads');
      const d = await r.json();
      setLeads(d.leads || d || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  async function deleteLead(id: string) {
    setLeads(prev => prev.filter(l => l.id !== id));
    await api(`/api/my-leads/${id}`, { method: 'DELETE' });
  }

  async function clearAll() {
    if (!window.confirm('Удалить все сохранённые лиды?')) return;
    setLeads([]);
    await api('/api/my-leads', { method: 'DELETE' });
  }

  async function importXlsx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    setImportMsg('');
    try {
      const { getToken } = await import('../api');
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/seen/import-xlsx', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Ошибка');
      setImportMsg(`Добавлено в список пропуска: ${d.imported} аккаунтов`);
    } catch (e: unknown) {
      setImportMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  async function toggleField(id: string, field: 'contacted' | 'replied' | 'called') {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, [field]: !l[field] } : l));
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    await api(`/api/my-leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !lead[field] }),
    });
  }

  const filtered = leads.filter(l => {
    const q = search.toLowerCase();
    const matchSearch = !q || l.username.toLowerCase().includes(q) ||
      (l.fullName || '').toLowerCase().includes(q) ||
      (l.bio || '').toLowerCase().includes(q);
    const matchTier = tierFilter === 'all' || l.tier === tierFilter;
    return matchSearch && matchTier;
  });

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="text"
          placeholder="Поиск по username, имени, bio..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className={styles.tierBtns}>
          {(['all', 'A', 'B', 'C'] as const).map(t => (
            <button
              key={t}
              className={`${styles.tierBtn} ${tierFilter === t ? styles.tierBtnActive : ''}`}
              onClick={() => setTierFilter(t)}
            >
              {t === 'all' ? 'Все' : `Tier ${t}`}
            </button>
          ))}
        </div>
        <div className={styles.spacer} />
        <span className={styles.count}>{filtered.length} лидов</span>
        <label className={styles.importBtn} title="Загрузить XLSX с Instagram-ссылками — аккаунты попадут в список пропуска">
          {importing ? '...' : '⬆ Импорт XLSX'}
          <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={importXlsx} disabled={importing} />
        </label>
        {leads.length > 0 && (
          <button className={styles.clearBtn} onClick={clearAll}>🗑 Очистить всё</button>
        )}
      </div>
      {importMsg && (
        <div className={importMsg.startsWith('Добавлено') ? styles.importOk : styles.importErr}>
          {importMsg}
        </div>
      )}

      {loading ? (
        <div className={styles.empty}>Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>Нет лидов{search || tierFilter !== 'all' ? ' по фильтру' : ''}</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Профиль</th>
                <th>Bio</th>
                <th>Подписчики</th>
                <th>Tier / Score</th>
                <th>Написал</th>
                <th>Ответил</th>
                <th>Созвонился</th>
                <th>Добавлен</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead, idx) => (
                <tr key={lead.id} className={idx % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                  <td className={styles.num}>{idx + 1}</td>
                  <td className={styles.profileCell}>
                    <a
                      href={lead.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.username}
                    >
                      @{lead.username}
                    </a>
                    {lead.fullName && <div className={styles.fullName}>{lead.fullName}</div>}
                  </td>
                  <td className={styles.bioCell}>
                    {lead.bio ? lead.bio.slice(0, 100) + (lead.bio.length > 100 ? '…' : '') : '—'}
                  </td>
                  <td className={styles.numCell}>{lead.followersCount?.toLocaleString() || '—'}</td>
                  <td className={styles.tierCell}>
                    <span className={`${styles.tier} ${styles['tier' + lead.tier]}`}>{lead.tier}</span>
                    <span className={styles.score}>{lead.score}</span>
                  </td>
                  <td className={styles.checkCell}>
                    <input
                      type="checkbox"
                      className={styles.check}
                      checked={lead.contacted}
                      onChange={() => toggleField(lead.id, 'contacted')}
                    />
                  </td>
                  <td className={styles.checkCell}>
                    <input
                      type="checkbox"
                      className={styles.check}
                      checked={lead.replied}
                      onChange={() => toggleField(lead.id, 'replied')}
                    />
                  </td>
                  <td className={styles.checkCell}>
                    <input
                      type="checkbox"
                      className={styles.check}
                      checked={lead.called}
                      onChange={() => toggleField(lead.id, 'called')}
                    />
                  </td>
                  <td className={styles.dateCell}>
                    {lead.savedAt ? new Date(lead.savedAt).toLocaleDateString('ru-RU') : '—'}
                  </td>
                  <td className={styles.deleteCell}>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => deleteLead(lead.id)}
                      title="Удалить"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
