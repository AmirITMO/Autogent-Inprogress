import { google } from 'googleapis';
import { Lead } from './types';

function getAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const credentials = JSON.parse(json);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

const SHEET_NAME = 'Лиды';
const HEADERS = ['№', 'Instagram', 'Имя', 'Bio', 'Подписчики', 'Telegram', 'Email', 'Tier', 'Score', 'Дата'];

export async function appendLeadsToSheet(spreadsheetId: string, leads: Lead[]): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Get spreadsheet metadata
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetsList = meta.data.sheets || [];
  const existingSheet = sheetsList.find(s => s.properties?.title === SHEET_NAME);

  if (!existingSheet) {
    // Create the sheet
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
      },
    });
  }

  // Check if headers exist (is the sheet empty?)
  const rangeCheck = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:A1`,
  });

  const rows: (string | number)[][] = [];
  const isEmpty = !rangeCheck.data.values || rangeCheck.data.values.length === 0;

  if (isEmpty) {
    rows.push(HEADERS);
  }

  // Get current row count to compute sequential №
  let startIndex = 1;
  if (!isEmpty) {
    const all = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A:A`,
    });
    startIndex = ((all.data.values?.length || 1)); // header + data rows, next № = length
  }

  leads.forEach((lead, i) => {
    rows.push([
      startIndex + i,
      `https://instagram.com/${lead.username}`,
      lead.fullName,
      lead.bio.slice(0, 200),
      lead.followersCount,
      lead.contact.telegram || '',
      lead.contact.email || '',
      lead.tier,
      lead.score,
      lead.parsedAt,
    ]);
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}
