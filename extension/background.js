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

  if (result && result[0] && result[0].result && result[0].result.error) {
    if (settings.closeTabAfter) {
      try { await chrome.tabs.remove(tab.id); } catch (e) {}
    }
    throw new Error(result[0].result.error);
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

      function simulateClick(el) {
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
      }

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

      let composerTrigger = null;
      const pagelet = document.querySelector('div[data-pagelet="GroupInlineComposer"]');
      if (pagelet) {
        const btn = pagelet.querySelector('[role="button"]');
        if (btn) composerTrigger = btn;
      }

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
        resolve({ error: 'Compositor de post não encontrado.' });
        return;
      }

      simulateClick(composerTrigger);

      waitForElement('[contenteditable="true"][role="textbox"]', 10000).then((editor) => {
        if (!editor) {
          resolve({ error: 'Editor de texto não apareceu após clicar no compositor' });
          return;
        }

        setTimeout(() => {
          editor.focus();
          const typed = document.execCommand('insertText', false, fullMessage);
          if (!typed) {
            editor.textContent = fullMessage;
            editor.dispatchEvent(new Event('input', { bubbles: true }));
          }
          editor.dispatchEvent(new Event('input', { bubbles: true }));

          setTimeout(() => {
            const postButtons = document.querySelectorAll('[role="button"]');
            let postBtn = null;

            for (const btn of postButtons) {
              const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
              if (ariaLabel === 'post' || ariaLabel === 'publicar' || ariaLabel === 'postar') {
                postBtn = btn;
                break;
              }
            }

            if (!postBtn) {
              for (const btn of postButtons) {
                const text = btn.textContent.trim().toLowerCase();
                if ((text === 'post' || text === 'publicar' || text === 'postar') &&
                    !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
                  postBtn = btn;
                  break;
                }
              }
            }

            if (postBtn) {
              if (postBtn.getAttribute('aria-disabled') === 'true') {
                setTimeout(() => { simulateClick(postBtn); resolve({ success: true }); }, 2000);
              } else {
                simulateClick(postBtn);
                resolve({ success: true });
              }
            } else {
              resolve({ error: 'Botão de publicar não encontrado.' });
            }
          }, 3000);
        }, 1500);
      });
    } catch (err) {
      resolve({ error: err.message });
    }
  });
}
