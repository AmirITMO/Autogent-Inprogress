import * as XLSX from 'xlsx';
import { Lead } from './types';

export function exportToXLSX(leads: Lead[], filePath: string): void {
  const rows = leads.map((l, i) => ({
    '№': i + 1,
    'Instagram': l.profileUrl,
    'Имя': l.fullName || l.username,
    'Подписчики': l.followersCount,
    'Telegram': l.contact.telegram || '',
    'Email': l.contact.email || '',
    'Телефон': l.contact.phone || '',
    'Теги': l.foundByTags.join(', '),
    'Описание (bio)': l.bio || '',
    'Описание (AI)': l.aiAnalysis?.description || '',
    'Категория': l.businessCategory || '',
    'Сайт': l.externalUrl || '',
    'Активность': l.aiAnalysis?.activitySummary || `Avg Reels views: ${Math.round(l.avgReelsViews)}`,
    'AI вердикт': l.aiAnalysis?.reason || '',
    'Хороший лид': l.aiAnalysis ? (l.aiAnalysis.isGoodLead ? 'Да' : 'Нет') : '',
    'Уверенность AI': l.aiAnalysis ? `${Math.round(l.aiAnalysis.confidence * 100)}%` : '',
    'Tier': l.tier,
    'Score': l.score,
    'Avg Reels Views': Math.round(l.avgReelsViews),
    'Ответил': '',
    'Заинтересован': '',
    'Отказался': '',
    'Согласился': '',
    'Оплатил': '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const colWidths = [4, 45, 25, 12, 35, 30, 18, 30, 55, 55, 20, 35, 40, 50, 12, 15, 5, 6, 14, 10, 12, 10, 10, 10];
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Лиды');

  const statsData = [
    ['Метрика', 'Значение'],
    ['Всего лидов', leads.length],
    ['Tier A', leads.filter(l => l.tier === 'A').length],
    ['Tier B', leads.filter(l => l.tier === 'B').length],
    ['Tier C', leads.filter(l => l.tier === 'C').length],
    ['С Telegram', leads.filter(l => l.contact.telegram).length],
    ['С Email', leads.filter(l => l.contact.email).length],
    ['С телефоном', leads.filter(l => l.contact.phone).length],
    ['С AI анализом', leads.filter(l => l.aiAnalysis).length],
    ['Хорошие лиды (AI)', leads.filter(l => l.aiAnalysis?.isGoodLead).length],
    ['Дата парсинга', new Date().toLocaleString('ru')],
  ];
  const wsStats = XLSX.utils.aoa_to_sheet(statsData);
  wsStats['!cols'] = [{ wch: 25 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsStats, 'Статистика');

  XLSX.writeFile(wb, filePath);
}
