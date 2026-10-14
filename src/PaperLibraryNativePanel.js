var MNPLPanel = (function () {
  const PAGE = 100;
  function attempt(action) {
    try { return action(); }
    catch (error) {
      console.log("[MNPL] native panel: " + String(error && error.message || error));
      Application.sharedInstance().alert(String(error && error.message || error));
    }
  }
  function studyFor(controller) {
    return controller.addon && controller.addon.window ? Application.sharedInstance().studyController(controller.addon.window) : null;
  }
  function status(controller, message) { if (controller.mnplStatus) controller.mnplStatus.text = message; }
  function updateToolbar(controller) {
    const count = controller.mnplItemTypes.length + (controller.mnplFavoritesOnly ? 1 : 0);
    controller.mnplFilterButton.setTitleForState(count ? "筛选 · " + count : "筛选", 0);
    const labels = { "year-desc": "年份 ↓", "year-asc": "年份 ↑", "title-asc": "标题 A→Z", "title-desc": "标题 Z→A",
      "author-asc": "作者", "venue-asc": "来源", "quartile-asc": "JCR 分区", "if-desc": "影响因子" };
    controller.mnplSortButton.setTitleForState("排序 · " + labels[controller.mnplSort], 0);
  }
  function editing(controller) {
    if (!controller.mnplEditing) return false;
    status(controller, "请先保存或取消右侧正在编辑的资料。");
    return true;
  }
  function folders(controller) {
    if (!controller.mnplLibrary) return;
    const root = controller.mnplLibrary.rootPath;
    controller.mnplFolderRows = MNPLFolderTree.rows(controller.mnplLibrary.folders, root, controller.mnplFolderExpanded);
    controller.mnplFolderTable.reloadData();
    controller.mnplFolderTitle.text = "文献库目录";
  }
  function reloadList(controller, append) {
    const result = MNPLService.list(controller.addon, { query: controller.mnplQuery, sort: controller.mnplSort,
      folderPath: controller.mnplFolder, itemTypes: controller.mnplItemTypes, favoritesOnly: controller.mnplFavoritesOnly, offset: append ? controller.mnplItems.length : 0, limit: PAGE });
    controller.mnplItems = append ? controller.mnplItems.concat(result.items) : result.items;
    controller.mnplTotal = result.total;
    controller.mnplPaperTable.reloadData();
    if (controller.mnplSelectedId && !MNPLService.inScope(controller.mnplSelectedId, controller.mnplFolder)) {
      controller.mnplSelectedId = null;
      controller.mnplDocument = null;
      controller.mnplTab = "info";
      MNPLDetail.render(controller);
    }
    const path = controller.mnplFolder || "全部文献";
    status(controller, path + " · " + result.total + " 篇" + (result.total === 0 ? " · 当前范围没有匹配文献" : ""));
  }
  function select(controller, id) {
    if (editing(controller)) return;
    const doc = MNPLService.detail(controller.addon, { id });
    controller.mnplSelectedId = id;
    controller.mnplDocument = doc;
    controller.mnplHideDetail = false;
    controller.mnplMobileSection = "detail";
    controller.mnplPaperTable.reloadData();
    layoutContent(controller);
    MNPLDetail.render(controller);
    maybeAutoLookup(controller, doc);
  }
  function locateCurrent(controller) {
    if (editing(controller)) return;
    const current = MNPLService.currentDocument(controller.addon);
    if (!current) { status(controller, "当前没有正在阅读的文献。"); return; }
    if (!MNPLService.inScope(current.id)) { status(controller, "正在阅读的文献不在设置中选择的文献库范围内。"); return; }
    if (!controller.mnplLibrary) controller.mnplLibrary = MNPLService.folders({ quick: true });
    controller.mnplFolder = current.folderPath || controller.mnplLibrary.rootPath;
    const parts = controller.mnplFolder.split("/").filter(Boolean);
    parts.forEach(function (_, index) { controller.mnplFolderExpanded.add(parts.slice(0, index + 1).join("/")); });
    controller.mnplQuery = ""; controller.mnplSearch.text = ""; controller.mnplSearchPlaceholder.hidden = false;
    controller.mnplSearchGeneration += 1;
    controller.mnplItemTypes = []; controller.mnplFavoritesOnly = false;
    controller.mnplShowFolders = false;
    MNPLOptions.close(controller); updateToolbar(controller); folders(controller);
    reloadList(controller, false);
    let row = controller.mnplItems.findIndex(function (item) { return item.id === current.id; });
    while (row < 0 && controller.mnplItems.length < controller.mnplTotal) {
      const previous = controller.mnplItems.length;
      reloadList(controller, true);
      if (controller.mnplItems.length === previous) break;
      row = controller.mnplItems.findIndex(function (item) { return item.id === current.id; });
    }
    select(controller, current.id);
    if (row >= 0) controller.mnplPaperTable.scrollToRowAtIndexPathAtScrollPositionAnimated(NSIndexPath.indexPathForRowInSection(row, 0), 2, true);
    status(controller, "已定位正在阅读的文献 · " + controller.mnplDocument.title);
  }
  function maybeAutoLookup(controller, doc) {
    if (!doc || !MNPLPaperData.settings().autoLookup || (doc.metrics || {}).source || controller.mnplAutoAttempted.has(doc.id)) return;
    controller.mnplAutoAttempted.add(doc.id);
    fetchPaperData(controller, true);
  }
  function stopBatch(controller) {
    if (controller.mnplBatch) {
      const job = controller.mnplBatch;
      controller.mnplBatch = null;
      job.stop();
      controller.mnplLastBatch = job;
    }
  }
  function startBatch(controller) {
    if (controller.mnplBatch) { stopBatch(controller); status(controller, "已停止批量补全。"); return; }
    controller.mnplLastBatch = null;
    const job = MNPLBatchLookup.start(controller.addon, {
      progress: function (state) {
        if (!controller.mnplVisible || controller.mnplDisposed) return;
        status(controller, "补全文献信息 " + state.current + "/" + state.total + " · 已补全 " + state.saved + " · 未匹配 " + state.unmatched + " · 错误 " + (state.failed || 0));
        MNPLSettings.updateProgress(controller);
      },
      saved: function (id, document) {
        if (!controller.mnplVisible || controller.mnplDisposed) return;
        if (controller.mnplSelectedId === id && !controller.mnplEditing) {
          controller.mnplDocument = document; MNPLDetail.render(controller);
        }
        reloadList(controller, false);
      },
      done: function (state) {
        if (controller.mnplBatch !== job) return;
        controller.mnplBatch = null;
        controller.mnplLastBatch = state;
        if (!controller.mnplVisible || controller.mnplDisposed) return;
        status(controller, (state.rateLimited ? "遇到数据源限流，补全已暂停" : state.stopped ? "已停止补全" : "文献补全完成") + " · 已补全 " + state.saved + " · 未匹配 " + state.unmatched + " · 错误 " + (state.failed || 0) +
          (state.lastError ? " · " + state.lastError : ""));
        if (controller.mnplSettingsPage) MNPLSettings.render(controller);
      },
    });
    controller.mnplBatch = job;
    if (controller.mnplSettingsPage) MNPLSettings.render(controller);
  }
  function fetchPaperData(controller, automatic, abstractOnly) {
    const doc = controller.mnplDocument;
    if (!doc || controller.mnplPaperLoading || controller.mnplEditing) return;
    controller.mnplPaperLoading = true;
    MNPLDetail.render(controller);
    const id = doc.id, originalDoi = doc.doi || "", originalTitle = doc.title;
    MNPLPaperData.lookup(doc, { includeAbstract: !automatic }).then(function (fetched) {
      controller.mnplPaperLoading = false;
      if (controller.mnplDisposed) return;
      attempt(function () {
        const current = MNPLService.detail(controller.addon, { id });
        if (current.title !== originalTitle || (current.doi || "") !== originalDoi) { status(controller, "标题或 DOI 已更改，请重新识别。"); return; }
        if (abstractOnly && (current.abstract || "") !== (doc.abstract || "")) { status(controller, "摘要已更改，保留当前内容。"); return; }
        let patch = MNPLPaperData.merge(current, fetched, MNPLPaperData.settings().overwrite);
        if (abstractOnly) patch = fetched.abstract ? { abstract: fetched.abstract, metrics: { abstractSource: fetched.metrics.abstractSource || fetched.metrics.source } } : {};
        const saved = MNPLService.saveMetadata(controller.addon, { id, metadata: patch });
        if (controller.mnplSelectedId === id && !controller.mnplEditing) { controller.mnplDocument = saved; MNPLDetail.render(controller); }
        reloadList(controller, false);
        status(controller, abstractOnly ? (fetched.abstract ? "摘要已保存 · " + (fetched.metrics.abstractSource || fetched.metrics.source) : fetched.abstractLookupError || "数据源未提供这篇文献的摘要，可在编辑中手动填写。") : "文献资料已保存 · " + fetched.metrics.source);
      });
    }, function (error) {
      controller.mnplPaperLoading = false;
      if (controller.mnplDisposed) return;
      if (!controller.mnplEditing) MNPLDetail.render(controller);
      status(controller, (automatic ? "自动识别：" : "识别失败：") + error.message);
    });
  }
  function refresh(controller) {
    controller.mnplLibrary = MNPLService.folders({ quick: true, refresh: true });
    controller.mnplFolderExpanded.add(controller.mnplLibrary.rootPath);
    if (controller.mnplFolder == null || !MNPLFolders.within(controller.mnplFolder, controller.mnplLibrary.rootPath)) {
      controller.mnplFolder = controller.mnplLibrary.rootPath;
    }
    folders(controller);
    reloadList(controller, false);
    if (!controller.mnplDocument && !controller.mnplEditing) {
      const current = MNPLService.currentDocument(controller.addon);
      if (current && MNPLService.inScope(current.id, controller.mnplFolder)) {
        // Keep the library visible on compact screens until a row is selected.
        controller.mnplDocument = MNPLService.detail(controller.addon, { id: current.id });
        controller.mnplSelectedId = current.id;
      }
      MNPLDetail.render(controller);
      maybeAutoLookup(controller, controller.mnplDocument);
    }
    const dataSources = MNPLPaperData.settings();
    if (dataSources.autoLibrary && (dataSources.crossref || dataSources.openAlex) && !controller.mnplAutoLibraryStarted) {
      controller.mnplAutoLibraryStarted = true;
      startBatch(controller);
    }
    const generation = ++controller.mnplGeneration;
    controller.mnplFolderTitle.text = "文献库目录 · 更新中";
    MNPLService.folders().then(function (library) {
      if (controller.mnplDisposed || generation !== controller.mnplGeneration) return;
      controller.mnplLibrary = library;
      folders(controller);
      if (!library.rootExists) status(controller, "文献库根文件夹已不存在，请重新设置。");
      else if (library.warnings.length) status(controller, library.warnings.join("；"));
    }, function (error) {
      if (controller.mnplDisposed || generation !== controller.mnplGeneration) return;
      controller.mnplFolderTitle.text = "文献库目录";
      status(controller, "文件夹更新失败：" + String(error && error.message || error));
    });
  }
  function close(controller) {
    MNPLDetail.capture(controller);
    stopBatch(controller);
    controller.mnplAutoLibraryStarted = false;
    MNPLOptions.close(controller);
    MNPLSettings.close(controller);
    controller.mnplVisible = false;
    controller.mnplGeneration += 1;
    controller.mnplSearchGeneration += 1;
    controller.view.removeFromSuperview();
    const study = studyFor(controller);
    if (study) study.refreshAddonCommands();
  }
  function open(controller, id) {
    if (!id || editing(controller)) return;
    MNPLService.open(controller.addon, { id });
    close(controller);
  }
  function layoutContent(controller) {
    if (!controller.mnplReady) return;
    const ui = MNPLUI, width = controller.view.bounds.width, height = controller.view.bounds.height;
    const wide = width >= 850, compact = width < 760;
    const folderVisible = wide && !controller.mnplHideFolders;
    const detailVisible = compact ? controller.mnplMobileSection === "detail" : !controller.mnplHideDetail;
    if (controller.mnplMenu && controller.mnplMenuWidth !== width) MNPLOptions.close(controller);
    controller.mnplCompact = compact;
    controller.mnplHeading.frame = ui.rect(18, 10, Math.max(75, width - 390), 32);
    controller.mnplDetailButton.frame = ui.rect(width - 370, 10, 75, 32);
    controller.mnplDetailButton.hidden = compact;
    controller.mnplDetailButton.setTitleForState(detailVisible ? "收起详情" : "显示详情", 0);
    controller.mnplCurrentButton.frame = ui.rect(width - 290, 10, 90, 32);
    controller.mnplRefreshButton.frame = ui.rect(width - 195, 10, 54, 32);
    controller.mnplSettingsButton.frame = ui.rect(width - 138, 10, 54, 32);
    controller.mnplCloseButton.frame = ui.rect(width - 80, 10, 54, 32);
    controller.mnplCurrentButton.hidden = width < 420;
    controller.mnplRefreshButton.hidden = width < 420;
    controller.mnplFolderButton.frame = ui.rect(10, 53, 76, 36);
    controller.mnplFolderButton.setTitleForState(wide ? (folderVisible ? "收起目录" : "显示目录") :
      (controller.mnplShowFolders ? "收起目录" : "显示目录"), 0);
    controller.mnplBackButton.hidden = !compact;
    const small = width < 650;
    controller.mnplSearch.frame = ui.rect(94, 50, small ? width - 106 : width - 390, 40);
    controller.mnplSearchPlaceholder.frame = ui.rect(12, 0, controller.mnplSearch.bounds.width - 45, 40);
    controller.mnplFilterButton.frame = ui.rect(small ? 8 : width - 282, small ? 96 : 53, 132, 34);
    controller.mnplSortButton.frame = ui.rect(small ? 146 : width - 146, small ? 96 : 53, 136, 34);
    controller.mnplBackButton.frame = ui.rect(width - 88, small ? 96 : 91, 80, 34);
    controller.mnplFilterButton.hidden = compact && controller.mnplMobileSection === "detail";
    controller.mnplSortButton.hidden = compact && controller.mnplMobileSection === "detail";
    controller.mnplSearch.hidden = compact && controller.mnplMobileSection === "detail";
    controller.mnplBackButton.hidden = !compact || controller.mnplMobileSection !== "detail";
    const top = compact ? 140 : 100, contentHeight = Math.max(80, height - top - 32);
    const folderWidth = folderVisible ? Math.min(Math.max(190, controller.mnplFolderWidth), Math.max(190, width - 570)) : 0;
    const detailWidth = compact ? width : detailVisible ? Math.min(340, Math.max(280, width * 0.31)) : 0;
    controller.mnplFolders.hidden = wide ? !folderVisible : !controller.mnplShowFolders;
    controller.mnplFolderDivider.hidden = !folderVisible;
    controller.mnplFolderDivider.frame = ui.rect(folderWidth - 4, top, 8, contentHeight);
    controller.mnplFolderDividerLine.frame = ui.rect(3, 0, 1, contentHeight);
    controller.mnplDetail.hidden = !detailVisible;
    controller.mnplPaperTable.hidden = compact && controller.mnplMobileSection === "detail";
    controller.mnplPaperTable.frame = ui.rect(folderWidth, top, compact ? width : width - folderWidth - detailWidth, contentHeight);
    const oldDetailWidth = controller.mnplDetail.bounds.width;
    const oldDetailHeight = controller.mnplDetail.bounds.height;
    controller.mnplDetail.frame = ui.rect(compact ? 0 : width - detailWidth, top, detailWidth, contentHeight);
    controller.mnplFolders.frame = ui.rect(0, top, wide ? folderWidth : Math.min(330, width), contentHeight);
    const fw = controller.mnplFolders.bounds.width;
    controller.mnplFolderTitle.frame = ui.rect(12, 8, fw - 24, 24);
    controller.mnplFolderTable.frame = ui.rect(0, 40, fw, contentHeight - 40);
    controller.mnplStatus.frame = ui.rect(14, height - 28, width - 28, 22);
    // Resize preserves editor drafts; ordinary searches never rebuild editors.
    if (oldDetailWidth !== detailWidth || oldDetailHeight !== contentHeight) MNPLDetail.render(controller);
    const rowWidth = controller.mnplPaperTable.bounds.width;
    if (rowWidth !== controller.mnplRowWidth) {
      controller.mnplRowWidth = rowWidth;
      controller.mnplPaperTable.reloadData();
    }
    MNPLSettings.layout(controller);
  }
  const panelClass = JSB.defineClass("MNPLNativePanelController : UIViewController <UITableViewDataSource, UITableViewDelegate, UISearchBarDelegate, UITextFieldDelegate>", {
    viewDidLoad: function () {
      const c = self, ui = MNPLUI;
      c.view.backgroundColor = ui.color(ui.colors.paper);
      c.view.layer.cornerRadius = 10;
      c.view.layer.masksToBounds = true;
      c.view.layer.borderWidth = 1;
      c.view.layer.borderColor = ui.color(ui.colors.line);
      c.mnplHeading = ui.label(c.view, "文献库", ui.rect(18, 10, 200, 32), 20, "ink", true);
      c.mnplDetailButton = ui.button(c.view, "收起详情", ui.rect(0, 0, 75, 32), c, "toggleDetail");
      c.mnplCurrentButton = ui.button(c.view, "定位当前", ui.rect(0, 0, 90, 32), c, "showCurrent");
      c.mnplRefreshButton = ui.button(c.view, "刷新", ui.rect(0, 0, 54, 32), c, "refreshLibrary");
      c.mnplSettingsButton = ui.button(c.view, "设置", ui.rect(0, 0, 54, 32), c, "openSettings");
      c.mnplCloseButton = ui.button(c.view, "关闭", ui.rect(0, 0, 46, 32), c, "closeLibrary");
      c.mnplFolderButton = ui.button(c.view, "收起目录", ui.rect(0, 0, 76, 36), c, "toggleFolders");
      c.mnplSearch = new UITextField(ui.rect(0, 0, 300, 40));
      c.mnplSearch.placeholder = "";
      c.mnplSearch.font = UIFont.systemFontOfSize(13);
      c.mnplSearch.textColor = ui.color(ui.colors.ink);
      c.mnplSearch.backgroundColor = ui.color(ui.colors.paper);
      c.mnplSearch.layer.borderWidth = 1;
      c.mnplSearch.layer.borderColor = ui.color(ui.colors.line);
      c.mnplSearch.layer.cornerRadius = 6;
      c.mnplSearch.borderStyle = 0;
      c.mnplSearch.leftView = new UIView(ui.rect(0, 0, 12, 1)); c.mnplSearch.leftViewMode = 3;
      c.mnplSearch.clearButtonMode = 3;
      c.mnplSearch.delegate = c;
      c.mnplSearch.addTargetActionForControlEvents(c, "searchChanged:", 1 << 17);
      c.mnplSearchPlaceholder = ui.label(c.mnplSearch, "搜索标题、作者、来源", ui.rect(12, 0, 255, 40), 13, "muted");
      c.mnplSearchPlaceholder.userInteractionEnabled = false;
      c.view.addSubview(c.mnplSearch);
      c.mnplFilterButton = ui.control(c.view, "筛选", ui.rect(0, 0, 132, 34), c, "filterPapers");
      c.mnplSortButton = ui.control(c.view, "排序：年份", ui.rect(0, 0, 136, 34), c, "sortPapers");
      c.mnplBackButton = ui.button(c.view, "返回列表", ui.rect(0, 0, 70, 36), c, "backToList");
      c.mnplPaperTable = new UITableView(ui.rect(0, 100, 450, 500));
      c.mnplPaperTable.tag = 1; c.mnplPaperTable.dataSource = c; c.mnplPaperTable.delegate = c;
      c.mnplPaperTable.rowHeight = 72; c.mnplPaperTable.separatorStyle = 0;
      c.mnplPaperTable.backgroundColor = ui.color(ui.colors.paper);
      c.view.addSubview(c.mnplPaperTable);
      c.mnplDetail = ui.box(c.view, ui.rect(450, 100, 320, 500), "sidebar");
      c.mnplFolders = ui.box(c.view, ui.rect(0, 100, 205, 500), "sidebar");
      c.mnplFolders.layer.borderWidth = 1;
      c.mnplFolders.layer.borderColor = ui.color(ui.colors.line);
      c.mnplFolderTitle = ui.label(c.mnplFolders, "文献库目录", ui.rect(12, 8, 181, 24), 12, "ink", true);
      c.mnplFolderTable = new UITableView(ui.rect(0, 40, 205, 460));
      c.mnplFolderTable.tag = 2; c.mnplFolderTable.dataSource = c; c.mnplFolderTable.delegate = c;
      c.mnplFolderTable.rowHeight = 42; c.mnplFolderTable.separatorStyle = 0;
      c.mnplFolderTable.backgroundColor = ui.color(ui.colors.sidebar);
      c.mnplFolders.addSubview(c.mnplFolderTable);
      c.mnplFolderDivider = ui.box(c.view, ui.rect(201, 100, 8, 500), "sidebar");
      c.mnplFolderDividerLine = ui.box(c.mnplFolderDivider, ui.rect(3, 0, 1, 500), "line");
      c.mnplFolderDivider.addGestureRecognizer(new UIPanGestureRecognizer(c, "resizeFolders:"));
      c.mnplStatus = ui.label(c.view, "正在读取文献库…", ui.rect(14, 0, 600, 22), 11, "muted");
      updateToolbar(c);
      c.mnplReady = true;
      layoutContent(c);
    },
    viewDidLayoutSubviews: function () { layoutContent(self); },
    numberOfSectionsInTableView: function () { return 1; },
    tableViewNumberOfRowsInSection: function (table) {
      return table.tag === 3 ? (self.mnplSettingsFolderRows || []).length :
        table.tag === 2 ? self.mnplFolderRows.length : self.mnplItems.length + (self.mnplItems.length < self.mnplTotal ? 1 : 0);
    },
    tableViewHeightForRowAtIndexPath: function (table, index) {
      return table.tag === 2 || table.tag === 3 || index.row >= self.mnplItems.length ? 42 : 72;
    },
    tableViewCellForRowAtIndexPath: function (table, index) {
      const c = self, ui = MNPLUI;
      if (table.tag === 1 && index.row < c.mnplItems.length) return ui.paperCell(table, c, c.mnplItems[index.row], index.row);
      if (table.tag === 2 || table.tag === 3) return ui.folderCell(table, c,
        table.tag === 3 ? c.mnplSettingsFolderRows[index.row] : c.mnplFolderRows[index.row], index.row, table.tag === 3);
      const cell = table.dequeueReusableCellWithIdentifier("MNPLMore") || UITableViewCell.makeWithStyleReuseIdentifier(0, "MNPLMore");
      cell.backgroundColor = ui.color(ui.colors.paper);
      cell.textLabel.font = UIFont.systemFontOfSize(13);
      cell.textLabel.textColor = ui.color(ui.colors.ink);
      cell.textLabel.text = "加载更多（已显示 " + c.mnplItems.length + " / " + c.mnplTotal + "）";
      return cell;
    },
    tableViewDidSelectRowAtIndexPath: function (table, index) {
      const c = self;
      attempt(function () {
        if (table.tag === 3) {
          if (editing(c)) return;
          const folder = c.mnplSettingsFolderRows[index.row];
          stopBatch(c);
          c.mnplLibrary = MNPLService.setRootFolder(c.addon, { path: folder.path });
          c.mnplFolderExpanded.add(folder.path);
          c.mnplFolder = folder.path; c.mnplShowFolders = false;
          c.mnplMobileSection = "list";
          folders(c); reloadList(c, false); layoutContent(c); MNPLSettings.show(c);
          if (MNPLPaperData.settings().autoLibrary) startBatch(c);
          return;
        }
        if (table.tag === 2) {
          if (c.mnplCompact && editing(c)) return;
          const folder = c.mnplFolderRows[index.row];
          c.mnplFolder = folder.path; c.mnplShowFolders = false;
          c.mnplMobileSection = "list";
          folders(c); reloadList(c, false); layoutContent(c);
        } else if (index.row === c.mnplItems.length) reloadList(c, true);
        else select(c, c.mnplItems[index.row].id);
      });
    },
    searchChanged: function (input) {
      const c = self, generation = ++c.mnplSearchGeneration;
      c.mnplQuery = String(input.text || "");
      c.mnplSearchPlaceholder.hidden = c.mnplQuery.length > 0;
      NSTimer.scheduledTimerWithTimeInterval(0.18, false, function () {
        if (c.mnplDisposed || !c.mnplVisible || generation !== c.mnplSearchGeneration) return;
        attempt(function () { reloadList(c, false); });
      });
    },
    textFieldShouldReturn: function (input) { input.resignFirstResponder(); return true; },
    closeLibrary: function () { close(self); },
    refreshLibrary: function () { const c = self; attempt(function () { refresh(c); }); },
    filterPapers: function () { MNPLOptions.show(self, "filter"); },
    sortPapers: function () { MNPLOptions.show(self, "sort"); },
    openSettings: function () { const c = self; attempt(function () { MNPLSettings.show(c); }); },
    closeSettings: function () { MNPLSettings.close(self); },
    backToSettings: function () { MNPLSettings.show(self); },
    settingAction: function (button) { const c = self; attempt(function () { MNPLSettings.choose(c, button.tag); }); },
    saveJournalKey: function () { const c = self; attempt(function () { MNPLSettings.saveKey(c); }); },
    chooseOption: function (button) {
      const c = self;
      attempt(function () {
        const option = c.mnplMenuOptions[button.tag];
        if (c.mnplMenuKind === "sort") { c.mnplSort = option[0]; MNPLOptions.close(c); }
        else {
          if (option[0] === "all") { c.mnplItemTypes = []; c.mnplFavoritesOnly = false; }
          else if (option[0] === "favorites") c.mnplFavoritesOnly = !c.mnplFavoritesOnly;
          else if (c.mnplItemTypes.indexOf(option[0]) >= 0) c.mnplItemTypes = c.mnplItemTypes.filter(function (type) { return type !== option[0]; });
          else c.mnplItemTypes.push(option[0]);
          MNPLOptions.show(c, "filter");
        }
        updateToolbar(c);
        reloadList(c, false);
      });
    },
    closeOptions: function () { MNPLOptions.close(self); },
    journalSettings: function () { const c = self; attempt(function () { MNPLSettings.show(c); }); },
    fetchRelations: function (button) {
      const c = self, doc = c.mnplDocument;
      if (!doc || editing(c)) return;
      const kind = button.tag % 2 === 0 ? "references" : "citations";
      const key = doc.id + ":" + MNPLRelations.fingerprint(doc);
      const states = c.mnplRelationStates[key] || (c.mnplRelationStates[key] = {});
      if (states[kind] && states[kind].loading) return;
      states[kind] = { loading: true, error: "" };
      MNPLDetail.render(c);
      function done(error) {
        states[kind] = { loading: false, error: error ? String(error.message || error) : "" };
        if (!c.mnplDisposed && c.mnplVisible && c.mnplDocument && c.mnplDocument.id === doc.id && !c.mnplEditing) MNPLDetail.render(c);
      }
      try { MNPLRelations.load(doc, kind, button.tag >= 2).then(function () { done(null); }, done); }
      catch (error) { done(error); }
    },
    openRelation: function (button) {
      const c = self;
      attempt(function () {
        const url = (c.mnplRelationLinks || [])[button.tag] || "";
        if (!/^https:\/\/(?:doi\.org\/10\.|openalex\.org\/W\d+)/.test(url)) throw new Error("文献来源链接无效。");
        Application.sharedInstance().openURL(NSURL.URLWithString(url));
      });
    },
    fetchPaperData: function () { fetchPaperData(self, false); },
    fetchAbstract: function () { fetchPaperData(self, false, true); },
    fetchJournal: function () {
      const c = self, doc = c.mnplDocument;
      if (!doc || c.mnplJournalLoading || editing(c)) return;
      const type = MNPLBibliography.type((doc.metrics || {}).type, doc.title);
      if (type !== "unknown" && type !== "journal-article") { status(c, "期刊分级仅适用于期刊论文。"); return; }
      c.mnplJournalLoading = true;
      MNPLDetail.render(c);
      // Capture document identity and venue: selection may change during I/O.
      const id = doc.id, venue = doc.venue || "";
      let lookup;
      try { lookup = MNPLJournal.lookup(venue); }
      catch (error) { c.mnplJournalLoading = false; MNPLDetail.render(c); status(c, error.message); return; }
      lookup.then(function (value) {
        c.mnplJournalLoading = false;
        if (c.mnplDisposed) return;
        attempt(function () {
          const current = MNPLService.detail(c.addon, { id });
          if ((current.venue || "") !== venue) { status(c, "期刊名已更改，请重新获取标签。"); return; }
          const saved = MNPLService.saveMetadata(c.addon, { id, metadata: { journal: value.journal } });
          if (c.mnplSelectedId === id && !c.mnplEditing) { c.mnplDocument = saved; MNPLDetail.render(c); }
          reloadList(c, false);
          status(c, "期刊标签已保存 · " + value.journal.source + (value.warnings.length ? " · " + value.warnings.join("；") : ""));
        });
      }, function (error) {
        c.mnplJournalLoading = false;
        if (c.mnplDisposed) return;
        if (!c.mnplEditing) MNPLDetail.render(c);
        status(c, error.message);
      });
    },
    toggleFolders: function () {
      if (self.view.bounds.width >= 850) self.mnplHideFolders = !self.mnplHideFolders;
      else self.mnplShowFolders = !self.mnplShowFolders;
      layoutContent(self);
    },
    toggleDetail: function () {
      if (self.view.bounds.width < 760) {
        if (self.mnplMobileSection === "detail") self.mnplMobileSection = "list";
        else if (self.mnplDocument) self.mnplMobileSection = "detail";
      } else self.mnplHideDetail = !self.mnplHideDetail;
      layoutContent(self);
    },
    toggleFolderNode: function (button) {
      const c = self, settings = button.tag >= 100000, index = settings ? button.tag - 100000 : button.tag;
      const row = settings ? c.mnplSettingsFolderRows[index] : c.mnplFolderRows[index];
      if (!row) return;
      const expanded = settings ? c.mnplSettingsExpanded : c.mnplFolderExpanded;
      MNPLFolderTree.toggle(expanded, row.path);
      if (settings) {
        c.mnplSettingsFolderRows = MNPLFolderTree.rows(c.mnplLibrary.folders, "", expanded);
        c.mnplSettingsFolderTable.reloadData();
      } else folders(c);
    },
    resizeFolders: function (gesture) {
      const c = self;
      if (gesture.state === 1) c.mnplDragFolderWidth = c.mnplFolderWidth;
      if (gesture.state === 1 || gesture.state === 2 || gesture.state === 3) {
        const point = gesture.translationInView(c.view);
        c.mnplFolderWidth = Math.max(190, Math.min(420, c.mnplDragFolderWidth + point.x));
        layoutContent(c);
      }
    },
    backToList: function () { if (editing(self)) return; self.mnplMobileSection = "list"; layoutContent(self); },
    showCurrent: function () {
      const c = self;
      attempt(function () { locateCurrent(c); });
    },
    favoritePaper: function (button) {
      const c = self;
      attempt(function () {
        const item = c.mnplItems[button.tag];
        if (!item) return;
        const doc = MNPLService.setFavorite(c.addon, { id: item.id, favorite: !item.favorite });
        item.favorite = doc.favorite;
        if (c.mnplDocument && c.mnplDocument.id === doc.id) c.mnplDocument.favorite = doc.favorite;
        c.mnplPaperTable.reloadData();
      });
    },
    openPaper: function (button) { const c = self; attempt(function () { const item = c.mnplItems[button.tag]; if (item) open(c, item.id); }); },
    openDetail: function () { const c = self; attempt(function () { if (c.mnplDocument) open(c, c.mnplDocument.id); }); },
    detailTab: function (button) {
      if (editing(self)) return;
      self.mnplTab = ["info", "citations"][button.tag] || "info"; MNPLDetail.render(self);
    },
    editDetail: function () { MNPLDetail.edit(self); },
    cancelEdit: function () { self.mnplEditing = false; self.mnplInputs = {}; MNPLDetail.render(self); },
    saveEdit: function () {
      const c = self;
      attempt(function () { MNPLDetail.save(c); reloadList(c, false); status(c, "文献资料已保存。"); });
    },
  });
  function create(mainPath, addon) {
    const c = panelClass.new();
    c.mainPath = mainPath; c.addon = addon;
    c.mnplVisible = false; c.mnplReady = false; c.mnplDisposed = false;
    c.mnplItems = []; c.mnplFolderRows = []; c.mnplTotal = 0;
    c.mnplQuery = ""; c.mnplSort = "year-desc"; c.mnplItemTypes = []; c.mnplFavoritesOnly = false; c.mnplTab = "info";
    c.mnplRelationStates = {}; c.mnplRelationLinks = [];
    c.mnplAutoAttempted = new Set(); c.mnplPaperLoading = false;
    c.mnplGeneration = 0; c.mnplSearchGeneration = 0;
    c.mnplMobileSection = "list"; c.mnplInputs = {};
    c.mnplFolderWidth = 260; c.mnplFolderExpanded = new Set([""]);
    c.mnplHideFolders = false; c.mnplHideDetail = false; c.mnplShowFolders = false;
    return c;
  }
  function layout(c) {
    if (!c.mnplVisible || !c.mnplReady) return;
    const parent = c.view.superview;
    if (!parent) return;
    const bounds = parent.bounds;
    const margin = bounds.width < 700 ? 6 : 18;
    c.view.frame = MNPLUI.rect(bounds.x + margin, bounds.y + margin, bounds.width - margin * 2, bounds.height - margin * 2);
    layoutContent(c);
  }
  function toggle(c) {
    if (c.mnplVisible) { close(c); return; }
    const study = studyFor(c);
    if (!study || !study.view) { Application.sharedInstance().alert("请先在 MarginNote 打开一个学习界面。"); return; }
    attempt(function () {
      study.view.addSubview(c.view);
      c.mnplVisible = true;
      layout(c);
      // Present native controls before indexing the library. No WebView startup.
      const generation = ++c.mnplGeneration;
      NSTimer.scheduledTimerWithTimeInterval(0.01, false, function () {
        if (c.mnplDisposed || !c.mnplVisible || generation !== c.mnplGeneration) return;
        attempt(function () { refresh(c); });
      });
    });
  }
  function notifyDocumentChanged(c) {
    if (!c.mnplVisible || !c.mnplReady || c.mnplEditing) return;
    attempt(function () {
      if (c.mnplSelectedId) { c.mnplDocument = MNPLService.detail(c.addon, { id: c.mnplSelectedId }); MNPLDetail.render(c); }
    });
  }
  function dispose(c) {
    c.mnplDisposed = true; c.mnplGeneration += 1; c.mnplSearchGeneration += 1;
    stopBatch(c);
    MNPLOptions.close(c); MNPLSettings.close(c);
    if (c.mnplVisible) c.view.removeFromSuperview();
    c.mnplVisible = false;
  }
  return { create, layout, toggle, notifyDocumentChanged, dispose, lookupLibrary: startBatch };
})();
