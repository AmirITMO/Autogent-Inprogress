import React, { useEffect, useState } from 'react';
import { api, clearToken } from '../api';
import { AuthUser, TagPreset } from '../types';
import styles from './ProfilePanel.module.css';

interface Props {
  user: AuthUser;
  onUserUpdate: (u: AuthUser) => void;
  onClose: () => void;
}

export default function ProfilePanel({ user, onUserUpdate, onClose }: Props) {
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMsg, setPromoMsg] = useState('');

  const [apifyToken, setApifyToken] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [keysLoading, setKeysLoading] = useState(false);
  const [keysMsg, setKeysMsg] = useState('');

  const [sheetId, setSheetId] = useState(user.settings.googleSheetId || '');
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetMsg, setSheetMsg] = useState('');

  const [presets, setPresets] = useState<TagPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem('tagPresets') || '[]'); } catch { return []; }
  });
  const [presetName, setPresetName] = useState('');
  const [presetHashtags, setPresetHashtags] = useState('');
  const [presetKeywords, setPresetKeywords] = useState('');

  function savePresets(updated: TagPreset[]) {
    setPresets(updated);
    localStorage.setItem('tagPresets', JSON.stringify(updated));
  }

  function createPreset() {
    if (!presetName.trim()) return;
    const newPreset: TagPreset = {
      id: Math.random().toString(36).slice(2),
      name: presetName.trim(),
      hashtags: presetHashtags.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean),
      keywords: presetKeywords.split('\n').map(s => s.trim()).filter(Boolean),
    };
    savePresets([...presets, newPreset]);
    setPresetName('');
    setPresetHashtags('');
    setPresetKeywords('');
  }

  function deletePreset(id: string) {
    savePresets(presets.filter(p => p.id !== id));
  }

  const [serviceEmail, setServiceEmail] = useState(user.settings.serviceAccountEmail || '');

  useEffect(() => {
    api('/api/settings').then(r => r.json()).then(d => {
      if (d.serviceAccountEmail) setServiceEmail(d.serviceAccountEmail);
    }).catch(() => {});
  }, []);

  async function activatePromo() {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoMsg('');
    try {
      const res = await api('/api/promo/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      setPromoMsg('Подписка активирована');
      setPromoCode('');
      const meRes = await api('/api/auth/me');
      const me: AuthUser = await meRes.json();
      onUserUpdate(me);
    } catch (e: unknown) {
      setPromoMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setPromoLoading(false);
    }
  }

  async function saveKeys() {
    setKeysLoading(true);
    setKeysMsg('');
    try {
      const body: Record<string, string> = {};
      if (apifyToken) body.apifyToken = apifyToken;
      if (openaiKey) body.openaiKey = openaiKey;
      const res = await api('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      setKeysMsg('Сохранено');
      setApifyToken('');
      setOpenaiKey('');
      const meRes = await api('/api/auth/me');
      const me: AuthUser = await meRes.json();
      onUserUpdate(me);
    } catch (e: unknown) {
      setKeysMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setKeysLoading(false);
    }
  }

  async function saveSheet() {
    setSheetLoading(true);
    setSheetMsg('');
    try {
      const res = await api('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleSheetId: sheetId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      setSheetMsg('Сохранено');
      const meRes = await api('/api/auth/me');
      const me: AuthUser = await meRes.json();
      onUserUpdate(me);
    } catch (e: unknown) {
      setSheetMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSheetLoading(false);
    }
  }

  function logout() {
    clearToken();
    window.location.reload();
  }

  const subActive = user.subscription.active;
  const expiresAt = user.subscription.expiresAt
    ? new Date(user.subscription.expiresAt).toLocaleDateString('ru-RU')
    : null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Профиль · {user.username}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Подписка */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Подписка</h3>
            <div className={styles.subStatus}>
              {subActive ? (
                <span className={styles.subActive}>Активна до {expiresAt}</span>
              ) : (
                <span className={styles.subInactive}>Нет активной подписки</span>
              )}
            </div>
            <div className={styles.inlineRow}>
              <input
                className={styles.input}
                type="text"
                value={promoCode}
                onChange={e => setPromoCode(e.target.value)}
                placeholder="Промокод"
                onKeyDown={e => e.key === 'Enter' && activatePromo()}
              />
              <button className={styles.btn} onClick={activatePromo} disabled={promoLoading}>
                {promoLoading ? '...' : 'Активировать'}
              </button>
            </div>
            {promoMsg && (
              <div className={promoMsg === 'Подписка активирована' ? styles.msgOk : styles.msgErr}>
                {promoMsg}
              </div>
            )}
          </section>

          {/* API ключи */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>API ключи</h3>
            <div className={styles.field}>
              <label>
                Apify Token
                <span className={styles.keyStatus}>
                  {user.settings.hasApifyToken ? ' ✓ сохранён' : ' — не задан'}
                </span>
              </label>
              <input
                className={styles.input}
                type="password"
                value={apifyToken}
                onChange={e => setApifyToken(e.target.value)}
                placeholder="apify_api_..."
              />
            </div>
            <div className={styles.field}>
              <label>
                OpenAI API Key
                <span className={styles.keyStatus}>
                  {user.settings.hasOpenaiKey ? ' ✓ сохранён' : ' — не задан'}
                </span>
                <span className={styles.optional}> (опционально, для AI анализа)</span>
              </label>
              <input
                className={styles.input}
                type="password"
                value={openaiKey}
                onChange={e => setOpenaiKey(e.target.value)}
                placeholder="sk-proj-..."
              />
            </div>
            <button className={styles.btn} onClick={saveKeys} disabled={keysLoading}>
              {keysLoading ? '...' : 'Сохранить ключи'}
            </button>
            {keysMsg && (
              <div className={keysMsg === 'Сохранено' ? styles.msgOk : styles.msgErr}>
                {keysMsg}
              </div>
            )}
          </section>

          {/* Пресеты тегов */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Пресеты тегов</h3>

            {presets.length > 0 && (
              <div className={styles.presetList}>
                {presets.map(p => (
                  <div key={p.id} className={styles.presetItem}>
                    <div className={styles.presetInfo}>
                      <span className={styles.presetName}>🏷 {p.name}</span>
                      <span className={styles.presetMeta}>{p.hashtags.length} хэштегов · {p.keywords.length} ключевых слов</span>
                    </div>
                    <button className={styles.presetDeleteBtn} onClick={() => deletePreset(p.id)}>🗑</button>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.field}>
              <label>Название пресета</label>
              <input
                className={styles.input}
                type="text"
                value={presetName}
                onChange={e => setPresetName(e.target.value)}
                placeholder="Рилсмейкеры"
              />
            </div>
            <div className={styles.field}>
              <label>Хэштеги <span className={styles.optional}>(через запятую)</span></label>
              <textarea
                className={styles.input}
                value={presetHashtags}
                onChange={e => setPresetHashtags(e.target.value)}
                placeholder="reelsmaker, filmmaker, videographer"
                rows={2}
              />
            </div>
            <div className={styles.field}>
              <label>Ключевые слова <span className={styles.optional}>(каждое с новой строки)</span></label>
              <textarea
                className={styles.input}
                value={presetKeywords}
                onChange={e => setPresetKeywords(e.target.value)}
                placeholder="reels maker&#10;video editor reels"
                rows={3}
              />
            </div>
            <button className={styles.btn} onClick={createPreset} disabled={!presetName.trim()}>
              Создать пресет
            </button>
          </section>

          {/* Google Sheets */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Google Sheets</h3>
            <div className={styles.field}>
              <label>
                ID таблицы
                <span className={styles.keyStatus}>
                  {user.settings.googleSheetId ? ' ✓ сохранён' : ' — не задан'}
                </span>
              </label>
              <input
                className={styles.input}
                type="text"
                value={sheetId}
                onChange={e => setSheetId(e.target.value)}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              />
            </div>
            <button className={styles.btn} onClick={saveSheet} disabled={sheetLoading}>
              {sheetLoading ? '...' : 'Сохранить'}
            </button>
            {sheetMsg && (
              <div className={sheetMsg === 'Сохранено' ? styles.msgOk : styles.msgErr}>
                {sheetMsg}
              </div>
            )}

            {serviceEmail ? (
              <div className={styles.instruction}>
                <div className={styles.instrTitle}>📋 Как подключить Google Sheets</div>
                <ol className={styles.instrList}>
                  <li>Создайте Google таблицу на <a href="https://drive.google.com" target="_blank" rel="noopener noreferrer">drive.google.com</a></li>
                  <li>
                    Скопируйте ID из URL:
                    <div className={styles.instrCode}>drive.google.com/spreadsheets/d/<b>ВОТ_ЭТОТ_ID</b>/edit</div>
                  </li>
                  <li>
                    Нажмите "Поделиться" и дайте доступ этому email:
                    <div className={styles.instrEmail}>{serviceEmail}</div>
                    Права: <b>Редактор</b>
                  </li>
                  <li>Вставьте ID таблицы в поле выше и сохраните</li>
                </ol>
                <div className={styles.instrNote}>
                  После этого лиды будут автоматически добавляться в вашу таблицу после каждого парсинга.
                </div>
              </div>
            ) : (
              <div className={styles.instrNote} style={{ marginTop: 12 }}>
                Google Sheets интеграция не настроена на сервере.
              </div>
            )}
          </section>

          {/* Выход */}
          <section className={styles.section}>
            <button className={styles.logoutBtn} onClick={logout}>Выйти</button>
          </section>
        </div>
      </div>
    </div>
  );
}
