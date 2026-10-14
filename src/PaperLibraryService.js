var MNPLService = (function () {
  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function string(value) { return value == null ? "" : String(value); }

  let documentCache = null;
  const collator = typeof Intl !== "undefined" && Intl.Collator ? new Intl.Collator(undefined, { sensitivity: "base", numeric: true }) : null;

  function invalidate() { documentCache = null; }

  function projectDocument(document, documentPath, summary) {
    const id = string(document && document.docMd5);
    if (!id) return null;
    const title = string(document.docTitle).trim() || "未命名文献";
    const count = summary ? NaN : Number(document.pageCount);
    const path = string(document.pathFile || document.fullPathFileName);
    const extension = (/\.([a-z0-9]+)$/i.exec(path) || [])[1];
    return {
      id,
      title, nativeTitle: title,
      pageCount: Number.isInteger(count) && count >= 0 ? count : null,
      type: extension ? extension.toUpperCase() : "文档",
      fileName: path.split(/[\\/]/).pop() || "",
      folderPath: MNPLFolders.documentFolder(document, documentPath),
      notebookId: string(document.currentTopicId),
    };
  }

  function nativeDocuments() {
    if (!documentCache) {
      const started = Date.now();
      const base = String(Application.sharedInstance().documentPath).replace(/\/$/, "");
      documentCache = MNPLNativeValues.toArray(Database.sharedInstance().allDocuments())
        .map(function (document) { return projectDocument(document, base, true); }).filter(Boolean);
      console.log("[MNPL] document index: " + documentCache.length + " documents, " + (Date.now() - started) + " ms");
    }
    return documentCache;
  }

  function currentDocument(addon) {
    if (!addon || !addon.window) return null;
    const study = Application.sharedInstance().studyController(addon.window);
    const controller = study && study.readerController && study.readerController.currentDocumentController;
    const info = controller && projectDocument(controller.document, undefined, true);
    if (!info) return null;
    info.notebookId = string(controller.notebookId || info.notebookId);
    info.currentPage = Number.isInteger(Number(controller.currPageNo)) ? Number(controller.currPageNo) : null;
    return info;
  }

  function list(addon, payload) {
    const options = payload || {};
    const query = string(options.query).trim().toLocaleLowerCase();
    const offset = Number.isInteger(options.offset) ? Math.max(0, options.offset) : 0;
    const limit = Number.isInteger(options.limit) ? Math.min(100, Math.max(1, options.limit)) : 60;
    const sort = MNPLBibliography.sorts.some(function (entry) { return entry[0] === options.sort; }) ? options.sort : "title-asc";
    const root = MNPLFolders.root();
    const folder = options.folderPath == null ? root : MNPLFolders.normalize(options.folderPath);
    if (!MNPLFolders.within(folder, root)) fail("INVALID_FOLDER", "该目录不在当前文献库中。");
    const metadata = MNPLMetadataStore.all();
    const typeSet = Array.isArray(options.itemTypes) ? options.itemTypes.filter(function (item) {
      return MNPLBibliography.types.some(function (type) { return type[0] === item; });
    }) : options.itemType && options.itemType !== "all" ? [options.itemType] : [];
    const documents = nativeDocuments().filter(function (item) {
      const record = metadata[item.id] || {};
      if (typeSet.length && typeSet.indexOf(MNPLBibliography.type((record.metrics || {}).type, item.title)) < 0) return false;
      if (options.favoritesOnly && !record.favorite) return false;
      if (root !== "" || folder !== "") {
        if (!MNPLFolders.within(item.folderPath, folder)) return false;
      }
      return !query || ((record.title || item.title) + " " + item.title + " " + item.fileName + " " + (record.authors || "") + " " + (record.venue || "")).toLocaleLowerCase().includes(query);
    });
    function value(item) {
      const record = metadata[item.id] || {}, journal = record.journal || {};
      if (sort.indexOf("year-") === 0) return record.year ? Number(record.year) : null;
      if (sort === "if-desc") return journal.impactFactor == null ? null : journal.impactFactor;
      if (sort === "quartile-asc") { const match = /Q([1-4])/i.exec(journal.jcrQuartile || record.quartile || ""); return match ? Number(match[1]) : null; }
      if (sort === "author-asc") return record.authors || null;
      if (sort === "venue-asc") return record.venue || null;
      return (metadata[item.id] || {}).title || item.title;
    }
    documents.sort(function (a, b) {
      const av = value(a), bv = value(b);
      // Missing fields stay last in both directions; equal values have stable IDs.
      if (av === null && bv !== null) return 1;
      if (bv === null && av !== null) return -1;
      let order = 0;
      if (av !== null && bv !== null) order = typeof av === "number" ? av - bv : collator ? collator.compare(av, bv) : av.localeCompare(bv);
      return (sort.endsWith("desc") ? -order : order) || a.id.localeCompare(b.id);
    });
    const current = currentDocument(addon);
    return { items: documents.slice(offset, offset + limit).map(function (item) {
      const record = metadata[item.id] || {};
      // Abstracts and research metrics belong to the detail response only.
      return Object.assign({}, item, { title: record.title || item.title, authors: record.authors || "", year: record.year || "", venue: record.venue || "",
        hasAbstract: Boolean(record.abstract), quartile: record.quartile || "", journal: record.journal || {}, itemType: MNPLBibliography.type((record.metrics || {}).type, record.title || item.title), favorite: record.favorite === true });
    }), total: documents.length,
      offset, limit, rootPath: root, folderPath: folder, currentId: current ? current.id : null };
  }

  function find(id, summary) {
    const key = string(id);
    if (!key) fail("INVALID_DOCUMENT", "缺少文档标识。");
    const document = Database.sharedInstance().getDocumentById(key);
    const info = document && projectDocument(document, undefined, summary);
    if (!info) fail("DOCUMENT_NOT_FOUND", "文档已不在 MarginNote 资料库中，请刷新列表。");
    return info;
  }
  function inScope(id, folderPath) {
    const root = MNPLFolders.root();
    const folder = folderPath == null ? root : MNPLFolders.normalize(folderPath);
    if (!MNPLFolders.within(folder, root)) return false;
    try {
      const info = find(id, true);
      return root === "" && folder === "" || MNPLFolders.within(info.folderPath, folder);
    } catch (_) { return false; }
  }

  function notebookForDocument(info) {
    const db = Database.sharedInstance();
    if (info.notebookId && db.getNotebookById(info.notebookId)) return info.notebookId;
    const notebooks = MNPLNativeValues.toArray(db.allNotebooks());
    for (let i = 0; i < notebooks.length; i += 1) {
      const notebook = notebooks[i];
      if (!notebook || !notebook.topicId) continue;
      if (string(notebook.mainDocMd5) === info.id) return string(notebook.topicId);
      const linked = MNPLNativeValues.toArray(notebook.documents || []);
      if (linked.some(function (document) { return string(document && document.docMd5) === info.id; })) {
        return string(notebook.topicId);
      }
    }
    return "";
  }

  // Background enrichment never needs page counts or notebook membership.
  function record(addon, payload) {
    const info = find(payload && payload.id, true);
    const metadata = MNPLMetadataStore.get(info.id);
    Object.assign(info, metadata);
    info.metadataTitle = metadata.title;
    info.title = metadata.title || info.nativeTitle;
    return info;
  }

  function detail(addon, payload) {
    const info = record(addon, payload);
    const current = currentDocument(addon);
    info.isCurrent = Boolean(current && current.id === info.id);
    info.currentPage = info.isCurrent ? current.currentPage : null;
    if (info.isCurrent && current.notebookId) info.notebookId = current.notebookId;
    // Reading metadata must not traverse notebook documents or load PDF page counts.
    // Resolve notebook membership only for the explicit open action.
    return info;
  }

  function open(addon, payload) {
    if (!addon || !addon.window) fail("HOST_UNAVAILABLE", "当前 MarginNote 窗口不可用。");
    const info = detail(addon, payload);
    info.notebookId = notebookForDocument(info);
    if (!info.notebookId) {
      fail("NO_NOTEBOOK", "这份文档尚未关联学习集，当前插件接口无法从资料库直接打开。请先在 MarginNote 中将文档加入学习集。");
    }
    const study = Application.sharedInstance().studyController(addon.window);
    if (!study || typeof study.openNotebookAndDocument !== "function") {
      fail("STUDY_UNAVAILABLE", "请先在 MarginNote 打开一个学习界面，再从文献库打开文档。");
    }
    study.openNotebookAndDocument(info.notebookId, info.id);
    return { requested: true, id: info.id, notebookId: info.notebookId };
  }

  function saveMetadata(addon, payload) {
    const info = find(payload && payload.id, true);
    MNPLMetadataStore.save(info.id, payload && payload.metadata);
    return payload && payload.background === true ? record(addon, { id: info.id }) : detail(addon, { id: info.id });
  }

  function setFavorite(addon, payload) {
    const info = find(payload && payload.id, true);
    if (!payload || typeof payload.favorite !== "boolean") fail("INVALID_METADATA", "收藏状态必须是布尔值。");
    MNPLMetadataStore.save(info.id, { favorite: payload.favorite });
    return detail(addon, { id: info.id });
  }

  function folders(payload) {
    if (payload && payload.refresh) invalidate();
    if (payload && payload.quick) return MNPLFolders.inspect(nativeDocuments());
    return MNPLFolders.scan().then(function () { return MNPLFolders.inspect(nativeDocuments()); });
  }
  function setRootFolder(addon, payload) {
    // Refresh catalogue-derived folders before validating a linked directory.
    invalidate();
    folders({ quick: true });
    MNPLFolders.setRoot(payload && payload.path);
    invalidate();
    return folders({ quick: true });
  }
  return { list, detail, record, currentDocument, inScope, open, saveMetadata, setFavorite, folders, setRootFolder, invalidate };
})();
