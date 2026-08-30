import React, { useEffect, useState } from 'react';
import { api, getToken } from './api';
import { AuthUser, Lead, JobStatus } from './types';
import AuthPage from './components/AuthPage';
import ConfigPanel from './components/ConfigPanel';
import JobPanel from './components/JobPanel';
import LeadsTable from './components/LeadsTable';
import ProfilePanel from './components/ProfilePanel';
import MyLeadsPage from './components/MyLeadsPage';
import styles from './App.module.css';

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tab, setTab] = useState<'config' | 'leads' | 'myleads'>('config');

  useEffect(() => {
    if (!authed) return;
    api('/api/auth/me').then(r => r.json()).then(setUser).catch(() => {});
  }, [authed]);

  function handleAuth() {
    setAuthed(true);
  }

  function handleJobStarted(jobId: string) {
    setActiveJobId(jobId);
    setLeads([]);
    setJobStatus(null);
    setTab('leads');
  }

  function handleJobUpdate(status: JobStatus) {
    setJobStatus(status);
  }

  function handleLeadsLoaded(newLeads: Lead[]) {
    setLeads(newLeads);
  }

  if (!authed) {
    return <AuthPage onAuth={handleAuth} />;
  }

  const noSub = user && !user.subscription.active;
  const noApify = user && !user.settings.hasApifyToken;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>◈</span>
          <div>
            <h1>Instagram Lead Parser <span className={styles.badge}>PRO</span></h1>
            <p>Поиск лидов по хэштегам и ключевым словам · Apify + AI</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          {user && (
            <button
              className={`${styles.userBtn} ${profileOpen ? styles.userBtnActive : ''}`}
              onClick={() => setProfileOpen(v => !v)}
            >
              <span className={styles.userAvatar}>{user.username[0].toUpperCase()}</span>
              <span className={styles.userName}>{user.username}</span>
              <span className={styles.userCaret}>▾</span>
            </button>
          )}
        </div>
      </header>

      {(noSub || noApify) && (
        <div className={styles.warnings}>
          {noSub && (
            <div className={styles.warning}>
              ⚠ Нет активной подписки. Активируйте промокод в профиле.
            </div>
          )}
          {noApify && (
            <div className={styles.warning}>
              ⚠ Добавьте Apify токен в настройках профиля.
            </div>
          )}
        </div>
      )}

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'config' ? styles.tabActive : ''}`}
          onClick={() => setTab('config')}
        >
          ⚙ Настройки
        </button>
        <button
          className={`${styles.tab} ${tab === 'leads' ? styles.tabActive : ''}`}
          onClick={() => setTab('leads')}
          disabled={!activeJobId}
        >
          ◎ Релевантное {leads.length > 0 ? `(${leads.length})` : ''}
        </button>
        <button
          className={`${styles.tab} ${tab === 'myleads' ? styles.tabActive : ''}`}
          onClick={() => setTab('myleads')}
        >
          ◎ Мои лиды
        </button>
      </div>

      <main className={styles.main}>
        {tab === 'config' && (
          <ConfigPanel onJobStarted={handleJobStarted} />
        )}
        {tab === 'myleads' && <MyLeadsPage />}
        {tab === 'leads' && activeJobId && (
          <div className={styles.leadsView}>
            <JobPanel
              jobId={activeJobId}
              onStatusUpdate={handleJobUpdate}
              onLeadsLoaded={handleLeadsLoaded}
            />
            {leads.length > 0 && (
              <LeadsTable leads={leads} jobId={activeJobId} />
            )}
          </div>
        )}
      </main>

      {profileOpen && user && (
        <ProfilePanel
          user={user}
          onUserUpdate={setUser}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  );
}
