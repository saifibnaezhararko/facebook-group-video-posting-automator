document.getElementById("startAutomationBtn").addEventListener("click", () => {
  const log = (msg) => {
    const el = document.getElementById("log");
    el.textContent += msg + "\n";
    el.scrollTop = el.scrollHeight;
  };

  log("🚀 Starting automation (reading input.csv)...");

  try {
    chrome.runtime.sendMessage(
      {
        action: "startAllAutomation", // This action is handled by background.js
        config: {}, // No content config needed
      },
      (response) => {
        if (chrome.runtime.lastError) {
          log("⚠️ Extension background not ready or error sending message.");
          console.warn(chrome.runtime.lastError.message);
        } else if (response?.status) {
          log("✅ " + response.status);
        }
      }
    );
  } catch (e) {
    log("❌ Error: " + e.message);
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.log) {
    const el = document.getElementById("log");
    el.textContent += msg.log + "\n";
    el.scrollTop = el.scrollHeight;
  }
});
