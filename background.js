// 🔮 Lovablex - Background Service Worker

// Importar módulos
importScripts("supabase-config.js"); // Supabase Edge Functions
importScripts("security.js"); // Assinatura HMAC
importScripts("license.js"); // Gerenciamento de licenças

// Listener para abrir extensão quando clicar no ícone - SEMPRE sidepanel
chrome.action.onClicked.addListener(async (tab) => {
  // Sempre abrir como sidepanel ao clicar no ícone
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// Interceptor de Token
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const authHeader = details.requestHeaders.find(
      (header) => header.name.toLowerCase() === "authorization",
    );

    if (authHeader && authHeader.value) {
      const token = authHeader.value.replace("Bearer ", "").trim();
      if (token.length > 20) {
        chrome.storage.local.set({ authToken: token, lovable_token: token });
      }
    }

    // Capturar Project ID da URL da requisição
    const urlMatch = details.url.match(/projects\/([a-f0-9-]+)/);
    if (urlMatch && urlMatch[1]) {
      chrome.storage.local.set({ projectId: urlMatch[1] });
    }
  },
  { urls: ["https://api.lovable.dev/*"] },
  ["requestHeaders"],
);

// ===== SHIELD: Detectar fechamento do painel e remover shield =====

// Executar shield via script tag injection (MAIN world guarantido)
async function executeShieldOnTab(enable) {
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.lovable.dev/*' });
    console.log('[Shield BG] Tabs encontradas:', tabs.length);
    const shieldFileUrl = chrome.runtime.getURL('shield-inject.js');
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (action, scriptUrl) => {
            document.documentElement.setAttribute('data-shield-action', action ? 'enable' : 'disable');
            var s = document.createElement('script');
            s.src = scriptUrl + '?t=' + Date.now();
            s.onload = function () { s.remove(); };
            s.onerror = function () { console.error('[Shield] Falha ao carregar script'); s.remove(); };
            (document.head || document.documentElement).appendChild(s);
          },
          args: [enable, shieldFileUrl]
        });
        console.log('[Shield BG] executeScript OK na tab', tab.id);
      } catch (e) {
        console.error('[Shield BG] executeScript falhou:', e);
      }
    }
  } catch (e) {
    console.error('[Shield BG] Erro geral:', e);
  }
}

function removeShieldFromAllTabs() {
  executeShieldOnTab(false);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'shield-panel') {
    console.log('[Shield BG] Painel conectado');
    port.onDisconnect.addListener(() => {
      console.log('[Shield BG] Painel desconectado - removendo shield');
      removeShieldFromAllTabs();
    });
  }
});
// ===== FIM SHIELD =====

// Listener de mensagens
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Ping
  if (request.action === "ping") {
    sendResponse("pong");
    return;
  }

  // Abrir popup (desprender)
  if (request.action === "openPopup") {
    (async () => {
      try {
        console.log("Abrindo popup...");

        // Abrir popup imediatamente
        const newWindow = await chrome.windows.create({
          url: chrome.runtime.getURL("popup.html"),
          type: "popup",
          width: 400,
          height: 600,
          left: 100,
          top: 100,
          focused: true,
        });

        console.log("Popup criado:", newWindow.id);
        sendResponse({ success: true, windowId: newWindow.id });
      } catch (error) {
        console.error("Erro ao abrir popup:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // enhance-prompt agora é chamado diretamente via Edge Function no popup.js

  // Handlers do license.js
  if (request.action === "saveToken") {
    handleSaveToken(request.token).then(sendResponse);
    return true;
  }

  if (request.action === "getToken") {
    handleGetToken().then(sendResponse);
    return true;
  }

  if (request.action === "saveProjectId") {
    handleSaveProjectId(request.projectId).then(sendResponse);
    return true;
  }

  if (request.action === "getProjectId") {
    handleGetProjectId().then(sendResponse);
    return true;
  }

  // getCredits removido - buscado direto da API Lovable no popup.js

  if (request.action === "sendMessage") {
    processMessageSend(request.data).then(sendResponse);
    return true;
  }

  // createNewProject e publish-project agora são chamados diretamente via Edge Function/API no popup.js

  if (request.action === "executeShield") {
    executeShieldOnTab(request.enabled).then(() => {
      sendResponse({ success: true });
    }).catch((e) => {
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }

  if (request.action === "checkLicense") {
    handleCheckLicense().then(sendResponse);
    return true;
  }

  if (
    request.action === "licenseActivated" ||
    request.action === "licenseRemoved"
  ) {
    sendResponse({ success: true });
    return true;
  }

  sendResponse({ success: false, error: "Ação desconhecida" });
  return true;
});
