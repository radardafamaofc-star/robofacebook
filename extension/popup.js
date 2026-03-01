// ========== STATE ==========
let groups = [];
let settings = {
  delay: 30,
  randomDelay: true,
  closeTabAfter: true
};

// ========== DOM ELEMENTS ==========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupTabs();
  setupEventListeners();
  // Poll posting status from background
  pollPostingStatus();
  setInterval(pollPostingStatus, 1500);
});

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
  $('#btn-add-group').addEventListener('click', addGroup);
  $('#btn-select-all').addEventListener('click', toggleSelectAll);
  $('#btn-fetch-groups').addEventListener('click', fetchGroupsFromFacebook);
  $('#btn-save-settings').addEventListener('click', saveSettings);
  $('#btn-start').addEventListener('click', startPosting);
  $('#btn-stop').addEventListener('click', stopPosting);

  // Image upload
  $('#btn-pick-image').addEventListener('click', () => $('#image-input').click());
  $('#image-input').addEventListener('change', handleImageSelect);
  $('#btn-remove-image').addEventListener('click', removeImage);
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
  showStatus('🔄 Navegando até a página de grupos...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('facebook.com')) {
      showStatus('⚠️ Abra o Facebook em uma aba primeiro!');
      return;
    }

    // Navigate to the groups listing page
    await chrome.tabs.update(tab.id, { url: 'https://www.facebook.com/groups/joins/' });

    // Wait for page to load
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

    showStatus('🔄 Expandindo e rolando para carregar todos os grupos...');

    // Phase 1: Click all "Ver mais" / "See more" buttons repeatedly and scroll
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const delay = ms => new Promise(r => setTimeout(r, ms));

        const clickExpanders = () => {
          let clicked = 0;
          // Target all clickable elements that might expand group lists
          const allClickable = document.querySelectorAll(
            'div[role="button"], span[role="button"], a[role="button"], [aria-expanded="false"]'
          );
          allClickable.forEach(el => {
            const text = (el.textContent || '').trim().toLowerCase();
            if (text === 'ver mais' || text === 'see more' || text === 'ver tudo' || text === 'see all') {
              el.click();
              clicked++;
            }
          });
          return clicked;
        };

        // First, click all "Ver mais" / "Ver tudo" buttons multiple times
        for (let i = 0; i < 10; i++) {
          const clicked = clickExpanders();
          if (clicked > 0) {
            await delay(2000);
          } else if (i > 2) {
            break;
          } else {
            await delay(1000);
          }
        }

        // Now scroll the entire page to load lazy-loaded content
        let lastHeight = 0;
        let stableCount = 0;
        const maxAttempts = 60; // More attempts for 260+ groups

        for (let i = 0; i < maxAttempts; i++) {
          window.scrollTo(0, document.body.scrollHeight);
          await delay(1000);

          // Click any new "Ver mais" that appeared after scrolling
          clickExpanders();
          await delay(500);

          const newHeight = document.body.scrollHeight;
          if (newHeight === lastHeight) {
            stableCount++;
            if (stableCount >= 3) break; // Stop after 3 consecutive unchanged scrolls
          } else {
            stableCount = 0;
          }
          lastHeight = newHeight;
        }

        // Scroll back up
        window.scrollTo(0, 0);
      }
    });

    showStatus('🔍 Extraindo grupos encontrados...');

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const found = [];
        const seen = new Set();
        const skipSlugs = new Set(['feed', 'discover', 'joins', 'create', 'notifications', 'settings', 'your_groups']);

        const groupLinks = document.querySelectorAll('a[href*="/groups/"]');

        groupLinks.forEach(link => {
          const href = link.href;
          const match = href.match(/facebook\.com\/groups\/([^/?#]+)/);
          if (!match || seen.has(match[1]) || skipSlugs.has(match[1])) return;

          const slug = match[1];
          let name = '';

          // Strategy 1: Text content of the link itself (non-numeric spans)
          const spans = link.querySelectorAll('span');
          for (const span of spans) {
            const text = span.textContent.trim();
            if (text.length > 2 && text.length < 120 && !/^\d+$/.test(text) && !/^\d[\d\s,.]+$/.test(text)) {
              name = text;
              break;
            }
          }

          // Strategy 2: Direct text of the link
          if (!name) {
            const directText = link.textContent.trim();
            if (directText.length > 2 && directText.length < 120 && !/^\d+$/.test(directText)) {
              name = directText;
            }
          }

          // Strategy 3: aria-label
          if (!name) name = link.getAttribute('aria-label') || '';

          // Strategy 4: Search up the DOM tree more aggressively
          if (!name) {
            let el = link.parentElement;
            for (let depth = 0; depth < 5 && el; depth++) {
              const elSpans = el.querySelectorAll('span, strong, h3, h4');
              for (const span of elSpans) {
                const text = span.textContent.trim();
                if (text.length > 2 && text.length < 120 && !/^\d+$/.test(text) && !/^\d[\d\s,.]+$/.test(text)) {
                  name = text;
                  break;
                }
              }
              if (name) break;
              el = el.parentElement;
            }
          }

          // Strategy 5: img alt text nearby
          if (!name) {
            const parentContainer = link.closest('div');
            if (parentContainer) {
              const img = parentContainer.querySelector('img[alt]');
              if (img && img.alt.length > 2) {
                name = img.alt;
              }
            }
          }

          // Fallback: use slug but format it nicely
          if (!name || /^\d+$/.test(name)) {
            name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          }

          seen.add(slug);
          found.push({
            name,
            url: `https://www.facebook.com/groups/${slug}/`,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            selected: true
          });
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

// ========== POSTING (delegates to background) ==========
async function startPosting() {
  const message = $('#post-message').value.trim();
  const link = $('#post-link').value.trim();
  const anonymous = $('#post-anonymous').checked;

  if (!message && !link && !selectedImageDataUrl) {
    showStatus('⚠️ Digite uma mensagem, link ou selecione uma imagem!');
    return;
  }

  const selectedGroups = groups.filter(g => g.selected);
  if (selectedGroups.length === 0) {
    showStatus('⚠️ Selecione pelo menos um grupo!');
    return;
  }

  saveData();

  // Send to background worker
  chrome.runtime.sendMessage({
    type: 'START_POSTING',
    groups: selectedGroups,
    message,
    link,
    imageDataUrl: selectedImageDataUrl,
    anonymous,
    settings
  }, (response) => {
    if (response && response.started) {
      $('#btn-start').classList.add('hidden');
      $('#btn-stop').classList.remove('hidden');
      showStatus(`🚀 Iniciando postagem em ${selectedGroups.length} grupo(s)...`);
    }
  });
}

function stopPosting() {
  chrome.runtime.sendMessage({ type: 'STOP_POSTING' }, () => {
    $('#btn-start').classList.remove('hidden');
    $('#btn-stop').classList.add('hidden');
    showStatus('⛔ Postagem interrompida pelo usuário');
  });
}

// ========== HELPERS ==========
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
