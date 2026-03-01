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
    startPosting(message.groups, message.message, message.link, message.settings);
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

async function startPosting(selectedGroups, message, link, settings) {
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
      await postToGroup(group, message, link, settings);
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

async function postToGroup(group, message, link, settings) {
  const tab = await chrome.tabs.create({ url: group.url, active: false });
  await waitForTabLoad(tab.id);
  await sleep(3000);

  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: autoPost,
    args: [message, link]
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
function autoPost(message, link) {
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
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        } catch (_) {}

        let typed = false;
        try {
          typed = document.execCommand('insertText', false, text);
        } catch (_) {}

        if (!typed || normalize(editor.textContent || '') === '') {
          editor.textContent = text;
        }

        try {
          editor.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: text
          }));
        } catch (_) {
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        }

        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
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

        injectText(editor, fullMessage);
        await sleep(700);

        if (normalize(editor.textContent || '') === '') {
          injectText(editor, fullMessage);
          await sleep(700);
        }

        const buttonEnabled = await waitForCondition(() => {
          const currentDialog = getComposerDialog();
          const btn = findPostButton(currentDialog);
          return !!btn && !isDisabled(btn);
        }, 12000, 300);

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

        // Só considera sucesso se o modal realmente fechar
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
