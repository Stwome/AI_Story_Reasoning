(function () {
  const config = window.STORY_DUEL_CONFIG || {};
  const defaultState = {
    conversationState: null,
    history: [],
    sceneStarted: false,
    pending: false
  };

  const state = { ...defaultState };

  const examplePayload = {
    characterA:
      "Ralph Morrow: impatient, wiry, sentimental about family, prone to grabbing whatever object is nearby as an improvised weapon, convinced that speed beats planning.",
    characterB:
      "Dr. Imani Vale: quick-witted, observant, loaded with practical science knowledge, cool under pressure, prefers improvisation that looks accidental instead of violent.",
    scene:
      "A cavernous big-box retail store after midnight. Half the aisle lights are off, the freezer section hums from across the floor, and the store's overnight cleaning machine occasionally glides past the far endcaps.",
    situation:
      "They both slipped in through the garden-center gate after closing and discovered they are hunting the same jumbo pool float from the seasonal aisle.",
    goals:
      "Ralph wants to steal the pool float for his grandmother's birthday. Imani needs the same float for a buoyancy experiment she must finish before dawn. If either leaves empty-handed, the night becomes a personal disaster.",
    tone:
      "Tense, funny, cinematic, and a little noir."
  };

  const elements = {
    storyForm: document.getElementById("storyForm"),
    turnForm: document.getElementById("turnForm"),
    exampleButton: document.getElementById("exampleButton"),
    resetButton: document.getElementById("resetButton"),
    startButton: document.getElementById("startButton"),
    sendButton: document.getElementById("sendButton"),
    transcript: document.getElementById("transcript"),
    statusBanner: document.getElementById("statusBanner"),
    fields: {
      characterA: document.getElementById("characterA"),
      characterB: document.getElementById("characterB"),
      scene: document.getElementById("scene"),
      situation: document.getElementById("situation"),
      goals: document.getElementById("goals"),
      tone: document.getElementById("tone"),
      userTurn: document.getElementById("userTurn")
    }
  };

  elements.storyForm.addEventListener("submit", handleStartScene);
  elements.turnForm.addEventListener("submit", handleSendTurn);
  elements.exampleButton.addEventListener("click", loadExample);
  elements.resetButton.addEventListener("click", resetApp);

  renderTranscript();

  function getSetupValues() {
    return {
      characterA: elements.fields.characterA.value.trim(),
      characterB: elements.fields.characterB.value.trim(),
      scene: elements.fields.scene.value.trim(),
      situation: elements.fields.situation.value.trim(),
      goals: elements.fields.goals.value.trim(),
      tone: elements.fields.tone.value.trim()
    };
  }

  function validateSetup(values) {
    const requiredFields = [
      "characterA",
      "characterB",
      "scene",
      "situation",
      "goals",
      "tone"
    ];

    for (const key of requiredFields) {
      if (!values[key]) {
        return `Please fill in ${humanizeField(key)} before starting the scene.`;
      }
    }
    return null;
  }

  async function handleStartScene(event) {
    event.preventDefault();
    const setup = getSetupValues();
    const validationError = validateSetup(setup);
    if (validationError) {
      showStatus(validationError, true);
      return;
    }

    const openingTurn =
      "Open the scene. Show both characters entering the conflict immediately, alternating their actions, dialogue, and visible thoughts.";

    await submitTurn({
      setup,
      userTurn: openingTurn,
      resetConversation: true,
      requestLabel: "Starting scene..."
    });
  }

  async function handleSendTurn(event) {
    event.preventDefault();
    if (!state.sceneStarted) {
      showStatus("Start a scene before sending a follow-up turn.", true);
      return;
    }

    const setup = getSetupValues();
    const validationError = validateSetup(setup);
    if (validationError) {
      showStatus(validationError, true);
      return;
    }

    const userTurn = elements.fields.userTurn.value.trim();
    if (!userTurn) {
      showStatus("Write the next turn before sending it.", true);
      return;
    }

    await submitTurn({
      setup,
      userTurn,
      resetConversation: false,
      requestLabel: "Continuing scene..."
    });
  }

  async function submitTurn({ setup, userTurn, resetConversation, requestLabel }) {
    if (state.pending) {
      return;
    }

    if (!config.apiBaseUrl || config.apiBaseUrl.includes("your-worker-subdomain")) {
      showStatus("Set `window.STORY_DUEL_CONFIG.apiBaseUrl` in `config.js` to your deployed Worker URL.", true);
      return;
    }

    setPending(true, requestLabel);

    try {
      const payload = {
        ...setup,
        userTurn,
        conversationState: resetConversation ? null : state.conversationState,
        history: resetConversation ? [] : state.history
      };

      const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      logDebugStatus(data.debug, response.status);
      if (!response.ok) {
        throw new Error(data.error || "The scene request failed.");
      }

      if (resetConversation) {
        state.history = [];
      }

      state.sceneStarted = true;
      state.conversationState = data.conversationState || null;
      state.history.push({
        type: "assistant",
        beats: normalizeBeats(data.beats, data.rawText),
        rawText: data.rawText || "",
        prompt: userTurn
      });
      elements.fields.userTurn.value = "";
      hideStatus();
      renderTranscript();
    } catch (error) {
      console.error("[Story Duel Debug] Network or client error.", error);
      showStatus(error.message || "Something went wrong while contacting the Worker.", true);
    } finally {
      setPending(false);
    }
  }

  function normalizeBeats(beats, rawText) {
    if (Array.isArray(beats) && beats.length) {
      return beats
        .filter((beat) => beat && typeof beat.text === "string" && typeof beat.character === "string")
        .map((beat) => ({
          character: beat.character.trim(),
          kind: normalizeKind(beat.kind),
          text: beat.text.trim()
        }))
        .filter((beat) => beat.character && beat.text);
    }

    if (rawText) {
      return [
        {
          character: "Narration",
          kind: "raw",
          text: rawText.trim()
        }
      ];
    }

    return [];
  }

  function normalizeKind(kind) {
    const value = (kind || "").toLowerCase();
    if (value === "thought" || value === "dialogue" || value === "action") {
      return value;
    }
    return "raw";
  }

  function renderTranscript() {
    if (!state.history.length) {
      elements.transcript.innerHTML = [
        '<div class="empty-state">',
        "<div>",
        "<h3>No scene yet</h3>",
        "<p>Fill the setup fields, then start the scene. Continue it turn by turn below.</p>",
        "</div>",
        "</div>"
      ].join("");
      return;
    }

    const blocks = state.history
      .map((entry, index) => {
        const heading = `<p class="meta-line">${index === 0 ? "Opening Scene" : `Turn ${index + 1}`}</p>`;
        const beats = entry.beats
          .map(
            (beat) => `
              <p class="beat ${escapeHtml(beat.kind)}">
                <span class="beat-name">${escapeHtml(beat.character)}</span>
                <span class="beat-kind"> ${labelForKind(beat.kind)} </span>
                ${escapeHtml(beat.text)}
              </p>
            `
          )
          .join("");

        return `<article class="transcript-block">${heading}${beats}</article>`;
      })
      .join("");

    elements.transcript.innerHTML = blocks;
    elements.transcript.scrollTop = elements.transcript.scrollHeight;
  }

  function labelForKind(kind) {
    switch (kind) {
      case "thought":
        return "thinks:";
      case "action":
        return "acts:";
      case "dialogue":
        return "says:";
      default:
        return "story:";
    }
  }

  function showStatus(message, isError) {
    elements.statusBanner.textContent = message;
    elements.statusBanner.classList.remove("hidden", "error");
    if (isError) {
      elements.statusBanner.classList.add("error");
    }
  }

  function hideStatus() {
    elements.statusBanner.textContent = "";
    elements.statusBanner.classList.add("hidden");
    elements.statusBanner.classList.remove("error");
  }

  function setPending(isPending, label) {
    state.pending = isPending;
    elements.startButton.disabled = isPending;
    elements.sendButton.disabled = isPending;
    elements.resetButton.disabled = isPending;
    elements.exampleButton.disabled = isPending;

    if (isPending) {
      showStatus(label || "Working...", false);
    } else if (!elements.statusBanner.classList.contains("error")) {
      hideStatus();
    }
  }

  function loadExample() {
    Object.keys(examplePayload).forEach((key) => {
      elements.fields[key].value = examplePayload[key];
    });
    elements.fields.userTurn.value = "Ralph spots movement in the pool aisle and decides to make the first move.";
    showStatus("Example loaded. Start the scene or edit anything you want.", false);
  }

  function resetApp() {
    elements.storyForm.reset();
    elements.turnForm.reset();
    state.conversationState = null;
    state.history = [];
    state.sceneStarted = false;
    state.pending = false;
    hideStatus();
    renderTranscript();
  }

  function humanizeField(key) {
    switch (key) {
      case "characterA":
        return "Character A";
      case "characterB":
        return "Character B";
      default:
        return key.charAt(0).toUpperCase() + key.slice(1);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function logDebugStatus(debug, statusCode) {
    if (!debug || typeof debug !== "object") {
      console.info(`[Story Duel Debug] HTTP ${statusCode}. No structured debug payload returned.`);
      return;
    }

    const label = debug.status || "unknown";
    const detail = debug.detail ? ` ${debug.detail}` : "";
    console.info(`[Story Duel Debug] ${label}.${detail}`);

    switch (label) {
      case "missing_openai_configuration":
        console.info("[Story Duel Debug] Worker secret is missing. Run `npx wrangler secret put OPENAI_API_KEY`.");
        break;
      case "invalid_api_key":
        console.info("[Story Duel Debug] The Worker has a key, but OpenAI rejected it as invalid.");
        break;
      case "model_or_quota_error":
        console.info("[Story Duel Debug] The key works, but the model, quota, or rate limits blocked the request.");
        break;
      case "success":
        console.info("[Story Duel Debug] Request succeeded end-to-end.");
        break;
      default:
        console.info("[Story Duel Debug] Unclassified response. Check Worker response body and logs.");
        break;
    }
  }
})();
