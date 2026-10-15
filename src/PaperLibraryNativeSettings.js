var MNPLSettings = (function () {
  function close(c) {
    if (c.mnplSettingsPage) c.mnplSettingsPage.removeFromSuperview();
    c.mnplSettingsPage = null; c.mnplSettingsOpen = false; c.mnplSettingsScroll = null;
    c.mnplSettingsFolderTable = null; c.mnplSettingsProgress = null; c.mnplKeyField = null;
  }
  function show(c) {
    MNPLOptions.close(c);
    if (!c.mnplSettingsPage) c.mnplSettingsPage = MNPLUI.box(c.mnplSurface, MNPLUI.rect(0, 0, c.mnplSurface.bounds.width, c.mnplSurface.bounds.height), "paper");
    c.mnplSettingsOpen = true;
    c.mnplSettingsMode = "settings";
    render(c);
  }
  function pickRoot(c) {
    c.mnplSettingsMode = "root";
    c.mnplSettingsScroll = null;
    c.mnplSettingsExpanded = new Set([""]);
    const parts = (c.mnplLibrary && c.mnplLibrary.rootPath || "").split("/").filter(Boolean);
    parts.forEach(function (_, index) { c.mnplSettingsExpanded.add(parts.slice(0, index + 1).join("/")); });
    render(c);
  }
  function render(c) {
    const page = c.mnplSettingsPage;
    if (!page) return;
    const ui = MNPLUI, width = c.mnplSurface.bounds.width, height = c.mnplSurface.bounds.height;
    const offset = c.mnplSettingsScroll ? c.mnplSettingsScroll.contentOffset : null;
    const keyDraft = c.mnplSettingsMode === "key" && c.mnplKeyField ? c.mnplKeyField.text : "";
    page.frame = ui.rect(0, 0, width, height);
    ui.clear(page);
    const subpage = c.mnplSettingsMode === "root" || c.mnplSettingsMode === "key";
    ui.label(page, c.mnplSettingsMode === "root" ? "选择文献库文件夹" : c.mnplSettingsMode === "key" ? "配置数据源密钥" : "设置",
      ui.rect(18, 10, width - 150, 34), 20, "ink", true);
    ui.button(page, subpage ? "返回设置" : "返回文献库", ui.rect(width - 112, 10, 100, 34), c,
      subpage ? "backToSettings" : "closeSettings");
    ui.box(page, ui.rect(0, 53, width, 1), "line");
    if (c.mnplSettingsMode === "key") {
      c.mnplSettingsFolderTable = null; c.mnplSettingsProgress = null;
      const x = Math.max(18, (width - 620) / 2), column = Math.min(620, width - 36);
      ui.label(page, c.mnplEditingKey === "easyScholarKey" ? "easyScholar SecretKey" : "OpenAlex API Key",
        ui.rect(x, 78, column, 28), 15, "ink", true);
      const note = ui.label(page, "密钥保存在本机插件设置中。输入新密钥后点保存；留空保存将删除已存密钥。",
        ui.rect(x, 112, column, 42), 12, "muted");
      note.numberOfLines = 0;
      const field = new UITextField(ui.rect(x, 166, column, 42));
      field.text = keyDraft;
      field.placeholder = "输入新密钥（输入时可见）";
      field.font = UIFont.systemFontOfSize(14);
      field.textColor = ui.color(ui.colors.ink);
      field.backgroundColor = ui.color(ui.colors.paper);
      field.layer.borderWidth = 1; field.layer.borderColor = ui.color(ui.colors.line); field.layer.cornerRadius = 6;
      field.leftView = new UIView(ui.rect(0, 0, 12, 1)); field.leftViewMode = 3;
      page.addSubview(field); c.mnplKeyField = field;
      ui.control(page, "保存密钥", ui.rect(x, 222, 104, 38), c, "saveJournalKey");
      return;
    }
    c.mnplKeyField = null;
    if (c.mnplSettingsMode === "root") {
      c.mnplSettingsProgress = null;
      if (!c.mnplLibrary) c.mnplLibrary = MNPLService.folders({ quick: true });
      c.mnplSettingsFolderRows = MNPLFolderTree.rows(c.mnplLibrary.folders, "", c.mnplSettingsExpanded);
      const note = ui.label(page, "选择一个文件夹；库中只显示它及子文件夹里的文献。选择“全部文献”可恢复完整资料库。",
        ui.rect(18, 62, width - 36, 38), 12, "muted");
      note.numberOfLines = 0;
      const table = new UITableView(ui.rect(12, 104, width - 24, Math.max(0, height - 116)));
      table.tag = 3; table.dataSource = c; table.delegate = c;
      table.rowHeight = 42; table.separatorStyle = 0;
      table.backgroundColor = ui.color(ui.colors.paper);
      page.addSubview(table);
      c.mnplSettingsFolderTable = table;
      return;
    }
    c.mnplSettingsFolderTable = null;
    const scroll = new UIScrollView(ui.rect(0, 54, width, height - 54));
    scroll.backgroundColor = ui.color(ui.colors.sidebar);
    page.addSubview(scroll);
    const columnWidth = Math.min(620, width - 32), x = (width - columnWidth) / 2;
    let y = 18;
    const actions = [];
    function heading(title, subtitle) {
      ui.label(scroll, title, ui.rect(x + 2, y, columnWidth - 4, 22), 14, "ink", true); y += 25;
      if (subtitle) {
        const note = ui.label(scroll, subtitle, ui.rect(x + 2, y, columnWidth - 4, 34), 11, "muted");
        note.numberOfLines = 0; y += 38;
      }
    }
    function group(rows) {
      const box = ui.box(scroll, ui.rect(x, y, columnWidth, rows.length * 48), "paper");
      box.layer.cornerRadius = 7; box.layer.borderWidth = 1; box.layer.borderColor = ui.color(ui.colors.line);
      rows.forEach(function (row, index) {
        const top = index * 48;
        if (index) ui.box(box, ui.rect(12, top, columnWidth - 24, 0.5), "line");
        const button = ui.button(box, "", ui.rect(0, top, columnWidth, 48), c, "settingAction");
        button.tag = actions.length; actions.push(row.key);
        ui.label(box, row.label, ui.rect(14, top + 10, columnWidth - 116, 28), 13, "ink");
        const value = ui.label(box, row.value, ui.rect(columnWidth - 102, top + 10, 88, 28), 12, row.on ? "accent" : "muted", row.on);
        value.textAlignment = 2;
      });
      y += rows.length * 48 + 22;
    }
    const root = c.mnplLibrary && c.mnplLibrary.rootPath || "";
    const paper = MNPLPaperData.settings(), journal = MNPLJournal.settings();
    heading("文献库范围", "只显示所选文件夹及子文件夹中已导入 MarginNote 的文档。");
    group([{ key: "root", label: root || "全部文献", value: "更换文件夹  ›", on: true }]);
    heading("文献信息", "按 DOI 或完整标题核对记录；默认只补充空白字段。");
    group([{ key: "autoLookup", label: "打开详情时自动识别", value: paper.autoLookup ? "已开启" : "已关闭", on: paper.autoLookup },
      { key: "autoLibrary", label: "打开文献库时自动补全", value: paper.autoLibrary ? "已开启" : "已关闭", on: paper.autoLibrary },
      { key: "batchLookup", label: "补全当前文献库", value: c.mnplBatch ? "停止  ›" : "开始  ›", on: Boolean(c.mnplBatch) },
      { key: "crossref", label: "Crossref 文献数据", value: paper.crossref ? "已开启" : "已关闭", on: paper.crossref },
      { key: "openAlex", label: "OpenAlex 文献数据", value: paper.openAlex ? "已开启" : "已关闭", on: paper.openAlex },
      { key: "overwrite", label: "更新时覆盖已有字段", value: paper.overwrite ? "已开启" : "已关闭", on: paper.overwrite }]);
    c.mnplSettingsProgress = ui.label(scroll, "仅处理所选根文件夹中缺少资料的文献；无可靠匹配时保持原样。",
      ui.rect(x + 2, y - 15, columnWidth - 4, 48), 11, "muted");
    c.mnplSettingsProgress.numberOfLines = 0;
    updateProgress(c);
    y += 46;
    heading("期刊指标", "期刊名精确匹配。OpenAlex 两年平均被引率与 JCR IF 分开显示。");
    group([{ key: "easyScholar", label: "easyScholar 分区与 IF", value: journal.easyScholar ? "已开启" : "已关闭", on: journal.easyScholar },
      { key: "openAlexJournal", label: "OpenAlex 期刊指标", value: journal.openAlex ? "已开启" : "已关闭", on: journal.openAlex },
      { key: "easyScholarKey", label: "easyScholar 密钥", value: journal.easyScholarKey ? "已配置  ›" : "未配置  ›", on: Boolean(journal.easyScholarKey) },
      { key: "openAlexKey", label: "OpenAlex 密钥（可选）", value: journal.openAlexKey ? "已配置  ›" : "未配置  ›", on: Boolean(journal.openAlexKey) }]);
    c.mnplSettingsActions = actions;
    scroll.contentSize = { width, height: y + 14 };
    c.mnplSettingsScroll = scroll;
    if (offset) scroll.setContentOffsetAnimated({ x: 0, y: Math.max(0, Math.min(offset.y, y + 14 - scroll.bounds.height)) }, false);
  }
  function choose(c, index) {
    const key = c.mnplSettingsActions && c.mnplSettingsActions[index];
    if (!key) return;
    if (key === "root") { pickRoot(c); return; }
    if (key === "batchLookup") { MNPLPanel.lookupLibrary(c); render(c); return; }
    if (key.endsWith("Key")) { c.mnplEditingKey = key; c.mnplSettingsMode = "key"; render(c); return; }
    if (key === "easyScholar" || key === "openAlexJournal") {
      const field = key === "openAlexJournal" ? "openAlex" : key;
      const patch = {}; patch[field] = !MNPLJournal.settings()[field]; MNPLJournal.saveSettings(patch);
    } else {
      const patch = {}; patch[key] = !MNPLPaperData.settings()[key]; MNPLPaperData.saveSettings(patch);
      if (key === "autoLibrary" && patch[key]) MNPLPanel.lookupLibrary(c);
    }
    render(c);
  }
  function saveKey(c) {
    if (!c.mnplKeyField || !c.mnplEditingKey) return;
    const value = String(c.mnplKeyField.text || "").trim();
    const patch = {}; patch[c.mnplEditingKey] = value;
    MNPLJournal.saveSettings(patch);
    if (MNPLJournal.settings()[c.mnplEditingKey] !== value) throw new Error("密钥保存后校验失败，请重试。");
    c.mnplEditingKey = null; c.mnplSettingsMode = "settings";
    render(c);
  }
  function updateProgress(c) {
    if (!c.mnplSettingsProgress || (!c.mnplBatch && !c.mnplLastBatch)) return;
    const job = c.mnplBatch || c.mnplLastBatch;
    c.mnplSettingsProgress.text = (c.mnplBatch ? "识别中 " : job.stopped ? "已停止 " : "已完成 ") + job.current + "/" + job.total + " · 已补全 " + job.saved + " · 未匹配 " + job.unmatched + " · 错误 " + (job.failed || 0) +
      (job.lastError ? "\n最近结果：" + job.lastError : "");
  }
  function layout(c) {
    if (!c.mnplSettingsPage) return;
    if (c.mnplSettingsPage.frame.width !== c.mnplSurface.bounds.width || c.mnplSettingsPage.frame.height !== c.mnplSurface.bounds.height) render(c);
  }
  return { show, close, render, choose, saveKey, layout, updateProgress };
})();
