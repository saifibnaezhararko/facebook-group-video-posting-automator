// background.js - Facebook Video Upload Automation with Caption

function logToPopup(message) {
  chrome.runtime.sendMessage({ log: message }).catch(() => {
    console.log(message);
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Function to fetch and parse the CSV
async function getGroupDataFromCSV() {
  logToPopup("📂 Fetching 'input.csv' from extension directory...");
  const csvUrl = chrome.runtime.getURL("input.csv");

  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV: ${response.statusText}`);
    }
    const text = await response.text();

    const lines = text.split("\n").filter((line) => line.trim() !== "");

    if (lines.length < 2) {
      logToPopup("❌ CSV file is empty or missing header.");
      return [];
    }

    // Parse CSV properly handling quoted fields
    function parseCSVLine(line) {
      const result = [];
      let current = "";
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === "," && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    }

    const headers = parseCSVLine(lines[0]);
    const groupLinkIndex = headers.indexOf("group_link");
    const pathIndex = headers.indexOf("path");
    const captionIndex = headers.indexOf("caption");

    if (groupLinkIndex === -1) {
      logToPopup("❌ CSV must contain a 'group_link' column.");
      return [];
    }

    if (pathIndex === -1) {
      logToPopup("❌ CSV must contain a 'path' column.");
      return [];
    }

    if (captionIndex === -1) {
      logToPopup("❌ CSV must contain a 'caption' column.");
      return [];
    }

    logToPopup(`✅ CSV headers found: ${headers.join(", ")}`);

    const groupData = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const data = parseCSVLine(line);

      const groupLink = data[groupLinkIndex];
      const videoPath = data[pathIndex];
      const caption = data[captionIndex] || "";

      if (groupLink && videoPath) {
        groupData.push({
          groupLink: groupLink,
          videoPath: videoPath,
          caption: caption,
          rowNumber: i + 1,
        });
        logToPopup(`   Row ${i + 1}: ${groupLink} -> ${videoPath}`);
        if (caption) {
          logToPopup(`   Caption: ${caption.substring(0, 50)}...`);
        }
      } else {
        logToPopup(`⚠️ Row ${i + 1}: Missing data (skipped)`);
      }
    }

    if (groupData.length === 0) {
      logToPopup("⚠️ No valid group data found in CSV.");
    } else {
      logToPopup(
        `✅ Successfully read ${groupData.length} valid entries from CSV.`
      );
    }
    return groupData;
  } catch (error) {
    logToPopup(`❌ Error reading CSV file: ${error.message}`);
    console.error("CSV reading error:", error);
    return [];
  }
}

// Function to read video file and convert to base64
async function getVideoFileAsBase64(videoPath) {
  try {
    logToPopup(`📹 Loading video file: ${videoPath}`);

    const videoUrl = chrome.runtime.getURL(videoPath);

    const response = await fetch(videoUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.statusText}`);
    }

    const blob = await response.blob();
    const fileSizeMB = (blob.size / 1024 / 1024).toFixed(2);

    logToPopup(`   File size: ${fileSizeMB} MB`);
    logToPopup(`   MIME type: ${blob.type}`);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onloadend = () => {
        const base64data = reader.result;
        logToPopup(`✅ Video loaded successfully (${fileSizeMB} MB)`);

        resolve({
          base64: base64data,
          type: blob.type,
          size: blob.size,
          name: videoPath.split("/").pop() || "video.mp4",
        });
      };

      reader.onerror = (error) => {
        logToPopup(`❌ Error reading video file: ${error}`);
        reject(error);
      };

      reader.readAsDataURL(blob);
    });
  } catch (error) {
    logToPopup(`❌ Error loading video file: ${error.message}`);
    console.error("Video loading error:", error);
    throw error;
  }
}

// Main automation function
async function startAllAutomation(config) {
  logToPopup("=".repeat(50));
  logToPopup("🚀 Starting Facebook Video Upload Automation");
  logToPopup("=".repeat(50));

  const groupData = await getGroupDataFromCSV();

  if (!groupData || groupData.length === 0) {
    logToPopup(
      "🛑 Automation stopped: No valid group data to process from CSV."
    );
    logToPopup("Please check your input.csv file.");

    chrome.runtime.sendMessage({ automationComplete: true }).catch(() => {});
    return;
  }

  logToPopup(`📊 Total groups to process: ${groupData.length}`);
  logToPopup("");

  let successCount = 0;
  let failCount = 0;

  for (let index = 0; index < groupData.length; index++) {
    const data = groupData[index];
    const groupNum = index + 1;

    logToPopup("─".repeat(50));
    logToPopup(`📍 Processing ${groupNum}/${groupData.length}`);
    logToPopup(`   Group: ${data.groupLink}`);
    logToPopup(`   Video: ${data.videoPath}`);
    if (data.caption) {
      logToPopup(`   Caption: ${data.caption.substring(0, 60)}...`);
    }
    logToPopup("─".repeat(50));

    let tab = null;

    try {
      // Step 1: Load the video file
      logToPopup(`[${groupNum}] Step 1/4: Loading video file...`);
      const videoData = await getVideoFileAsBase64(data.videoPath);

      // Step 2: Create tab and navigate to group
      logToPopup(`[${groupNum}] Step 2/4: Creating new tab...`);
      logToPopup(`[${groupNum}] Opening URL: ${data.groupLink}`);

      tab = await chrome.tabs.create({
        url: data.groupLink,
        active: true,
      });

      if (!tab || !tab.id) {
        throw new Error("Failed to create tab");
      }

      logToPopup(`[${groupNum}] ✅ Tab created (ID: ${tab.id})`);
      logToPopup(`[${groupNum}] Waiting for page to load...`);

      // Wait for page load with better handling
      await new Promise((resolve, reject) => {
        const maxWaitTime = 30000; // 30 seconds max
        const startTime = Date.now();

        const checkInterval = setInterval(() => {
          chrome.tabs.get(tab.id, (tabInfo) => {
            if (chrome.runtime.lastError) {
              clearInterval(checkInterval);
              reject(new Error("Tab was closed or not found"));
              return;
            }

            const elapsed = Date.now() - startTime;

            if (tabInfo.status === "complete") {
              clearInterval(checkInterval);
              resolve();
            } else if (elapsed > maxWaitTime) {
              clearInterval(checkInterval);
              reject(new Error("Page load timeout"));
            } else {
              logToPopup(
                `[${groupNum}] Loading... (${Math.floor(elapsed / 1000)}s)`
              );
            }
          });
        }, 1000); // Check every second
      });

      logToPopup(`[${groupNum}] ✅ Page loaded successfully`);
      logToPopup(`[${groupNum}] Waiting for Facebook to render...`);

      // Extra wait for Facebook to fully render
      await sleep(3000);

      // Step 3: Inject content script
      logToPopup(`[${groupNum}] Step 3/4: Injecting automation script...`);

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });

      logToPopup(`[${groupNum}] ✅ Content script injected`);

      await sleep(1000);

      // Step 4: Execute automation with video data and caption
      logToPopup(`[${groupNum}] Step 4/4: Starting video upload process...`);

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: (videoFileData, captionText) => {
          if (
            typeof window.facebookGroupAutomation !== "undefined" &&
            typeof window.facebookGroupAutomation.uploadVideoToGroup !==
              "undefined"
          ) {
            return window.facebookGroupAutomation.uploadVideoToGroup(
              videoFileData,
              captionText
            );
          } else {
            console.error(
              "Facebook automation functions not available in content script."
            );
            throw new Error(
              "Automation functions not ready in content script."
            );
          }
        },
        args: [videoData, data.caption],
      });

      logToPopup(`[${groupNum}] ✅ Video upload process completed!`);
      logToPopup(
        `[${groupNum}] 📝 Note: You may need to click 'Post' button manually`
      );

      successCount++;
    } catch (error) {
      logToPopup(`[${groupNum}] ❌ ERROR: ${error.message}`);
      console.error(`Error processing group ${data.groupLink}:`, error);

      failCount++;

      if (tab && tab.id) {
        try {
          await chrome.tabs.remove(tab.id);
          logToPopup(`[${groupNum}] 🗑️ Tab closed due to error`);
        } catch (e) {
          // Tab might already be closed
        }
      }
    } finally {
      if (index < groupData.length - 1) {
        logToPopup(`[${groupNum}] ⏳ Waiting 50 seconds before next group...`);
        logToPopup("");
        await sleep(50000);
      }
    }
  }

  logToPopup("=".repeat(50));
  logToPopup("📊 AUTOMATION SUMMARY");
  logToPopup("=".repeat(50));
  logToPopup(`✅ Successful uploads: ${successCount}`);
  logToPopup(`❌ Failed uploads: ${failCount}`);
  logToPopup(`📝 Total processed: ${groupData.length}`);
  logToPopup("=".repeat(50));
  logToPopup("✅ All automation tasks completed!");
  logToPopup("");

  chrome.runtime.sendMessage({ automationComplete: true }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startAllAutomation") {
    startAllAutomation(message.config).catch((error) => {
      logToPopup(`❌ Critical error in automation: ${error.message}`);
      console.error("Automation error:", error);
      chrome.runtime.sendMessage({ automationComplete: true }).catch(() => {});
    });

    sendResponse({ status: "Automation started successfully" });
  } else if (message.action === "log_from_content") {
    logToPopup(message.data);
    sendResponse({ status: "Log received" });
  }

  return true;
});

console.log("Facebook Video Upload Automation background script loaded");
