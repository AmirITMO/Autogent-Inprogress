export function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function taskLink(id: string, title: string) {
  const base = process.env.APP_URL;
  const text = escapeHtml(title);
  return base ? `<a href="${base}/tasks?task=${id}">${text}</a>` : text;
}
