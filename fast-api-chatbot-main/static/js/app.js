// State Management
let chats = {};
let activeChatId = null;

const settingsKey = 'orb_chat_settings';
const chatsKey = 'orb_chats';
const activeChatKey = 'orb_active_chat_id';

// Migrate legacy keys if present
try {
    // Migrate from lumino
    if (localStorage.getItem('lumino_chat_settings') && !localStorage.getItem(settingsKey)) {
        localStorage.setItem(settingsKey, localStorage.getItem('lumino_chat_settings'));
        localStorage.removeItem('lumino_chat_settings');
    }
    if (localStorage.getItem('lumino_chats') && !localStorage.getItem(chatsKey)) {
        localStorage.setItem(chatsKey, localStorage.getItem('lumino_chats'));
        localStorage.removeItem('lumino_chats');
    }
    if (localStorage.getItem('lumino_active_chat_id') && !localStorage.getItem(activeChatKey)) {
        localStorage.setItem(activeChatKey, localStorage.getItem('lumino_active_chat_id'));
        localStorage.removeItem('lumino_active_chat_id');
    }
    // Migrate from aether
    if (localStorage.getItem('aether_chat_settings') && !localStorage.getItem(settingsKey)) {
        localStorage.setItem(settingsKey, localStorage.getItem('aether_chat_settings'));
        localStorage.removeItem('aether_chat_settings');
    }
    if (localStorage.getItem('aether_chats') && !localStorage.getItem(chatsKey)) {
        localStorage.setItem(chatsKey, localStorage.getItem('aether_chats'));
        localStorage.removeItem('aether_chats');
    }
    if (localStorage.getItem('aether_active_chat_id') && !localStorage.getItem(activeChatKey)) {
        localStorage.setItem(activeChatKey, localStorage.getItem('aether_active_chat_id'));
        localStorage.removeItem('aether_active_chat_id');
    }
} catch (e) {
    console.error('Migration error:', e);
}
let isStreaming = false;
let activeController = null;
let serverApiKeyConfigured = false;

// Default Settings
const defaultSettings = {
    customApiKey: "",
    model: "gemini-2.5-flash",
    temperature: 0.7,
    systemPrompt: ""
};
let settings = { ...defaultSettings };

// DOM Selectors
const sidebar = document.getElementById('sidebar');
const menuBtn = document.getElementById('menuBtn');
const backBtn = document.getElementById('backBtn');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');
const newChatBtn = document.getElementById('newChatBtn');
const chatHistoryList = document.getElementById('chatHistoryList');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const apiStatusDot = document.getElementById('apiStatusDot');
const apiStatusText = document.getElementById('apiStatusText');
const activeChatTitle = document.getElementById('activeChatTitle');
const activeModelBadge = document.getElementById('activeModelBadge');
const clearChatBtn = document.getElementById('clearChatBtn');
const messageArea = document.getElementById('messageArea');
const welcomeContainer = document.getElementById('welcomeContainer');
const messagesList = document.getElementById('messagesList');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const promptCards = document.querySelectorAll('.prompt-card');

// Settings Modal Selectors
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtnX = document.getElementById('closeSettingsBtnX');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const toggleApiKeyVisibility = document.getElementById('toggleApiKeyVisibility');
const eyeIcon = document.getElementById('eyeIcon');
const modelSelect = document.getElementById('modelSelect');
const tempInput = document.getElementById('tempInput');
const tempValue = document.getElementById('tempValue');
const systemPromptInput = document.getElementById('systemPromptInput');

/* ==========================================================================
   Initialization
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialise Lucide icons
    lucide.createIcons();
    
    // 2. Load stored settings & chat history
    loadSettings();
    loadChatsFromStorage();
    
    // 3. Setup event listeners
    setupEventListeners();
    
    // 4. Verify backend status
    checkBackendHealth();
    
    // 5. Select active chat or create/display empty welcome screen
    if (activeChatId && chats[activeChatId]) {
        loadChat(activeChatId);
    } else {
        showWelcomeScreen();
    }
});

/* ==========================================================================
   API & Backend Functions
   ========================================================================== */
async function checkBackendHealth() {
    try {
        const response = await fetch('/api/health');
        if (!response.ok) throw new Error('API server returned status: ' + response.status);
        
        const data = await response.json();
        serverApiKeyConfigured = data.api_key_configured;
        updateStatusIndicator();
    } catch (e) {
        console.error('Error verifying API health:', e);
        apiStatusDot.className = 'status-dot disconnected';
        apiStatusText.textContent = 'Offline';
    }
}

function updateStatusIndicator() {
    const hasKey = serverApiKeyConfigured || settings.customApiKey.trim().length > 0;
    if (hasKey) {
        apiStatusDot.className = 'status-dot connected';
        apiStatusText.textContent = settings.customApiKey ? 'Connected (Custom Key)' : 'Connected (Server Key)';
    } else {
        apiStatusDot.className = 'status-dot disconnected';
        apiStatusText.textContent = 'API Key Missing';
    }
}

/* ==========================================================================
   Settings Management
   ========================================================================== */
function loadSettings() {
    const stored = localStorage.getItem(settingsKey);
    if (stored) {
        try {
            settings = { ...defaultSettings, ...JSON.parse(stored) };
        } catch (e) {
            console.error('Error parsing settings:', e);
        }
    }
    
    // Populate form fields
    apiKeyInput.value = settings.customApiKey;
    modelSelect.value = settings.model;
    tempInput.value = settings.temperature;
    tempValue.textContent = settings.temperature;
    systemPromptInput.value = settings.systemPrompt;
    
    // Update header badge
    activeModelBadge.textContent = settings.model;
}

function saveSettings() {
    settings.customApiKey = apiKeyInput.value.trim();
    settings.model = modelSelect.value;
    settings.temperature = parseFloat(tempInput.value);
    settings.systemPrompt = systemPromptInput.value.trim();
    
    localStorage.setItem(settingsKey, JSON.stringify(settings));
    
    // Update UI Elements
    activeModelBadge.textContent = settings.model;
    updateStatusIndicator();
    
    // Close modal
    closeSettingsModal();
}

function resetSettings() {
    // Reset inputs
    apiKeyInput.value = "";
    modelSelect.value = defaultSettings.model;
    tempInput.value = defaultSettings.temperature;
    tempValue.textContent = defaultSettings.temperature;
    systemPromptInput.value = defaultSettings.systemPrompt;
}

/* ==========================================================================
   Chat History Management
   ========================================================================== */
function loadChatsFromStorage() {
    const stored = localStorage.getItem(chatsKey);
    const active = localStorage.getItem(activeChatKey);
    
    if (stored) {
        try {
            chats = JSON.parse(stored);
            activeChatId = active;
        } catch (e) {
            console.error('Error loading conversations from localStorage:', e);
            chats = {};
        }
    }
    
    renderChatHistoryList();
}

function saveChatsToStorage() {
    localStorage.setItem(chatsKey, JSON.stringify(chats));
    localStorage.setItem(activeChatKey, activeChatId);
    renderChatHistoryList();
}

function renderChatHistoryList() {
    chatHistoryList.innerHTML = '';
    
    const sortedChatIds = Object.keys(chats).sort((a, b) => b - a); // Newest first
    
    if (sortedChatIds.length === 0) {
        chatHistoryList.innerHTML = '<div class="no-history-msg">No chats yet</div>';
        return;
    }
    
    sortedChatIds.forEach(id => {
        const chat = chats[id];
        const item = document.createElement('div');
        item.className = `history-item ${id === activeChatId ? 'active' : ''}`;
        item.dataset.id = id;
        
        item.innerHTML = `
            <div class="history-item-left">
                <i data-lucide="message-square" class="history-item-icon"></i>
                <span class="history-item-title">${escapeHTML(chat.title || 'Untitled Chat')}</span>
            </div>
            <button class="delete-history-btn" title="Delete conversation">
                <i data-lucide="trash" style="width:14px;height:14px"></i>
            </button>
        `;
        
        // Load chat on click
        item.addEventListener('click', (e) => {
            if (e.target.closest('.delete-history-btn')) {
                e.stopPropagation();
                deleteChat(id);
            } else {
                loadChat(id);
                // Collapse sidebar on mobile
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('open');
                }
            }
        });
        
        chatHistoryList.appendChild(item);
    });
    
    lucide.createIcons();
}

function createNewChat(initialMessage = "") {
    const id = Date.now().toString();
    chats[id] = {
        id: id,
        title: initialMessage ? truncateText(initialMessage, 24) : "New Chat",
        messages: [],
        model: settings.model,
        temperature: settings.temperature,
        systemPrompt: settings.systemPrompt
    };
    
    activeChatId = id;
    saveChatsToStorage();
    loadChat(id);
}

function loadChat(id) {
    if (!chats[id]) return;
    
    activeChatId = id;
    localStorage.setItem(activeChatKey, id);
    
    // Update headers
    const chat = chats[id];
    activeChatTitle.textContent = chat.title || 'New Chat';
    activeModelBadge.textContent = chat.model || settings.model;
    
    // Update sidebar selection
    document.querySelectorAll('.history-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === id);
    });
    
    // Render messages
    welcomeContainer.style.display = 'none';
    messagesList.style.display = 'flex';
    messagesList.innerHTML = '';
    backBtn.style.display = 'flex'; // Show back button when chat is active
    
    chat.messages.forEach(msg => {
        appendMessageBubble(msg.role, msg.content);
    });
    
    scrollToBottom();
}

function deleteChat(id) {
    delete chats[id];
    
    if (activeChatId === id) {
        const remainingKeys = Object.keys(chats);
        if (remainingKeys.length > 0) {
            const nextActiveId = remainingKeys.sort((a, b) => b - a)[0];
            loadChat(nextActiveId);
        } else {
            activeChatId = null;
            localStorage.removeItem(activeChatKey);
            showWelcomeScreen();
        }
    }
    
    saveChatsToStorage();
}

function showWelcomeScreen() {
    activeChatId = null;
    localStorage.removeItem(activeChatKey);
    activeChatTitle.textContent = 'New Chat';
    
    welcomeContainer.style.display = 'flex';
    messagesList.style.display = 'none';
    messagesList.innerHTML = '';
    backBtn.style.display = 'none'; // Hide back button on welcome screen
    
    document.querySelectorAll('.history-item').forEach(item => {
        item.classList.remove('active');
    });
}

function clearActiveChatHistory() {
    if (!activeChatId) return;
    
    chats[activeChatId].messages = [];
    chats[activeChatId].title = "New Chat";
    saveChatsToStorage();
    loadChat(activeChatId);
}

/* ==========================================================================
   Chat Interface & Streaming Logic
   ========================================================================== */
function appendMessageBubble(role, text, isPending = false) {
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    
    if (role === 'user') {
        avatar.innerHTML = 'U';
    } else {
        avatar.innerHTML = '<i data-lucide="bot" style="width:18px;height:18px"></i>';
    }
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    if (isPending) {
        bubble.innerHTML = `
            <div class="typing-indicator">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;
    } else {
        bubble.innerHTML = marked.parse(text);
        formatCodeBlocks(bubble);
    }
    
    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    messagesList.appendChild(wrapper);
    
    lucide.createIcons();
    scrollToBottom();
    
    return bubble;
}

function formatCodeBlocks(container) {
    const preElements = container.querySelectorAll('pre');
    preElements.forEach((pre) => {
        if (pre.parentElement.classList.contains('code-block-container')) return;

        const code = pre.querySelector('code');
        if (!code) return;

        // Get language class
        let lang = 'text';
        const classes = code.className.split(' ');
        for (const cls of classes) {
            if (cls.startsWith('language-')) {
                lang = cls.replace('language-', '');
                break;
            }
        }

        // Create container
        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-container';
        
        const header = document.createElement('div');
        header.className = 'code-block-header';
        
        const langSpan = document.createElement('span');
        langSpan.className = 'code-block-lang';
        langSpan.textContent = lang;
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-code-btn';
        copyBtn.innerHTML = `<i data-lucide="clipboard" style="width:14px;height:14px"></i> <span>Copy</span>`;
        
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(code.textContent).then(() => {
                copyBtn.innerHTML = `<i data-lucide="check" style="width:14px;height:14px"></i> <span>Copied!</span>`;
                lucide.createIcons();
                setTimeout(() => {
                    copyBtn.innerHTML = `<i data-lucide="clipboard" style="width:14px;height:14px"></i> <span>Copy</span>`;
                    lucide.createIcons();
                }, 2000);
            });
        });
        
        header.appendChild(langSpan);
        header.appendChild(copyBtn);
        
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(header);
        wrapper.appendChild(pre);

        // Run Prism highlight
        Prism.highlightElement(code);
    });
}

async function sendMessage(text) {
    if (!text.trim() || isStreaming) return;
    
    // 1. If no active chat, create one first
    if (!activeChatId) {
        createNewChat(text);
    }
    
    const chat = chats[activeChatId];
    
    // Update title if it is the first user message
    if (chat.messages.length === 0) {
        chat.title = truncateText(text, 24);
        activeChatTitle.textContent = chat.title;
        saveChatsToStorage();
    }
    
    // 2. Add user message to state and view
    const userMsg = { role: 'user', content: text };
    chat.messages.push(userMsg);
    appendMessageBubble('user', text);
    saveChatsToStorage();
    
    // Reset input text & height
    chatInput.value = '';
    adjustInputHeight();
    sendBtn.disabled = true;
    
    // 3. Add pending loading bubble
    isStreaming = true;
    setStreamingUI(true);
    
    const botBubble = appendMessageBubble('model', '', true);
    
    // 4. Send API query
    activeController = new AbortController();
    let accumulatedText = "";
    
    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Pass dynamic API key override if present
        if (settings.customApiKey) {
            headers['X-Gemini-API-Key'] = settings.customApiKey;
        }
        
        const payload = {
            messages: chat.messages.slice(0, -1).concat(userMsg), // Include historical contents + latest msg
            model: chat.model || settings.model,
            temperature: chat.temperature !== undefined ? chat.temperature : settings.temperature,
            system_instruction: chat.systemPrompt !== undefined ? chat.systemPrompt : settings.systemPrompt
        };
        
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
            signal: activeController.signal
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({ detail: 'Failed to stream response.' }));
            throw new Error(errData.detail || `Server returned error ${response.status}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let firstToken = true;
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Hold remainder
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6).trim();
                    if (!dataStr) continue;
                    
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.error) {
                            throw new Error(data.error);
                        }
                        
                        if (data.text) {
                            if (firstToken) {
                                // Clear typing skeleton
                                botBubble.innerHTML = '';
                                firstToken = false;
                            }
                            accumulatedText += data.text;
                            botBubble.innerHTML = marked.parse(accumulatedText);
                            formatCodeBlocks(botBubble);
                            scrollToBottom();
                        }
                    } catch (e) {
                        console.error('Error parsing streaming event:', e);
                        // If it is our internal custom error, bubble it up
                        if (e.message.startsWith('Gemini API') || e.message.startsWith('Internal')) {
                            throw e;
                        }
                    }
                }
            }
        }
        
        // Save chatbot response to state
        if (accumulatedText.trim().length === 0) {
            accumulatedText = "_[No response generated by model]_";
            botBubble.innerHTML = marked.parse(accumulatedText);
        }
        
        chat.messages.push({ role: 'model', content: accumulatedText });
        saveChatsToStorage();
        
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('User cancelled response generation.');
            // Append visual cancellation indicator
            accumulatedText += '\n\n*Response generation stopped.*';
            botBubble.innerHTML = marked.parse(accumulatedText);
            formatCodeBlocks(botBubble);
            
            chat.messages.push({ role: 'model', content: accumulatedText });
            saveChatsToStorage();
        } else {
            console.error('Streaming request failed:', err);
            if (botBubble.querySelector('.typing-indicator')) {
                botBubble.innerHTML = '';
            }
            const errorMsg = `<div style="color: #ef4444; display: flex; align-items: center; gap: 8px;">
                <i data-lucide="alert-triangle" style="width:16px;height:16px;flex-shrink:0;"></i>
                <span>${escapeHTML(err.message)}</span>
            </div>`;
            botBubble.innerHTML += errorMsg;
            lucide.createIcons();
        }
    } finally {
        isStreaming = false;
        setStreamingUI(false);
        activeController = null;
    }
}

function stopStreaming() {
    if (activeController) {
        activeController.abort();
    }
}

function setStreamingUI(streaming) {
    if (streaming) {
        sendBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
        chatInput.disabled = true;
    } else {
        sendBtn.style.display = 'flex';
        stopBtn.style.display = 'none';
        chatInput.disabled = false;
        chatInput.focus();
        adjustInputHeight();
    }
}

/* ==========================================================================
   UI Event Handlers & Helpers
   ========================================================================== */
function setupEventListeners() {
    // Menu Sidebar Toggles
    menuBtn.addEventListener('click', () => sidebar.classList.add('open'));
    backBtn.addEventListener('click', () => showWelcomeScreen());
    closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('remove') || sidebar.classList.remove('open'));
    
    // New Chat Action
    newChatBtn.addEventListener('click', () => {
        showWelcomeScreen();
        if (window.innerWidth <= 768) sidebar.classList.remove('open');
    });
    
    // Clear Chat Action
    clearChatBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear this conversation history?')) {
            clearActiveChatHistory();
        }
    });
    
    // Textarea auto-resize & input listeners
    chatInput.addEventListener('input', () => {
        adjustInputHeight();
        sendBtn.disabled = chatInput.value.trim().length === 0;
    });
    
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (chatInput.value.trim().length > 0 && !isStreaming) {
                sendMessage(chatInput.value);
            }
        }
    });
    
    // Send & Stop Click
    sendBtn.addEventListener('click', () => {
        if (chatInput.value.trim().length > 0) {
            sendMessage(chatInput.value);
        }
    });
    
    stopBtn.addEventListener('click', stopStreaming);
    
    // Welcome screen prompt suggestions
    promptCards.forEach(card => {
        card.addEventListener('click', () => {
            const prompt = card.getAttribute('data-prompt');
            if (prompt) {
                sendMessage(prompt);
            }
        });
    });
    
    // Settings Modal handlers
    openSettingsBtn.addEventListener('click', openSettingsModal);
    closeSettingsBtnX.addEventListener('click', closeSettingsModal);
    cancelSettingsBtn.addEventListener('click', () => {
        resetSettings();
        closeSettingsModal();
    });
    saveSettingsBtn.addEventListener('click', saveSettings);
    
    // Temperature slider display update
    tempInput.addEventListener('input', () => {
        tempValue.textContent = tempInput.value;
    });
    
    // Password visibility toggle
    toggleApiKeyVisibility.addEventListener('click', () => {
        const type = apiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
        apiKeyInput.setAttribute('type', type);
        
        if (type === 'password') {
            eyeIcon.setAttribute('data-lucide', 'eye');
        } else {
            eyeIcon.setAttribute('data-lucide', 'eye-off');
        }
        lucide.createIcons();
    });
}

function openSettingsModal() {
    loadSettings(); // refresh form data
    settingsModal.classList.add('active');
}

function closeSettingsModal() {
    settingsModal.classList.remove('active');
}

function adjustInputHeight() {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
}

function scrollToBottom() {
    messageArea.scrollTo({
        top: messageArea.scrollHeight,
        behavior: 'smooth'
    });
}

function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function truncateText(str, length) {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.slice(0, length) + '...';
}

// Mouse Trail Spark Particle Effect
document.addEventListener('mousemove', (e) => {
    // Throttling: only create particles sometimes to maintain high performance
    if (Math.random() > 0.08) return; 
    
    const particle = document.createElement('div');
    particle.className = 'trail-particle';
    
    // Position at cursor
    particle.style.left = `${e.clientX}px`;
    particle.style.top = `${e.clientY}px`;
    
    // Randomize dimensions
    const size = Math.random() * 8 + 4; // 4px to 12px
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    
    // Choose dynamic neon accent colors
    const colors = ['#ff007f', '#00ffff', '#ffeb3b', '#e040fb', '#ff5722', '#00e676', '#ff003c', '#00f0ff'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    particle.style.background = randomColor;
    particle.style.boxShadow = `0 0 10px ${randomColor}, 0 0 20px ${randomColor}, 0 0 30px ${randomColor}`;
    
    // Vector fly offsets
    const dx = (Math.random() - 0.5) * 60;
    const dy = (Math.random() - 0.5) * 60;
    particle.style.setProperty('--dx', `${dx}px`);
    particle.style.setProperty('--dy', `${dy}px`);
    
    document.body.appendChild(particle);
    
    // Clean up DOM element after fade out animation ends
    setTimeout(() => {
        particle.remove();
    }, 1000);
});
