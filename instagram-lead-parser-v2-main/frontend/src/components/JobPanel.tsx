import React, { useEffect, useRef, useState } from 'react';
import { JobStatus, Lead } from '../types';
import { api } from '../api';
import styles from './JobPanel.module.css';

interface Props {
  jobId: string;
  onStatusUpdate: (s: JobStatus) => void;
  onLeadsLoaded: (leads: Lead[]) => void;
}

export default function JobPanel({ jobId, onStatusUpdate, onLeadsLoaded }: Props) {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await api(`/api/parse/${jobId}/status`);
        const data: JobStatus = await res.json();
        setStatus(data);
        onStatusUpdate(data);

        if (data.status === 'done') {
          clearInterval(intervalRef.current as unknown as number);
          const leadsRes = await api(`/api/parse/${jobId}/leads`);
          const leads: Lead[] = await leadsRes.json();
          onLeadsLoaded(leads);
        } else if (data.status === 'error') {
          clearInterval(intervalRef.current as unknown as number);
        }
      } catch { /* ignore */ }
    };

    poll();
    intervalRef.current = setInterval(poll, 2000);
    return () => clearInterval(intervalRef.current as unknown as number);
  }, [jobId]);

  if (!status) return <div className={styles.loading}>Подключение...</div>;

  const pct = status.progress.total > 0
    ? Math.round((status.progress.current / status.progress.total) * 100)
    : 0;

  const stageIcon: Record<string, string> = {
    init: '⚙',
    discovery: '🔍',
    enrichment: '📥',
    qualification: '🎯',
    ai: '🤖',
    done: '✅',
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.statusBadge} data-status={status.status}>
          {status.status === 'running' && <span className={styles.pulse} />}
          {status.status === 'running' ? 'Работает' : status.status === 'done' ? 'Готово' : status.status === 'error' ? 'Ошибка' : 'Ожидание'}
        </div>
        <div className={styles.meta}>
          Job ID: <code>{jobId.slice(0, 8)}</code>
          {status.finishedAt && (
            <span>
              · {Math.round((new Date(status.finishedAt).getTime() - new Date(status.startedAt).getTime()) / 1000)}с
            </span>
          )}
        </div>
        {status.status === 'done' && (
          <a
            href={`/api/parse/${jobId}/export`}
            className={styles.exportBtn}
            download
          >
            ⬇ Excel
          </a>
        )}
      </div>

      {status.status !== 'error' && (
        <>
          <div className={styles.stageMsg}>
            <span className={styles.stageIcon}>{stageIcon[status.progress.stage] || '⚙'}</span>
            {status.progress.message}
          </div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${status.status === 'done' ? 100 : pct}%` }} />
          </div>
          <div className={styles.progressMeta}>
            {status.progress.current}/{status.progress.total}
            {status.leadsCount > 0 && (
              <span className={styles.leadsFound}>· Найдено лидов: {status.leadsCount}</span>
            )}
          </div>
        </>
      )}

      {status.status === 'error' && (
        status.error?.includes('Закончились токены APIFY') ? (
          <div className={styles.quotaError}>
            <div className={styles.quotaIcon}>⚠</div>
            <div>
              <div className={styles.quotaTitle}>Закончились токены APIFY</div>
              <div className={styles.quotaBody}>
                Месячный лимит Apify исчерпан. Чтобы продолжить парсинг:
                <ul>
                  <li>Пополните баланс на <a href="https://console.apify.com/billing" target="_blank" rel="noopener noreferrer">console.apify.com/billing</a></li>
                  <li>Или увеличьте <b>monthly hard limit</b> в настройках биллинга</li>
                  <li>Или используйте другой APIFY токен</li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.error}>Ошибка: {status.error}</div>
        )
      )}

      {status.status === 'done' && (
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryNum}>{status.leadsCount}</span>
            <span>лидов найдено</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryNum}>
              {Math.round((new Date(status.finishedAt!).getTime() - new Date(status.startedAt).getTime()) / 1000)}с
            </span>
            <span>времени</span>
          </div>
        </div>
      )}
    </div>
  );
}
