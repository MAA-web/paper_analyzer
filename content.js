// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzePapers") {
    // Inject the analyzer into the page context
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('analyzer.js');
    script.onload = () => script.remove();
    document.head.appendChild(script);
    
    // Send initialization message to page context
    window.postMessage({
      type: "FROM_EXTENSION",
      action: "initAnalyzer"
    }, "*");
    
    return true; // Keep message channel open
  }
});