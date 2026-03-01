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
  loadData();
  setupTabs();
  setupEventListeners();
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
  showStatus('🔍 Buscando grupos... Navegue até facebook.com/groups/feed/ primeiro!');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('facebook.com')) {
      showStatus('⚠️ Abra o Facebook em uma aba primeiro!');
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const found = [];
        const seen = new Set();
        const skipSlugs = new Set(['feed', 'discover', 'joins', 'create', 'notifications', 'settings']);

        // Strategy 1: All links pointing to /groups/XXXX
        const groupLinks = document.querySelectorAll('a[href*="/groups/"]');

        groupLinks.forEach(link => {
          const href = link.href;
          const match = href.match(/facebook\.com\/groups\/([^/?#]+)/);
          if (!match || seen.has(match[1]) || skipSlugs.has(match[1])) return;

          // Try to get a readable name
          let name = '';

          // Check for text inside spans with dir="auto" (Facebook's text rendering)
          const spans = link.querySelectorAll('span');
          for (const span of spans) {
            const text = span.textContent.trim();
            if (text.length > 2 && text.length < 120 && !/^\d+$/.test(text)) {
              name = text;
              break;
            }
          }

          // Fallback: use aria-label
          if (!name) {
            name = link.getAttribute('aria-label') || '';
          }

          // Fallback: use closest parent with meaningful text
          if (!name) {
            const parent = link.closest('[role="listitem"], [role="row"], li, div');
            if (parent) {
              const parentSpans = parent.querySelectorAll('span');
              for (const span of parentSpans) {
                const text = span.textContent.trim();
                if (text.length > 2 && text.length < 120 && !/^\d+$/.test(text)) {
                  name = text;
                  break;
                }
              }
            }
          }

          // Last fallback: use the slug/ID
          if (!name) {
            name = match[1];
          }

          seen.add(match[1]);
          found.push({
            name: name,
            url: `https://www.facebook.com/groups/${match[1]}/`,
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

      // Helper: simulate realistic click
      function simulateClick(el) {
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
      }

      // Helper: wait for element to appear
      function waitForElement(selector, timeout = 8000) {
        return new Promise((res) => {
          const el = document.querySelector(selector);
          if (el) return res(el);
          const observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) { observer.disconnect(); res(el); }
          });
          observer.observe(document.body, { childList: true, subtree: true });
          setTimeout(() => { observer.disconnect(); res(null); }, timeout);
        });
      }

      // Step 1: Find and click the composer trigger
      let composerTrigger = null;
      
      // Try data-pagelet first
      const pagelet = document.querySelector('div[data-pagelet="GroupInlineComposer"]');
      if (pagelet) {
        const btn = pagelet.querySelector('[role="button"]');
        if (btn) composerTrigger = btn;
      }

      // Fallback: search by text
      if (!composerTrigger) {
        const allButtons = document.querySelectorAll('[role="button"]');
        const triggerTexts = [
          'write something', 'escreva algo', "what's on your mind",
          'no que você está pensando', 'o que você está pensando',
          'escreva algo para o grupo', 'write something to the group'
        ];
        for (const btn of allButtons) {
          const text = btn.textContent.toLowerCase().trim();
          if (triggerTexts.some(t => text.includes(t))) {
            composerTrigger = btn;
            break;
          }
        }
      }

      if (!composerTrigger) {
        resolve({ error: 'Compositor de post não encontrado. Verifique se a página do grupo carregou.' });
        return;
      }

      simulateClick(composerTrigger);

      // Step 2: Wait for the editor to appear
      waitForElement('[contenteditable="true"][role="textbox"]', 10000).then((editor) => {
        if (!editor) {
          resolve({ error: 'Editor de texto não apareceu após clicar no compositor' });
          return;
        }

        // Small delay for modal to fully render
        setTimeout(() => {
          editor.focus();

          // Type using execCommand + fallback
          const typed = document.execCommand('insertText', false, fullMessage);

          if (!typed) {
            // Fallback: set innerHTML and dispatch events
            editor.textContent = fullMessage;
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));
          }

          // Dispatch React-compatible input event
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLElement.prototype, 'textContent'
          );
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          editor.dispatchEvent(new Event('change', { bubbles: true }));

          // Step 3: Wait then find and click Post button
          setTimeout(() => {
            // Look for the submit button in dialog/form
            const postButtons = document.querySelectorAll('[role="button"]');
            let postBtn = null;

            // Priority: look for aria-label match first (more reliable)
            for (const btn of postButtons) {
              const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
              if (ariaLabel === 'post' || ariaLabel === 'publicar' || ariaLabel === 'postar') {
                postBtn = btn;
                break;
              }
            }

            // Fallback: text content match
            if (!postBtn) {
              for (const btn of postButtons) {
                const text = btn.textContent.trim().toLowerCase();
                if (text === 'post' || text === 'publicar' || text === 'postar') {
                  // Make sure it's not disabled
                  if (!btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
                    postBtn = btn;
                    break;
                  }
                }
              }
            }

            // Also try form submit
            if (!postBtn) {
              const forms = document.querySelectorAll('form[method="POST"]');
              for (const form of forms) {
                const submitBtn = form.querySelector('[type="submit"], [role="button"]');
                if (submitBtn) { postBtn = submitBtn; break; }
              }
            }

            if (postBtn) {
              // Check if button is disabled (FB disables until text is entered)
              if (postBtn.getAttribute('aria-disabled') === 'true') {
                // Try clicking anyway after a delay
                setTimeout(() => {
                  simulateClick(postBtn);
                  resolve({ success: true });
                }, 2000);
              } else {
                simulateClick(postBtn);
                resolve({ success: true });
              }
            } else {
              resolve({ error: 'Botão de publicar não encontrado. O texto foi digitado mas não foi possível enviar.' });
            }
          }, 3000);
        }, 1500);
      });
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
