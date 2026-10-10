importScripts('defaults.js');

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...AL_DEFAULTS, ...settings };
}
function badge(on) {
  chrome.action.setBadgeText({ text: on ? '' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: '#555555' });
}

chrome.runtime.onInstalled.addListener(async () => {
  const { settings, settingsVersion } = await chrome.storage.local.get(['settings', 'settingsVersion']);
  // First install, or defaults were bumped (AL_VERSION): start from the new defaults once. Otherwise keep the user's values.
  const s = settingsVersion === AL_VERSION ? { ...AL_DEFAULTS, ...settings } : { ...AL_DEFAULTS };
  await chrome.storage.local.set({ settings: s, settingsVersion: AL_VERSION });
  badge(s.enabled);
});
chrome.runtime.onStartup.addListener(async () => badge((await getSettings()).enabled));
chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'local' && c.settings) badge(c.settings.newValue?.enabled !== false);
});
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'toggle') return;
  const s = await getSettings();
  await chrome.storage.local.set({ settings: { ...s, enabled: !s.enabled } });
});
