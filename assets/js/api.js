export async function loadConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`Failed to load config: ${res.status}`);
  return res.json();
}

export async function saveConfig(config) {
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    let serverMsg = '';
    try {
      const body = await res.json();
      if (body.error) serverMsg = ': ' + body.error;
    } catch (_) {
      // body not JSON
    }
    throw new Error(`Failed to save config: ${res.status}${serverMsg}`);
  }
  return res.json();
}


export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
