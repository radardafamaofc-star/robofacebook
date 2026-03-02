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

// Leave state
let leaveState = {
  isLeaving: false,
  statusText: '',
  progress: 0,
  leftGroupIds: []
};

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

  if (message.type === 'LEAVE_ALL_GROUPS') {
    leaveAllGroupsBg(message.groups);
    sendResponse({ started: true });
    return true;
  }

  if (message.type === 'GET_LEAVE_STATUS') {
    sendResponse({ ...leaveState });
    return true;
  }

  if (message.type === 'STOP_LEAVING') {
    leaveState.isLeaving = false;
    sendResponse({ stopped: true });
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

function sendDebuggerCommand(target, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve(result);
    });
  });
}

async function dispatchTrustedClick(tabId, x, y) {
  const target = { tabId };
  const clickX = Math.max(1, Math.round(x));
  const clickY = Math.max(1, Math.round(y));

  await new Promise((resolve, reject) => {
    chrome.debugger.attach(target, '1.3', () => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve();
    });
  });

  try {
    await sendDebuggerCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: clickX, y: clickY });
    await sendDebuggerCommand(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: clickX, y: clickY, button: 'left', clickCount: 1 });
    await sendDebuggerCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: clickX, y: clickY, button: 'left', clickCount: 1 });
    return true;
  } finally {
    await new Promise((resolve) => {
      chrome.debugger.detach(target, () => resolve());
    });
  }
}

async function isComposerClosed(tabId) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        for (const dialog of dialogs) {
          if (dialog.querySelector('[contenteditable="true"][role="textbox"]')) {
            return false;
          }
        }
        return true;
      }
    });

    return !!(result && result[0] && result[0].result === true);
  } catch (_) {
    return false;
  }
}

async function startPosting(selectedGroups, message, link, imageDataUrl, anonymous, settings) {
  postingState.isPosting = true;
  postingState.currentIndex = 0;
  postingState.totalGroups = selectedGroups.length;
  postingState.statusText = `🚀 Iniciando postagem em ${selectedGroups.length} grupo(s)...`;
  postingState.progress = 0;
  savePostingState();

  let loopCount = 0;

  do {
    loopCount++;
    if (loopCount > 1) {
      postingState.statusText = `🔄 Loop #${loopCount} — Recomeçando postagem em ${selectedGroups.length} grupo(s)...`;
      postingState.progress = 0;
      savePostingState();
    }

    for (let i = 0; i < selectedGroups.length; i++) {
      if (!postingState.isPosting) break;

      const group = selectedGroups[i];
      postingState.currentIndex = i;
      postingState.currentGroupName = group.name;
      postingState.statusText = `📤 ${settings.loopPosting ? `[Loop #${loopCount}] ` : ''}Postando em: ${group.name} (${i + 1}/${selectedGroups.length})`;
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

    // If loop is enabled, wait before restarting
    if (settings.loopPosting && postingState.isPosting) {
      const delay = getDelay(settings);
      postingState.statusText = `🔄 Loop #${loopCount} concluído! Reiniciando em ${delay}s...`;
      postingState.progress = 100;
      savePostingState();
      await sleep(delay * 1000);
    }

  } while (settings.loopPosting && postingState.isPosting);

  if (postingState.isPosting) {
    postingState.statusText = '🎉 Postagem concluída em todos os grupos!';
    postingState.progress = 100;
  }
  postingState.isPosting = false;
  savePostingState();
}

async function postToGroup(group, message, link, imageDataUrl, anonymous, settings) {
  // No fluxo anônimo, manter aba ativa melhora confiabilidade de clique em modais do Facebook
  const tab = await chrome.tabs.create({ url: group.url, active: !!anonymous });
  await waitForTabLoad(tab.id);
  await sleep(anonymous ? 4500 : 3000);

  if (anonymous) {
    try { await chrome.tabs.update(tab.id, { active: true }); } catch (_) {}
    await sleep(1200);
  }

  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: autoPost,
    args: [message, link, imageDataUrl, anonymous]
  });

  const execution = result && result[0] ? result[0].result : null;
  if (!execution || execution.success !== true) {
    let recovered = false;

    if (execution?.publishRetryPoint) {
      postingState.statusText = '🛠️ Tentando envio com clique confiável...';
      savePostingState();

      const { x, y, label } = execution.publishRetryPoint;
      if (label) {
        console.warn('[PUBLISH] Retry trusted click no botão:', label);
      }

      for (let attempt = 0; attempt < 2 && !recovered; attempt++) {
        try {
          await dispatchTrustedClick(tab.id, x, y);
          await sleep(1200 + (attempt * 700));
          recovered = await isComposerClosed(tab.id);
        } catch (err) {
          console.warn('[PUBLISH] Falha no trusted click:', err?.message || err);
          break;
        }
      }
    }

    if (!recovered) {
      if (settings.closeTabAfter) {
        try { await chrome.tabs.remove(tab.id); } catch (e) {}
      }
      throw new Error((execution && execution.error) || 'Falha ao confirmar publicação');
    }
  }

  const settleMs = anonymous ? 18000 : 12000;
  postingState.statusText = `⌛ Confirmando envio no Facebook (${Math.round(settleMs / 1000)}s)...`;
  savePostingState();
  await sleep(settleMs);

  if (settings.closeTabAfter && execution?.canCloseTab !== false) {
    try { await chrome.tabs.remove(tab.id); } catch (e) {}
  }
}

// This function runs INSIDE the Facebook tab
function autoPost(message, link, imageDataUrl, anonymous) {
  return new Promise((resolve) => {
    try {
      const fullMessage = link ? `${message}\n\n${link}` : message;
      const POST_LABELS = new Set(['post', 'publicar', 'postar', 'publish', 'enviar', 'send']);

      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const normalize = (value = '') => value.toLowerCase().replace(/\s+/g, ' ').trim();
      const isVisible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      };
      const isDisabled = (el) => !!el && (el.disabled === true || el.getAttribute('aria-disabled') === 'true');

      function dispatchPointerMouseClick(target, x, y) {
        const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        target.dispatchEvent(new PointerEvent('pointerdown', opts));
        target.dispatchEvent(new MouseEvent('mousedown', opts));
        target.dispatchEvent(new PointerEvent('pointerup', opts));
        target.dispatchEvent(new MouseEvent('mouseup', opts));
        target.dispatchEvent(new MouseEvent('click', opts));
      }

      function simulateHumanClick(el) {
        if (!el) return false;
        try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}

        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        let target = el;
        try {
          const topEl = document.elementFromPoint(x, y);
          const clickableTop = topEl && topEl.closest
            ? topEl.closest('[role="button"], button, [tabindex="0"], div[aria-label], a[role="button"]')
            : null;
          if (clickableTop) target = clickableTop;
        } catch (_) {}

        try { dispatchPointerMouseClick(target, x, y); } catch (_) {}
        if (target !== el) {
          try { dispatchPointerMouseClick(el, x, y); } catch (_) {}
        }
        try { target.click(); } catch (_) {}
        if (target !== el) {
          try { el.click(); } catch (_) {}
        }

        return true;
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

        const exactSubmitLabels = new Set([
          'publicar',
          'postar',
          'post',
          'publish',
          'enviar',
          'send',
          'publicar anonimamente',
          'postar anonimamente',
          'post anonymously',
          'publish anonymously'
        ]);

        const submitPhraseHints = [
          'publicar anonimamente',
          'postar anonimamente',
          'post anonymously',
          'publish anonymously'
        ];

        const denyHints = [
          'entendi', 'ok', 'okay', 'cancelar', 'cancel', 'fechar', 'close',
          'voltar', 'back', 'dispensar', 'dismiss', 'adicionar ao post', 'add to your post'
        ];

        const dialogRect = dialog.getBoundingClientRect();

        const candidates = Array.from(dialog.querySelectorAll('[role="button"], button, div[aria-label]'))
          .filter((el) => {
            if (!isVisible(el) || isDisabled(el)) return false;

            const text = normalize(el.textContent || '');
            const aria = normalize(el.getAttribute('aria-label') || '');
            const label = normalize(`${text} ${aria}`);
            if (!label) return false;
            if (denyHints.some((hint) => label === hint || label.includes(hint))) return false;

            const hasExact = exactSubmitLabels.has(text) || exactSubmitLabels.has(aria) || exactSubmitLabels.has(label);
            const hasHint = submitPhraseHints.some((hint) => label.includes(hint));
            if (!hasExact && !hasHint) return false;

            const rect = el.getBoundingClientRect();
            if (rect.width < 90 || rect.height < 24) return false;

            // Para labels genéricas (enviar/send), exigir posição de CTA no rodapé
            const isGenericSend = label === 'enviar' || label === 'send' || text === 'enviar' || text === 'send' || aria === 'enviar' || aria === 'send';
            if (isGenericSend) {
              const footerZone = rect.top > (dialogRect.top + dialogRect.height * 0.62);
              const wideEnough = rect.width > (dialogRect.width * 0.42);
              if (!footerZone || !wideEnough) return false;
            }

            // Evitar wrappers grandes demais que engolem texto do modal inteiro
            if (rect.width > dialogRect.width * 0.98 && rect.height > dialogRect.height * 0.55) return false;

            return true;
          })
          .map((el) => {
            const rect = el.getBoundingClientRect();
            const text = normalize(el.textContent || '');
            const aria = normalize(el.getAttribute('aria-label') || '');
            const label = normalize(`${text} ${aria}`);
            const hasExact = exactSubmitLabels.has(text) || exactSubmitLabels.has(aria) || exactSubmitLabels.has(label);
            const exactBonus = hasExact ? 280 : 0;
            const footerBonus = rect.top > (dialogRect.top + dialogRect.height * 0.62) ? 120 : 0;
            const widthBonus = rect.width > (dialogRect.width * 0.5) ? 120 : 0;
            const anonymousBonus = label.includes('anonim') || label.includes('anonymous') ? 20 : 0;
            const score = exactBonus + footerBonus + widthBonus + anonymousBonus + rect.bottom;
            return { el, score };
          })
          .sort((a, b) => b.score - a.score);

        return candidates[0]?.el || null;
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
        const anonLabels = ['anonimamente', 'anônimo', 'anonymous', 'anonimo', 'anonymously', 'postar anonimamente', 'post anonymously', 'membro anônimo', 'anonymous member'];
        
        // Strategy 1: Look for a direct anonymous toggle/switch in dialog
        const toggleElements = dialog.querySelectorAll('[role="switch"], [role="checkbox"], input[type="checkbox"]');
        for (const el of toggleElements) {
          // Walk up multiple levels to find the text container
          let parent = el.parentElement;
          for (let depth = 0; depth < 5 && parent && parent !== dialog; depth++) {
            const text = normalize(parent.textContent || '');
            if (anonLabels.some(l => text.includes(l))) {
              // Check if anonymous mode is already ON before clicking
              const ariaChecked = el.getAttribute('aria-checked');
              const hasCheckedProp = typeof el.checked === 'boolean';
              const isCurrentlyOn = ariaChecked === 'true' || (hasCheckedProp && el.checked === true);

              if (!isCurrentlyOn) {
                simulateHumanClick(el);
                await waitForCondition(() => el.getAttribute('aria-checked') === 'true', 2500, 150);
                await sleep(900);
              }
              return true;
            }
            parent = parent.parentElement;
          }
        }

        // Strategy 2: Click on the profile/identity area at the top of the composer
        // Facebook shows a clickable area with user name/photo that opens identity picker
        const profileButtons = dialog.querySelectorAll('[role="button"]');
        for (const btn of profileButtons) {
          const aria = normalize(btn.getAttribute('aria-label') || '');
          const text = normalize(btn.textContent || '');
          
          // Look for identity picker trigger
          const identityHints = [
            'posting as', 'publicando como', 'postar como',
            'post as', 'publicar como', 'selecionar público',
            'choose audience', 'select audience'
          ];
          
          if (identityHints.some(h => aria.includes(h) || text.includes(h))) {
            simulateHumanClick(btn);
            await sleep(1500);
            
            // Look for anonymous option in any new dialog/menu/dropdown
            const anonFound = await findAndClickAnonymousOption(anonLabels);
            if (anonFound) return true;
            break;
          }
        }

        // Strategy 3: Look for small dropdown/button near the top of dialog (profile section)
        // Usually the first few buttons in the dialog header area
        const dialogChildren = dialog.querySelectorAll('div');
        for (const div of dialogChildren) {
          // Find divs that contain a profile image and a button
          const img = div.querySelector('image, img, svg');
          const btn = div.querySelector('[role="button"]');
          if (img && btn) {
            const rect = div.getBoundingClientRect();
            const dialogRect = dialog.getBoundingClientRect();
            // Only click if it's near the top of the dialog (profile area)
            if (rect.top - dialogRect.top < 120) {
              simulateHumanClick(btn);
              await sleep(1500);
              const anonFound = await findAndClickAnonymousOption(anonLabels);
              if (anonFound) return true;
              // Avoid Escape here because it can close the main composer modal on some UIs
              await sleep(300);
              break;
            }
          }
        }

        // Strategy 4: Direct text search in the entire dialog for anything anonymous
        const allClickable = dialog.querySelectorAll('[role="button"], button, label, span, a');
        for (const el of allClickable) {
          const text = normalize(el.textContent || '');
          if (anonLabels.some(l => text === l || text.includes(l))) {
            simulateHumanClick(el);
            await sleep(1000);
            return true;
          }
        }

        console.warn('Anonymous posting: could not find anonymous option');
        return false;
      }

      async function findAndClickAnonymousOption(anonLabels) {
        const found = await waitForCondition(() => {
          const containers = document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"], [role="radiogroup"], div[data-visualcompletion]');
          for (const container of containers) {
            const items = container.querySelectorAll('[role="menuitem"], [role="option"], [role="radio"], [role="button"], [role="menuitemradio"], label, span, div');
            for (const item of items) {
              const t = normalize(item.textContent || '');
              if (anonLabels.some(l => t.includes(l))) return true;
            }
          }
          return false;
        }, 4000, 300);

        if (!found) return false;

        const containers = document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"], [role="radiogroup"], div[data-visualcompletion]');
        for (const container of containers) {
          const items = container.querySelectorAll('[role="menuitem"], [role="option"], [role="radio"], [role="button"], [role="menuitemradio"], label, span, div');
          for (const item of items) {
            const t = normalize(item.textContent || '');
            if (anonLabels.some(l => t.includes(l))) {
              simulateHumanClick(item);
              await sleep(1000);
              
              // Confirm/save if there's a confirm button
              const confirmLabels = ['salvar', 'save', 'confirmar', 'confirm', 'done', 'concluído'];
              await sleep(500);
              const allBtns = document.querySelectorAll('[role="button"], button');
              for (const cb of allBtns) {
                const ct = normalize(cb.textContent || '');
                if (confirmLabels.some(l => ct === l) && isVisible(cb)) {
                  simulateHumanClick(cb);
                  await sleep(1000);
                  break;
                }
              }
              return true;
            }
          }
        }
        return false;
      }

      async function dismissAnonymousInfoModal() {
        const infoLabels = [
          'post anônimo', 'post anonimo', 'posts anônimos', 'posts anonimos',
          'postagem anônima', 'postagem anonima', 'publicação anônima', 'publicacao anonima',
          'anonymous post', 'anonymous posts'
        ];
        const dismissLabels = [
          'entendi', 'ok', 'okay', 'got it', 'continuar', 'continue',
          'fechar', 'close', 'agora não', 'agora nao', 'dispensar', 'dismiss'
        ];
        const postLikeLabels = ['publicar', 'postar', 'post', 'publish'];

        const isElementRenderable = (el) => {
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          if (style.pointerEvents === 'none') return false;
          return true;
        };

        const getDocuments = () => {
          const docs = [document];
          const iframes = document.querySelectorAll('iframe');
          for (const frame of iframes) {
            try {
              if (frame.contentDocument && frame.contentWindow && frame.contentWindow.location.origin === window.location.origin) {
                docs.push(frame.contentDocument);
              }
            } catch (_) {}
          }
          return docs;
        };

        const getLabel = (el) => normalize([
          el.textContent || '',
          el.getAttribute('aria-label') || '',
          el.getAttribute('title') || '',
          el.getAttribute('value') || ''
        ].join(' '));

        const isDismissLabel = (label) => dismissLabels.some((l) => label === l || label.includes(l));

        const isAnonymousInfoDialog = (dialog) => {
          if (!dialog || !isElementRenderable(dialog)) return false;
          const text = normalize(dialog.textContent || '');
          return infoLabels.some((label) => text.includes(label));
        };

        const hasAnonymousInfoModal = (doc) => {
          const dialogs = doc.querySelectorAll('[role="dialog"], [role="alertdialog"], div[aria-modal="true"]');
          for (const dialog of dialogs) {
            if (dialog.querySelector('[contenteditable="true"][role="textbox"]')) continue;
            const hasDismissBtn = Array.from(dialog.querySelectorAll('[role="button"], button, [tabindex="0"], div[aria-label], a[role="button"]'))
              .some((b) => isDismissLabel(getLabel(b)));
            if (hasDismissBtn && isAnonymousInfoDialog(dialog)) return true;
          }
          return false;
        };

        const dispatchClickLike = (doc, target) => {
          if (!target) return;
          const view = doc.defaultView || window;
          const rect = target.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const opts = { bubbles: true, cancelable: true, composed: true, view, clientX: x, clientY: y };

          target.dispatchEvent(new PointerEvent('pointerdown', opts));
          target.dispatchEvent(new MouseEvent('mousedown', opts));
          target.dispatchEvent(new PointerEvent('pointerup', opts));
          target.dispatchEvent(new MouseEvent('mouseup', opts));
          target.dispatchEvent(new MouseEvent('click', opts));
          try { target.click(); } catch (_) {}
        };

        const clickPrimaryAreaOfAnonymousDialog = async (doc, dialog) => {
          if (!dialog || !isElementRenderable(dialog)) return false;
          const rect = dialog.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;

          const x = rect.left + rect.width / 2;
          const y = rect.bottom - Math.max(24, Math.min(42, rect.height * 0.1));

          let target = null;
          try {
            const topEl = doc.elementFromPoint(x, y);
            if (topEl) {
              target = topEl.closest('[role="button"], button, [tabindex="0"], div[aria-label], a[role="button"]') || topEl;
            }
          } catch (_) {}

          if (!target) return false;
          dispatchClickLike(doc, target);
          await sleep(180);
          return true;
        };

        const clickElementRobust = async (doc, el) => {
          if (!el) return;

          const candidates = [
            el,
            el.closest('[role="button"], button, [tabindex="0"], div[aria-label], a[role="button"]'),
            el.querySelector?.('[role="button"], button, [tabindex="0"], div[aria-label], a[role="button"]') || null,
            el.parentElement
          ].filter(Boolean);

          for (const candidate of candidates) {
            if (!isElementRenderable(candidate)) continue;

            try { candidate.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}

            const rect = candidate.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            let clickTarget = candidate;

            try {
              const topEl = doc.elementFromPoint(x, y);
              if (topEl) {
                const clickableTop = topEl.closest('[role="button"], button, [tabindex="0"], div[aria-label], a[role="button"]');
                if (clickableTop) clickTarget = clickableTop;
              }
            } catch (_) {}

            dispatchClickLike(doc, clickTarget);
            await sleep(120);
          }
        };

        const findBestDismissButton = (doc) => {
          const clickables = Array.from(doc.querySelectorAll('[role="button"], button, [tabindex="0"], div[aria-label], a[role="button"]'));
          let best = null;

          for (const el of clickables) {
            if (!isElementRenderable(el) || isDisabled(el)) continue;
            const label = getLabel(el);
            if (!label) continue;
            if (!isDismissLabel(label)) continue;
            if (postLikeLabels.some((l) => label === l || label.includes(l))) continue;

            const dialog = el.closest('[role="dialog"], [role="alertdialog"], div[aria-modal="true"]');
            const context = normalize((dialog ? dialog.textContent : el.parentElement?.textContent) || '');
            const inAnonymousContext = infoLabels.some((l) => context.includes(l));
            const preferEntendi = label.includes('entendi') ? 35 : 0;
            const preferOk = (label === 'ok' || label.includes('got it') || label.includes('okay')) ? 22 : 0;
            const inDialog = dialog ? 10 : 0;
            const score = (inAnonymousContext ? 120 : 0) + preferEntendi + preferOk + inDialog;

            if (!best || score > best.score) {
              best = { el, score };
            }
          }

          return best ? best.el : null;
        };

        const getAnonymousInfoDialogs = (doc) => {
          const dialogs = Array.from(doc.querySelectorAll('[role="dialog"], [role="alertdialog"], div[aria-modal="true"]'));
          return dialogs.filter((dialog) => {
            if (!isAnonymousInfoDialog(dialog)) return false;
            // Evita remover o compositor principal por engano
            if (dialog.querySelector('[contenteditable="true"][role="textbox"]')) return false;
            const hasDismissBtn = Array.from(dialog.querySelectorAll('[role="button"], button, [tabindex="0"], div[aria-label], a[role="button"]'))
              .some((b) => isDismissLabel(getLabel(b)));
            return hasDismissBtn;
          });
        };

        const forceHideAnonymousInfoModal = (doc) => {
          const dialogs = getAnonymousInfoDialogs(doc);
          let changed = false;

          for (const dialog of dialogs) {
            try {
              dialog.setAttribute('data-autoposter-force-hidden', 'true');
              dialog.style.setProperty('display', 'none', 'important');
              dialog.style.setProperty('visibility', 'hidden', 'important');
              dialog.style.setProperty('pointer-events', 'none', 'important');
              changed = true;
            } catch (_) {}

            try {
              dialog.remove();
              changed = true;
            } catch (_) {}
          }

          if (changed && doc.body) {
            try {
              doc.body.style.removeProperty('overflow');
              doc.body.style.removeProperty('position');
            } catch (_) {}
          }

          return changed;
        };

        let clickedAny = false;

        for (let attempt = 0; attempt < 12; attempt++) {
          const docs = getDocuments();
          const anyModalOpen = docs.some((doc) => hasAnonymousInfoModal(doc));
          let clicked = false;

          for (const doc of docs) {
            const btn = findBestDismissButton(doc);
            if (btn) {
              console.log('[ANON] Fechando popup com botão:', getLabel(btn));
              await clickElementRobust(doc, btn);
              clicked = true;
              clickedAny = true;
              break;
            }

            // Fallback: modal anônimo detectado, clicar no CTA primário mais provável
            const anonDialogs = getAnonymousInfoDialogs(doc);

            for (const dialog of anonDialogs) {
              const btns = Array.from(dialog.querySelectorAll('[role="button"], button, [tabindex="0"], div[aria-label], a[role="button"]'))
                .filter((b) => isElementRenderable(b) && !isDisabled(b));

              if (btns.length > 0) {
                const ranked = btns
                  .map((b) => {
                    const label = getLabel(b);
                    const rect = b.getBoundingClientRect();
                    const isBack = label.includes('voltar') || label.includes('back');
                    const isPostLike = postLikeLabels.some((l) => label === l || label.includes(l));
                    const dismissBonus = dismissLabels.some((l) => label === l || label.includes(l)) ? 200 : 0;
                    const entendiBonus = label.includes('entendi') ? 120 : 0;
                    return {
                      b,
                      score: dismissBonus + entendiBonus + rect.bottom - (isBack ? 1000 : 0) - (isPostLike ? 1000 : 0)
                    };
                  })
                  .sort((a, b) => b.score - a.score);

                const chosen = ranked[0]?.b;
                if (chosen) {
                  console.log('[ANON] Fallback clique no CTA do modal anônimo:', getLabel(chosen));
                  await clickElementRobust(doc, chosen);
                  clicked = true;
                  clickedAny = true;
                  break;
                }
              }

              // Fallback absoluto: clicar no ponto do CTA primário (centro inferior do modal)
              const clickedByPoint = await clickPrimaryAreaOfAnonymousDialog(doc, dialog);
              if (clickedByPoint) {
                console.log('[ANON] Fallback por coordenada no CTA do modal anônimo');
                clicked = true;
                clickedAny = true;
                break;
              }
            }

            if (clicked) break;
          }

          if (!clicked) {
            if (anyModalOpen) {
              // Último fallback: Enter/Escape para fechar o popup caso o clique seja bloqueado
              for (const doc of docs) {
                const view = doc.defaultView || window;
                const active = doc.activeElement;
                const keyOpts = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' };
                try { (active || doc.body).dispatchEvent(new KeyboardEvent('keydown', keyOpts)); } catch (_) {}
                try { (active || doc.body).dispatchEvent(new KeyboardEvent('keyup', keyOpts)); } catch (_) {}
                try { doc.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape', code: 'Escape', view })); } catch (_) {}
                try { doc.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Escape', code: 'Escape', view })); } catch (_) {}
              }
              await sleep(450);
              continue;
            }
            break;
          }

          const closed = await waitForCondition(() => {
            const currentDocs = getDocuments();
            return !currentDocs.some((doc) => hasAnonymousInfoModal(doc));
          }, 3000, 150);

          if (closed) break;
          await sleep(250);
        }

        // Fallback final: ocultar/remover à força o modal informativo de anônimo (sem tocar no compositor)
        const docsAfter = getDocuments();
        const stillOpen = docsAfter.some((doc) => hasAnonymousInfoModal(doc));
        if (stillOpen) {
          let forced = false;
          for (const doc of docsAfter) {
            if (forceHideAnonymousInfoModal(doc)) {
              forced = true;
            }
          }

          if (forced) {
            console.warn('[ANON] Modal informativo removido/ocultado à força para destravar publicação.');
            await sleep(250);
            const closedAfterForce = await waitForCondition(() => {
              const currentDocs = getDocuments();
              return !currentDocs.some((doc) => hasAnonymousInfoModal(doc));
            }, 1800, 120);

            if (closedAfterForce) return true;
          }
        }

        return clickedAny;
      }

      function isAnonymousInfoModalOpen() {
        const labels = [
          'post anônimo', 'post anonimo', 'posts anônimos', 'posts anonimos',
          'postagem anônima', 'postagem anonima', 'publicação anônima', 'publicacao anonima',
          'anonymous post', 'anonymous posts'
        ];
        const dismissLabels = [
          'entendi', 'ok', 'okay', 'got it', 'continuar', 'continue',
          'fechar', 'close', 'agora não', 'agora nao', 'dispensar', 'dismiss'
        ];

        const docs = [document];
        const iframes = document.querySelectorAll('iframe');
        for (const frame of iframes) {
          try {
            if (frame.contentDocument && frame.contentWindow && frame.contentWindow.location.origin === window.location.origin) {
              docs.push(frame.contentDocument);
            }
          } catch (_) {}
        }

        return docs.some((doc) => {
          const dialogs = doc.querySelectorAll('[role="dialog"], [role="alertdialog"], div[aria-modal="true"]');
          for (const dialog of dialogs) {
            if (!isVisible(dialog)) continue;
            if (dialog.querySelector('[contenteditable="true"][role="textbox"]')) continue;

            const hasDismissBtn = Array.from(dialog.querySelectorAll('[role="button"], button, [tabindex="0"], div[aria-label], a[role="button"]'))
              .some((btn) => dismissLabels.some((l) => {
                const t = normalize([
                  btn.textContent || '',
                  btn.getAttribute('aria-label') || '',
                  btn.getAttribute('title') || '',
                  btn.getAttribute('value') || ''
                ].join(' '));
                return t === l || t.includes(l);
              }));

            if (!hasDismissBtn) continue;

            const text = normalize(dialog.textContent || '');
            if (labels.some((label) => text.includes(label))) return true;
          }
          return false;
        });
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

        const initialDialog = getComposerDialog();
        if (!initialDialog) {
          return resolve({ error: 'Modal de criação de post não encontrado após abrir.' });
        }

        // Enable anonymous posting if requested
        if (anonymous) {
          await enableAnonymous(initialDialog);
          await dismissAnonymousInfoModal();
          await sleep(700);
        }

        // Re-acquire dialog/editor because Facebook may re-render after toggling anonymous
        const activeDialog = getComposerDialog() || initialDialog;
        const editor = getEditor(activeDialog);
        if (!editor) {
          return resolve({ error: 'Editor de texto não apareceu.' });
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
          const dialogForImage = getComposerDialog() || activeDialog;
          const imgOk = await attachImage(dialogForImage, imageDataUrl);
          if (!imgOk) {
            console.warn('Não foi possível anexar a imagem, continuando sem ela.');
          }
          await sleep(2000);
        }

        // O modal informativo do anônimo pode reaparecer próximo do clique final
        if (anonymous) {
          await dismissAnonymousInfoModal();
          await sleep(300);
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

        // Última checagem do modal anônimo antes do clique em publicar
        if (anonymous) {
          await dismissAnonymousInfoModal();
          await sleep(200);
        }

        const getPublishRetryPoint = () => {
          const btn = findPostButton(getComposerDialog());
          if (!btn || isDisabled(btn)) return null;
          const rect = btn.getBoundingClientRect();
          const label = normalize([
            btn.textContent || '',
            btn.getAttribute('aria-label') || ''
          ].join(' '));
          return {
            x: Math.round(rect.left + (rect.width / 2)),
            y: Math.round(rect.top + (rect.height / 2)),
            label
          };
        };

        const clickPublish = async () => {
          if (anonymous && isAnonymousInfoModalOpen()) {
            await dismissAnonymousInfoModal();
            await sleep(250);
          }

          const dialog = getComposerDialog();
          const btn = findPostButton(dialog);
          if (!btn || isDisabled(btn)) return false;

          const btnLabel = normalize([
            btn.textContent || '',
            btn.getAttribute('aria-label') || ''
          ].join(' '));
          console.log('[PUBLISH] Botão alvo:', btnLabel || '(sem label)');

          const clicked = simulateHumanClick(btn);
          if (!clicked) return false;

          await sleep(180);

          // Fallback imediato: um segundo clique costuma destravar quando há overlay transitório
          const refreshedBtn = findPostButton(getComposerDialog());
          if (refreshedBtn && !isDisabled(refreshedBtn)) {
            simulateHumanClick(refreshedBtn);
          }

          return true;
        };

        const clickedFirst = await clickPublish();
        if (!clickedFirst) {
          return resolve({
            error: 'Botão de publicar indisponível no momento do clique.',
            publishRetryPoint: getPublishRetryPoint()
          });
        }

        let closed = false;

        for (let attempt = 0; attempt < 3 && !closed; attempt++) {
          closed = await waitForCondition(() => !getComposerDialog(), attempt === 0 ? 6000 : 9000, 300);
          if (closed) break;

          if (anonymous) {
            await dismissAnonymousInfoModal();
            await sleep(250);
          }

          const clickedAgain = await clickPublish();
          if (!clickedAgain && anonymous) {
            await dismissAnonymousInfoModal();
            await sleep(250);
          }
        }

        if (!closed) {
          return resolve({
            error: 'Clique em publicar não foi confirmado (modal continuou aberto).',
            publishRetryPoint: getPublishRetryPoint()
          });
        }

        const detectSubmitOutcome = () => {
          const visibleText = normalize(document.body?.innerText || '');
          const successHints = [
            'sua publicação está pendente',
            'publicação enviada',
            'postado com sucesso',
            'your post is pending',
            'post published',
            'post shared'
          ];
          const failureHints = [
            'you’re temporarily blocked',
            'you are temporarily blocked',
            'temporariamente bloqueado',
            'não pode usar esse recurso',
            'não pode usar este recurso',
            'we limit how often',
            'algo deu errado',
            'something went wrong',
            'não foi possível publicar',
            'couldn\'t post'
          ];

          if (failureHints.some((hint) => visibleText.includes(hint))) return 'failure';
          if (successHints.some((hint) => visibleText.includes(hint))) return 'success';
          return 'unknown';
        };

        let outcome = 'unknown';
        await waitForCondition(() => {
          outcome = detectSubmitOutcome();
          return outcome !== 'unknown';
        }, 5000, 250);

        if (outcome === 'failure') {
          return resolve({ error: 'Facebook sinalizou falha/bloqueio após clicar em publicar.' });
        }

        // Sem sinal visual claro: mantém a aba aberta por segurança para não interromper envio.
        return resolve({ success: true, canCloseTab: outcome === 'success' });
      }

      run().catch((err) => resolve({ error: err.message || 'Erro desconhecido na automação' }));
    } catch (err) {
      resolve({ error: err.message });
    }
  });
}

// ========== LEAVE ALL GROUPS ==========
async function leaveAllGroupsBg(selectedGroups) {
  leaveState.isLeaving = true;
  leaveState.progress = 0;
  leaveState.statusText = `🚪 Saindo de ${selectedGroups.length} grupo(s)...`;
  leaveState.leftGroupIds = [];

  for (let i = 0; i < selectedGroups.length; i++) {
    if (!leaveState.isLeaving) break;

    const group = selectedGroups[i];
    leaveState.statusText = `🚪 Saindo de: ${group.name} (${i + 1}/${selectedGroups.length})`;
    leaveState.progress = ((i + 1) / selectedGroups.length) * 100;

    try {
      const tab = await chrome.tabs.create({ url: group.url, active: true });
      await waitForTabLoad(tab.id);
      await sleep(4000);

      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: leaveGroupScript
      });

      const outcome = result?.[0]?.result;

      // If script-level click didn't confirm, try trusted click via debugger
      if (outcome?.retryPoint && !outcome?.success) {
        leaveState.statusText = `🛠️ Tentando clique confiável em: ${group.name}`;
        try {
          await dispatchTrustedClick(tab.id, outcome.retryPoint.x, outcome.retryPoint.y);
          await sleep(3000);
        } catch (_) {}
      }

      if (outcome?.success || outcome?.retryPoint) {
        leaveState.leftGroupIds.push(group.id);
        leaveState.statusText = `✅ Saiu de: ${group.name} (${i + 1}/${selectedGroups.length})`;
      } else {
        leaveState.statusText = `❌ Falha ao sair de: ${group.name} - ${outcome?.error || 'Erro desconhecido'}`;
      }

      await sleep(2000);
      try { await chrome.tabs.remove(tab.id); } catch (_) {}

      if (i < selectedGroups.length - 1 && leaveState.isLeaving) {
        await sleep(3000);
      }
    } catch (err) {
      leaveState.statusText = `❌ Erro em ${group.name}: ${err.message}`;
    }
  }

  leaveState.statusText = leaveState.leftGroupIds.length > 0
    ? `🎉 Saiu de ${leaveState.leftGroupIds.length} grupo(s)!`
    : '⚠️ Não foi possível sair de nenhum grupo.';
  leaveState.progress = 100;
  leaveState.isLeaving = false;
}

function leaveGroupScript() {
  return new Promise((resolve) => {
    try {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const normalize = (s) => (s || '').toLowerCase().trim();

      function simulateClick(el) {
        if (!el) return;
        try { el.scrollIntoView({ block: 'center' }); } catch (_) {}
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
        try { el.click(); } catch (_) {}
      }

      async function run() {
        // Labels for each step (PT + EN)
        const joinedLabels = ['participou', 'joined', 'membro', 'member', 'entrou', 'participando'];
        const leaveLabels = ['sair do grupo', 'leave group', 'deixar grupo', 'sair'];
        const confirmLabels = ['sair do grupo', 'leave group', 'confirmar', 'confirm', 'sair'];
        const cancelLabels = ['cancelar', 'cancel', 'voltar', 'back'];

        // Step 1: Find "Joined/Participou" button
        let joinedBtn = null;
        const allButtons = document.querySelectorAll('[role="button"], button');
        for (const btn of allButtons) {
          const text = normalize(btn.textContent);
          const aria = normalize(btn.getAttribute('aria-label') || '');
          const combined = text + ' ' + aria;
          if (joinedLabels.some(l => combined.includes(l))) {
            // Avoid very large wrapper elements
            const rect = btn.getBoundingClientRect();
            if (rect.width < 400 && rect.height < 100 && rect.width > 20) {
              joinedBtn = btn;
              break;
            }
          }
        }

        if (!joinedBtn) {
          return resolve({ success: false, error: 'Botão "Participou/Joined" não encontrado' });
        }

        simulateClick(joinedBtn);
        await sleep(2500);

        // Step 2: Find "Leave group" in dropdown/popover
        let leaveOption = null;
        const candidates = document.querySelectorAll('[role="menuitem"], [role="option"], [role="button"], a, div[tabindex], span');
        for (const item of candidates) {
          const text = normalize(item.textContent);
          if (leaveLabels.some(l => text.includes(l))) {
            const rect = item.getBoundingClientRect();
            if (rect.width > 10 && rect.height > 10 && rect.width < 500) {
              leaveOption = item;
              break;
            }
          }
        }

        if (!leaveOption) {
          return resolve({ success: false, error: 'Opção "Sair do grupo" não encontrada no menu' });
        }

        simulateClick(leaveOption);
        await sleep(2500);

        // Step 3: Confirm in dialog
        const dialogs = document.querySelectorAll('[role="dialog"]');
        let confirmBtn = null;

        for (const dialog of dialogs) {
          const buttons = dialog.querySelectorAll('[role="button"], button');
          for (const btn of buttons) {
            const text = normalize(btn.textContent);
            const aria = normalize(btn.getAttribute('aria-label') || '');
            const combined = text + ' ' + aria;
            // Skip cancel buttons
            if (cancelLabels.some(l => combined.includes(l))) continue;
            if (confirmLabels.some(l => combined.includes(l))) {
              confirmBtn = btn;
              break;
            }
          }
          if (confirmBtn) break;
        }

        if (confirmBtn) {
          simulateClick(confirmBtn);
          await sleep(2000);
          return resolve({ success: true });
        }

        // If no confirm button found, return retry coordinates for trusted click
        // Try to find any primary action button in dialog
        for (const dialog of dialogs) {
          const buttons = dialog.querySelectorAll('[role="button"], button');
          for (const btn of buttons) {
            const text = normalize(btn.textContent);
            if (cancelLabels.some(l => text.includes(l))) continue;
            if (text.length > 0 && text.length < 30) {
              const rect = btn.getBoundingClientRect();
              if (rect.width > 60) {
                return resolve({
                  success: false,
                  retryPoint: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
                });
              }
            }
          }
        }

        return resolve({ success: false, error: 'Diálogo de confirmação não encontrado' });
      }

      run().catch(err => resolve({ success: false, error: err.message }));
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}
