import React, { useState } from 'react';
import { Lead } from '../types';
import styles from './LeadsTable.module.css';

interface Props {
  leads: Lead[];
  jobId: string;
}

const TIER_COLOR = { A: '#4ade80', B: '#facc15', C: '#94a3b8' };

export default function LeadsTable({ leads, jobId }: Props) {
  const [filter, setFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'followers' | 'avgViews'>('score');

  const filtered = leads
    .filter(l => filter === 'all' || l.tier === filter)
    .filter(l =>
      !search ||
      l.username.toLowerCase().includes(search.toLowerCase()) ||
      l.fullName.toLowerCase().includes(search.toLowerCase()) ||
      l.bio.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'score') return b.score - a.score;
      if (sortBy === 'followers') return b.followersCount - a.followersCount;
      return b.avgReelsViews - a.avgReelsViews;
    });

  const tierCounts = { A: leads.filter(l => l.tier === 'A').length, B: leads.filter(l => l.tier === 'B').length, C: leads.filter(l => l.tier === 'C').length };

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {(['all', 'A', 'B', 'C'] as const).map(t => (
            <button
              key={t}
              className={`${styles.filterBtn} ${filter === t ? styles.filterActive : ''}`}
              onClick={() => setFilter(t)}
            >
              {t === 'all' ? `Все (${leads.length})` : `Tier ${t} (${tierCounts[t]})`}
            </button>
          ))}
        </div>
        <div className={styles.right}>
          <input
            className={styles.search}
            placeholder="Поиск по имени, нику..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className={styles.sort}
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="score">По оценке</option>
            <option value="followers">По подписчикам</option>
            <option value="avgViews">По просмотрам</option>
          </select>
          <a
            href={`/api/parse/${jobId}/export`}
            className={styles.exportBtn}
            download
          >
            ⬇ Скачать Excel
          </a>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Профиль</th>
              <th>Описание</th>
              <th>Теги</th>
              <th>Контакты</th>
              <th>Подписчики</th>
              <th>Avg Reels</th>
              <th>Tier</th>
              <th>Score</th>
              <th>AI</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead, i) => (
              <tr key={lead.id} className={styles.row}>
                <td className={styles.num}>{i + 1}</td>
                <td className={styles.profile}>
                  <a
                    href={lead.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.profileLink}
                  >
                    @{lead.username}
                  </a>
                  {lead.fullName && (
                    <div className={styles.profileName}>{lead.fullName}</div>
                  )}
                  {lead.businessCategory && (
                    <div className={styles.bioMeta}>{lead.businessCategory}</div>
                  )}
                </td>
                <td className={styles.desc}>
                  {lead.aiAnalysis?.description ? (
                    <div className={styles.aiDesc}>{lead.aiAnalysis.description}</div>
                  ) : null}
                  {lead.bio && (
                    <div className={styles.bio}>{lead.bio}</div>
                  )}
                  {lead.externalUrl && (
                    <a href={lead.externalUrl} target="_blank" rel="noopener noreferrer" className={styles.extUrl}>
                      🔗 {lead.externalUrl.replace(/^https?:\/\//, '').slice(0, 40)}
                    </a>
                  )}
                </td>
                <td className={styles.tags}>
                  {lead.foundByTags.slice(0, 3).map(tag => (
                    <span key={tag} className={styles.tag}>{tag}</span>
                  ))}
                </td>
                <td className={styles.contacts}>
                  {lead.contact.telegram && (
                    <a href={lead.contact.telegram} target="_blank" rel="noopener noreferrer" className={styles.contactLink} title={lead.contact.telegram}>
                      TG
                    </a>
                  )}
                  {lead.contact.email && (
                    <a href={`mailto:${lead.contact.email}`} className={styles.contactLink} title={lead.contact.email}>
                      @
                    </a>
                  )}
                  {lead.contact.phone && (
                    <a href={`tel:${lead.contact.phone.replace(/\D/g, '')}`} className={styles.contactLink} title={lead.contact.phone}>
                      ☎
                    </a>
                  )}
                  {!lead.contact.telegram && !lead.contact.email && !lead.contact.phone && (
                    <span className={styles.noContact}>—</span>
                  )}
                </td>
                <td className={styles.num}>{lead.followersCount.toLocaleString()}</td>
                <td className={styles.num}>
                  {lead.avgReelsViews > 0 ? lead.avgReelsViews.toLocaleString() : '—'}
                </td>
                <td>
                  <span
                    className={styles.tier}
                    style={{ color: TIER_COLOR[lead.tier], borderColor: TIER_COLOR[lead.tier] }}
                  >
                    {lead.tier}
                  </span>
                </td>
                <td className={styles.score}>{lead.score}</td>
                <td className={styles.ai}>
                  {lead.aiAnalysis ? (
                    <div className={`${styles.aiBadge} ${lead.aiAnalysis.isGoodLead ? styles.aiGood : styles.aiBad}`}>
                      {lead.aiAnalysis.isGoodLead ? '✓' : '✗'}
                      <span>{Math.round(lead.aiAnalysis.confidence * 100)}%</span>
                    </div>
                  ) : (
                    <span className={styles.aiNone}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className={styles.empty}>Нет лидов по выбранным фильтрам</div>
      )}
    </div>
  );
}
