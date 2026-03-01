// Background service worker for Facebook Group Auto Poster
// Handles posting logic so it persists even when popup is closed

let postingState = {
  isPosting: false,
  currentIndex: 0,
  totalGroups: 0,
  currentGroupName: '',
  statusText: '',
  progress: 0
};

chrome.runtime.onInstalled.addListener(() => {
  console.log('Facebook Group Auto Poster instalado!');
  chrome.storage.local.get(['settings'], (data) => {
    if (!data.settings) {
      chrome.storage.local.set({
        settings: { delay: 30, randomDelay: true, closeTabAfter: true }
      });
    }
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_POSTING') {
    startPosting(message.groups, message.message, message.link, message.imageDataUrl, message.anonymous, message.settings);
    sendResponse({ started: true });
    return true;
  }

  if (message.type === 'STOP_POSTING') {
    postingState.isPosting = false;
    postingState.statusText = '⛔ Postagem interrompida pelo usuário';
    savePostingState();
    sendResponse({ stopped: true });
    return true;
  }

  if (message.type === 'GET_POSTING_STATUS') {
    sendResponse({ ...postingState });
    return true;
  }

  if (message.type === 'GET_TAB_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] || null });
    });
    return true;
  }

  if (message.type === 'CLOSE_TAB') {
    chrome.tabs.remove(message.tabId).catch(() => {});
    sendResponse({ success: true });
    return true;
  }
});

function savePostingState() {
  chrome.storage.local.set({ postingState });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getDelay(settings) {
  let delay = settings.delay;
  if (settings.randomDelay) {
    const variation = Math.floor(delay * 0.5);
    delay += Math.floor(Math.random() * variation) - Math.floor(variation / 2);
  }
  return Math.max(10, delay);
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 30000);
  });
}

async function startPosting(selectedGroups, message, link, imageDataUrl, anonymous, settings) {
  postingState.isPosting = true;
  postingState.currentIndex = 0;
  postingState.totalGroups = selectedGroups.length;
  postingState.statusText = `🚀 Iniciando postagem em ${selectedGroups.length} grupo(s)...`;
  postingState.progress = 0;
  savePostingState();

  for (let i = 0; i < selectedGroups.length; i++) {
    if (!postingState.isPosting) break;

    const group = selectedGroups[i];
    postingState.currentIndex = i;
    postingState.currentGroupName = group.name;
    postingState.statusText = `📤 Postando em: ${group.name} (${i + 1}/${selectedGroups.length})`;
    postingState.progress = ((i + 1) / selectedGroups.length) * 100;
    savePostingState();

    try {
      await postToGroup(group, message, link, imageDataUrl, anonymous, settings);
      postingState.statusText = `✅ Postado em: ${group.name} (${i + 1}/${selectedGroups.length})`;
      savePostingState();
    } catch (err) {
      postingState.statusText = `❌ Erro em ${group.name}: ${err.message}`;
      savePostingState();
    }

    if (i < selectedGroups.length - 1 && postingState.isPosting) {
      const delay = getDelay(settings);
      postingState.statusText = `⏳ Aguardando ${delay}s antes do próximo post...`;
      savePostingState();
      await sleep(delay * 1000);
    }
  }

  if (postingState.isPosting) {
    postingState.statusText = '🎉 Postagem concluída em todos os grupos!';
    postingState.progress = 100;
  }
  postingState.isPosting = false;
  savePostingState();
}

async function postToGroup(group, message, link, imageDataUrl, anonymous, settings) {
  const tab = await chrome.tabs.create({ url: group.url, active: false });
  await waitForTabLoad(tab.id);
  await sleep(3000);

  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: autoPost,
    args: [message, link, imageDataUrl, anonymous]
  });

  const execution = result && result[0] ? result[0].result : null;
  if (!execution || execution.success !== true) {
    if (settings.closeTabAfter) {
      try { await chrome.tabs.remove(tab.id); } catch (e) {}
    }
    throw new Error((execution && execution.error) || 'Falha ao confirmar publicação');
  }

  await sleep(5000);

  if (settings.closeTabAfter) {
    try { await chrome.tabs.remove(tab.id); } catch (e) {}
  }
}

// This function runs INSIDE the Facebook tab
function autoPost(message, link, imageDataUrl, anonymous) {
  return new Promise((resolve) => {
    try {
      const fullMessage = link ? `${message}\n\n${link}` : message;
      const POST_LABELS = new Set(['post', 'publicar', 'postar']);

      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const normalize = (value = '') => value.toLowerCase().replace(/\s+/g, ' ').trim();
      const isVisible = (el) => !!el && el.offsetParent !== null;
      const isDisabled = (el) => !!el && (el.disabled === true || el.getAttribute('aria-disabled') === 'true');

      function simulateHumanClick(el) {
        if (!el) return;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };

        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
      }

      async function waitForCondition(condition, timeout = 12000, interval = 250) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
          if (condition()) return true;
          await sleep(interval);
        }
        return false;
      }

      function getComposerDialog() {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        for (const dialog of dialogs) {
          if (dialog.querySelector('[contenteditable="true"][role="textbox"]')) {
            return dialog;
          }
        }
        return null;
      }

      function getEditor(dialog) {
        if (!dialog) return null;
        const editors = dialog.querySelectorAll('[contenteditable="true"][role="textbox"]');
        for (const editor of editors) {
          if (isVisible(editor)) return editor;
        }
        return editors[0] || null;
      }

      function findComposerTrigger() {
        const triggerTexts = [
          'write something',
          'escreva algo',
          "what's on your mind",
          'no que você está pensando',
          'o que você está pensando',
          'escreva algo para o grupo',
          'write something to the group'
        ];

        const pagelet = document.querySelector('div[data-pagelet="GroupInlineComposer"]');
        if (pagelet) {
          const btn = pagelet.querySelector('[role="button"]');
          if (btn) return btn;
        }

        const allButtons = document.querySelectorAll('[role="button"]');
        for (const btn of allButtons) {
          const text = normalize(btn.textContent || '');
          const aria = normalize(btn.getAttribute('aria-label') || '');
          if (triggerTexts.some((t) => text.includes(t) || aria.includes(t))) {
            return btn;
          }
        }

        return null;
      }

      function findPostButton(dialog) {
        if (!dialog) return null;

        const candidates = Array.from(dialog.querySelectorAll('[role="button"], button, div[aria-label]'))
          .filter((el) => {
            if (!isVisible(el)) return false;
            const text = normalize(el.textContent || '');
            const aria = normalize(el.getAttribute('aria-label') || '');
            return POST_LABELS.has(text) || POST_LABELS.has(aria);
          })
          .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);

        return candidates[0] || null;
      }

      function injectText(editor, text) {
        editor.focus();

        try {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(editor);
          selection.removeAllRanges();
          selection.addRange(range);
          document.execCommand('delete', false, null);
        } catch (_) {}

        try {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        } catch (_) {}

        let typed = false;
        try {
          typed = document.execCommand('insertText', false, text);
        } catch (_) {}

        if (!typed || normalize(editor.textContent || '') === '') {
          editor.textContent = text;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      // Convert data URL to File object for image upload
      function dataURLtoFile(dataUrl, filename) {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new File([u8arr], filename, { type: mime });
      }

      // Find and click the photo/image upload button in the composer dialog
      async function attachImage(dialog, dataUrl) {
        // Look for the photo/video button in the composer
        const photoLabels = ['photo', 'foto', 'foto/vídeo', 'photo/video', 'imagem', 'image'];
        
        // First try: find "Photo/Video" action bar button in the dialog
        const actionButtons = dialog.querySelectorAll('[role="button"], button');
        let photoBtn = null;
        for (const btn of actionButtons) {
          const text = normalize(btn.textContent || '');
          const aria = normalize(btn.getAttribute('aria-label') || '');
          if (photoLabels.some(l => text.includes(l) || aria.includes(l))) {
            photoBtn = btn;
            break;
          }
        }

        // Also try icon-based buttons (green camera icon)
        if (!photoBtn) {
          const imgs = dialog.querySelectorAll('img, i, svg');
          for (const img of imgs) {
            const parent = img.closest('[role="button"]');
            if (parent) {
              const aria = normalize(parent.getAttribute('aria-label') || '');
              if (photoLabels.some(l => aria.includes(l))) {
                photoBtn = parent;
                break;
              }
            }
          }
        }

        if (photoBtn) {
          simulateHumanClick(photoBtn);
          await sleep(1500);
        }

        // Find file input (Facebook creates one when photo button is clicked)
        const found = await waitForCondition(() => {
          const inputs = document.querySelectorAll('input[type="file"][accept*="image"]');
          return inputs.length > 0;
        }, 5000, 300);

        const fileInputs = document.querySelectorAll('input[type="file"][accept*="image"]');
        if (fileInputs.length === 0) {
          // Fallback: try any file input
          const anyInput = document.querySelector('input[type="file"]');
          if (!anyInput) return false;
          const file = dataURLtoFile(dataUrl, 'image.jpg');
          const dt = new DataTransfer();
          dt.items.add(file);
          anyInput.files = dt.files;
          anyInput.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(2000);
          return true;
        }

        const fileInput = fileInputs[fileInputs.length - 1];
        const file = dataURLtoFile(dataUrl, 'image.jpg');
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(2000);
        return true;
      }

      // Try to enable anonymous posting
      async function enableAnonymous(dialog) {
        const anonLabels = ['anônimo', 'anonymous', 'anonimo', 'anon'];
        
        // Look for anonymous toggle/dropdown in dialog
        const allElements = dialog.querySelectorAll('[role="button"], [role="switch"], [role="checkbox"], button, label, span');
        for (const el of allElements) {
          const text = normalize(el.textContent || '');
          const aria = normalize(el.getAttribute('aria-label') || '');
          if (anonLabels.some(l => text.includes(l) || aria.includes(l))) {
            simulateHumanClick(el);
            await sleep(1000);
            return true;
          }
        }

        // Try the "more options" or dropdown near the profile pic at the top of composer
        const dropdowns = dialog.querySelectorAll('[role="button"]');
        for (const dd of dropdowns) {
          const aria = normalize(dd.getAttribute('aria-label') || '');
          if (aria.includes('posting as') || aria.includes('publicando como') || aria.includes('postar como')) {
            simulateHumanClick(dd);
            await sleep(1000);
            
            // Now look for anonymous option in the dropdown that appeared
            const found = await waitForCondition(() => {
              const menus = document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"]');
              for (const menu of menus) {
                const items = menu.querySelectorAll('[role="menuitem"], [role="option"], [role="radio"], [role="button"]');
                for (const item of items) {
                  const t = normalize(item.textContent || '');
                  if (anonLabels.some(l => t.includes(l))) return true;
                }
              }
              return false;
            }, 3000, 300);

            if (found) {
              const menus = document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"]');
              for (const menu of menus) {
                const items = menu.querySelectorAll('[role="menuitem"], [role="option"], [role="radio"], [role="button"]');
                for (const item of items) {
                  const t = normalize(item.textContent || '');
                  if (anonLabels.some(l => t.includes(l))) {
                    simulateHumanClick(item);
                    await sleep(1000);
                    return true;
                  }
                }
              }
            }
            break;
          }
        }

        return false;
      }

      async function run() {
        const composerTrigger = findComposerTrigger();
        if (!composerTrigger) {
          return resolve({ error: 'Compositor de post não encontrado.' });
        }

        simulateHumanClick(composerTrigger);

        const opened = await waitForCondition(() => !!getComposerDialog(), 12000, 250);
        if (!opened) {
          return resolve({ error: 'Modal de criação de post não abriu.' });
        }

        const dialog = getComposerDialog();
        const editor = getEditor(dialog);
        if (!editor) {
          return resolve({ error: 'Editor de texto não apareceu.' });
        }

        // Enable anonymous posting if requested
        if (anonymous) {
          await enableAnonymous(dialog);
          await sleep(500);
        }

        // Inject text
        if (fullMessage) {
          injectText(editor, fullMessage);
          await sleep(700);

          if (normalize(editor.textContent || '') === '') {
            injectText(editor, fullMessage);
            await sleep(700);
          }
        }

        // Attach image if provided
        if (imageDataUrl) {
          const imgOk = await attachImage(dialog, imageDataUrl);
          if (!imgOk) {
            console.warn('Não foi possível anexar a imagem, continuando sem ela.');
          }
          await sleep(2000);
        }

        const buttonEnabled = await waitForCondition(() => {
          const currentDialog = getComposerDialog();
          const btn = findPostButton(currentDialog);
          return !!btn && !isDisabled(btn);
        }, 15000, 300);

        if (!buttonEnabled) {
          const currentDialog = getComposerDialog();
          const btn = findPostButton(currentDialog);
          if (!btn) {
            return resolve({ error: 'Botão de publicar não encontrado no modal.' });
          }
          return resolve({ error: 'Botão de publicar permaneceu desabilitado.' });
        }

        const postBtn = findPostButton(getComposerDialog());
        if (!postBtn || isDisabled(postBtn)) {
          return resolve({ error: 'Botão de publicar indisponível no momento do clique.' });
        }

        simulateHumanClick(postBtn);

        let closed = await waitForCondition(() => !getComposerDialog(), 15000, 300);

        if (!closed) {
          const retryBtn = findPostButton(getComposerDialog());
          if (retryBtn && !isDisabled(retryBtn)) {
            simulateHumanClick(retryBtn);
            closed = await waitForCondition(() => !getComposerDialog(), 8000, 300);
          }
        }

        if (!closed) {
          return resolve({ error: 'Clique em publicar não foi confirmado (modal continuou aberto).' });
        }

        return resolve({ success: true });
      }

      run().catch((err) => resolve({ error: err.message || 'Erro desconhecido na automação' }));
    } catch (err) {
      resolve({ error: err.message });
    }
  });
}
