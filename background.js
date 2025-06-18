// Background script for YouTube Course Tracker
// Handles extension lifecycle and cross-tab communication

browser.runtime.onInstalled.addListener(() => {
  console.log('YouTube Course Tracker installed');
});

// Handle messages from content scripts and popup
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateProgress') {
    // Broadcast progress updates to other tabs if needed
    browser.tabs.query({}).then(tabs => {
      tabs.forEach(tab => {
        if (tab.url && tab.url.includes('youtube.com/watch')) {
          browser.tabs.sendMessage(tab.id, {
            action: 'progressUpdated',
            data: request.data
          }).catch(() => {
            // Ignore errors for tabs that don't have the content script
          });
        }
      });
    });
  }
  
  return true; // Keep message channel open for async response
});

// Clean up old data periodically (optional)
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup') {
    cleanupOldData();
  }
});

// Set up periodic cleanup (once a week)
browser.alarms.create('cleanup', { periodInMinutes: 10080 }); // 7 days

async function cleanupOldData() {
  const result = await browser.storage.local.get(['courses']);
  const courses = result.courses || {};
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  
  let hasChanges = false;
  
  for (const [videoId, course] of Object.entries(courses)) {
    const lastWatched = course.lastWatched ? new Date(course.lastWatched) : new Date(course.dateAdded);
    
    // Remove courses not watched in the last month
    if (lastWatched < oneMonthAgo) {
      delete courses[videoId];
      hasChanges = true;
    }
  }
  
  if (hasChanges) {
    await browser.storage.local.set({ courses });
    console.log('Cleaned up old course data');
  }
}