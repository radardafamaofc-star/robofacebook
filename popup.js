// ========== CONFIG ==========
const SUPABASE_URL = 'https://hovvwniyxnzskocsmgcr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvdnZ3bml5eG56c2tvY3NtZ2NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDI0ODAsImV4cCI6MjA4NzkxODQ4MH0.XzciHb-ysEx25cc4HHqLT8VcUr_0JuOGv8I3rZAronw';

// ========== STATE ==========
let groups = [];
let settings = {
  delay: 30,
  randomDelay: true,
  closeTabAfter: true
};
let isPosting = false;
let currentPostIndex = 0;

// ========== DOM ELEMENTS ==========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  checkLicense();
});

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
  // License key validation
  $('#btn-validate-key').addEventListener('click', validateKey);
  $('#license-key').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') validateKey();
  });
  $('#btn-logout-key').addEventListener('click', logoutKey);

  // Add group
  $('#btn-add-group').addEventListener('click', addGroup);

  // Select all
  $('#btn-select-all').addEventListener('click', toggleSelectAll);

  // Fetch groups from Facebook
  $('#btn-fetch-groups').addEventListener('click', fetchGroupsFromFacebook);

  // Save settings
  $('#btn-save-settings').addEventListener('click', saveSettings);

  // Start posting
  $('#btn-start').addEventListener('click', startPosting);

  // Stop posting
  $('#btn-stop').addEventListener('click', stopPosting);
}

// ========== LICENSE ==========
function checkLicense() {
  chrome.storage.local.get(['licenseKey'], (data) => {
    if (data.licenseKey) {
      unlockApp();
    } else {
      showLockScreen();
    }
    setupEventListeners();
  });
}

function showLockScreen() {
  $('#lock-screen').classList.remove('hidden');
  $('#main-app').classList.add('hidden');
}

function unlockApp() {
  $('#lock-screen').classList.add('hidden');
  $('#main-app').classList.remove('hidden');
  loadData();
  setupTabs();
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
      chrome.storage.local.set({ licenseKey: key });
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
  chrome.storage.local.remove('licenseKey');
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
  saveData();
  showStatus('✅ Configurações salvas!');
  setTimeout(() => hideStatus(), 2000);
}

// ========== GROUPS MANAGEMENT ==========
function addGroup() {
  const name = $('#group-name').value.trim();
  const url = $('#group-url').value.trim();

  if (!name || !url) {
    showStatus('⚠️ Preencha nome e URL do grupo');
    return;
  }

  if (!url.includes('facebook.com/groups/')) {
    showStatus('⚠️ URL inválida. Use: facebook.com/groups/...');
    return;
  }

  groups.push({ name, url, selected: true, id: Date.now().toString() });
  $('#group-name').value = '';
  $('#group-url').value = '';
  saveData();
  renderGroups();
  updateSelectedCount();
}

function removeGroup(id) {
  groups = groups.filter(g => g.id !== id);
  saveData();
  renderGroups();
  updateSelectedCount();
}

function toggleGroup(id) {
  const group = groups.find(g => g.id === id);
  if (group) {
    group.selected = !group.selected;
    saveData();
    updateSelectedCount();
  }
}

function toggleSelectAll() {
  const allSelected = groups.every(g => g.selected);
  groups.forEach(g => g.selected = !allSelected);
  saveData();
  renderGroups();
  updateSelectedCount();
}

function renderGroups() {
  const list = $('#groups-list');
  if (groups.length === 0) {
    list.innerHTML = '<p class="empty-state">Nenhum grupo adicionado</p>';
    return;
  }

  list.innerHTML = groups.map(g => `
    <div class="group-item">
      <input type="checkbox" ${g.selected ? 'checked' : ''} 
             onchange="toggleGroup('${g.id}')">
      <span class="group-name" title="${g.url}">${g.name}</span>
      <button class="btn-remove" onclick="removeGroup('${g.id}')">✕</button>
    </div>
  `).join('');
}

function updateSelectedCount() {
  const count = groups.filter(g => g.selected).length;
  $('#selected-count').textContent = count;
}

// ========== FETCH GROUPS FROM FACEBOOK ==========
async function fetchGroupsFromFacebook() {
  showStatus('🔍 Buscando grupos... Certifique-se que o Facebook está aberto.');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('facebook.com')) {
      showStatus('⚠️ Abra o Facebook em uma aba primeiro!');
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Try to scrape groups from the sidebar or groups page
        const groupLinks = document.querySelectorAll('a[href*="/groups/"]');
        const found = [];
        const seen = new Set();

        groupLinks.forEach(link => {
          const href = link.href;
          const match = href.match(/facebook\.com\/groups\/([^/?]+)/);
          if (match && !seen.has(match[1])) {
            seen.add(match[1]);
            const name = link.textContent.trim() || match[1];
            if (name.length > 1 && name.length < 100) {
              found.push({
                name: name,
                url: `https://www.facebook.com/groups/${match[1]}/`,
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                selected: true
              });
            }
          }
        });

        return found;
      }
    });

    if (results && results[0] && results[0].result) {
      const newGroups = results[0].result;
      if (newGroups.length === 0) {
        showStatus('⚠️ Nenhum grupo encontrado. Navegue até facebook.com/groups/ e tente novamente.');
        return;
      }

      // Merge, avoid duplicates
      const existingUrls = new Set(groups.map(g => g.url));
      let added = 0;
      newGroups.forEach(g => {
        if (!existingUrls.has(g.url)) {
          groups.push(g);
          added++;
        }
      });

      saveData();
      renderGroups();
      updateSelectedCount();
      showStatus(`✅ ${added} novo(s) grupo(s) encontrado(s)! Total: ${groups.length}`);
    }
  } catch (err) {
    showStatus('❌ Erro ao buscar grupos: ' + err.message);
  }
}

// ========== POSTING ==========
async function startPosting() {
  const message = $('#post-message').value.trim();
  const link = $('#post-link').value.trim();

  if (!message && !link) {
    showStatus('⚠️ Digite uma mensagem ou link!');
    return;
  }

  const selectedGroups = groups.filter(g => g.selected);
  if (selectedGroups.length === 0) {
    showStatus('⚠️ Selecione pelo menos um grupo!');
    return;
  }

  isPosting = true;
  currentPostIndex = 0;
  saveData();

  $('#btn-start').classList.add('hidden');
  $('#btn-stop').classList.remove('hidden');

  showStatus(`🚀 Iniciando postagem em ${selectedGroups.length} grupo(s)...`);

  for (let i = 0; i < selectedGroups.length; i++) {
    if (!isPosting) break;

    currentPostIndex = i;
    const group = selectedGroups[i];
    const progress = ((i + 1) / selectedGroups.length) * 100;

    showStatus(`📤 Postando em: ${group.name} (${i + 1}/${selectedGroups.length})`);
    updateProgress(progress);

    try {
      await postToGroup(group, message, link);
      showStatus(`✅ Postado em: ${group.name} (${i + 1}/${selectedGroups.length})`);
    } catch (err) {
      showStatus(`❌ Erro em ${group.name}: ${err.message}`);
    }

    // Wait between posts
    if (i < selectedGroups.length - 1 && isPosting) {
      const delay = getDelay();
      showStatus(`⏳ Aguardando ${delay}s antes do próximo post...`);
      await sleep(delay * 1000);
    }
  }

  isPosting = false;
  $('#btn-start').classList.remove('hidden');
  $('#btn-stop').classList.add('hidden');

  if (currentPostIndex >= selectedGroups.length - 1) {
    showStatus('🎉 Postagem concluída em todos os grupos!');
    updateProgress(100);
  }
}

function stopPosting() {
  isPosting = false;
  $('#btn-start').classList.remove('hidden');
  $('#btn-stop').classList.add('hidden');
  showStatus('⛔ Postagem interrompida pelo usuário');
}

async function postToGroup(group, message, link) {
  // Open group in new tab
  const tab = await chrome.tabs.create({ url: group.url, active: false });

  // Wait for page to load
  await waitForTabLoad(tab.id);
  await sleep(3000); // Extra wait for Facebook dynamic content

  // Execute posting script in the tab
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: autoPost,
    args: [message, link]
  });

  if (result && result[0] && result[0].result && result[0].result.error) {
    throw new Error(result[0].result.error);
  }

  // Wait a bit for the post to submit
  await sleep(5000);

  // Close tab if setting enabled
  if (settings.closeTabAfter) {
    try {
      await chrome.tabs.remove(tab.id);
    } catch (e) {
      // Tab might already be closed
    }
  }
}

// This function runs INSIDE the Facebook tab
function autoPost(message, link) {
  return new Promise((resolve) => {
    try {
      const fullMessage = link ? `${message}\n\n${link}` : message;

      // Strategy 1: Find the "Write something" / "Escreva algo" composer box
      const selectors = [
        '[role="button"][tabindex="0"]',
        'div[data-pagelet="GroupInlineComposer"]',
        'div[role="complementary"] [role="button"]',
        'span[dir="auto"]'
      ];

      // Look for the composer trigger
      let composerTrigger = null;
      const allButtons = document.querySelectorAll('[role="button"]');

      for (const btn of allButtons) {
        const text = btn.textContent.toLowerCase();
        if (
          text.includes('write something') ||
          text.includes('escreva algo') ||
          text.includes("what's on your mind") ||
          text.includes('no que você está pensando') ||
          text.includes('o que você está pensando')
        ) {
          composerTrigger = btn;
          break;
        }
      }

      if (!composerTrigger) {
        resolve({ error: 'Compositor de post não encontrado' });
        return;
      }

      // Click to open composer
      composerTrigger.click();

      // Wait for composer to open, then type
      setTimeout(() => {
        // Find the contenteditable area
        const editor = document.querySelector(
          '[contenteditable="true"][role="textbox"]'
        );

        if (!editor) {
          resolve({ error: 'Editor de texto não encontrado' });
          return;
        }

        // Focus and type
        editor.focus();

        // Use execCommand to insert text (works with React/FB's event system)
        document.execCommand('insertText', false, fullMessage);

        // Also dispatch input event
        editor.dispatchEvent(new Event('input', { bubbles: true }));

        // Wait a moment then click Post/Publicar button
        setTimeout(() => {
          const postButtons = document.querySelectorAll('[role="button"]');
          let postBtn = null;

          for (const btn of postButtons) {
            const text = btn.textContent.trim().toLowerCase();
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (
              text === 'post' ||
              text === 'publicar' ||
              text === 'postar' ||
              ariaLabel === 'post' ||
              ariaLabel === 'publicar'
            ) {
              postBtn = btn;
              break;
            }
          }

          if (postBtn) {
            postBtn.click();
            resolve({ success: true });
          } else {
            resolve({ error: 'Botão de publicar não encontrado' });
          }
        }, 2000);
      }, 3000);
    } catch (err) {
      resolve({ error: err.message });
    }
  });
}

// ========== HELPERS ==========
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Timeout safety
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
}

function getDelay() {
  let delay = settings.delay;
  if (settings.randomDelay) {
    const variation = Math.floor(delay * 0.5);
    delay += Math.floor(Math.random() * variation) - Math.floor(variation / 2);
  }
  return Math.max(10, delay);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showStatus(text) {
  $('#status-bar').classList.remove('hidden');
  $('#status-text').textContent = text;
}

function hideStatus() {
  $('#status-bar').classList.add('hidden');
}

function updateProgress(percent) {
  $('#progress-fill').style.width = `${percent}%`;
}
