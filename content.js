// content.js - Facebook Video Upload Content Script with Caption

(function () {
  // Utility: sleep
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Helper: find element by visible text
  function findElementsByText(root, selector, textOrRegex) {
    const nodes = Array.from((root || document).querySelectorAll(selector));
    const matcher =
      typeof textOrRegex === "string"
        ? (t) => t.trim() === textOrRegex
        : (t) => textOrRegex.test(t);
    return nodes.filter((n) => {
      const style = window.getComputedStyle(n);
      const isVisible =
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        n.offsetParent !== null;
      const hasDimensions = n.offsetWidth > 0 && n.offsetHeight > 0;
      return isVisible && hasDimensions && matcher(n.textContent);
    });
  }

  // Waits for an element to appear and be visible (CSS Selector)
  async function waitForElement(
    selector,
    maxAttempts = 10,
    delayMs = 500,
    root = document
  ) {
    logToBackground(
      `Waiting for element by CSS: "${selector}" (max ${maxAttempts} attempts, ${delayMs}ms delay).`
    );
    for (let i = 0; i < maxAttempts; i++) {
      const element = root.querySelector(selector);
      if (element) {
        const style = window.getComputedStyle(element);
        const isVisible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          element.offsetParent !== null;
        const hasDimensions =
          element.offsetWidth > 0 && element.offsetHeight > 0;
        if (isVisible && hasDimensions) {
          logToBackground(
            `Element found and visible by CSS: "${selector}" on attempt ${
              i + 1
            }.`
          );
          return element;
        }
      }
      await sleep(delayMs);
    }
    logToBackground(
      `Element by CSS "${selector}" not found or not visible after ${maxAttempts} attempts.`
    );
    return null;
  }

  // Waits for an element to appear and be visible (XPath)
  async function waitForXPath(
    xpath,
    maxAttempts = 10,
    delayMs = 500,
    root = document
  ) {
    logToBackground(
      `Waiting for element by XPath: "${xpath}" (max ${maxAttempts} attempts, ${delayMs}ms delay).`
    );
    for (let i = 0; i < maxAttempts; i++) {
      const iterator = document.evaluate(
        xpath,
        root,
        null,
        XPathResult.ANY_TYPE,
        null
      );
      const element = iterator.iterateNext();
      if (element) {
        const style = window.getComputedStyle(element);
        const isVisible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          element.offsetParent !== null;
        const hasDimensions =
          element.offsetWidth > 0 && element.offsetHeight > 0;
        if (isVisible && hasDimensions) {
          logToBackground(
            `Element found and visible by XPath: "${xpath}" on attempt ${
              i + 1
            }.`
          );
          return element;
        }
      }
      await sleep(delayMs);
    }
    logToBackground(
      `Element by XPath "${xpath}" not found or not visible after ${maxAttempts} attempts.`
    );
    return null;
  }

  // Function to send logs back to the background script
  function logToBackground(message) {
    chrome.runtime.sendMessage({ action: "log_from_content", data: message });
  }

  // Convert base64 to File object
  function base64ToFile(base64Data, filename, mimeType) {
    const arr = base64Data.split(",");
    const mime = mimeType || arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  }

  // Main function to upload video to Facebook group with caption
  // Main function to upload video to Facebook group with caption
  async function uploadVideoToGroup(videoFileData, captionText) {
    logToBackground("Starting video upload automation...");
    logToBackground(
      `Video: ${videoFileData.name} (${(
        videoFileData.size /
        1024 /
        1024
      ).toFixed(2)} MB)`
    );
    if (captionText) {
      logToBackground(`Caption: ${captionText.substring(0, 60)}...`);
    }

    // --- Step 1: Find and click "Write something..." ---
    logToBackground('Searching for "Write something..." input field...');

    let writeSomethingElement = null;

    // STRATEGY 1: Specific HTML/CSS structure
    const specificWriteSomethingSpanSelector =
      'div[role="button"][tabindex="0"] span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6';
    const specificWriteSomethingSpans = findElementsByText(
      document,
      specificWriteSomethingSpanSelector,
      /Write something\.\.\./i
    );

    if (specificWriteSomethingSpans.length > 0) {
      writeSomethingElement = specificWriteSomethingSpans[0].closest(
        'div[role="button"][tabindex="0"]'
      );
      if (writeSomethingElement) {
        logToBackground(
          `Found "Write something..." by specific HTML/CSS structure.`
        );
      }
    }

    // STRATEGY 2: Broader CSS selectors
    if (!writeSomethingElement) {
      logToBackground("Trying broader CSS selectors...");
      const broaderCSSSelectors = [
        'div[role="button"][aria-label*="Create a post"]',
        'div[role="button"][aria-label*="What\'s on your mind"]',
        'textarea[placeholder*="Write something"]',
        'div[data-testid="status-attachment-mentions-input"]',
        'div[data-testid="group-feed-composer-input"]',
        'div[role="button"][tabindex="0"][data-visualcompletion="ignore-dynamic"]',
      ];
      for (const selector of broaderCSSSelectors) {
        writeSomethingElement = await waitForElement(selector, 5, 500);
        if (writeSomethingElement) {
          logToBackground(`Found by CSS: ${selector}`);
          break;
        }
      }
    }

    // STRATEGY 3: XPath
    if (!writeSomethingElement) {
      logToBackground("Trying XPath...");
      const robustXPath =
        '//div[@role="button" and @tabindex="0"][.//span[contains(text(), "Write something...") or contains(text(), "What\'s on your mind")]]';
      writeSomethingElement = await waitForXPath(robustXPath, 5, 500);
      if (writeSomethingElement) {
        logToBackground(`Found by XPath.`);
      }
    }

    if (!writeSomethingElement) {
      logToBackground('❌ Could not find "Write something..." field.');
      alert('Could not find "Write something..." field. Automation stopped.');
      return;
    }

    // Click to open composer
    logToBackground('Clicking "Write something..." to open composer...');
    writeSomethingElement.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    await sleep(500);
    writeSomethingElement.click();
    await sleep(2000);

    // --- Step 2: Confirm composer dialog opened ---
    logToBackground("Verifying composer dialog opened...");
    const composerDialog = await waitForElement(
      'div[role="dialog"][aria-label*="Create"], div[role="dialog"]',
      10,
      500
    );

    if (!composerDialog) {
      logToBackground("❌ Composer dialog did not open.");
      alert("Composer dialog did not open. Automation stopped.");
      return;
    }
    logToBackground("✅ Composer dialog is open.");

    // --- Step 3: Find and click "Photo/Video" button ---
    logToBackground('Looking for "Photo/Video" button...');

    let photoVideoButton = null;

    const photoVideoSelectors = [
      'div[role="dialog"] div[aria-label*="Photo/video"]',
      'div[role="dialog"] div[aria-label*="Photo/Video"]',
      'div[role="dialog"] div[aria-label*="Add photos/videos"]',
      'div[aria-label*="Photo/video"][role="button"]',
    ];

    for (const selector of photoVideoSelectors) {
      photoVideoButton = await waitForElement(selector, 3, 300);
      if (photoVideoButton) {
        logToBackground(`Found Photo/Video button: ${selector}`);
        break;
      }
    }

    // Alternative: search by text content
    if (!photoVideoButton) {
      logToBackground("Trying to find Photo/Video button by text...");
      const buttons = findElementsByText(
        composerDialog,
        'div[role="button"], span',
        /Photo\/video|Add photos\/videos/i
      );
      if (buttons.length > 0) {
        photoVideoButton = buttons[0];
        logToBackground("Found Photo/Video button by text.");
      }
    }

    if (!photoVideoButton) {
      logToBackground("❌ Could not find Photo/Video button.");
      alert("Could not find Photo/Video button. Automation stopped.");
      return;
    }

    // Click Photo/Video button
    logToBackground("Clicking Photo/Video button...");
    photoVideoButton.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(300);
    photoVideoButton.click();
    await sleep(1500);

    // --- Step 4: Find file input and attach video ---
    logToBackground("Looking for file input element...");

    let fileInput = null;

    const fileInputSelectors = [
      'div[role="dialog"] input[type="file"]',
      'input[type="file"][accept*="video"]',
      'input[type="file"][accept*="image"]',
      'input[type="file"]',
    ];

    for (const selector of fileInputSelectors) {
      fileInput = document.querySelector(selector);
      if (fileInput) {
        logToBackground(`Found file input: ${selector}`);
        break;
      }
    }

    if (!fileInput) {
      logToBackground("❌ Could not find file input element.");
      alert("Could not find file input. Automation stopped.");
      return;
    }

    // --- Step 5: Create File object and attach to input ---
    logToBackground("Creating File object from video data...");

    try {
      const videoFile = base64ToFile(
        videoFileData.base64,
        videoFileData.name,
        videoFileData.type
      );

      logToBackground(
        `File created: ${videoFile.name}, ${videoFile.size} bytes`
      );

      // Create DataTransfer object to hold the file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(videoFile);

      // Assign files to the input
      fileInput.files = dataTransfer.files;

      logToBackground("✅ File attached to input element.");

      // Trigger change event
      const changeEvent = new Event("change", { bubbles: true });
      fileInput.dispatchEvent(changeEvent);

      logToBackground("✅ Change event dispatched.");

      // --- IMPORTANT: Wait for video to be processed ---
      await sleep(3000);

      // --- Step 6: NOW Add caption text AFTER video is attached ---
      if (captionText) {
        logToBackground("Now adding caption to post (after video attached)...");

        // Wait a bit more for Facebook to update the composer
        await sleep(1000);

        const textInputSelectors = [
          'div[role="dialog"] div[contenteditable="true"]',
          'div[contenteditable="true"][data-testid*="post-composer"]',
          'div[contenteditable="true"][aria-label*="What\'s on your mind"]',
          'div[role="dialog"] div[role="textbox"]',
          'div[contenteditable="true"][aria-describedby]',
          'div[contenteditable="true"]',
        ];

        let textInput = null;
        for (const selector of textInputSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const style = window.getComputedStyle(el);
            const isVisible =
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              el.offsetParent !== null;
            const hasDimensions = el.offsetWidth > 0 && el.offsetHeight > 0;

            if (isVisible && hasDimensions) {
              textInput = el;
              logToBackground(`Found text input: ${selector}`);
              break;
            }
          }
          if (textInput) break;
        }

        if (textInput) {
          // Scroll into view
          textInput.scrollIntoView({ behavior: "smooth", block: "center" });
          await sleep(300);

          // Focus the input
          textInput.focus();
          await sleep(300);

          // Click to ensure it's active
          textInput.click();
          await sleep(300);

          // Method 1: Set innerText
          textInput.innerText = captionText;

          // Method 2: Also try textContent as backup
          textInput.textContent = captionText;

          // Method 3: Try document.execCommand (older method but sometimes works)
          try {
            document.execCommand("selectAll", false, null);
            document.execCommand("insertText", false, captionText);
          } catch (e) {
            logToBackground("execCommand method failed, but continuing...");
          }

          // Trigger all possible events
          textInput.dispatchEvent(new Event("input", { bubbles: true }));
          textInput.dispatchEvent(new Event("change", { bubbles: true }));
          textInput.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true })
          );
          textInput.dispatchEvent(
            new KeyboardEvent("keyup", { bubbles: true })
          );

          logToBackground(
            `✅ Caption added: "${captionText.substring(0, 50)}..."`
          );
          await sleep(1000);
        } else {
          logToBackground(
            "⚠️ Could not find text input for caption after video upload."
          );
          logToBackground("⚠️ Please add caption manually.");
        }
      }

      logToBackground("✅ Video upload automation completed!");
      logToBackground("ℹ️ You may need to click 'Post' button manually.");
    } catch (error) {
      logToBackground(`❌ Error attaching video: ${error.message}`);
      console.error("File attachment error:", error);
      alert(`Error uploading video: ${error.message}`);
    }
  } // Main function to upload video to Facebook group with caption
  async function uploadVideoToGroup(videoFileData, captionText) {
    logToBackground("Starting video upload automation...");
    logToBackground(
      `Video: ${videoFileData.name} (${(
        videoFileData.size /
        1024 /
        1024
      ).toFixed(2)} MB)`
    );
    if (captionText) {
      logToBackground(`Caption: ${captionText.substring(0, 60)}...`);
    }

    // --- Step 1: Find and click "Write something..." ---
    logToBackground('Searching for "Write something..." input field...');

    let writeSomethingElement = null;

    // STRATEGY 1: Specific HTML/CSS structure
    const specificWriteSomethingSpanSelector =
      'div[role="button"][tabindex="0"] span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6';
    const specificWriteSomethingSpans = findElementsByText(
      document,
      specificWriteSomethingSpanSelector,
      /Write something\.\.\./i
    );

    if (specificWriteSomethingSpans.length > 0) {
      writeSomethingElement = specificWriteSomethingSpans[0].closest(
        'div[role="button"][tabindex="0"]'
      );
      if (writeSomethingElement) {
        logToBackground(
          `Found "Write something..." by specific HTML/CSS structure.`
        );
      }
    }

    // STRATEGY 2: Broader CSS selectors
    if (!writeSomethingElement) {
      logToBackground("Trying broader CSS selectors...");
      const broaderCSSSelectors = [
        'div[role="button"][aria-label*="Create a post"]',
        'div[role="button"][aria-label*="What\'s on your mind"]',
        'textarea[placeholder*="Write something"]',
        'div[data-testid="status-attachment-mentions-input"]',
        'div[data-testid="group-feed-composer-input"]',
        'div[role="button"][tabindex="0"][data-visualcompletion="ignore-dynamic"]',
      ];
      for (const selector of broaderCSSSelectors) {
        writeSomethingElement = await waitForElement(selector, 5, 500);
        if (writeSomethingElement) {
          logToBackground(`Found by CSS: ${selector}`);
          break;
        }
      }
    }

    // STRATEGY 3: XPath
    if (!writeSomethingElement) {
      logToBackground("Trying XPath...");
      const robustXPath =
        '//div[@role="button" and @tabindex="0"][.//span[contains(text(), "Write something...") or contains(text(), "What\'s on your mind")]]';
      writeSomethingElement = await waitForXPath(robustXPath, 5, 500);
      if (writeSomethingElement) {
        logToBackground(`Found by XPath.`);
      }
    }

    if (!writeSomethingElement) {
      logToBackground('❌ Could not find "Write something..." field.');
      alert('Could not find "Write something..." field. Automation stopped.');
      return;
    }

    // Click to open composer
    logToBackground('Clicking "Write something..." to open composer...');
    writeSomethingElement.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    await sleep(500);
    writeSomethingElement.click();
    await sleep(2000);

    // --- Step 2: Confirm composer dialog opened ---
    logToBackground("Verifying composer dialog opened...");
    const composerDialog = await waitForElement(
      'div[role="dialog"][aria-label*="Create"], div[role="dialog"]',
      10,
      500
    );

    if (!composerDialog) {
      logToBackground("❌ Composer dialog did not open.");
      alert("Composer dialog did not open. Automation stopped.");
      return;
    }
    logToBackground("✅ Composer dialog is open.");

    // --- Step 3: Find and click "Photo/Video" button ---
    logToBackground('Looking for "Photo/Video" button...');

    let photoVideoButton = null;

    const photoVideoSelectors = [
      'div[role="dialog"] div[aria-label*="Photo/video"]',
      'div[role="dialog"] div[aria-label*="Photo/Video"]',
      'div[role="dialog"] div[aria-label*="Add photos/videos"]',
      'div[aria-label*="Photo/video"][role="button"]',
    ];

    for (const selector of photoVideoSelectors) {
      photoVideoButton = await waitForElement(selector, 3, 300);
      if (photoVideoButton) {
        logToBackground(`Found Photo/Video button: ${selector}`);
        break;
      }
    }

    // Alternative: search by text content
    if (!photoVideoButton) {
      logToBackground("Trying to find Photo/Video button by text...");
      const buttons = findElementsByText(
        composerDialog,
        'div[role="button"], span',
        /Photo\/video|Add photos\/videos/i
      );
      if (buttons.length > 0) {
        photoVideoButton = buttons[0];
        logToBackground("Found Photo/Video button by text.");
      }
    }

    if (!photoVideoButton) {
      logToBackground("❌ Could not find Photo/Video button.");
      alert("Could not find Photo/Video button. Automation stopped.");
      return;
    }

    // Click Photo/Video button
    logToBackground("Clicking Photo/Video button...");
    photoVideoButton.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(300);
    photoVideoButton.click();
    await sleep(1500);

    // --- Step 4: Find file input and attach video ---
    logToBackground("Looking for file input element...");

    let fileInput = null;

    const fileInputSelectors = [
      'div[role="dialog"] input[type="file"]',
      'input[type="file"][accept*="video"]',
      'input[type="file"][accept*="image"]',
      'input[type="file"]',
    ];

    for (const selector of fileInputSelectors) {
      fileInput = document.querySelector(selector);
      if (fileInput) {
        logToBackground(`Found file input: ${selector}`);
        break;
      }
    }

    if (!fileInput) {
      logToBackground("❌ Could not find file input element.");
      alert("Could not find file input. Automation stopped.");
      return;
    }

    // --- Step 5: Create File object and attach to input ---
    logToBackground("Creating File object from video data...");

    try {
      const videoFile = base64ToFile(
        videoFileData.base64,
        videoFileData.name,
        videoFileData.type
      );

      logToBackground(
        `File created: ${videoFile.name}, ${videoFile.size} bytes`
      );

      // Create DataTransfer object to hold the file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(videoFile);

      // Assign files to the input
      fileInput.files = dataTransfer.files;

      logToBackground("✅ File attached to input element.");

      // Trigger change event
      const changeEvent = new Event("change", { bubbles: true });
      fileInput.dispatchEvent(changeEvent);

      logToBackground("✅ Change event dispatched.");

      // --- IMPORTANT: Wait for video to be processed ---
      await sleep(3000);

      // --- Step 6: NOW Add caption text AFTER video is attached ---
      if (captionText) {
        logToBackground("Now adding caption to post (after video attached)...");

        // Wait a bit more for Facebook to update the composer
        await sleep(1000);

        const textInputSelectors = [
          'div[role="dialog"] div[contenteditable="true"]',
          'div[contenteditable="true"][data-testid*="post-composer"]',
          'div[contenteditable="true"][aria-label*="What\'s on your mind"]',
          'div[role="dialog"] div[role="textbox"]',
          'div[contenteditable="true"][aria-describedby]',
          'div[contenteditable="true"]',
        ];

        let textInput = null;
        for (const selector of textInputSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const style = window.getComputedStyle(el);
            const isVisible =
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              el.offsetParent !== null;
            const hasDimensions = el.offsetWidth > 0 && el.offsetHeight > 0;

            if (isVisible && hasDimensions) {
              textInput = el;
              logToBackground(`Found text input: ${selector}`);
              break;
            }
          }
          if (textInput) break;
        }

        if (textInput) {
          // Scroll into view
          textInput.scrollIntoView({ behavior: "smooth", block: "center" });
          await sleep(300);

          // Focus the input
          textInput.focus();
          await sleep(300);

          // Click to ensure it's active
          textInput.click();
          await sleep(300);

          // Method 1: Set innerText
          textInput.innerText = captionText;

          // Method 2: Also try textContent as backup
          textInput.textContent = captionText;

          // Method 3: Try document.execCommand (older method but sometimes works)
          try {
            document.execCommand("selectAll", false, null);
            document.execCommand("insertText", false, captionText);
          } catch (e) {
            logToBackground("execCommand method failed, but continuing...");
          }

          // Trigger all possible events
          textInput.dispatchEvent(new Event("input", { bubbles: true }));
          textInput.dispatchEvent(new Event("change", { bubbles: true }));
          textInput.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true })
          );
          textInput.dispatchEvent(
            new KeyboardEvent("keyup", { bubbles: true })
          );

          logToBackground(
            `✅ Caption added: "${captionText.substring(0, 50)}..."`
          );
          await sleep(1000);
        } else {
          logToBackground(
            "⚠️ Could not find text input for caption after video upload."
          );
          logToBackground("⚠️ Please add caption manually.");
        }
      }

      logToBackground("✅ Video upload automation completed!");

      // --- Step 7: Auto-click "Post" button ---
      logToBackground("Looking for 'Post' button to click automatically...");

      await sleep(2000); // Wait for everything to be ready

      let postButton = null;

      // Strategy 1: Find by text "Post" inside dialog
      const postButtonSpans = findElementsByText(
        composerDialog,
        "span",
        /^Post$/i
      );

      if (postButtonSpans.length > 0) {
        // Find the clickable parent (usually a div with role="button" or just a clickable div)
        for (const span of postButtonSpans) {
          let parent = span.closest('div[role="button"]');
          if (!parent) {
            // Try to find clickable parent div
            parent = span.closest("div.x1ja2u2z"); // Common class in the Post button
          }
          if (parent) {
            const style = window.getComputedStyle(parent);
            const isVisible =
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              parent.offsetParent !== null;

            if (isVisible) {
              postButton = parent;
              logToBackground("Found Post button by text content");
              break;
            }
          }
        }
      }

      // Strategy 2: Find by aria-label
      if (!postButton) {
        const ariaLabelSelectors = [
          'div[role="dialog"] div[aria-label="Post"]',
          'div[role="dialog"] div[aria-label*="Post"]',
          'div[aria-label="Post"][role="button"]',
        ];

        for (const selector of ariaLabelSelectors) {
          postButton = await waitForElement(selector, 2, 300);
          if (postButton) {
            logToBackground(`Found Post button by aria-label: ${selector}`);
            break;
          }
        }
      }

      // Strategy 3: XPath - find div containing span with text "Post"
      if (!postButton) {
        const postButtonXPath =
          '//div[@role="dialog"]//div[.//span[text()="Post"]]';
        const xpathResult = document.evaluate(
          postButtonXPath,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );

        // Try to find the most appropriate element (smallest/most specific)
        let smallestElement = null;
        let smallestSize = Infinity;

        for (let i = 0; i < xpathResult.snapshotLength; i++) {
          const element = xpathResult.snapshotItem(i);
          const size = element.offsetWidth * element.offsetHeight;

          if (size > 0 && size < smallestSize) {
            const style = window.getComputedStyle(element);
            const isVisible =
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              element.offsetParent !== null;

            if (isVisible) {
              smallestSize = size;
              smallestElement = element;
            }
          }
        }

        if (smallestElement) {
          postButton = smallestElement;
          logToBackground("Found Post button by XPath");
        }
      }

      // Strategy 4: Look for button-like div with specific classes near bottom of dialog
      if (!postButton) {
        const buttonDivs = composerDialog.querySelectorAll(
          "div.x1ja2u2z.x78zum5.x2lah0s"
        );
        for (const div of buttonDivs) {
          if (div.innerText && div.innerText.trim() === "Post") {
            const style = window.getComputedStyle(div);
            const isVisible =
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              div.offsetParent !== null;

            if (isVisible) {
              postButton = div;
              logToBackground("Found Post button by class combination");
              break;
            }
          }
        }
      }

      if (postButton) {
        logToBackground("✅ Post button found! Clicking automatically...");

        // Scroll into view
        postButton.scrollIntoView({ behavior: "smooth", block: "center" });
        await sleep(500);

        // Highlight the button briefly (visual feedback)
        const originalBackground = postButton.style.background;
        postButton.style.background = "rgba(0, 255, 0, 0.3)";
        await sleep(300);
        postButton.style.background = originalBackground;

        // Click the button
        postButton.click();

        logToBackground("✅ Post button clicked!");
        logToBackground("🎉 Post submitted successfully!");

        await sleep(2000);

        logToBackground("✅ Automation fully completed!");
      } else {
        logToBackground("⚠️ Could not find Post button automatically.");
        logToBackground("ℹ️ Please click 'Post' button manually.");
      }
    } catch (error) {
      logToBackground(`❌ Error attaching video: ${error.message}`);
      console.error("File attachment error:", error);
      alert(`Error uploading video: ${error.message}`);
    }
  }
  // Expose the function
  window.facebookGroupAutomation = {
    uploadVideoToGroup,
  };
})();
