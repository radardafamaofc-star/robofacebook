// ========== CONFIG ==========
const SUPABASE_URL = 'https://hovvwniyxnzskocsmgcr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvdnZ3bml5eG56c2tvY3NtZ2NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDI0ODAsImV4cCI6MjA4NzkxODQ4MH0.XzciHb-ysEx25cc4HHqLT8VcUr_0JuOGv8I3rZAronw';

// ========== STATE ==========
let groups = [];
let settings = {
  delay: 30,
  randomDelay: true,
  closeTabAfter: true,
  loopPosting: false
};

// ========== DOM ELEMENTS ==========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  checkLicense();
});

// ========== LICENSE ==========
function checkLicense() {
  chrome.storage.local.get(['licenseKey', 'licenseValidatedAt'], (data) => {
    if (data.licenseKey) {
      const now = Date.now();
      const lastValidated = data.licenseValidatedAt || 0;
      const ONE_DAY = 24 * 60 * 60 * 1000;
      // Only re-validate online once per day
      if (now - lastValidated < ONE_DAY) {
        unlockApp();
      } else {
        validateStoredKey(data.licenseKey);
      }
    } else {
      showLockScreen();
    }
  });
}

function showLockScreen() {
  $('#lock-screen').classList.remove('hidden');
  $('#main-app').classList.add('hidden');
  setupLicenseListeners();
}

function unlockApp() {
  $('#lock-screen').classList.add('hidden');
  $('#main-app').classList.remove('hidden');
  loadData();
  setupTabs();
  setupEventListeners();
  
}

function setupLicenseListeners() {
  $('#btn-validate-key').addEventListener('click', validateKey);
  $('#license-key').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') validateKey();
  });
}

async function validateStoredKey(key) {
  // Quick check - if key exists in storage, unlock
  // Full validation happens on fresh validate
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/validate-key`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ key })
      }
    );
    const result = await response.json();
    if (result.valid) {
      chrome.storage.local.set({ licenseValidatedAt: Date.now() });
      unlockApp();
    } else {
      chrome.storage.local.remove(['licenseKey', 'licenseValidatedAt']);
      showLockScreen();
    }
  } catch (err) {
    // Network error - allow offline use if key was previously validated
    unlockApp();
  }
}

async function validateKey() {
  const key = $('#license-key').value.trim();
  if (!key) {
    showKeyError('Digite uma chave válida');
    return;
  }

  $('#btn-validate-key').disabled = true;
  $('#btn-validate-key').textContent = '⏳ Validando...';
  hideKeyError();

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/validate-key`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ key })
      }
    );

    const result = await response.json();

    if (result.valid) {
      chrome.storage.local.set({ licenseKey: key, licenseValidatedAt: Date.now() });
      unlockApp();
    } else {
      showKeyError(result.error || 'Chave inválida');
    }
  } catch (err) {
    showKeyError('Erro de conexão. Tente novamente.');
  }

  $('#btn-validate-key').disabled = false;
  $('#btn-validate-key').textContent = '🔑 Validar Chave';
}

function logoutKey() {
  chrome.storage.local.remove(['licenseKey', 'licenseValidatedAt']);
  showLockScreen();
  $('#license-key').value = '';
}

function showKeyError(msg) {
  const el = $('#key-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideKeyError() {
  $('#key-error').classList.add('hidden');
}

// ========== TABS ==========
function setupTabs() {
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      $$('.tab-content').forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      $(`#tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
  $('#btn-logout-key').addEventListener('click', logoutKey);
  $('#btn-add-group').addEventListener('click', addGroup);
  $('#btn-select-all').addEventListener('click', toggleSelectAll);
  $('#btn-remove-all-groups').addEventListener('click', removeAllGroups);
  $('#btn-fetch-groups').addEventListener('click', fetchGroupsFromFacebook);
  $('#btn-save-settings').addEventListener('click', saveSettings);
  $('#btn-start').addEventListener('click', startPosting);
  $('#btn-stop').addEventListener('click', stopPosting);
  $('#btn-leave-all').addEventListener('click', leaveAllGroups);

  // Explore tab
  $('#btn-start-explore').addEventListener('click', startExplore);
  $('#btn-stop-explore').addEventListener('click', stopExplore);
  $('#explore-keyword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startExplore();
  });

  // Image upload
  $('#btn-pick-image').addEventListener('click', () => $('#image-input').click());
  $('#image-input').addEventListener('change', handleImageSelect);
  $('#btn-remove-image').addEventListener('click', removeImage);

  // Poll posting status from background
  pollPostingStatus();
  setInterval(pollPostingStatus, 1500);

  // Poll explore status
  pollExploreStatus();
  setInterval(pollExploreStatus, 1500);
}

// ========== POLL BACKGROUND STATUS ==========
function pollPostingStatus() {
  chrome.runtime.sendMessage({ type: 'GET_POSTING_STATUS' }, (response) => {
    if (chrome.runtime.lastError || !response) return;
    if (response.isPosting) {
      $('#btn-start').classList.add('hidden');
      $('#btn-stop').classList.remove('hidden');
      showStatus(response.statusText);
      updateProgress(response.progress);
    } else if (response.statusText) {
      $('#btn-start').classList.remove('hidden');
      $('#btn-stop').classList.add('hidden');
      showStatus(response.statusText);
      updateProgress(response.progress);
    }
  });
}

// ========== DATA PERSISTENCE ==========
function loadData() {
  chrome.storage.local.get(['groups', 'settings', 'lastMessage', 'lastLink'], (data) => {
    if (data.groups) groups = data.groups;
    if (data.settings) settings = { ...settings, ...data.settings };
    if (data.lastMessage) $('#post-message').value = data.lastMessage;
    if (data.lastLink) $('#post-link').value = data.lastLink;

    $('#delay-time').value = settings.delay;
    $('#random-delay').checked = settings.randomDelay;
    $('#close-tab-after').checked = settings.closeTabAfter;
    $('#loop-posting').checked = settings.loopPosting;

    renderGroups();
    updateSelectedCount();
  });
}

function saveData() {
  chrome.storage.local.set({
    groups,
    settings,
    lastMessage: $('#post-message').value,
    lastLink: $('#post-link').value
  });
}

function saveSettings() {
  settings.delay = Math.max(10, parseInt($('#delay-time').value) || 30);
  settings.randomDelay = $('#random-delay').checked;
  settings.closeTabAfter = $('#close-tab-after').checked;
  settings.loopPosting = $('#loop-posting').checked;
  saveData();
  showStatus('✅ Configurações salvas!');
  setTimeout(() => hideStatus(), 2000);
}

// ========== GROUPS MANAGEMENT ==========
function addGroup() {
  const name = $('#group-name').value.trim();
  const url = $('#group-url').value.trim();
  if (!name || !url) { showStatus('⚠️ Preencha nome e URL do grupo'); return; }
  if (!url.includes('facebook.com/groups/')) { showStatus('⚠️ URL inválida'); return; }
  groups.push({ name, url, selected: true, id: Date.now().toString() });
  $('#group-name').value = '';
  $('#group-url').value = '';
  saveData();
  renderGroups();
  updateSelectedCount();
}

function removeGroup(id) {
  groups = groups.filter(g => g.id !== id);
  saveData(); renderGroups(); updateSelectedCount();
}

function toggleGroup(id) {
  const group = groups.find(g => g.id === id);
  if (group) { group.selected = !group.selected; saveData(); updateSelectedCount(); }
}

function removeAllGroups() {
  if (groups.length === 0) return;
  if (!confirm('Tem certeza que deseja remover todos os grupos da lista?')) return;
  groups = [];
  saveData();
  renderGroups();
  updateSelectedCount();
  showStatus('🗑️ Todos os grupos foram removidos!');
  setTimeout(() => hideStatus(), 2000);
}

function toggleSelectAll() {
  const allSelected = groups.every(g => g.selected);
  groups.forEach(g => g.selected = !allSelected);
  saveData(); renderGroups(); updateSelectedCount();
}

function renderGroups() {
  const list = $('#groups-list');
  if (groups.length === 0) {
    list.innerHTML = '<p class="empty-state">Nenhum grupo adicionado</p>';
    return;
  }
  list.innerHTML = groups.map(g => `
    <div class="group-item">
      <input type="checkbox" data-group-id="${g.id}" ${g.selected ? 'checked' : ''}>
      <span class="group-name" title="${g.url}">${g.name}</span>
      <button class="btn-remove" data-remove-id="${g.id}">✕</button>
    </div>
  `).join('');

  // Use addEventListener instead of inline handlers (CSP compliance)
  list.querySelectorAll('input[data-group-id]').forEach(cb => {
    cb.addEventListener('change', () => toggleGroup(cb.dataset.groupId));
  });
  list.querySelectorAll('button[data-remove-id]').forEach(btn => {
    btn.addEventListener('click', () => removeGroup(btn.dataset.removeId));
  });
}

function updateSelectedCount() {
  const count = groups.filter(g => g.selected).length;
  $('#selected-count').textContent = count;
}

// ========== FETCH GROUPS ==========
async function fetchGroupsFromFacebook() {
  showStatus('🔄 Navegando até a página de grupos...');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('facebook.com')) {
      showStatus('⚠️ Abra o Facebook em uma aba primeiro!');
      return;
    }
    await chrome.tabs.update(tab.id, { url: 'https://www.facebook.com/groups/joins/' });
    await new Promise(resolve => {
      const listener = (tabId, info) => {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
    await new Promise(r => setTimeout(r, 3000));
    showStatus('🔄 Expandindo e rolando...');

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const delay = ms => new Promise(r => setTimeout(r, ms));
        const clickExpanders = () => {
          let clicked = 0;
          document.querySelectorAll('div[role="button"], span[role="button"], a[role="button"], [aria-expanded="false"]').forEach(el => {
            const text = (el.textContent || '').trim().toLowerCase();
            if (['ver mais','see more','ver tudo','see all'].includes(text)) { el.click(); clicked++; }
          });
          return clicked;
        };
        for (let i = 0; i < 10; i++) {
          const clicked = clickExpanders();
          if (clicked > 0) await delay(2000);
          else if (i > 2) break;
          else await delay(1000);
        }
        let lastHeight = 0, stableCount = 0;
        for (let i = 0; i < 60; i++) {
          window.scrollTo(0, document.body.scrollHeight);
          await delay(1000);
          clickExpanders();
          await delay(500);
          const newHeight = document.body.scrollHeight;
          if (newHeight === lastHeight) { stableCount++; if (stableCount >= 3) break; }
          else stableCount = 0;
          lastHeight = newHeight;
        }
        window.scrollTo(0, 0);
      }
    });

    showStatus('🔍 Extraindo grupos...');
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const found = [], seen = new Set();
        const skip = new Set(['feed','discover','joins','create','notifications','settings','your_groups']);
        document.querySelectorAll('a[href*="/groups/"]').forEach(link => {
          const match = link.href.match(/facebook\.com\/groups\/([^/?#]+)/);
          if (!match || seen.has(match[1]) || skip.has(match[1])) return;
          const slug = match[1];
          let name = '';
          for (const span of link.querySelectorAll('span')) {
            const t = span.textContent.trim();
            if (t.length > 2 && t.length < 120 && !/^\d+$/.test(t)) { name = t; break; }
          }
          if (!name) { const t = link.textContent.trim(); if (t.length > 2 && t.length < 120) name = t; }
          if (!name) name = link.getAttribute('aria-label') || slug.replace(/-/g, ' ');
          seen.add(slug);
          found.push({ name, url: `https://www.facebook.com/groups/${slug}/`, id: Date.now().toString() + Math.random().toString(36).substr(2, 5), selected: true });
        });
        return found;
      }
    });

    if (results?.[0]?.result) {
      const newGroups = results[0].result;
      if (newGroups.length === 0) { showStatus('⚠️ Nenhum grupo encontrado.'); return; }
      const existingUrls = new Set(groups.map(g => g.url));
      let added = 0;
      newGroups.forEach(g => { if (!existingUrls.has(g.url)) { groups.push(g); added++; } });
      saveData(); renderGroups(); updateSelectedCount();
      showStatus(`✅ ${added} novo(s) grupo(s)! Total: ${groups.length}`);
    }
  } catch (err) {
    showStatus('❌ Erro: ' + err.message);
  }
}

// ========== IMAGE HANDLING ==========
let selectedImageDataUrl = null;

function handleImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    selectedImageDataUrl = ev.target.result;
    $('#image-thumb').src = selectedImageDataUrl;
    $('#image-preview').classList.remove('hidden');
    $('#btn-pick-image').textContent = '📷 Trocar Imagem';
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  selectedImageDataUrl = null;
  $('#image-input').value = '';
  $('#image-preview').classList.add('hidden');
  $('#btn-pick-image').textContent = '📷 Escolher Imagem';
}

// ========== POSTING ==========
async function startPosting() {
  const message = $('#post-message').value.trim();
  const link = $('#post-link').value.trim();
  const anonymous = $('#post-anonymous').checked;
  if (!message && !link && !selectedImageDataUrl) { showStatus('⚠️ Digite uma mensagem, link ou selecione uma imagem!'); return; }
  const selectedGroups = groups.filter(g => g.selected);
  if (selectedGroups.length === 0) { showStatus('⚠️ Selecione pelo menos um grupo!'); return; }
  saveData();
  chrome.runtime.sendMessage({
    type: 'START_POSTING', groups: selectedGroups, message, link,
    imageDataUrl: selectedImageDataUrl, anonymous, settings
  }, (response) => {
    if (response?.started) {
      $('#btn-start').classList.add('hidden');
      $('#btn-stop').classList.remove('hidden');
      showStatus(`🚀 Iniciando em ${selectedGroups.length} grupo(s)...`);
    }
  });
}

function stopPosting() {
  chrome.runtime.sendMessage({ type: 'STOP_POSTING' }, () => {
    $('#btn-start').classList.remove('hidden');
    $('#btn-stop').classList.add('hidden');
    showStatus('⛔ Postagem interrompida');
  });
}

// ========== LEAVE ALL GROUPS ==========
function leaveAllGroups() {
  const selectedGroups = groups.filter(g => g.selected);
  if (selectedGroups.length === 0) {
    showStatus('⚠️ Selecione pelo menos um grupo para sair!');
    return;
  }
  if (!confirm(`Tem certeza que deseja sair de ${selectedGroups.length} grupo(s)?`)) return;

  $('#btn-leave-all').disabled = true;
  $('#btn-leave-all').textContent = '⏳ Saindo dos grupos...';

  chrome.runtime.sendMessage({
    type: 'LEAVE_ALL_GROUPS',
    groups: selectedGroups
  }, (response) => {
    if (response?.started) {
      showStatus(`🚪 Saindo de ${selectedGroups.length} grupo(s)...`);
    }
  });

  // Poll for leave status
  const pollLeave = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'GET_LEAVE_STATUS' }, (response) => {
      if (chrome.runtime.lastError || !response) return;
      showStatus(response.statusText || '');
      updateProgress(response.progress || 0);
      if (!response.isLeaving) {
        clearInterval(pollLeave);
        $('#btn-leave-all').disabled = false;
        $('#btn-leave-all').textContent = '🚪 Sair de Todos os Grupos';
        // Remove groups that were left successfully
        if (response.leftGroupIds && response.leftGroupIds.length > 0) {
          groups = groups.filter(g => !response.leftGroupIds.includes(g.id));
          saveData();
          renderGroups();
          updateSelectedCount();
        }
      }
    });
  }, 1500);
}

// ========== HELPERS ==========
function showStatus(text) { $('#status-bar').classList.remove('hidden'); $('#status-text').textContent = text; }
function hideStatus() { $('#status-bar').classList.add('hidden'); }
function updateProgress(percent) { $('#progress-fill').style.width = `${percent}%`; }

// ========== EXPLORE (SEARCH + JOIN + TEST + CLASSIFY) ==========
function startExplore() {
  const keyword = $('#explore-keyword').value.trim();
  if (!keyword) { showStatus('⚠️ Digite uma palavra-chave para buscar grupos!'); return; }

  const autoLeave = $('#explore-auto-leave').checked;

  chrome.runtime.sendMessage({
    type: 'START_EXPLORE_SEARCH',
    keyword,
    autoLeave
  }, (response) => {
    if (response?.started) {
      $('#btn-start-explore').disabled = true;
      $('#btn-stop-explore').classList.remove('hidden');
      showStatus(`🔎 Buscando grupos de "${keyword}"...`);
    }
  });
}

function stopExplore() {
  chrome.runtime.sendMessage({ type: 'STOP_EXPLORE' }, () => {
    $('#btn-start-explore').disabled = false;
    $('#btn-stop-explore').classList.add('hidden');
    showStatus('⛔ Exploração interrompida');
  });
}

function pollExploreStatus() {
  chrome.runtime.sendMessage({ type: 'GET_EXPLORE_STATUS' }, (response) => {
    if (chrome.runtime.lastError || !response) return;
    if (response.isExploring) {
      $('#btn-start-explore').disabled = true;
      $('#btn-stop-explore').classList.remove('hidden');
      showStatus(response.statusText);
      updateProgress(response.progress);
    } else {
      $('#btn-start-explore').disabled = false;
      $('#btn-stop-explore').classList.add('hidden');
    }
    if (response.results && response.results.length > 0) {
      renderExploreResults(response.results);
    }
  });
}

function renderExploreResults(results) {
  const container = $('#explore-results');
  if (!results || results.length === 0) {
    container.innerHTML = '<p class="empty-state">Nenhum grupo explorado ainda</p>';
    return;
  }
  container.innerHTML = results.map(r => {
    const icon = r.status === 'free' ? '✅' : r.status === 'moderated' ? '❌' : r.status === 'left' ? '🚪' : r.status === 'error' ? '⚠️' : r.status === 'joined' ? '📥' : '⏳';
    const label = r.status === 'free' ? 'Livre' : r.status === 'moderated' ? 'Moderado' : r.status === 'left' ? 'Saiu' : r.status === 'error' ? 'Erro' : r.status === 'joined' ? 'Entrou' : 'Pendente';
    const addBtn = r.status === 'free' ? `<button class="btn-add-explored" data-url="${r.url}" data-name="${r.name || r.slug}">+ Adicionar</button>` : '';
    return `
      <div class="group-item">
        <span style="flex-shrink:0">${icon}</span>
        <span class="group-name" title="${r.url}">${r.name || r.slug}</span>
        <span style="font-size:10px;opacity:0.7;flex-shrink:0">${label}</span>
        ${addBtn}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-add-explored').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      const name = btn.dataset.name;
      const exists = groups.some(g => g.url === url);
      if (!exists) {
        groups.push({ name, url, selected: true, id: Date.now().toString() });
        saveData();
        renderGroups();
        updateSelectedCount();
        btn.textContent = '✓';
        btn.disabled = true;
      } else {
        btn.textContent = 'Já existe';
        btn.disabled = true;
      }
    });
  });
}

