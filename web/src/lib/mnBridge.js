const pending = Object.create(null);
let sequence = 0;

window.__MNPLBridgeReceive = function (raw) {
  let response;
  try { response = JSON.parse(raw); } catch (_) { return; }
  const item = response && pending[response.requestId];
  if (!item) return;
  delete pending[response.requestId];
  clearTimeout(item.timer);
  if (response.error) item.reject(response.error);
  else item.resolve(response.payload);
};

export const MNBridge = {
  send(command, payload = null) {
    const requestId = `mnpl-${Date.now()}-${++sequence}`;
    const encoded = encodeURIComponent(JSON.stringify({ command, requestId, payload }));
    if (encoded.length > 110000) return Promise.reject({ message: "请求内容过长。" });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        delete pending[requestId];
        reject({ message: "MarginNote 未回复，请重新打开文献库。" });
      }, ["lookupPaper", "lookupJournal", "loadRelations"].includes(command) ? 180000 : command === "getFolders" && !payload?.quick ? 60000 : 15000);
      pending[requestId] = { resolve, reject, timer };
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = `mnpl://bridge?payload=${encoded}`;
      document.body.appendChild(iframe);
      setTimeout(() => iframe.remove(), 500);
    });
  },
};
