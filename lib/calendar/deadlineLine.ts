// Чистые функции для отрисовки персональной линии дедлайна задачи в
// месячной сетке календаря (Google Calendar style) — вынесены отдельно от
// компонента, чтобы пересечение диапазона с неделей было легко покрыть
// юнит-тестами без рендера.

export type PersonalDeadlineTask = {
  id: string;
  title: string;
  startDate: string; // "yyyy-MM-dd" по МСК
  dueDate: string; // "yyyy-MM-dd" по МСК
};

export function chunkWeeks<T>(days: T[], weekSize = 7): T[][] {
  const weeks: T[][] = [];
  for (let i = 0; i < days.length; i += weekSize) {
    weeks.push(days.slice(i, i + weekSize));
  }
  return weeks;
}

export type WeekSegment = { startCol: number; endCol: number };

// weekDayKeys — 7 дата-ключей недели ("yyyy-MM-dd") по порядку слева направо.
// Возвращает диапазон колонок [startCol, endCol] (0-6), которые задевает
// отрезок [task.startDate, task.dueDate] в этой неделе, либо null, если
// пересечения нет — тогда сегмент в этой строке не рисуется.
export function weekSegment(
  weekDayKeys: string[],
  task: { startDate: string; dueDate: string }
): WeekSegment | null {
  const first = weekDayKeys[0];
  const last = weekDayKeys[weekDayKeys.length - 1];
  if (task.dueDate < first || task.startDate > last) return null;

  const startCol = task.startDate <= first ? 0 : weekDayKeys.findIndex((k) => k >= task.startDate);
  let endCol = weekDayKeys.length - 1;
  if (task.dueDate < last) {
    for (let i = weekDayKeys.length - 1; i >= 0; i--) {
      if (weekDayKeys[i] <= task.dueDate) {
        endCol = i;
        break;
      }
    }
  }
  return { startCol, endCol };
}

// Детерминированный акцентный цвет по id задачи — чтобы несколько линий в
// одной неделе визуально не сливались в одну.
export function colorForTaskId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 70% 55%)`;
}
