// Handle messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzePapers") {
    window.postMessage({ 
      type: "FROM_EXTENSION", 
      action: "analyzePapers" 
    }, "*");
    sendResponse({ status: "Sent to page context" });
  }
  return true;
});