// Команда работает по московскому времени (GMT+3, без перехода на летнее/зимнее —
// у Москвы фиксированный оффсет), а сервер и браузер могут быть в любом часовом
// поясе. Чтобы дата+время, введённые пользователем в календаре, всегда
// интерпретировались как московские (а не как локальное время сервера/браузера),
// работаем с оффсетом явно, не полагаясь на Intl/системный часовой пояс.
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Собирает ISO-момент (UTC) из даты/времени, введённых как московское время.
export function mskInputToUtcIso(dateStr: string, timeStr: string): string {
  const asIfUtc = new Date(`${dateStr}T${timeStr}:00.000Z`);
  return new Date(asIfUtc.getTime() - MSK_OFFSET_MS).toISOString();
}

// Возвращает компоненты даты/времени по Москве для отображения — не зависит от
// часового пояса окружения, в котором выполняется код.
export function toMoscowParts(input: Date | string) {
  const utc = new Date(input);
  const msk = new Date(utc.getTime() + MSK_OFFSET_MS);
  return {
    dateKey: `${msk.getUTCFullYear()}-${pad(msk.getUTCMonth() + 1)}-${pad(msk.getUTCDate())}`,
    timeLabel: `${pad(msk.getUTCHours())}:${pad(msk.getUTCMinutes())}`,
  };
}

// Прибавляет час к строке "HH:MM" (с переносом через полночь).
export function addOneHour(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const total = (h * 60 + m + 60) % (24 * 60);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

// UTC-момент, соответствующий полуночи по Москве сегодня. Используется, чтобы
// "ближайшие созвоны" считались от начала текущего дня по МСК, а не строго от
// текущей минуты — иначе созвон, который был утром, а сейчас день, пропадал бы
// из списка, хотя формально он "сегодняшний".
export function mskStartOfTodayUtc(): Date {
  const nowMsk = new Date(Date.now() + MSK_OFFSET_MS);
  const mskMidnightAsUtcMs = Date.UTC(
    nowMsk.getUTCFullYear(),
    nowMsk.getUTCMonth(),
    nowMsk.getUTCDate(),
    0,
    0,
    0
  );
  return new Date(mskMidnightAsUtcMs - MSK_OFFSET_MS);
}
