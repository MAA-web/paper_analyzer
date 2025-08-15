

// document.getElementById("clickMe").addEventListener("click", () => {
//   alert("Button clicked!");
// });

document.getElementById('analyzeBtn').addEventListener('click', async () => {

  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});

  chrome.tabs.sendMessage(tab.id, {action: "analyzePapers"});

});