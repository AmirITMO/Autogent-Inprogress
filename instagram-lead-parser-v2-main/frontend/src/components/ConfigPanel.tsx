import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { TagPreset } from '../types';
import styles from './ConfigPanel.module.css';

const DEFAULT_HASHTAGS = [
  'creativedirector', 'artdirector', 'filmmaker', 'videographer',
  'cinematographer', 'motiondesigner', 'visualartist', 'videoeditor',
];

const DEFAULT_KEYWORDS = [
  'creative director',
  'art director',
  'filmmaker',
  'videographer',
  'vfx artist',
  'photographer director',
  'motion designer',
  'video editor reels',
  'cinematographer',
  'ad creative director',
  'режиссер',
  'художественный руководитель',
  'видеограф',
  'автор цифрового контента',
  'content creator reels',
  'video production',
  'reels maker',
];

interface Props {
  onJobStarted: (jobId: string) => void;
}

export default function ConfigPanel({ onJobStarted }: Props) {
  const [hashtagsText, setHashtagsText] = useState(DEFAULT_HASHTAGS.join(', '));
  const [keywordsText, setKeywordsText] = useState(DEFAULT_KEYWORDS.join('\n'));
  const [profilesPerQuery, setProfilesPerQuery] = useState(10);
  const [minScore, setMinScore] = useState(40);
  const [minReelsViews, setMinReelsViews] = useState(10000);
  const [minFollowers, setMinFollowers] = useState(20000);
  const [useMinFollowers, setUseMinFollowers] = useState(false);
  const [useMinReelsViews, setUseMinReelsViews] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [seenCount, setSeenCount] = useState(0);

  const [presets] = useState<TagPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem('tagPresets') || '[]'); } catch { return []; }
  });
  const [hashDragOver, setHashDragOver] = useState(false);
  const [kwDragOver, setKwDragOver] = useState(false);

  const refreshSeen = async () => {
    try {
      const r = await api('/api/seen-count');
      const d = await r.json();
      setSeenCount(d.count || 0);
    } catch { /* ignore */ }
  };

  useEffect(() => { refreshSeen(); }, []);

  const clearSeen = async () => {
    if (!window.confirm(`Удалить базу из ${seenCount} просканенных профилей? Они снова будут парситься.`)) return;
    try {
      await api('/api/seen', { method: 'DELETE' });
      await refreshSeen();
    } catch { /* ignore */ }
  };

  const hashtags = hashtagsText.split(/[,\n]/).map(s => s.trim().replace(/^#/, '')).filter(Boolean);
  const keywords = keywordsText.split('\n').map(s => s.trim()).filter(Boolean);

  function dropOnHashtags(e: React.DragEvent) {
    e.preventDefault();
    setHashDragOver(false);
    const id = e.dataTransfer.getData('presetId');
    const preset = presets.find(p => p.id === id);
    if (!preset) return;
    const existing = hashtagsText.split(/[,\n]/).map(s => s.trim().replace(/^#/, '')).filter(Boolean);
    const toAdd = preset.hashtags.filter(h => !existing.includes(h));
    if (toAdd.length) setHashtagsText(prev => prev.trimEnd() + (prev.trim() ? ', ' : '') + toAdd.join(', '));
  }

  function dropOnKeywords(e: React.DragEvent) {
    e.preventDefault();
    setKwDragOver(false);
    const id = e.dataTransfer.getData('presetId');
    const preset = presets.find(p => p.id === id);
    if (!preset) return;
    const existing = keywordsText.split('\n').map(s => s.trim()).filter(Boolean);
    const toAdd = preset.keywords.filter(k => !existing.includes(k));
    if (toAdd.length) setKeywordsText(prev => prev.trimEnd() + (prev.trim() ? '\n' : '') + toAdd.join('\n'));
  }

  // Apify актуальные цены (2025):
  // - instagram-search-scraper:  $0.80 / 1000 юзеров
  // - instagram-profile-scraper: $3.00 / 1000 профилей
  const SEARCH_PRICE_PER_1K = 0.80;
  const PROFILE_PRICE_PER_1K = 3.00;

  // Discovery: все запросы через user-search
  const discoveryResults = (hashtags.length + keywords.length) * profilesPerQuery;
  const discoveryCost = (discoveryResults / 1000) * SEARCH_PRICE_PER_1K;

  // Enrichment: ~75% проходят pre-filter по followers
  const estimatedProfiles = Math.round(discoveryResults * 0.75);
  const enrichmentCost = (estimatedProfiles / 1000) * PROFILE_PRICE_PER_1K;

  const apifyCost = (discoveryCost + enrichmentCost).toFixed(2);

  const qualifiedProfiles = Math.round(estimatedProfiles * 0.06);
  const finalLeads = Math.round(estimatedProfiles * 0.04);

  async function handleStart() {
    if (!hashtags.length && !keywords.length) { setError('Добавьте хэштеги или ключевые слова'); return; }
    setError('');
    setLoading(true);

    try {
      const res = await api('/api/parse/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hashtags, keywords, profilesPerQuery, minScore,
          minReelsViews: useMinReelsViews ? minReelsViews : 0,
          minFollowers: useMinFollowers ? minFollowers : 0,
          useAI,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onJobStarted(data.jobId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.left}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}># Хэштеги и ключевые слова</h2>
          {presets.length > 0 && (
            <div className={styles.presetsBlock}>
              <div className={styles.presetsLabel}>🏷 Пресеты <span className={styles.hint}>(перетащи на поле)</span></div>
              <div className={styles.presetChips}>
                {presets.map(p => (
                  <span
                    key={p.id}
                    className={styles.presetChip}
                    draggable
                    onDragStart={e => e.dataTransfer.setData('presetId', p.id)}
                  >
                    🏷 {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label>Хэштеги <span className={styles.hint}>(через запятую или новую строку)</span></label>
            <div
              className={`${styles.dropZone} ${hashDragOver ? styles.dropZoneOver : ''}`}
              onDragOver={e => { e.preventDefault(); setHashDragOver(true); }}
              onDragLeave={() => setHashDragOver(false)}
              onDrop={dropOnHashtags}
            >
              <textarea
                value={hashtagsText}
                onChange={e => setHashtagsText(e.target.value)}
                className={styles.textarea}
                rows={5}
                placeholder="visualartist, creativedirector, filmmaker..."
              />
            </div>
            <div className={styles.fieldMeta}>{hashtags.length} хэштегов</div>
          </div>
          <div className={styles.field}>
            <label>Ключевые слова <span className={styles.hint}>(каждое с новой строки)</span></label>
            <div
              className={`${styles.dropZone} ${kwDragOver ? styles.dropZoneOver : ''}`}
              onDragOver={e => { e.preventDefault(); setKwDragOver(true); }}
              onDragLeave={() => setKwDragOver(false)}
              onDrop={dropOnKeywords}
            >
              <textarea
                value={keywordsText}
                onChange={e => setKeywordsText(e.target.value)}
                className={styles.textarea}
                rows={4}
                placeholder="visual artist creative director&#10;режиссер художественный руководитель"
              />
            </div>
            <div className={styles.fieldMeta}>{keywords.length} ключевых слов</div>
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>⚙ Настройки парсинга</h2>

          <div className={styles.slider}>
            <div className={styles.sliderHeader}>
              <span>Профилей на запрос</span>
              <span className={styles.sliderVal}>{profilesPerQuery}</span>
            </div>
            <input type="range" min={5} max={100} value={profilesPerQuery}
              onChange={e => setProfilesPerQuery(+e.target.value)} className={styles.range} />
            <div className={styles.sliderHints}><span>5</span><span>больше = больше охват</span><span>100</span></div>
          </div>

          <div className={styles.slider}>
            <div className={styles.sliderHeader}>
              <label className={styles.optionalToggle}>
                <input type="checkbox" checked={useMinFollowers} onChange={e => setUseMinFollowers(e.target.checked)} />
                <span>Мин. подписчиков</span>
              </label>
              {useMinFollowers && <span className={styles.sliderVal}>{minFollowers.toLocaleString()}</span>}
            </div>
            {useMinFollowers && (
              <>
                <input type="range" min={1000} max={500000} step={1000} value={minFollowers}
                  onChange={e => setMinFollowers(+e.target.value)} className={styles.range} />
                <div className={styles.sliderHints}><span>1к</span><span>рекомендуется 20к+</span><span>500к</span></div>
              </>
            )}
          </div>

          <div className={styles.slider}>
            <div className={styles.sliderHeader}>
              <label className={styles.optionalToggle}>
                <input type="checkbox" checked={useMinReelsViews} onChange={e => setUseMinReelsViews(e.target.checked)} />
                <span>Мин. просмотров Reels <span className={styles.hint}>(среднее)</span></span>
              </label>
              {useMinReelsViews && <span className={styles.sliderVal}>{minReelsViews.toLocaleString()}</span>}
            </div>
            {useMinReelsViews && (
              <>
                <input type="range" min={0} max={100000} step={1000} value={minReelsViews}
                  onChange={e => setMinReelsViews(+e.target.value)} className={styles.range} />
                <div className={styles.sliderHints}><span>0</span><span>10к рекомендуется</span><span>100к</span></div>
              </>
            )}
          </div>

          <div className={styles.slider}>
            <div className={styles.sliderHeader}>
              <span>Мин. оценка лида</span>
              <span className={styles.sliderVal}>{minScore}</span>
            </div>
            <input type="range" min={20} max={85} value={minScore}
              onChange={e => setMinScore(+e.target.value)} className={styles.range} />
            <div className={styles.sliderHints}><span>20</span><span>выше = строже</span><span>85</span></div>
          </div>

          <div className={styles.toggle}>
            <label className={styles.toggleLabel}>
              <div
                className={`${styles.toggleSwitch} ${useAI ? styles.toggleOn : ''}`}
                onClick={() => setUseAI(v => !v)}
              >
                <div className={styles.toggleThumb} />
              </div>
              <span>🤖 AI анализ</span>
              <span className={styles.toggleSub}>GPT-4o-mini верификация каждого лида</span>
            </label>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button
          className={styles.startBtn}
          onClick={handleStart}
          disabled={loading}
        >
          {loading ? '⏳ Запуск...' : '▶ Запустить парсер'}
        </button>
      </div>

      <div className={styles.right}>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>🗃 База просканенных</h3>
          <div className={styles.costRow}>
            <span>Профилей в базе</span>
            <span className={styles.costVal}>{seenCount.toLocaleString()}</span>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
            Эти профили не будут парситься повторно.
          </div>
          {seenCount > 0 && (
            <button onClick={clearSeen} style={{
              marginTop: 10, width: '100%', background: 'rgba(244,63,94,0.1)',
              border: '1px solid rgba(244,63,94,0.3)', color: '#f43f5e',
              borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer',
            }}>🗑 Очистить базу</button>
          )}
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>💳 Нужно на Apify</h3>
          <div style={{
            fontSize: 28, fontWeight: 700, color: '#4ade80',
            textAlign: 'center', padding: '8px 0', lineHeight: 1,
          }}>
            ${apifyCost}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginBottom: 10 }}>
            минимальный баланс на запуск
          </div>
          <div className={styles.costRow}>
            <span>User-search ({discoveryResults.toLocaleString()} рез.) × $0.80/1k</span>
            <span className={styles.costVal}>${discoveryCost.toFixed(2)}</span>
          </div>
          <div className={styles.costRow}>
            <span>Обогащение (~{estimatedProfiles} проф.)</span>
            <span className={styles.costVal}>${enrichmentCost.toFixed(2)}</span>
          </div>
          <div className={styles.costRow} style={{ marginTop: 6, borderTop: '1px solid #1e1e35', paddingTop: 6 }}>
            <span style={{ color: '#94a3b8' }}>Цена за лид (~{finalLeads} лидов)</span>
            <span className={styles.costVal}>{finalLeads > 0 ? `$${(parseFloat(apifyCost) / finalLeads).toFixed(2)}` : '—'}</span>
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 8, lineHeight: 1.4 }}>
            Search: $0.80/1k · Profile: $3.00/1k · ~$0.035 за лид
          </div>
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>📊 Оценка объёма</h3>
          <div className={styles.statRow}><span>Запросов Apify</span><span>{hashtags.length + keywords.length}</span></div>
          <div className={styles.statRow}><span>Результатов на запрос</span><span>{profilesPerQuery}</span></div>
          <div className={styles.statRow}><span>Всего результатов</span><span>~{discoveryResults.toLocaleString()}</span></div>
          <div className={styles.statRow}><span>Уник. профилей</span><span>~{estimatedProfiles.toLocaleString()}</span></div>
          <div className={styles.statRow}><span>Пройдут квалификацию</span><span>~{qualifiedProfiles.toLocaleString()}</span></div>
          <div className={`${styles.statRow} ${styles.statHighlight}`}>
            <span>Финальных лидов</span>
            <span>~{finalLeads}</span>
          </div>
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>✨ Критерии качества</h3>
          <ul className={styles.criteriaList}>
            <li className={styles.criteriaItem}>
              <span className={styles.dot} />
              Креативный профессионал (режиссёр, арт-директор, оператор, дизайнер)
            </li>
            {useMinFollowers && (
              <li className={styles.criteriaItem}>
                <span className={styles.dot} />
                Минимум {minFollowers.toLocaleString()} подписчиков (жёсткий фильтр)
              </li>
            )}
            <li className={styles.criteriaItem}>
              <span className={styles.dot} />
              {useMinReelsViews ? `Среднее по Reels ≥ ${minReelsViews.toLocaleString()} просмотров` : 'Просмотры Reels — без ограничений'}
            </li>
            <li className={styles.criteriaItem}>
              <span className={styles.dot} />
              Поиск Telegram и Email в профиле
            </li>
            <li className={styles.criteriaItem}>
              <span className={styles.dot} />
              Дедупликация — повторные лиды не попадают
            </li>
            {useAI && (
              <li className={styles.criteriaItem}>
                <span className={styles.dotPurple} />
                AI проверка каждого лида (GPT-4o-mini)
              </li>
            )}
          </ul>
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>📋 Экспорт в Excel</h3>
          <div className={styles.exportCols}>
            {['Instagram', 'Подписчики', 'Telegram', 'Email', 'Теги', 'Описание', 'Активность', 'Tier', 'Score'].map(col => (
              <span key={col} className={styles.exportCol}>{col}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
