var MNPLFolders = (function () {
  const KEY = "com.azeedel.marginnote.paper-library.rootFolder";
  const ADDON = "com.azeedel.marginnote.paper-library";

  function fail(code, message) {
    const error = new Error(message); error.code = code; throw error;
  }
  function normalize(value) {
    if (typeof value !== "string" || value.indexOf("\0") !== -1 || value.charAt(0) === "/") {
      fail("INVALID_FOLDER", "请选择 MarginNote 内的文件夹。");
    }
    const parts = value.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.some(function (part) { return part === "." || part === ".."; })) {
      fail("INVALID_FOLDER", "文件夹路径无效。");
    }
    return parts.join("/");
  }
  function within(path, root) {
    return path !== null && (root === "" || path === root || path.indexOf(root + "/") === 0);
  }
  function documentFolder(document, documentPath) {
    let path = String(document.pathFile || "");
    const base = documentPath || String(Application.sharedInstance().documentPath).replace(/\/$/, "");
    if (!path) path = String(document.fullPathFileName || "");
    if (path.indexOf(base + "/") === 0) path = path.slice(base.length + 1);
    if (!path || path.charAt(0) === "/") return null;
    try {
      const normalized = normalize(path);
      const slash = normalized.lastIndexOf("/");
      return slash < 0 ? "" : normalized.slice(0, slash);
    } catch (_) { return null; }
  }
  function root() {
    const stored = NSUserDefaults.standardUserDefaults().stringForKey(KEY);
    try { return stored == null ? "" : normalize(String(stored)); }
    catch (_) { fail("INVALID_FOLDER", "已保存的文献库目录无效，请重新选择。"); }
  }
  function absolute(path) {
    return String(Application.sharedInstance().documentPath).replace(/\/$/, "") + (path ? "/" + path : "");
  }
  let cachedPaths = [""];
  let cachedWarnings = [];
  let pendingScan = null;
  let indexedPaths = new Set([""]);

  // Keep each native file-system batch short so MarginNote can draw and respond
  // while empty folders are being discovered. Never run this scan before paint.
  function scan() {
    if (pendingScan) return pendingScan;
    const base = String(Application.sharedInstance().documentPath).replace(/\/$/, "");
    const manager = NSFileManager.defaultManager();
    const paths = new Set([""]);
    const warnings = [];
    const queue = [{ path: "", depth: 0 }];
    let cursor = 0;
    let active = null;
    function warning(message) { if (warnings.indexOf(message) === -1) warnings.push(message); }
    pendingScan = new Promise(function (resolve, reject) {
      function step() {
        const started = Date.now();
        let operations = 0;
        try {
          while (operations < 32 && Date.now() - started < 8) {
            if (!active) {
              if (cursor >= queue.length) {
                cachedPaths = Array.from(paths); cachedWarnings = warnings;
                resolve(); return;
              }
              const folder = queue[cursor++];
              let children;
              operations += 1;
              try { children = manager.contentsOfDirectoryAtPath(base + (folder.path ? "/" + folder.path : "")) || []; }
              catch (_) { warning("无法读取目录：" + (folder.path || "资料库根目录")); continue; }
              const count = Array.isArray(children) ? children.length : Number(children.count());
              if (!Number.isInteger(count) || count < 0) throw new Error("目录内容数量无效，请重试刷新。");
              active = { path: folder.path, depth: folder.depth, children, count, index: 0 };
              continue;
            }
            if (active.index >= active.count) { active = null; continue; }
            const index = active.index++;
            const entry = String(Array.isArray(active.children) ? active.children[index] : active.children.objectAtIndex(index));
            operations += 1;
            if (!entry || entry.charAt(0) === "." || entry.indexOf("/") >= 0 || entry.indexOf("\\") >= 0 ||
                (active.path === "" && (entry === ADDON || entry.indexOf("com.azeedel.marginnote.") === 0))) continue;
            const child = active.path ? active.path + "/" + entry : entry;
            if (manager.isDirectoryAtPath(base + "/" + child)) {
              if (active.depth >= 32 || queue.length >= 2000) { warning("目录层级或数量较多，部分目录未展开。"); continue; }
              paths.add(child); queue.push({ path: child, depth: active.depth + 1 });
            }
          }
          NSTimer.scheduledTimerWithTimeInterval(0.01, false, step);
        } catch (error) { reject(error); }
      }
      NSTimer.scheduledTimerWithTimeInterval(0.01, false, step);
    }).then(function () { pendingScan = null; }, function (error) { pendingScan = null; throw error; });
    return pendingScan;
  }

  function inspect(documents) {
    const paths = new Set(cachedPaths);
    const warnings = cachedWarnings.slice();
    const manager = NSFileManager.defaultManager();
    const selected = root();
    // Preserve a selected empty root while the fresh scan is still pending.
    if (selected) {
      const parts = selected.split("/");
      parts.forEach(function (_, index) { paths.add(parts.slice(0, index + 1).join("/")); });
    }
    documents.forEach(function (document) {
      if (document.folderPath === null) return;
      const parts = document.folderPath.split("/").filter(Boolean);
      parts.forEach(function (_, index) { paths.add(parts.slice(0, index + 1).join("/")); });
    });
    // The document catalogue also contains linked/cloud folders. Their paths
    // need not exist beneath Application.documentPath on this device.
    indexedPaths = new Set([""]);
    documents.forEach(function (document) {
      if (document.folderPath === null) return;
      const parts = document.folderPath.split("/").filter(Boolean);
      parts.forEach(function (_, index) { indexedPaths.add(parts.slice(0, index + 1).join("/")); });
    });
    const counts = new Map([["", documents.length]]);
    documents.forEach(function (document) {
      if (document.folderPath === null) return;
      const parts = document.folderPath.split("/").filter(Boolean);
      parts.forEach(function (_, index) {
        const path = parts.slice(0, index + 1).join("/");
        counts.set(path, (counts.get(path) || 0) + 1);
      });
    });
    const folders = Array.from(paths).sort(function (a, b) { return a.localeCompare(b); }).map(function (path) {
      const slash = path.lastIndexOf("/");
      return { path, name: path ? path.slice(slash + 1) : "全部文献", parentPath: path ? (slash < 0 ? "" : path.slice(0, slash)) : null,
        depth: path ? path.split("/").length : 0, count: counts.get(path) || 0 };
    });
    const exists = indexedPaths.has(selected) || manager.isDirectoryAtPath(absolute(selected));
    return { rootPath: selected, rootExists: exists, folders, warnings,
      unlocatedCount: documents.filter(function (document) { return document.folderPath === null; }).length };
  }
  function setRoot(path) {
    const selected = normalize(path);
    if (selected.split("/").some(function (part) { return part.charAt(0) === "."; }) || selected === ADDON || selected.indexOf(ADDON + "/") === 0) {
      fail("INVALID_FOLDER", "请选择资料库中的文献文件夹。");
    }
    if (selected && !indexedPaths.has(selected) && !NSFileManager.defaultManager().isDirectoryAtPath(absolute(selected))) {
      fail("FOLDER_NOT_FOUND", "这个文件夹已不存在，请刷新后重新选择。");
    }
    NSUserDefaults.standardUserDefaults().setObjectForKey(selected, KEY);
    return selected;
  }
  return { normalize, within, documentFolder, root, inspect, scan, setRoot };
})();
