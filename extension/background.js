// Background service worker for Facebook Group Auto Poster
// Handles tab management and messaging

chrome.runtime.onInstalled.addListener(() => {
  console.log('Facebook Group Auto Poster instalado!');

  // Set default settings
  chrome.storage.local.get(['settings'], (data) => {
    if (!data.settings) {
      chrome.storage.local.set({
        settings: {
          delay: 30,
          randomDelay: true,
          closeTabAfter: true
        }
      });
    }
  });
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
