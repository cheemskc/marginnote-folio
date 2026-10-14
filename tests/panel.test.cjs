const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Host doubles verify transitions and persistence contracts, not actual UIKit pixels.
function host() {
  const timers = [], alerts = [], saved = [], opened = [], openedSources = [], batchJobs = [];
  const journalSettings = { easyScholar: true, openAlex: true, easyScholarKey: '', openAlexKey: '' };
  let indexReads = 0, viewLoads = 0, resolveFolders;
  class View {
    constructor(frame = { x: 0, y: 0, width: 900, height: 640 }) { this.frame = frame; this.subviews = []; this.layer = {}; this.hidden = false; this.contentOffset = { x: 0, y: 0 }; }
    get bounds() { return { x: 0, y: 0, width: this.frame.width, height: this.frame.height }; }
    addSubview(v) { v.superview = this; this.subviews.push(v); }
    addGestureRecognizer(v) { this.gesture = v; }
    removeFromSuperview() { if (this.superview) this.superview.subviews = this.superview.subviews.filter(v => v !== this); this.superview = null; }
    sizeThatFits(size) { const w = Array.from(this.text || '').length * (this.font || 13) * 0.55; return { width: Math.min(w, size.width), height: Math.ceil(Math.max(1, w / size.width)) * (this.font || 13) * 1.3 }; }
    setTitleForState(text) { this.title = text; }
    setTitleColorForState() {}
    addTargetActionForControlEvents(target, action) { this.target = target; this.action = action; }
    resignFirstResponder() {}
    setContentOffsetAnimated(offset) { this.contentOffset = offset; }
    reloadData() { this.reloads = (this.reloads || 0) + 1; }
    scrollToRowAtIndexPathAtScrollPositionAnimated(index,position,animated) { this.scrolled={index,position,animated}; }
    dequeueReusableCellWithIdentifier(id) { return this.reuse && this.reuse[id] || null; }
  }
  class Button extends View { constructor(frame) { super(frame); this.titleLabel = new View(); } }
  const docs = [{ id: 'a', title: 'Long paper title '.repeat(12), folderPath: 'Research', authors: 'Author A', rating: 3, quartile: 'Q1', favorite: false, notebookId: 'n', metrics: { citations: 0, references: 0 } },
    { id: 'b', title: 'Second paper', folderPath: 'Other', notebookId: 'n', metrics: {} }];
  const library = { rootPath: '', rootExists: true, warnings: [], folders: [{ path: '', name: '全部文献', parentPath: null, depth: 0, count: 2 }, { path: 'Research', name: 'Research', parentPath: '', depth: 1, count: 1 }] };
  const study = { view: new View({ x: 0, y: 0, width: 1200, height: 800 }), refreshAddonCommands() {} };
  const context = vm.createContext({ console, UIImageView: View, UIImage: { imageWithContentsOfFile: p => p }, UIView: View, UILabel: View, UIButton: Button, UIScrollView: View, UITextView: View, UITextField: View, UISearchBar: View, UITableView: View,
    UIPanGestureRecognizer: class { constructor(target, action) { this.target=target; this.action=action; } },
    UITableViewCell: { makeWithStyleReuseIdentifier: () => ({ contentView: new View(), textLabel: new View() }) },
    UIColor: { colorWithRedGreenBlueAlpha: (...args) => args }, UIFont: { systemFontOfSize: n => n, boldSystemFontOfSize: n => n },
    MNPLNativeValues: { toArray: a => a },
    NSIndexPath: { indexPathForRowInSection: (row,section) => ({row,section}) },
    NSTimer: { scheduledTimerWithTimeInterval: (_, __, action) => timers.push(action) },
    NSURL: { URLWithString: value => value },
    Application: { sharedInstance: () => ({ studyController: () => study, alert: text => alerts.push(text), openURL: url => openedSources.push(url) }) },
    MNPLFolders: { within: (p, r) => !r || p === r || p.startsWith(r + '/') },
    MNPLRelations: { get: () => ({}), fingerprint: d => d.doi || d.id },
    MNPLPaperData: { settings: () => ({ autoLookup: false, autoLibrary: false, crossref: true, openAlex: true, overwrite: false }), saveSettings() {} },
    MNPLBatchLookup: { start() { const job={total:2,current:0,saved:0,unmatched:0,stopped:false,stop(){this.stopped=true;}};batchJobs.push(job);return job; } },
    MNPLJournal: { settings: () => ({ ...journalSettings }), saveSettings(patch) { Object.assign(journalSettings, patch); } },
    MNPLService: {
      folders(options) { if (options && options.quick) return library; return new Promise(resolve => { resolveFolders = resolve; }); },
      list(_, options) { indexReads++; const folder = options.folderPath || library.rootPath; const items = docs.filter(d => (!folder || d.folderPath === folder || d.folderPath.startsWith(folder + '/')) && (!options.query || d.title.includes(options.query))); return { items: items.map(d => ({ ...d })), total: items.length }; },
      inScope(id, folderPath) { const folder = folderPath || library.rootPath, doc = docs.find(d => d.id === id); return Boolean(doc && (!folder || doc.folderPath === folder || doc.folderPath.startsWith(folder + '/'))); },
      currentDocument: () => null,
      detail: (_, { id }) => ({ ...docs.find(d => d.id === id) }),
      saveMetadata(_, { id, metadata }) { saved.push({ id, metadata }); Object.assign(docs.find(d => d.id === id), metadata); return { ...docs.find(d => d.id === id) }; },
      setFavorite(_, { id, favorite }) { docs.find(d => d.id === id).favorite = favorite; return { ...docs.find(d => d.id === id) }; },
      setRootFolder(_, { path }) { library.rootPath = path; return library; },
      open(_, { id }) { opened.push(id); },
    },
  });
  context.JSB = { defineClass(_, methods) { return { new() {
    const c = {};
    for (const [key, method] of Object.entries(methods)) c[key] = (...args) => { const old = context.self; context.self = c; try { return method(...args); } finally { context.self = old; } };
    let view;
    Object.defineProperty(c, 'view', { get() { if (!view) { view = new View(); viewLoads++; c.viewDidLoad(); } return view; } });
    return c;
  } }; } };
  for (const file of ['PaperLibraryBibliography.js', 'PaperLibraryFolderTree.js', 'PaperLibraryNativeUI.js', 'PaperLibraryNativeDetail.js', 'PaperLibraryNativeOptions.js', 'PaperLibraryNativeSettings.js', 'PaperLibraryNativePanel.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  }
  const panel = context.MNPLPanel, c = panel.create('/plugin', { window: {} });
  return { panel, c, study, docs, library, timers, alerts, saved, opened, openedSources, batchJobs, journalSettings, context,
    reads: () => indexReads, loads: () => viewLoads, finishFolders: () => resolveFolders(library) };
}

test('native panel stays lazy, paints before indexing, cancels delayed work after closing', () => {
  const h = host(); assert.equal(h.loads(), 0); assert.equal(h.reads(), 0);
  h.panel.toggle(h.c); assert.equal(h.loads(), 1); assert.equal(h.reads(), 0);
  h.panel.toggle(h.c); h.timers.shift()(); assert.equal(h.reads(), 0);
  h.panel.toggle(h.c); h.timers.shift()(); assert.equal(h.reads(), 1);
  assert.equal(h.c.mnplItems.length, 2); assert.deepEqual(h.alerts, []);
});

test('native editor keeps drafts on resize and preserves zero-valued citation data', () => {
  const h = host(); h.panel.toggle(h.c); h.timers.shift()();
  h.c.tableViewDidSelectRowAtIndexPath(h.c.mnplPaperTable, { row: 0 });
  h.c.editDetail();
  h.c.mnplInputs['metrics.publisher'].text = 'New publisher';
  h.study.view.frame.width = 900; h.panel.layout(h.c);
  assert.equal(h.c.mnplInputs['metrics.publisher'].text, 'New publisher');
  h.c.saveEdit();
  assert.equal(h.saved[0].metadata.metrics.citations, undefined); // Citation counts are not overwritten by bibliographic editing.
  assert.equal(h.saved[0].metadata.metrics.publisher, 'New publisher');
  assert.equal(h.c.mnplEditing, false); assert.deepEqual(h.alerts, []);
});

test('editing actions remain outside the long form when scrolling and resizing', () => {
  const h = host(); h.panel.toggle(h.c); h.timers.shift()();
  h.c.tableViewDidSelectRowAtIndexPath(h.c.mnplPaperTable, { row: 0 });
  for (const tab of [0]) {
    h.c.detailTab({ tag: tab }); h.c.editDetail();
    for (const width of [1200, 400]) {
      h.study.view.frame.width = width; h.panel.layout(h.c);
      const detail = h.c.mnplDetail, scroll = h.c.mnplDetailScroll;
      scroll.setContentOffsetAnimated({ x: 0, y: 200 }, false);
      const save = detail.subviews.find(v => v.action === 'saveEdit:');
      const cancel = detail.subviews.find(v => v.action === 'cancelEdit:');
      assert.ok(save && cancel);
      assert.ok(save.frame.y + save.frame.height <= scroll.frame.y);
      assert.ok(save.frame.y + save.frame.height <= detail.bounds.height);
      assert.equal(detail.subviews.some(v => v.action === 'openDetail:'), false);
    }
    h.c.cancelEdit();
    h.study.view.frame.width = 1200; h.panel.layout(h.c);
  }
});

test('an unavailable abstract editor keeps saving available and preserves the existing abstract', () => {
  const h = host(); h.docs[0].abstract = 'Existing abstract';
  h.context.UITextView = class { constructor(frame, container) {
    assert.equal(container, null);
    throw new Error('Text view unavailable');
  } };
  h.panel.toggle(h.c); h.timers.shift()();
  h.c.tableViewDidSelectRowAtIndexPath(h.c.mnplPaperTable, { row: 0 }); h.c.editDetail();
  const save = h.c.mnplDetail.subviews.find(v => v.action === 'saveEdit:');
  assert.ok(save);
  assert.ok(h.c.mnplDetailScroll.contentSize.height > 0);
  h.c.mnplInputs.authors.text = 'Updated author';
  h.c.saveEdit();
  assert.equal(h.saved[0].metadata.abstract, 'Existing abstract');
  assert.equal(h.saved[0].metadata.authors, 'Updated author');
  assert.equal(h.c.mnplEditing, false);
});

test('reused row buttons target the current document and close after requesting open', () => {
  const h = host(); h.panel.toggle(h.c); h.timers.shift()();
  const cell = h.c.tableViewCellForRowAtIndexPath(h.c.mnplPaperTable, { row: 0 });
  h.c.mnplPaperTable.reuse = { MNPLPaper: cell };
  const reused = h.c.tableViewCellForRowAtIndexPath(h.c.mnplPaperTable, { row: 1 });
  assert.equal(reused, cell);
  const favorite = reused.contentView.subviews.find(v => v.action === 'favoritePaper:');
  h.c.favoritePaper(favorite);
  assert.equal(h.docs[0].favorite, false); assert.equal(h.docs[1].favorite, true);
  h.c.openPaper({ tag: 1 }); assert.deepEqual(h.opened, ['b']);
  assert.equal(h.c.mnplVisible, false); assert.deepEqual(h.alerts, []);
});

test('only latest search runs and disposed panels ignore folder completion', async () => {
  const h = host(); h.panel.toggle(h.c); h.timers.shift()();
  h.c.searchChanged({text:'Long'}); h.c.searchChanged({text:'Second'});
  h.timers.splice(0).forEach(action => action());
  assert.equal(h.reads(), 2); assert.equal(h.c.mnplItems[0].id, 'b');
  const count = h.c.mnplFolderTable.reloads;
  h.panel.dispose(h.c); h.finishFolders(); await Promise.resolve();
  assert.equal(h.c.mnplFolderTable.reloads, count);
});

test('document changes preserve a draft and root selection uses native folders', () => {
  const h = host(); h.panel.toggle(h.c); h.timers.shift()();
  h.c.tableViewDidSelectRowAtIndexPath(h.c.mnplPaperTable, { row: 0 }); h.c.editDetail();
  h.c.mnplInputs.authors.text = 'Unsaved author';
  h.c.tableViewDidSelectRowAtIndexPath(h.c.mnplPaperTable, { row: 1 });
  assert.equal(h.c.mnplSelectedId, 'a'); assert.equal(h.c.mnplInputs.authors.text, 'Unsaved author');
  h.study.view.frame.width = 400; h.panel.layout(h.c); h.c.backToList();
  assert.equal(h.c.mnplMobileSection, 'detail');
  h.context.MNPLService.saveMetadata = () => { throw new Error('Disk full'); };
  h.c.saveEdit();
  assert.equal(h.c.mnplEditing, true); assert.equal(h.c.mnplInputs.authors.text, 'Unsaved author');
  assert.deepEqual(h.alerts.splice(0), ['Disk full']);
  h.c.cancelEdit(); h.c.openSettings();
  h.c.settingAction({ tag: h.c.mnplSettingsActions.indexOf('root') });
  h.c.tableViewDidSelectRowAtIndexPath(h.c.mnplSettingsFolderTable, { row: 1 });
  assert.equal(h.library.rootPath, 'Research'); assert.equal(h.c.mnplFolder, 'Research');
  assert.deepEqual(Array.from(h.c.mnplItems, item => item.id), ['a']);
  assert.deepEqual(h.alerts, []);
});

test('native search controls select type and sort while icons follow bibliographic type', () => {
  const h=host();h.panel.toggle(h.c);h.timers.shift()();
  h.c.filterPapers();
  assert.equal(h.c.mnplMenuKind,'filter');
  const journal=h.c.mnplMenuOptions.findIndex(x=>x[0]==='journal-article');
  h.c.chooseOption({tag:journal});
  assert.deepEqual(Array.from(h.c.mnplItemTypes),['journal-article']);
  assert.match(h.c.mnplFilterButton.title,/筛选 · 1/);
  assert.equal(h.c.mnplMenu.frame.width,h.c.mnplFilterButton.frame.width);
  assert.equal(h.c.mnplMenu.frame.y,h.c.mnplFilterButton.frame.y+h.c.mnplFilterButton.frame.height+4);
  const thesis=h.c.mnplMenuOptions.findIndex(x=>x[0]==='thesis');
  h.c.chooseOption({tag:thesis});
  assert.deepEqual(Array.from(h.c.mnplItemTypes),['journal-article','thesis']);
  h.c.sortPapers();
  const year=h.c.mnplMenuOptions.findIndex(x=>x[0]==='year-asc');
  h.c.chooseOption({tag:year});
  assert.equal(h.c.mnplSort,'year-asc');
  assert.match(h.c.mnplSortButton.title,/年份/);
  h.c.mnplItems[0].itemType='patent';
  const patent=h.c.tableViewCellForRowAtIndexPath(h.c.mnplPaperTable,{row:0});
  const typeIcon=patent.contentView.subviews.find(v=>String(v.image||'').includes('type-'));
  assert.match(typeIcon.image,/type-patent\.png$/);
  assert.ok(patent.contentView.subviews.some(v=>String(v.image||'').endsWith('type-star.png')));
  assert.equal(patent.contentView.subviews.some(v=>/[★☆]/.test(v.text||'')),false);
});

test('locate current clears view filters, switches folder and scrolls without changing the library root', () => {
  const h=host();h.panel.toggle(h.c);h.timers.shift()();
  h.c.mnplFolder='Research';h.c.mnplQuery='No match';h.c.mnplSearch.text='No match';
  h.c.mnplItemTypes=['thesis'];h.c.mnplFavoritesOnly=true;h.c.mnplHideDetail=true;
  h.context.MNPLService.currentDocument=()=>h.docs[1];
  h.c.showCurrent();
  assert.equal(h.library.rootPath,'');assert.equal(h.c.mnplFolder,'Other');
  assert.equal(h.c.mnplSelectedId,'b');assert.equal(h.c.mnplHideDetail,false);
  assert.equal(h.c.mnplQuery,'');assert.equal(h.c.mnplFavoritesOnly,false);
  assert.deepEqual(Array.from(h.c.mnplItemTypes),[]);
  assert.equal(h.c.mnplPaperTable.scrolled.index.row,0);
  assert.equal(h.c.mnplPaperTable.scrolled.position,2);
  assert.match(h.c.mnplStatus.text,/已定位正在阅读的文献/);
  assert.deepEqual(h.alerts,[]);
});

test('locate current respects library root and an active metadata draft', () => {
  const h=host();h.panel.toggle(h.c);h.timers.shift()();
  h.library.rootPath='Research';h.c.mnplFolder='Research';
  h.context.MNPLService.currentDocument=()=>h.docs[1];h.c.showCurrent();
  assert.equal(h.c.mnplFolder,'Research');assert.equal(h.c.mnplSelectedId,undefined);
  assert.match(h.c.mnplStatus.text,/不在设置中选择的文献库范围/);
  h.context.MNPLService.currentDocument=()=>h.docs[0];
  h.c.mnplEditing=true;h.c.mnplQuery='Draft search';h.c.showCurrent();
  assert.equal(h.c.mnplQuery,'Draft search');assert.equal(h.c.mnplEditing,true);
});

test('settings uses a full native page and choosing a root limits list and detail', () => {
  const h=host();h.panel.toggle(h.c);h.timers.shift()();
  h.c.tableViewDidSelectRowAtIndexPath(h.c.mnplPaperTable,{row:1});
  assert.equal(h.c.mnplSelectedId,'b');
  h.c.openSettings();
  assert.equal(h.c.mnplSettingsPage.frame.width,h.c.view.bounds.width);
  assert.equal(h.c.mnplSettingsPage.frame.height,h.c.view.bounds.height);
  assert.ok(h.c.mnplSettingsActions.includes('crossref'));
  h.c.settingAction({tag:h.c.mnplSettingsActions.indexOf('root')});
  assert.equal(h.c.mnplSettingsMode,'root');
  assert.equal(h.c.mnplSettingsFolderTable.tag,3);
  assert.equal(h.c.mnplSettingsPage.frame.width,h.c.view.bounds.width);
  h.c.tableViewDidSelectRowAtIndexPath(h.c.mnplSettingsFolderTable,{row:1});
  assert.equal(h.library.rootPath,'Research');
  assert.deepEqual(Array.from(h.c.mnplItems,item=>item.id),['a']);
  assert.equal(h.c.mnplSelectedId,null);
  assert.equal(h.c.mnplDocument,null);
  assert.equal(h.c.mnplSettingsMode,'settings');
  assert.equal(h.c.mnplSettingsPage.frame.width,h.c.view.bounds.width);
});

test('folder tree expands independently and its divider resizes the left library', () => {
  const h=host();h.panel.toggle(h.c);h.timers.shift()();
  h.library.folders.push({path:'Research/Child',name:'Child',parentPath:'Research',depth:2,count:1});
  h.c.refreshLibrary();
  assert.equal(h.c.mnplFolderRows.some(row=>row.path==='Research/Child'),false);
  const index=h.c.mnplFolderRows.findIndex(row=>row.path==='Research');
  h.c.toggleFolderNode({tag:index});
  assert.equal(h.c.mnplFolderRows.some(row=>row.path==='Research/Child'),true);
  h.c.toggleFolderNode({tag:0});
  assert.deepEqual(Array.from(h.c.mnplFolderRows,row=>row.path),['']);
  h.c.toggleFolderNode({tag:0});
  assert.equal(h.c.mnplFolderRows.some(row=>row.path==='Research'),true);
  const before=h.c.mnplPaperTable.frame.x;
  h.c.resizeFolders({state:1,translationInView:()=>({x:40,y:0})});
  assert.equal(h.c.mnplPaperTable.frame.x,before+40);
  assert.equal(h.c.mnplFolderDivider.frame.x,h.c.mnplPaperTable.frame.x-4);
});

test('both native sidebars collapse and restore space to the paper list', () => {
  const h=host();h.panel.toggle(h.c);h.timers.shift()();
  const initial=h.c.mnplPaperTable.frame.width;
  assert.equal(h.c.mnplRootButton,undefined);
  assert.equal(h.c.mnplFolders.hidden,false);
  assert.equal(h.c.mnplDetail.hidden,false);
  h.c.toggleFolders();
  assert.equal(h.c.mnplFolders.hidden,true);
  assert.equal(h.c.mnplPaperTable.frame.x,0);
  assert.ok(h.c.mnplPaperTable.frame.width>initial);
  h.c.toggleDetail();
  assert.equal(h.c.mnplDetail.hidden,true);
  assert.equal(h.c.mnplPaperTable.frame.width,h.c.view.bounds.width);
  h.c.toggleFolders();h.c.toggleDetail();
  assert.equal(h.c.mnplFolders.hidden,false);
  assert.equal(h.c.mnplDetail.hidden,false);
  assert.equal(h.c.mnplPaperTable.frame.width,initial);
});

test('journal key editor saves only after the Save button and updates configured state', () => {
  const h=host();h.panel.toggle(h.c);h.timers.shift()();h.c.openSettings();
  const row=h.c.mnplSettingsActions.indexOf('easyScholarKey');
  h.c.settingAction({tag:row});
  assert.equal(h.c.mnplSettingsMode,'key');
  h.c.mnplKeyField.text='test-key';
  assert.equal(h.journalSettings.easyScholarKey,'');
  h.c.saveJournalKey();
  assert.equal(h.journalSettings.easyScholarKey,'test-key');
  assert.equal(h.c.mnplSettingsMode,'settings');
  assert.equal(h.alerts.length,0);
  assert.equal(h.c.mnplSettingsActions.includes('easyScholarKey'),true);
  assert.ok(h.c.mnplSettingsScroll.subviews.some(v=>v.subviews && v.subviews.some(label=>label.text==='已配置  ›')));
});

test('settings starts and stops scoped metadata completion', () => {
  const h=host();h.panel.toggle(h.c);h.timers.shift()();
  // JSB instance methods can be target actions without being callable JS fields.
  assert.equal(h.c.lookupLibrary,undefined);
  h.c.openSettings();
  const row=h.c.mnplSettingsActions.indexOf('batchLookup');
  h.c.settingAction({tag:row});
  assert.equal(h.batchJobs.length,1);
  assert.equal(h.c.mnplBatch,h.batchJobs[0]);
  h.c.settingAction({tag:row});
  assert.equal(h.batchJobs[0].stopped,true);
  assert.equal(h.c.mnplBatch,null);
});

test('compact paper rows keep one-line title, metadata and actions within 72 points', () => {
  const h=host();h.panel.toggle(h.c);h.timers.shift()();
  assert.equal(h.c.mnplPaperTable.rowHeight,72);
  assert.equal(h.c.tableViewHeightForRowAtIndexPath(h.c.mnplPaperTable,{row:0}),72);
  const cell=h.c.tableViewCellForRowAtIndexPath(h.c.mnplPaperTable,{row:0});
  const labels=cell.contentView.subviews.filter(v=>typeof v.text==='string');
  assert.equal(labels.find(v=>v.text==='Author A').font,11);
  assert.equal(labels.filter(v=>v.font===13 && v.text.includes('Long paper title')).length,1);
  assert.ok(cell.contentView.subviews.filter(v=>v.action).every(v=>v.frame.y+v.frame.height<=72));
});

test('manual paper data recognition saves verified fields and refreshes the detail',async()=>{
  const h=host();h.panel.toggle(h.c);h.timers.shift()();
  h.c.tableViewDidSelectRowAtIndexPath(h.c.mnplPaperTable,{row:0});
  h.context.MNPLPaperData.lookup=()=>Promise.resolve({authors:'Verified author',year:'2024',venue:'Verified Journal',metrics:{source:'Crossref',matchedTitle:'Verified title'}});
  h.context.MNPLPaperData.merge=(current,fetched)=>fetched;
  h.c.fetchPaperData();
  await Promise.resolve();await Promise.resolve();
  assert.equal(h.saved.at(-1).metadata.authors,'Verified author');
  assert.equal(h.c.mnplDocument.venue,'Verified Journal');
  assert.equal(h.c.mnplPaperLoading,false);
});

test('detail has two tabs, no duplicate heading fields, and bibliographic editing is at the bottom', () => {
  const h = host(); h.docs[0].venue = 'Example Journal'; h.docs[0].year = '2024';
  h.panel.toggle(h.c); h.timers.shift()();
  h.c.tableViewDidSelectRowAtIndexPath(h.c.mnplPaperTable, { row: 0 });
  const detail = h.c.mnplDetail, texts = h.c.mnplDetailScroll.subviews.map(v => v.text).filter(Boolean);
  assert.deepEqual(Array.from(detail.subviews.filter(v => v.action === 'detailTab:'), v => v.title), ['文献信息', '参考文献与引文']);
  assert.equal(texts.filter(t => t === h.docs[0].title).length, 1);
  assert.equal(texts.includes('文献库标题'), false); assert.equal(texts.includes('期刊 / 来源'), false); assert.equal(texts.includes('年份'), false);
  assert.ok(detail.subviews.find(v => v.action === 'editDetail:'));
  assert.equal(h.c.mnplDetailScroll.subviews.some(v => v.action === 'editDetail:'), false);
  h.c.editDetail(); h.c.mnplInputs.venue.text = 'New venue'; h.c.mnplInputs['journal.impactFactor'].text = '4.5';
  h.c.saveEdit();
  assert.equal(h.saved[0].metadata.journal.venue, 'New venue');
  assert.equal(h.saved[0].metadata.journal.impactFactor, '4.5');
});

test('citation lists open source links and fetching errors stay in the selected section', async () => {
  const h = host();
  h.context.MNPLRelations.get = () => ({ references: { total: 1, updatedAt: '2026-10-06', cursor: null, items: [{ title: 'Referenced paper', authors: 'Author', year: '2024', venue: 'Journal', url: 'https://doi.org/10.1234/ref' }] } });
  h.context.MNPLRelations.load = () => Promise.reject(new Error('OpenAlex 429'));
  h.panel.toggle(h.c); h.timers.shift()(); h.c.tableViewDidSelectRowAtIndexPath(h.c.mnplPaperTable, { row: 0 }); h.c.detailTab({ tag: 1 });
  assert.equal(h.c.mnplTab, 'citations');
  assert.equal(h.c.mnplDetail.subviews.some(v => v.action === 'editDetail:'), false);
  h.c.openRelation({ tag: 0 }); assert.deepEqual(h.openedSources, ['https://doi.org/10.1234/ref']);
  h.c.fetchRelations({ tag: 1 }); await Promise.resolve(); await Promise.resolve();
  const texts = h.c.mnplDetailScroll.subviews.map(v => v.text).filter(Boolean);
  assert.ok(texts.includes('OpenAlex 429'));
  assert.ok(texts.includes('1. Referenced paper'));
  assert.deepEqual(h.alerts, []);
});

test('fetch abstract saves only the abstract and its attribution', async () => {
  const h = host(); h.panel.toggle(h.c); h.timers.shift()();
  h.c.tableViewDidSelectRowAtIndexPath(h.c.mnplPaperTable, { row: 0 });
  h.context.MNPLPaperData.lookup = async (doc, options) => {
    assert.equal(options.includeAbstract, true);
    return { title: 'Remote title', authors: 'Remote author', abstract: 'Original abstract', metrics: { source: 'Crossref', abstractSource: 'OpenAlex' } };
  };
  h.context.MNPLPaperData.merge = () => ({ title: 'Remote title', authors: 'Remote author' });
  h.c.fetchAbstract(); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.saved[0].metadata.abstract, 'Original abstract');
  assert.equal(h.saved[0].metadata.title, undefined); assert.equal(h.saved[0].metadata.authors, undefined);
  assert.equal(h.saved[0].metadata.metrics.abstractSource, 'OpenAlex');
  assert.equal(h.docs[0].authors, 'Author A');
});
