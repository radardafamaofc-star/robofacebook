// Content script - runs on Facebook pages
// Listens for messages from the popup/background to perform actions

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCRAPE_GROUPS') {
    const groupLinks = document.querySelectorAll('a[href*="/groups/"]');
    const found = [];
    const seen = new Set();

    groupLinks.forEach(link => {
      const href = link.href;
      const match = href.match(/facebook\.com\/groups\/([^/?#]+)/);
      if (match && !seen.has(match[1]) && match[1] !== 'feed' && match[1] !== 'discover') {
        seen.add(match[1]);
        const name = link.textContent.trim() || match[1];
        if (name.length > 1 && name.length < 100) {
          found.push({
            name,
            url: `https://www.facebook.com/groups/${match[1]}/`,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            selected: true
          });
        }
      }
    });

    sendResponse({ groups: found });
    return true;
  }

  if (message.type === 'PING') {
    sendResponse({ alive: true });
    return true;
  }
});
