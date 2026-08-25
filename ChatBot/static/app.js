// Vanna AI Data Assistant - Client Application

let currentToken = localStorage.getItem("vanna_token") || "";
let currentUser = JSON.parse(localStorage.getItem("vanna_user") || "null");
let activeConversationId = null;
let currentAuthMode = "login";
let isSending = false;
let currentAbortController = null;
let tasksHistory = [];
let messageDataMap = {};
let currentDisplayedTable = null;
let currentTurnData = { dataframe: null, chart: null };

// ==============================================================================
// 1. KHỞI TẠO ỨNG DỤNG
// ==============================================================================
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    setupEventListeners();
    setupDataPanelResize();
    checkAuthAndInit();
});

function checkAuthAndInit() {
    if (currentToken && currentUser) {
        updateUserUI(currentUser);
        loadConversations();
    } else {
        continueAsGuest();
    }
}

// ==============================================================================
// GIAO DIỆN CHẾ ĐỘ SÁNG / TỐI (LIGHT / DARK MODE THEME MANAGEMENT)
// ==============================================================================
function initTheme() {
    const savedTheme = localStorage.getItem("vanna_theme") || "light";
    setTheme(savedTheme);
}

function setTheme(themeName) {
    const sunIcon = document.getElementById("theme-icon-sun");
    const moonIcon = document.getElementById("theme-icon-moon");
    const themeText = document.getElementById("theme-text");

    const isDark = themeName === "dark";
    if (isDark) {
        document.documentElement.setAttribute("data-theme", "dark");
        document.body.setAttribute("data-theme", "dark");
        if (sunIcon) sunIcon.style.display = "none";
        if (moonIcon) moonIcon.style.display = "inline-block";
        if (themeText) themeText.textContent = "Giao diện sáng";
    } else {
        document.documentElement.removeAttribute("data-theme");
        document.body.removeAttribute("data-theme");
        if (sunIcon) sunIcon.style.display = "inline-block";
        if (moonIcon) moonIcon.style.display = "none";
        if (themeText) themeText.textContent = "Chế độ tối";
    }

    // Update all bot avatar images in message list
    const botLogo = isDark ? "/static/logo-dark.png" : "/static/logo-light.png";
    document.querySelectorAll(".bot-avatar img").forEach(img => {
        img.src = botLogo;
    });

    localStorage.setItem("vanna_theme", themeName);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    setTheme(newTheme);
}

// Đồng bộ theme khi web app cha (Vue Frontend) gửi thông điệp postMessage
window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SET_THEME") {
        setTheme(event.data.theme);
    }
});

function setupEventListeners() {
    // Input Enter handler
    const input = document.getElementById("user-input");
    if (input) {
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isSending) {
                    sendMessage();
                }
            }
        });

        // Auto-resize input
        input.addEventListener("input", () => {
            input.style.height = "auto";
            input.style.height = Math.min(input.scrollHeight, 140) + "px";
        });
    }

    // Send / Stop button
    document.getElementById("btn-send")?.addEventListener("click", () => {
        if (isSending) {
            stopGenerating();
        } else {
            sendMessage();
        }
    });

    // New chat button
    document.getElementById("btn-new-chat")?.addEventListener("click", startNewChat);

    // Toggle Dev Modal Popup
    const devModal = document.getElementById("dev-modal");
    document.getElementById("btn-toggle-dev-panel")?.addEventListener("click", () => {
        if (devModal) devModal.style.display = "flex";
    });
    document.getElementById("btn-close-dev-drawer")?.addEventListener("click", () => {
        if (devModal) devModal.style.display = "none";
    });
    devModal?.addEventListener("click", (e) => {
        if (e.target.id === "dev-modal") {
            devModal.style.display = "none";
        }
    });

    // Toggle Data & Charts Side Panel
    document.getElementById("btn-toggle-data-panel")?.addEventListener("click", toggleDataPanel);
    document.getElementById("btn-close-data-panel")?.addEventListener("click", closeDataPanel);

    // Toggle Sidebar
    const sidebar = document.getElementById("sidebar");
    const toggleSidebar = () => {
        sidebar?.classList.toggle("collapsed");
        setTimeout(() => window.dispatchEvent(new Event("resize")), 260);
    };
    document.getElementById("btn-toggle-sidebar-collapse")?.addEventListener("click", toggleSidebar);
    document.getElementById("btn-sidebar-toggle")?.addEventListener("click", toggleSidebar);
    document.getElementById("btn-mobile-toggle")?.addEventListener("click", () => {
        sidebar?.classList.toggle("open");
    });

    // Toggle Light / Dark Theme
    document.getElementById("btn-theme-toggle")?.addEventListener("click", toggleTheme);

    // Logout / Switch account
    document.getElementById("btn-logout")?.addEventListener("click", () => {
        showAuthModal("login");
    });

    // Search conversations
    document.getElementById("search-conversations")?.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        const items = document.querySelectorAll(".conv-item");
        items.forEach(item => {
            const title = item.querySelector(".conv-title")?.textContent.toLowerCase() || "";
            item.style.display = title.includes(query) ? "flex" : "none";
        });
    });
}

// ==============================================================================
// 2. AUTHENTICATION & USER MANAGEMENT
// ==============================================================================
function showAuthModal(mode = "login") {
    switchAuthTab(mode);
    const modal = document.getElementById("auth-modal");
    if (modal) modal.style.display = "flex";
}

function hideAuthModal() {
    const modal = document.getElementById("auth-modal");
    if (modal) modal.style.display = "none";
}

function switchAuthTab(mode) {
    currentAuthMode = mode;
    const tabLogin = document.getElementById("tab-login");
    const tabRegister = document.getElementById("tab-register");
    const groupUsername = document.getElementById("group-username");
    const btnSubmit = document.getElementById("btn-auth-submit");
    const errorMsg = document.getElementById("auth-error-msg") || document.getElementById("auth-error");

    if (errorMsg) errorMsg.style.display = "none";

    if (mode === "login") {
        if (tabLogin) tabLogin.classList.add("active");
        if (tabRegister) tabRegister.classList.remove("active");
        if (groupUsername) groupUsername.style.display = "none";
        if (btnSubmit) btnSubmit.textContent = "Đăng Nhập";
    } else {
        if (tabLogin) tabLogin.classList.remove("active");
        if (tabRegister) tabRegister.classList.add("active");
        if (groupUsername) groupUsername.style.display = "block";
        if (btnSubmit) btnSubmit.textContent = "Đăng Ký Tài Khoản";
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById("auth-email")?.value.trim() || "";
    const password = document.getElementById("auth-password")?.value || "";
    const username = document.getElementById("auth-username")?.value.trim() || "";
    const errorMsg = document.getElementById("auth-error-msg") || document.getElementById("auth-error");

    if (errorMsg) errorMsg.style.display = "none";

    const endpoint = currentAuthMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const payload = currentAuthMode === "login" ? { email, password } : { email, password, username };

    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok) {
            if (errorMsg) {
                errorMsg.textContent = data.detail || "Đăng nhập thất bại. Vui lòng kiểm tra lại.";
                errorMsg.style.display = "block";
            }
            return;
        }

        currentToken = data.access_token;
        currentUser = data.user;
        localStorage.setItem("vanna_token", currentToken);
        localStorage.setItem("vanna_user", JSON.stringify(currentUser));

        updateUserUI(currentUser);
        hideAuthModal();
        loadConversations();
    } catch (err) {
        if (errorMsg) {
            errorMsg.textContent = "Lỗi kết nối máy chủ: " + err.message;
            errorMsg.style.display = "block";
        }
    }
}

function continueAsGuest() {
    currentToken = "";
    currentUser = { id: "guest_user", email: "guest@example.com", username: "Khách (Guest)" };
    localStorage.removeItem("vanna_token");
    localStorage.setItem("vanna_user", JSON.stringify(currentUser));
    updateUserUI(currentUser);
    hideAuthModal();
    loadConversations();
}

function handleLogout() {
    startNewChat();
}

function updateUserUI(user) {
    if (!user) return;
    const name = user.username || (user.email ? user.email.split("@")[0] : "User");
    const nameEl = document.getElementById("user-display-name");
    if (nameEl) nameEl.textContent = name;
    const emailEl = document.getElementById("user-display-email");
    if (emailEl) emailEl.textContent = user.email || "";
    const avatarEl = document.getElementById("user-avatar");
    if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
}

// ==============================================================================
// 3. CONVERSATIONS MANAGEMENT (SIDEBAR)
// ==============================================================================
async function loadConversations() {
    const listEl = document.getElementById("conversations-list");
    listEl.innerHTML = `<div class="conversations-loading">Đang tải lịch sử...</div>`;

    try {
        const headers = currentToken ? { "Authorization": `Bearer ${currentToken}` } : {};
        const res = await fetch("/api/conversations", { headers });
        const data = await res.json();

        if (!res.ok || !data.conversations || data.conversations.length === 0) {
            listEl.innerHTML = `<div class="conversations-empty">Chưa có cuộc trò chuyện nào</div>`;
            return;
        }

        listEl.innerHTML = "";
        data.conversations.forEach(conv => {
            const item = document.createElement("div");
            item.className = `conv-item ${conv.id === activeConversationId ? "active" : ""}`;
            item.dataset.id = conv.id;
            item.innerHTML = `
                <span class="conv-title">${escapeHtml(conv.title)}</span>
                <button class="btn-conv-delete" title="Xóa đoạn chat" onclick="deleteConversation(event, '${conv.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            `;
            item.addEventListener("click", () => selectConversation(conv.id, conv.title));
            listEl.appendChild(item);
        });
    } catch (err) {
        listEl.innerHTML = `<div class="conversations-empty">Không thể tải lịch sử</div>`;
    }
}

async function selectConversation(convId, title) {
    if (isSending) return;
    activeConversationId = convId;
    document.getElementById("active-chat-title").textContent = title || "Cuộc trò chuyện";

    // Highlight sidebar
    document.querySelectorAll(".conv-item").forEach(el => {
        el.classList.toggle("active", el.dataset.id === convId);
    });

    const welcomeScreen = document.getElementById("welcome-screen");
    const messagesList = document.getElementById("messages-list");
    welcomeScreen.style.display = "none";
    messagesList.style.display = "flex";
    messagesList.innerHTML = `<div class="conversations-loading">Đang tải tin nhắn...</div>`;

    try {
        const headers = currentToken ? { "Authorization": `Bearer ${currentToken}` } : {};
        const res = await fetch(`/api/conversations/${convId}`, { headers });
        const data = await res.json();

        messagesList.innerHTML = "";
        if (data.conversation && data.conversation.messages) {
            data.conversation.messages.forEach(msg => {
                if (!msg.content || !msg.content.trim()) return;
                if (msg.role !== "user" && msg.role !== "assistant") return;
                if (msg.content.includes("Results saved to file:") || msg.content.includes("IMPORTANT: FOR VISUALIZE_DATA")) return;
                
                const bubbleRow = appendMessageBubble(msg.role, msg.content, false);
                if (msg.role === "assistant") {
                    const parsedTable = parseMarkdownTable(msg.content);
                    if (parsedTable) {
                        const tId = "turn_" + generateUUID();
                        messageDataMap[tId] = { dataframe: parsedTable, chart: null };
                        const actionsBar = bubbleRow.querySelector(".bubble-actions");
                        if (actionsBar && !actionsBar.querySelector(".btn-view-data")) {
                            const dataBtn = document.createElement("button");
                            dataBtn.className = "btn-bubble-action btn-view-data";
                            dataBtn.title = "Xem bảng dữ liệu đã truy xuất";
                            dataBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/></svg>`;
                            dataBtn.onclick = () => openDataPanelWithData(tId);
                            actionsBar.insertBefore(dataBtn, actionsBar.firstChild);
                        }
                    }
                }
            });
            scrollToBottom();
        }
    } catch (err) {
        messagesList.innerHTML = `<div class="conversations-empty">Lỗi tải tin nhắn cũ.</div>`;
    }
}

async function deleteConversation(e, convId) {
    e.stopPropagation();
    if (!confirm("Bạn có chắc chắn muốn xóa cuộc trò chuyện này?")) return;

    try {
        const headers = currentToken ? { "Authorization": `Bearer ${currentToken}` } : {};
        await fetch(`/api/conversations/${convId}`, { method: "DELETE", headers });

        if (activeConversationId === convId) {
            startNewChat();
        }
        loadConversations();
    } catch (err) {
        alert("Lỗi khi xóa đoạn chat: " + err.message);
    }
}

function startNewChat() {
    activeConversationId = null;
    document.getElementById("active-chat-title").textContent = "Cuộc trò chuyện mới";
    document.getElementById("welcome-screen").style.display = "block";
    document.getElementById("messages-list").style.display = "none";
    document.getElementById("messages-list").innerHTML = "";
    document.getElementById("user-input").value = "";
    document.getElementById("user-input").style.height = "auto";
    
    // Reset Tasks
    tasksHistory = [];
    renderTasksList();

    document.querySelectorAll(".conv-item").forEach(el => el.classList.remove("active"));
}

function sendSuggestedPrompt(text) {
    const input = document.getElementById("user-input");
    if (input) {
        input.value = text;
        sendMessage();
    }
}

// ==============================================================================
// 4. CHAT MESSAGING & SSE STREAMING
// ==============================================================================
async function sendMessage() {
    const input = document.getElementById("user-input");
    if (!input) return;

    const message = input.value.trim();
    if (!message || isSending) return;

    const requestStartTime = Date.now();
    isSending = true;
    currentAbortController = new AbortController();
    currentTurnData = { dataframe: null, chart: null };
    setSendButtonState("stop");

    input.value = "";
    input.style.height = "auto";

    // Switch view to messages
    const welcomeScreen = document.getElementById("welcome-screen");
    const messagesList = document.getElementById("messages-list");
    if (welcomeScreen) welcomeScreen.style.display = "none";
    if (messagesList) messagesList.style.display = "flex";

    // 1. Render User message
    appendMessageBubble("user", message);
    scrollToBottom();

    // 2. Append empty bot bubble for streaming with Execution Flow tracker
    const botBubbleRow = appendMessageBubble("bot", "", true);
    const botContentWrapper = botBubbleRow.querySelector(".message-content-wrapper");
    const botBubble = botBubbleRow.querySelector(".message-bubble");
    const botBubbleText = botBubble ? botBubble.querySelector(".bubble-content") : null;

    // Attach Live Execution Flow component before the message bubble
    const flowEl = createExecutionFlowElement();
    if (botContentWrapper && botBubble) {
        botContentWrapper.insertBefore(flowEl, botBubble);
    }

    if (botBubbleText) {
        botBubbleText.innerHTML = `<span class="spinner" style="display:inline-block; vertical-align:middle; margin-right:6px;"></span> <em>Đang phân tích và truy vấn dữ liệu...</em><span class="typing-cursor"></span>`;
    }
    scrollToBottom();

    // 3. Show status banner
    showStatusBanner("Đang phân tích câu hỏi và truy vấn dữ liệu CRM...");

    // 4. Generate or use conversationId
    if (!activeConversationId) {
        activeConversationId = generateUUID();
        const titleEl = document.getElementById("active-chat-title");
        if (titleEl) titleEl.textContent = message.substring(0, 35) + "...";
    }

    tasksHistory = [];
    renderTasksList();

    let accumulatedText = "";

    try {
        const headers = { "Content-Type": "application/json" };
        if (currentToken) {
            headers["Authorization"] = `Bearer ${currentToken}`;
        }

        const response = await fetch("/api/vanna/v2/chat_sse", {
            method: "POST",
            headers,
            body: JSON.stringify({
                message: message,
                conversation_id: activeConversationId,
                request_id: generateUUID(),
                metadata: {}
            }),
            signal: currentAbortController.signal
        });

        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop(); // keep last incomplete line

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data:")) continue;

                const dataStr = trimmed.replace(/^data:\s*/, "");
                if (dataStr === "[DONE]") {
                    break;
                }

                try {
                    const chunk = JSON.parse(dataStr);
                    handleIncomingChunk(chunk, botBubbleText, botBubble, flowEl, (newText) => {
                        accumulatedText = newText;
                    });
                } catch (e) {
                    // Ignore non-json stream fragments
                }
            }
        }

        // Finalize Flow Tracker with duration
        const durationSec = Math.max(1, Math.round((Date.now() - requestStartTime) / 1000));
        completeAllFlowSteps(flowEl, durationSec);
        setTimeout(() => {
            if (flowEl) flowEl.classList.add("collapsed");
        }, 800);

        hideStatusBanner();
        loadConversations();
    } catch (err) {
        if (err.name === "AbortError") {
            // User stopped generating
            if (botBubbleText) {
                const cursor = botBubbleText.querySelector(".typing-cursor");
                if (cursor) cursor.remove();
            }
            if (botBubble && !botBubble.querySelector(".stopped-notice")) {
                const notice = document.createElement("div");
                notice.className = "stopped-notice";
                notice.innerHTML = `<span>⏹️ Đã dừng phản hồi</span>`;
                botBubble.appendChild(notice);
            }
            completeAllFlowSteps(flowEl);
        } else {
            if (botBubbleText) {
                botBubbleText.innerHTML = `<span style="color:#E53E3E;">⚠️ Lỗi: Không thể nhận phản hồi từ AI (${err.message}). Vui lòng thử lại.</span>`;
            }
        }
        hideStatusBanner();
    } finally {
        // Remove typing cursor and check if response is empty
        if (botBubbleText) {
            const cursor = botBubbleText.querySelector(".typing-cursor");
            if (cursor) cursor.remove();
            if (!accumulatedText) {
                botBubbleText.innerHTML = `<span style="color:#e53e3e;">⚠️ Không nhận được câu trả lời từ AI (có thể do chạm giới hạn Rate Limit). Vui lòng đợi 10 giây rồi thử lại hoặc tạo cuộc trò chuyện mới.</span>`;
            }
        }

        // Detect if query produced a markdown table
        if (!currentTurnData.dataframe && accumulatedText) {
            currentTurnData.dataframe = parseMarkdownTable(accumulatedText);
        }

        const durationSec = Math.max(1, Math.round((Date.now() - requestStartTime) / 1000));
        if (botBubble && accumulatedText) {
            const existingBadge = botBubble.querySelector(".execution-time-badge");
            if (!existingBadge) {
                const badge = document.createElement("div");
                badge.className = "execution-time-badge";
                badge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> <span>Đã hoàn thành trong ${durationSec} giây</span>`;
                botBubble.appendChild(badge);
            }
        }

        // If turn has table or chart, attach "Xem dữ liệu" button to bot message
        if (currentTurnData.dataframe || currentTurnData.chart) {
            const turnId = "turn_" + generateUUID();
            messageDataMap[turnId] = { ...currentTurnData };
            const actionsBar = botBubbleRow.querySelector(".bubble-actions");
            if (actionsBar && !actionsBar.querySelector(".btn-view-data")) {
                const dataBtn = document.createElement("button");
                dataBtn.className = "btn-bubble-action btn-view-data";
                dataBtn.title = "Xem bảng dữ liệu & biểu đồ đã truy xuất";
                dataBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/></svg>`;
                dataBtn.onclick = () => openDataPanelWithData(turnId);
                actionsBar.insertBefore(dataBtn, actionsBar.firstChild);
            }
        }

        isSending = false;
        currentAbortController = null;
        setSendButtonState("send");
        scrollToBottom();
    }
}

function stopGenerating() {
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
    isSending = false;
    hideStatusBanner();
    setSendButtonState("send");
}

function setSendButtonState(state) {
    const btn = document.getElementById("btn-send");
    if (!btn) return;

    if (state === "stop") {
        btn.classList.add("btn-stop");
        btn.disabled = false;
        btn.title = "Dừng tạo câu trả lời";
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;
    } else {
        btn.classList.remove("btn-stop");
        btn.disabled = false;
        btn.title = "Gửi tin nhắn";
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`;
    }
}

function handleIncomingChunk(chunk, bubbleContentEl, bubbleEl, flowEl, updateAccumulated) {
    if (!bubbleContentEl || !chunk) return;

    const rich = chunk.rich || chunk.rich_component;
    const simple = chunk.simple || chunk.simple_component;

    // 1. Process Rich Components
    if (rich) {
        const type = rich.type || rich.component_type;
        const data = rich.data || rich;

        // Status bar update
        if (type === "status_bar_update" || data?.message) {
            const msg = data.message || data.detail;
            if (msg) {
                showStatusBanner(msg);
                updateFlowStep(flowEl, "query", "in-progress", msg);
            }
        }

        // Task tracker update
        if (type === "task_tracker_update") {
            if (data.operation === "add_task" && data.task) {
                addTaskToTimeline(data.task.title || data.task.description || "Thực thi tác vụ", data.task.status || "in_progress", data.task.id);
                updateFlowStep(flowEl, "query", "in-progress", data.task.title || "Truy vấn cơ sở dữ liệu CRM...");
            } else if (data.operation === "update_task" && data.task_id) {
                updateTaskInTimeline(data.task_id, data.status || "completed", data.detail);
                updateFlowStep(flowEl, "query", "completed", "Đã truy vấn dữ liệu thành công");
                updateFlowStep(flowEl, "answer", "in-progress");
            }
        } else if (type === "task_list" || data.tasks) {
            tasksHistory = data.tasks || [];
            renderTasksList();
        } else if (type === "status_card") {
            addTaskToTimeline(data.title || data.description || "Công cụ hoàn thành", "completed");
            updateFlowStep(flowEl, "query", "completed", "Đã hoàn thành truy vấn");
            if (data.dataframe) {
                currentTurnData.dataframe = data.dataframe;
            }
        }

        // Dataframe component
        if (type === "dataframe" || data?.columns) {
            currentTurnData.dataframe = data.dataframe || data;
            updateFlowStep(flowEl, "query", "completed", `Đã trích xuất bảng dữ liệu (${data.row_count || data.data?.length || "nhiều"} dòng)`);
            updateFlowStep(flowEl, "answer", "in-progress");
        }

        // Plotly Chart Component
        if (type === "chart" || type === "plotly_chart" || data.figure || data.data) {
            const chartData = data.data || data.figure || data;
            currentTurnData.chart = chartData;
            renderPlotlyChart(chartData, bubbleContentEl);
            updateFlowStep(flowEl, "visualize", "completed", "Đã vẽ biểu đồ trực quan hóa");
            updateFlowStep(flowEl, "answer", "in-progress");
        }

        // Rich Text Component (Typewriter live update)
        if (type === "text" && data.content) {
            const rawText = data.content;
            if (!isToolOutput(rawText)) {
                const cleanedText = cleanAssistantText(rawText);
                if (cleanedText) {
                    bubbleContentEl.innerHTML = marked.parse(cleanedText) + '<span class="typing-cursor"></span>';
                    if (bubbleEl) bubbleEl.dataset.raw = cleanedText;
                    updateAccumulated(cleanedText);
                }
            }
            updateFlowStep(flowEl, "query", "completed", "Đã truy vấn dữ liệu");
            updateFlowStep(flowEl, "answer", "in-progress");
            scrollToBottom();
        }
    }

    // 2. Process Simple Component Text
    if (simple && simple.text) {
        const rawText = simple.text;
        if (!isToolOutput(rawText)) {
            const cleanedText = cleanAssistantText(rawText);
            if (cleanedText) {
                bubbleContentEl.innerHTML = marked.parse(cleanedText) + '<span class="typing-cursor"></span>';
                if (bubbleEl) bubbleEl.dataset.raw = cleanedText;
                updateAccumulated(cleanedText);
            }
        }
        updateFlowStep(flowEl, "query", "completed", "Đã truy vấn dữ liệu");
        updateFlowStep(flowEl, "answer", "in-progress");
        scrollToBottom();
    }
}

// ==============================================================================
// 5. LIVE EXECUTION FLOW & RENDERING HELPERS
// ==============================================================================
function createExecutionFlowElement() {
    const flow = document.createElement("div");
    flow.className = "execution-flow";
    flow.innerHTML = `
        <div class="flow-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <div class="flow-header-left">
                <div class="flow-spinner"></div>
                <span class="flow-title">Đang xử lý luồng phân tích dữ liệu...</span>
            </div>
            <button class="flow-toggle-btn" title="Thu gọn / Mở rộng tiến trình">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
        </div>
        <div class="flow-steps">
            <div class="flow-step in-progress" data-step="analyze">
                <div class="step-icon"><div class="mini-spinner"></div></div>
                <span class="step-label">Đọc & phân tích câu hỏi</span>
            </div>
            <div class="flow-step pending" data-step="query">
                <div class="step-icon"><span class="step-dot"></span></div>
                <span class="step-label">Truy vấn cơ sở dữ liệu CRM (DuckDB)</span>
            </div>
            <div class="flow-step pending" data-step="visualize" style="display: none;">
                <div class="step-icon"><span class="step-dot"></span></div>
                <span class="step-label">Khởi tạo biểu đồ trực quan hóa</span>
            </div>
            <div class="flow-step pending" data-step="answer">
                <div class="step-icon"><span class="step-dot"></span></div>
                <span class="step-label">Tổng hợp câu trả lời chi tiết</span>
            </div>
        </div>
    `;
    return flow;
}

function updateFlowStep(flowEl, stepName, status, customLabel = null) {
    if (!flowEl) return;
    const stepEl = flowEl.querySelector(`[data-step="${stepName}"]`);
    if (!stepEl) return;

    if (customLabel) {
        const labelEl = stepEl.querySelector(".step-label");
        if (labelEl) labelEl.textContent = customLabel;
    }

    stepEl.style.display = "flex";
    stepEl.classList.remove("pending", "in-progress", "completed");
    stepEl.classList.add(status);

    const iconEl = stepEl.querySelector(".step-icon");
    if (status === "in-progress") {
        iconEl.innerHTML = `<div class="mini-spinner"></div>`;
    } else if (status === "completed") {
        iconEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="step-check"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else {
        iconEl.innerHTML = `<span class="step-dot"></span>`;
    }
}

function completeAllFlowSteps(flowEl) {
    if (!flowEl) return;
    const steps = flowEl.querySelectorAll(".flow-step");
    steps.forEach(s => {
        s.classList.remove("pending", "in-progress");
        s.classList.add("completed");
        const iconEl = s.querySelector(".step-icon");
        if (iconEl) {
            iconEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="step-check"><polyline points="20 6 9 17 4 12"/></svg>`;
        }
    });

    const spinner = flowEl.querySelector(".flow-spinner");
    if (spinner) {
        spinner.outerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="step-check"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    }
    const title = flowEl.querySelector(".flow-title");
    if (title) {
        title.textContent = "Đã xử lý & hoàn tất luồng dữ liệu";
    }
}

function isToolOutput(text) {
    if (!text) return false;
    if (text.includes("Results saved to file:") || 
        text.includes("FOR VISUALIZE_DATA") || 
        text.includes("Results truncated to") ||
        text.includes("Query returned") ||
        text.includes("Created visualization from")) {
        return true;
    }
    if (/^[a-zA-Z0-9_]+(,[a-zA-Z0-9_]+){2,}/m.test(text.trim())) {
        return true;
    }
    return false;
}

function cleanAssistantText(text) {
    if (!text) return "";
    if (isToolOutput(text) && !text.includes("Dưới đây") && !text.includes("Thông tin") && !text.includes("Đơn hàng") && !text.includes("Doanh thu")) {
        return "";
    }
    let cleaned = text;
    cleaned = cleaned.replace(/Created visualization from '[^']+' \(\d+ rows, \d+ columns\)\.?/gi, "");
    cleaned = cleaned.replace(/Query returned \d+ rows\.?/gi, "");
    cleaned = cleaned.replace(/\(Results truncated to \d+ characters[\s\S]*?\)/gi, "");
    cleaned = cleaned.replace(/\*{0,2}Results saved to file:\s*[^\n\r*]+\*{0,2}/gi, "");
    cleaned = cleaned.replace(/\*{0,2}IMPORTANT:\s*FOR VISUALIZE_DATA[^\n\r*]+\*{0,2}/gi, "");
    cleaned = cleaned.replace(/(?:^|\n)[a-zA-Z0-9_]+(,[a-zA-Z0-9_]+)+[\s\S]*?(?=\n\n|\n[A-ZÀ-Ỹ]|$)/gi, "");
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
    return cleaned.trim();
}

function appendMessageBubble(role, content = "", animate = true) {
    const messagesList = document.getElementById("messages-list");
    if (!messagesList) return document.createElement("div");

    const row = document.createElement("div");
    row.className = `message-row ${role === "user" ? "user-row" : "bot-row"}`;
    if (!animate) row.style.animation = "none";

    const userInitial = (currentUser && currentUser.username ? currentUser.username.charAt(0) : "U").toUpperCase();
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const botLogo = isDark ? "/static/logo-dark.png" : "/static/logo-light.png";
    const avatarHtml = role === "user" 
        ? `<div class="message-avatar user-avatar">${userInitial}</div>`
        : `<div class="message-avatar bot-avatar"><img src="${botLogo}" alt="LaPet Agent"></div>`;

    const cleanedContent = cleanAssistantText(content);
    const parsedContent = cleanedContent ? marked.parse(cleanedContent) : "";

    row.innerHTML = `
        ${role !== "user" ? avatarHtml : ""}
        <div class="message-content-wrapper">
            <div class="message-bubble" data-raw="${escapeHtml(content)}">
                <div class="bubble-content">${parsedContent}</div>
            </div>
            <div class="bubble-actions">
                ${role === "user" ? `
                    <button class="btn-bubble-action btn-edit" title="Chỉnh sửa câu hỏi" onclick="handleEditMessage(this)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                ` : ""}
                <button class="btn-bubble-action btn-copy" title="Sao chép nội dung" onclick="handleCopyMessage(this)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
            </div>
        </div>
        ${role === "user" ? avatarHtml : ""}
    `;

    messagesList.appendChild(row);
    return row;
}

function handleCopyMessage(btn) {
    const wrapper = btn.closest(".message-content-wrapper");
    if (!wrapper) return;
    const bubble = wrapper.querySelector(".message-bubble");
    const raw = bubble?.dataset.raw || bubble?.querySelector(".bubble-content")?.innerText || "";

    navigator.clipboard.writeText(raw).then(() => {
        const origHtml = btn.innerHTML;
        const origTitle = btn.title;
        btn.classList.add("copied");
        btn.title = "Đã sao chép!";
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
            btn.classList.remove("copied");
            btn.title = origTitle;
            btn.innerHTML = origHtml;
        }, 2000);
    }).catch(err => {
        console.error("Copy failed:", err);
    });
}

function handleEditMessage(btn) {
    const wrapper = btn.closest(".message-content-wrapper");
    if (!wrapper) return;
    const bubble = wrapper.querySelector(".message-bubble");
    const rawText = bubble?.dataset.raw || bubble?.querySelector(".bubble-content")?.innerText || "";

    const mainInput = document.getElementById("user-input");
    if (mainInput) {
        mainInput.value = rawText;
        mainInput.style.height = "auto";
        mainInput.style.height = Math.min(mainInput.scrollHeight, 140) + "px";
        mainInput.focus();
        mainInput.setSelectionRange(mainInput.value.length, mainInput.value.length);

        // Highlight chat input briefly
        const chatBox = document.querySelector(".chat-input-box");
        if (chatBox) {
            chatBox.style.borderColor = "var(--vanna-orange)";
            setTimeout(() => {
                chatBox.style.borderColor = "";
            }, 1200);
        }
    }
}

function renderPlotlyChart(figureData, targetBubbleEl) {
    if (!targetBubbleEl || !figureData) return;

    let chartContainer = targetBubbleEl.querySelector(".chart-container");
    if (!chartContainer) {
        chartContainer = document.createElement("div");
        chartContainer.className = "chart-container";
        chartContainer.style.width = "100%";
        chartContainer.style.minHeight = "400px";
        chartContainer.style.marginTop = "14px";
        chartContainer.style.borderRadius = "8px";
        chartContainer.style.overflow = "hidden";
        chartContainer.style.background = "#FFFFFF";
        targetBubbleEl.appendChild(chartContainer);
    }

    try {
        let fig = typeof figureData === "string" ? JSON.parse(figureData) : figureData;
        let data = fig.data || (Array.isArray(fig) ? fig : [fig]);
        let layout = fig.layout || {
            margin: { t: 40, b: 40, l: 50, r: 20 },
            paper_bgcolor: "#FFFFFF",
            plot_bgcolor: "#FFFFFF",
            autosize: true
        };
        Plotly.newPlot(chartContainer, data, layout, { responsive: true });
    } catch (e) {
        console.error("Plotly render error:", e);
    }
}

// ==============================================================================
// 6. RIGHT DATA & CHARTS SIDE PANEL CONTROLLER
// ==============================================================================
function toggleDataPanel() {
    const panel = document.getElementById("data-side-panel");
    if (!panel) return;
    if (panel.classList.contains("collapsed")) {
        openDataPanel();
    } else {
        closeDataPanel();
    }
}

function openDataPanel() {
    const panel = document.getElementById("data-side-panel");
    if (panel) {
        panel.classList.remove("collapsed");
        panel.classList.add("open");
        const toggleIcon = document.getElementById("data-panel-toggle-icon");
        if (toggleIcon) {
            toggleIcon.innerHTML = `<polyline points="9 18 15 12 9 6"/>`; // > icon
        }
        document.getElementById("btn-toggle-data-panel")?.setAttribute("title", "Thu gọn Bảng Dữ Liệu");
        setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
    }
}

function closeDataPanel() {
    const panel = document.getElementById("data-side-panel");
    if (panel) {
        panel.classList.add("collapsed");
        panel.classList.remove("open");
        const toggleIcon = document.getElementById("data-panel-toggle-icon");
        if (toggleIcon) {
            toggleIcon.innerHTML = `<polyline points="15 18 9 12 15 6"/>`; // < icon
        }
        document.getElementById("btn-toggle-data-panel")?.setAttribute("title", "Mở Bảng Dữ Liệu & Biểu Đồ");
        setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
    }
}

function switchDataTab(tabName) {
    document.querySelectorAll(".data-tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".data-tab-pane").forEach(p => p.classList.remove("active"));

    const btn = document.getElementById(`tab-btn-${tabName}`);
    const pane = document.getElementById(`pane-${tabName}`);
    if (btn) btn.classList.add("active");
    if (pane) pane.classList.add("active");

    if (tabName === "chart") {
        setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
    }
}

function setupDataPanelResize() {
    const handle = document.getElementById("data-panel-resize-handle");
    const panel = document.getElementById("data-side-panel");
    if (!handle || !panel) return;

    let isResizing = false;

    handle.addEventListener("mousedown", (e) => {
        isResizing = true;
        handle.classList.add("resizing");
        document.body.style.cursor = "ew-resize";
        document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth >= 320 && newWidth <= window.innerWidth * 0.75) {
            panel.style.width = newWidth + "px";
        }
    });

    document.addEventListener("mouseup", () => {
        if (isResizing) {
            isResizing = false;
            handle.classList.remove("resizing");
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            localStorage.setItem("vanna_data_panel_width", panel.style.width);
            window.dispatchEvent(new Event("resize"));
        }
    });

    const savedWidth = localStorage.getItem("vanna_data_panel_width");
    if (savedWidth) {
        panel.style.width = savedWidth;
    }
}

function openDataPanelWithData(turnId) {
    const dataObj = messageDataMap[turnId];
    if (!dataObj) return;

    openDataPanel();

    if (dataObj.dataframe) {
        renderDataTable(dataObj.dataframe);
        switchDataTab("table");
    }

    if (dataObj.chart) {
        const chartPane = document.getElementById("data-chart-panel-container");
        if (chartPane) {
            chartPane.innerHTML = "";
            renderPlotlyChart(dataObj.chart, chartPane);
        }
        if (!dataObj.dataframe) {
            switchDataTab("chart");
        }
    }
}

function renderDataTable(dfData) {
    const container = document.getElementById("data-table-container");
    const rowCountEl = document.getElementById("data-row-count");
    if (!container || !dfData) return;

    currentDisplayedTable = dfData;

    let cols = [];
    let rows = [];

    if (Array.isArray(dfData)) {
        rows = dfData;
        if (rows.length > 0) cols = Object.keys(rows[0]);
    } else if (dfData.columns && dfData.data) {
        cols = dfData.columns;
        rows = dfData.data;
    }

    if (rowCountEl) {
        rowCountEl.textContent = `${rows.length} dòng, ${cols.length} cột`;
    }

    if (cols.length === 0 || rows.length === 0) {
        container.innerHTML = `<div class="data-empty-state"><p>Bảng không có dữ liệu để hiển thị.</p></div>`;
        return;
    }

    let html = `<table class="data-panel-table" id="active-interactive-table"><thead><tr>`;
    cols.forEach(c => {
        html += `<th>${escapeHtml(c)}</th>`;
    });
    html += `</tr></thead><tbody>`;

    rows.forEach(row => {
        html += `<tr>`;
        cols.forEach(c => {
            const val = Array.isArray(row) ? row[cols.indexOf(c)] : (row[c] !== undefined ? row[c] : "");
            html += `<td>${escapeHtml(String(val))}</td>`;
        });
        html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function filterDataTable(query) {
    const q = query.toLowerCase().trim();
    const table = document.getElementById("active-interactive-table");
    if (!table) return;

    const rows = table.querySelectorAll("tbody tr");
    let visibleCount = 0;

    rows.forEach(tr => {
        const text = tr.innerText.toLowerCase();
        if (!q || text.includes(q)) {
            tr.style.display = "";
            visibleCount++;
        } else {
            tr.style.display = "none";
        }
    });

    const rowCountEl = document.getElementById("data-row-count");
    if (rowCountEl) {
        rowCountEl.textContent = q ? `${visibleCount} dòng khớp` : `${rows.length} dòng`;
    }
}

function exportCurrentTableToCSV() {
    if (!currentDisplayedTable) {
        alert("Không có dữ liệu bảng để xuất file.");
        return;
    }

    let cols = [];
    let rows = [];

    if (Array.isArray(currentDisplayedTable)) {
        rows = currentDisplayedTable;
        if (rows.length > 0) cols = Object.keys(rows[0]);
    } else if (currentDisplayedTable.columns && currentDisplayedTable.data) {
        cols = currentDisplayedTable.columns;
        rows = currentDisplayedTable.data;
    }

    if (cols.length === 0) return;

    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel support
    csvContent += cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",") + "\r\n";

    rows.forEach(row => {
        const rowVals = cols.map(c => {
            const val = Array.isArray(row) ? row[cols.indexOf(c)] : (row[c] !== undefined ? row[c] : "");
            return `"${String(val).replace(/"/g, '""')}"`;
        });
        csvContent += rowVals.join(",") + "\r\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `data_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function parseMarkdownTable(markdownText) {
    if (!markdownText || !markdownText.includes("|")) return null;
    const lines = markdownText.split("\n").map(l => l.trim()).filter(l => l.startsWith("|") && l.endsWith("|"));
    if (lines.length < 3) return null;

    const parseRow = (line) => line.slice(1, -1).split("|").map(cell => cell.trim());
    const headers = parseRow(lines[0]);
    const isSep = lines[1].split("|").slice(1, -1).every(c => c.replace(/:/g, '').replace(/-/g, '').trim() === '');
    if (!isSep) return null;

    const dataRows = [];
    for (let i = 2; i < lines.length; i++) {
        const rowValues = parseRow(lines[i]);
        if (rowValues.length === headers.length) {
            const rowObj = {};
            headers.forEach((h, idx) => {
                rowObj[h] = rowValues[idx];
            });
            dataRows.push(rowObj);
        }
    }

    if (dataRows.length === 0) return null;
    return { columns: headers, data: dataRows, row_count: dataRows.length };
}

function addTaskToTimeline(text, status = "completed", id = null) {
    const taskId = id || generateUUID();
    const existing = tasksHistory.find(t => t.id === taskId || t.text === text);
    if (!existing) {
        tasksHistory.push({ id: taskId, text, status });
        renderTasksList();
    }
}

function updateTaskInTimeline(id, status, detail) {
    const task = tasksHistory.find(t => t.id === id);
    if (task) {
        task.status = status;
        if (detail) task.detail = detail;
        renderTasksList();
    }
}

function renderTasksList() {
    const listEl = document.getElementById("dev-task-list");
    const countEl = document.getElementById("nav-task-count");
    if (!listEl || !countEl) return;

    if (tasksHistory.length === 0) {
        listEl.innerHTML = `<div class="task-empty">Chưa có tác vụ nào được thực thi.</div>`;
        countEl.textContent = "0/0";
        return;
    }

    const completed = tasksHistory.filter(t => t.status === "completed").length;
    countEl.textContent = `${completed}/${tasksHistory.length}`;

    listEl.innerHTML = "";
    tasksHistory.forEach(task => {
        const item = document.createElement("div");
        item.className = `task-card ${task.status === "completed" ? "completed" : ""}`;
        item.innerHTML = `
            <span class="task-card-icon">${task.status === "completed" ? "✓" : "⟳"}</span>
            <div>
                <div class="task-card-title">${escapeHtml(task.text || task.title || "")}</div>
                <div class="task-card-detail">${task.status === "completed" ? (task.detail || "Thành công") : "Đang xử lý..."}</div>
            </div>
        `;
        listEl.appendChild(item);
    });
}

function showStatusBanner(text) {
    const banner = document.getElementById("status-banner");
    const bannerText = document.getElementById("status-banner-text");
    if (bannerText) bannerText.textContent = text;
    if (banner) banner.style.display = "flex";
    scrollToBottom();
}

function hideStatusBanner() {
    const banner = document.getElementById("status-banner");
    if (banner) banner.style.display = "none";
}

function scrollToBottom() {
    const viewport = document.getElementById("chat-viewport");
    if (viewport) {
        viewport.scrollTo({
            top: viewport.scrollHeight,
            behavior: "smooth"
        });
    }
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
