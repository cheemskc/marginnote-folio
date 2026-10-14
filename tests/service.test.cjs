const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function nativeArray(items) {
  return { count: () => items.length, objectAtIndex: (index) => items[index] };
}

function host(options = {}) {
  const documents = options.documents || [
    { docMd5: "alpha", docTitle: "Alpha Paper", pageCount: 12, pathFile: "a.pdf", currentTopicId: "notebook-1" },
    { docMd5: "beta", docTitle: "Beta Paper", pageCount: 20, pathFile: "b.epub", currentTopicId: "" },
  ];
  const notebooks = [{ topicId: "notebook-1", title: "研究", mainDocMd5: "alpha", documents: nativeArray([documents[0]]) }];
  const calls = [];
  const stats = { allDocuments: 0, directoryReads: 0, directoryChecks: 0, maxBatchChecks: 0, timerBatches: 0 };
  let saved = options.saved || null;
  const defaults = options.defaults || {};
  const folders = options.folders || { "/docs": [] };
  const db = {
    allDocuments: () => { stats.allDocuments += 1; return nativeArray(documents); },
    getDocumentById: (id) => documents.find((doc) => doc.docMd5 === id),
    allNotebooks: () => { if (options.forbidNotebookReads) throw new Error("Notebook enumeration on selection"); return nativeArray(notebooks); },
    getNotebookById: (id) => { if (options.forbidNotebookReads) throw new Error("Notebook lookup on selection"); return notebooks.find((book) => book.topicId === id); },
  };
  const study = {
    readerController: { currentDocumentController: { document: documents[0], notebookId: "notebook-1", currPageNo: 4 } },
    openNotebookAndDocument: (...args) => calls.push(args),
  };
  const context = vm.createContext({
    Database: { sharedInstance: () => db },
    Application: { sharedInstance: () => ({ studyController: () => study, documentPath: "/docs" }) },
    NSFileManager: { defaultManager: () => ({
      fileExistsAtPath: () => Boolean(saved), createDirectoryAtPathWithIntermediateDirectoriesAttributes: () => true,
      isDirectoryAtPath: (path) => { stats.directoryChecks += 1; return Object.hasOwn(folders, path); },
      contentsOfDirectoryAtPath: (path) => { stats.directoryReads += 1; return nativeArray(folders[path] || []); },
    }) },
    NSUserDefaults: { standardUserDefaults: () => ({ stringForKey: (key) => defaults[key], setObjectForKey: (value, key) => { defaults[key] = value; } }) },
    NSData: { dataWithContentsOfFile: () => saved ? { length: 1, value: saved, writeToFileAtomically: () => true } : null },
    NSJSONSerialization: {
      JSONObjectWithDataOptions: (data) => data.value,
      dataWithJSONObjectOptions: (value) => {
        if (options.throwOnSerialize) throw new Error("serialization failed");
        return { writeToFileAtomically: () => {
          if (options.failWrite) return false;
          saved = structuredClone(value); return true;
        } };
      },
    },
    NSTimer: { scheduledTimerWithTimeInterval: (interval, repeats, block) => setImmediate(() => {
      const before = stats.directoryChecks; stats.timerBatches += 1;
      block(); stats.maxBatchChecks = Math.max(stats.maxBatchChecks, stats.directoryChecks - before);
    }) },
    console,
  });
  for (const file of ["PaperLibraryNativeValues.js", "PaperLibraryBibliography.js", "PaperLibraryMetadataStore.js", "PaperLibraryFolders.js", "PaperLibraryService.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file), "utf8"), context, { filename: file });
  }
  return { service: context.MNPLService, addon: { window: {} }, calls, readSaved: () => saved, defaults, stats };
}

test("lists the whole MarginNote library and current document", () => {
  const { service, addon } = host();
  const result = service.list(addon, { query: "beta", offset: 0, limit: 60 });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, "beta");
  assert.equal(result.currentId, "alpha");
  assert.equal(service.currentDocument(addon).currentPage, 4);
});

test("opens a linked document and explains when no notebook exists", () => {
  const { service, addon, calls } = host();
  service.open(addon, { id: "alpha" });
  assert.deepEqual(calls, [["notebook-1", "alpha"]]);
  assert.throws(() => service.open(addon, { id: "beta" }), { code: "NO_NOTEBOOK" });
});

test("saves bibliographic metadata and projects it into list and detail", () => {
  const { service, addon, readSaved } = host();
  const detail = service.saveMetadata(addon, { id: "alpha", metadata: {
    authors: "Ada · Bo", year: "2024", venue: "Nature", quartile: "Q1", rating: 5,
    abstract: "A short abstract.", doi: "10.1234/example",
  } });
  assert.equal(detail.authors, "Ada · Bo");
  assert.equal(service.list(addon, { query: "Nature" }).items[0].quartile, "Q1");
  const reloaded = host({ saved: readSaved() });
  assert.equal(reloaded.service.detail(reloaded.addon, { id: "alpha" }).rating, 5);
  assert.throws(() => service.saveMetadata(addon, { id: "alpha", metadata: { rating: 6 } }), { code: "INVALID_METADATA" });
});

test("failed writes and serialization preserve the last saved metadata", () => {
  for (const failure of ["failWrite", "throwOnSerialize"]) {
    const options = {};
    const { service, addon, readSaved } = host(options);
    service.saveMetadata(addon, { id: "alpha", metadata: { rating: 4, authors: "Original author" } });
    options[failure] = true;
    assert.throws(() => service.saveMetadata(addon, { id: "alpha", metadata: { rating: 1 } }), { code: "STORE_WRITE_FAILED" });
    assert.equal(service.detail(addon, { id: "alpha" }).rating, 4);
    assert.equal(readSaved().records.alpha.authors, "Original author");
  }
});

test("library title can differ from native title without replacing native identifiers", () => {
  const { service, addon } = host({ saved: { schemaVersion: 1, records: {
    alpha: { id: "beta", title: "Wrong title", notebookId: "wrong", rating: 3 },
  } } });
  const detail = service.detail(addon, { id: "alpha" });
  assert.equal(detail.id, "alpha");
  assert.equal(detail.title, "Wrong title");
  assert.equal(detail.nativeTitle, "Alpha Paper");
  assert.equal(detail.notebookId, "notebook-1");
  assert.equal(detail.rating, 3);
});

function folderHost() {
  const documents = [
    { docMd5: "alpha", docTitle: "Alpha", pathFile: "文献/模型/a.pdf" },
    { docMd5: "beta", docTitle: "Beta", pathFile: "文献/综述/b.pdf" },
    { docMd5: "other", docTitle: "Other", pathFile: "文献备份/c.pdf" },
    { docMd5: "root", docTitle: "Root", pathFile: "文献/d.pdf" },
  ];
  const folders = { "/docs": ["文献", "文献备份", "com.azeedel.marginnote.paper-library"], "/docs/文献": ["模型", "综述", "空目录"],
    "/docs/文献/模型": [], "/docs/文献/综述": [], "/docs/文献/空目录": [], "/docs/文献备份": [],
    "/docs/com.azeedel.marginnote.paper-library": [] };
  const defaults = {};
  return { ...host({ documents, folders, defaults }), documents, folders };
}

test("folder tree includes empty folders and recursive counts, without plugin storage", async () => {
  const { service } = folderHost();
  const result = await service.folders();
  assert.equal(result.folders.find((folder) => folder.path === "文献").count, 3);
  assert.equal(result.folders.find((folder) => folder.path === "文献/空目录").count, 0);
  assert.equal(result.folders.find((folder) => folder.path === "文献/综述").parentPath, "文献");
  assert.equal(result.folders.some((folder) => folder.path.startsWith("com.azeedel")), false);
});

test("chosen root persists and parent filters include descendants with path boundaries", () => {
  const { service, addon, defaults, documents, folders } = folderHost();
  service.setRootFolder(addon, { path: "文献" });
  assert.equal(service.list(addon, {}).total, 3);
  assert.equal(service.inScope('alpha'), true);
  assert.equal(service.inScope('other'), false);
  assert.equal(service.inScope('beta', '文献/模型'), false);
  assert.equal(service.list(addon, { folderPath: "文献/模型" }).items[0].id, "alpha");
  assert.equal(service.list(addon, { folderPath: "文献/空目录" }).total, 0);
  assert.throws(() => service.list(addon, { folderPath: "文献备份" }), { code: "INVALID_FOLDER" });
  assert.throws(() => service.setRootFolder(addon, { path: "../外部" }), { code: "INVALID_FOLDER" });
  assert.throws(() => service.setRootFolder(addon, { path: "不存在" }), { code: "FOLDER_NOT_FOUND" });
  const reloaded = host({ defaults, documents, folders });
  assert.equal(reloaded.service.folders({ quick: true }).rootPath, "文献");
  assert.equal(reloaded.service.list(reloaded.addon, {}).total, 3);
});

test("moving a document updates its folder and retains its bibliographic metadata", () => {
  const { service, addon, documents } = folderHost();
  service.saveMetadata(addon, { id: "alpha", metadata: { rating: 5, authors: "Original" } });
  service.setRootFolder(addon, { path: "文献" });
  documents[0].pathFile = "文献/综述/a.pdf";
  service.folders({ quick: true, refresh: true });
  assert.equal(service.list(addon, { folderPath: "文献/模型" }).total, 0);
  const moved = service.list(addon, { folderPath: "文献/综述", query: "Original" }).items[0];
  assert.equal(moved.id, "alpha"); assert.equal(service.detail(addon, { id: moved.id }).rating, 5);
  assert.equal(service.folders({ quick: true }).folders.find((folder) => folder.path === "文献/综述").count, 2);
});

test("unlocated external documents stay in all documents but cannot leak into a chosen root", () => {
  const { service, addon, documents } = folderHost();
  documents.push({ docMd5: "outside", docTitle: "Outside", pathFile: "/elsewhere/a.pdf" });
  assert.equal(service.folders({ quick: true }).unlocatedCount, 1);
  assert.equal(service.list(addon, {}).total, 5);
  service.setRootFolder(addon, { path: "文献" });
  assert.equal(service.list(addon, {}).total, 3);
});

test("favorite persists independently of rating and partial metadata edits", () => {
  const { service, addon, readSaved } = host();
  service.saveMetadata(addon, { id: "alpha", metadata: { authors: "Ada", rating: 4, metrics: { citations: 0, references: 28, source: "Example database" } } });
  service.setFavorite(addon, { id: "alpha", favorite: true });
  service.saveMetadata(addon, { id: "alpha", metadata: { venue: "Nature", metrics: { publisher: "Example publisher" } } });
  const reloaded = host({ saved: readSaved() });
  const record = reloaded.service.detail(reloaded.addon, { id: "alpha" });
  assert.equal(record.favorite, true); assert.equal(record.rating, 4); assert.equal(record.authors, "Ada");
  assert.equal(record.metrics.citations, 0); assert.equal(record.metrics.references, 28);
  assert.equal(record.metrics.source, "Example database"); assert.equal(record.metrics.publisher, "Example publisher");
  service.setFavorite(addon, { id: "alpha", favorite: false });
  assert.equal(service.list(addon, {}).items[0].favorite, false);
  service.saveMetadata(addon, { id: "alpha", metadata: { metrics: { citations: " " } } });
  assert.equal(service.detail(addon, { id: "alpha" }).metrics.citations, null);
});

test("invalid data and failed favorite writes preserve existing records", () => {
  const options = {};
  const { service, addon, readSaved } = host(options);
  service.saveMetadata(addon, { id: "alpha", metadata: { rating: 5, metrics: { citations: 12 } } });
  for (const metadata of [{ favorite: "yes" }, { metrics: { citations: -1 } }, { metrics: { references: 1.5 } }, { metrics: [] }, { metrics: { sourceUrl: "javascript:alert(1)" } }]) {
    assert.throws(() => service.saveMetadata(addon, { id: "alpha", metadata }), { code: "INVALID_METADATA" });
  }
  assert.throws(() => service.setFavorite(addon, { id: "alpha", favorite: 1 }), { code: "INVALID_METADATA" });
  options.failWrite = true;
  assert.throws(() => service.setFavorite(addon, { id: "alpha", favorite: true }), { code: "STORE_WRITE_FAILED" });
  assert.equal(service.detail(addon, { id: "alpha" }).favorite, false);
  assert.equal(readSaved().records.alpha.metrics.citations, 12);
});

test("startup lists documents without walking folders, shares one index, and bounds background work", async () => {
  const folders = { "/docs": [...Array.from({ length: 1353 }, (_, i) => `paper-${i}.pdf`), "Empty"], "/docs/Empty": [] };
  const { service, addon, stats } = host({ folders });
  const quick = service.folders({ quick: true, refresh: true });
  assert.equal(quick.folders[0].count, 2);
  assert.equal(stats.directoryReads, 0);
  const first = service.list(addon, {});
  service.list(addon, { query: "Alpha" });
  service.list(addon, { sort: "title-desc" });
  assert.equal(first.items.length, 2);
  assert.equal(stats.allDocuments, 1);
  const scan = service.folders();
  const sameScan = service.folders();
  assert.equal(stats.directoryReads, 0, "scan must yield before touching directories");
  await scan; const result = await sameScan;
  assert.equal(result.folders.find((folder) => folder.path === "Empty").count, 0);
  assert.equal(stats.directoryReads, 2, "concurrent callers share one filesystem walk");
  assert.ok(stats.timerBatches > 1);
  assert.ok(stats.maxBatchChecks <= 32);
  assert.equal(stats.allDocuments, 1);
  service.folders({ quick: true, refresh: true });
  service.list(addon, {});
  assert.equal(stats.allDocuments, 2, "explicit refresh rebuilds the index once");
});

test("list responses omit abstracts and metrics while details preserve them", () => {
  const { service, addon } = host();
  service.saveMetadata(addon, { id: "alpha", metadata: { abstract: "x".repeat(12000), metrics: { citations: 100 }, authors: "Ada" } });
  const list = service.list(addon, { query: "Ada" });
  assert.equal(list.items[0].abstract, undefined);
  assert.equal(list.items[0].metrics, undefined);
  const detail = service.detail(addon, { id: "alpha" });
  assert.equal(detail.abstract.length, 12000);
  assert.equal(detail.metrics.citations, 100);
});

test('catalogue-linked folders can be selected without a local directory, but invented paths cannot', () => {
  const documents = [{ docMd5: 'linked', docTitle: 'Linked', pathFile: '$$$MNDOCLINK$$$zotero attachments/超声加工/专题/paper.pdf' }];
  const { service, addon } = host({ documents });
  const root = '$$$MNDOCLINK$$$zotero attachments/超声加工';
  service.setRootFolder(addon, { path: root });
  assert.equal(service.folders({ quick: true }).rootExists, true);
  assert.equal(service.list(addon, {}).items[0].id, 'linked');
  assert.equal(service.list(addon, { folderPath: root + '/专题' }).total, 1);
  assert.throws(() => service.setRootFolder(addon, { path: root + '/不存在' }), { code: 'FOLDER_NOT_FOUND' });
});

test('type and favorite filters compose, while year and IF sorts leave missing values last', () => {
  const documents = ['a','b','c','d'].map(id => ({ docMd5: id, docTitle: id, pathFile: id + '.pdf' }));
  const { service, addon } = host({ documents });
  service.saveMetadata(addon, { id: 'a', metadata: { year: '2025', favorite: true, metrics: { type: 'journalArticle' }, journal: { impactFactor: 7.6, jcrQuartile: 'Q1' } } });
  service.saveMetadata(addon, { id: 'b', metadata: { year: '2023', metrics: { type: 'dissertation' }, journal: { impactFactor: 0 } } });
  service.saveMetadata(addon, { id: 'd', metadata: { metrics: { type: 'patent' } } });
  const ids = options => Array.from(service.list(addon, options).items, d => d.id);
  assert.deepEqual(ids({sort:'year-desc'}), ['a','b','c','d']);
  assert.deepEqual(ids({sort:'year-asc'}), ['b','a','c','d']);
  assert.deepEqual(ids({sort:'if-desc'}), ['a','b','c','d']);
  assert.deepEqual(ids({itemType:'journal-article',favoritesOnly:true}), ['a']);
  assert.deepEqual(ids({itemType:'thesis',favoritesOnly:true}), []);
  assert.deepEqual(ids({itemTypes:['journal-article','thesis']}), ['a','b']);
  assert.deepEqual(ids({itemTypes:['journal-article','thesis'],favoritesOnly:true}), ['a']);
  assert.equal(service.list(addon, {itemType:'unknown'}).items[0].id, 'c', 'a PDF is not automatically a journal article');
});

test('journal metadata patches preserve provenance, accept zero and reject invalid values', () => {
  const { service, addon, readSaved } = host();
  service.saveMetadata(addon, { id:'alpha', metadata: { rating:5, journal:{impactFactor:0,jcrQuartile:'Q1',year:'2025',source:'easyScholar'} } });
  service.saveMetadata(addon, { id:'alpha', metadata: { journal:{casQuartile:'1区'} } });
  const journal = service.list(addon, {}).items[0].journal;
  assert.equal(journal.impactFactor, 0); assert.equal(journal.source, 'easyScholar'); assert.equal(journal.casQuartile, '1区');
  assert.equal(readSaved().records.alpha.rating, 5, 'legacy ratings remain stored without becoming journal metrics');
  assert.throws(() => service.saveMetadata(addon, { id:'alpha', metadata: { journal:{impactFactor:-1} } }), {code:'INVALID_METADATA'});
});

test('explicit bibliography types and unambiguous title suffixes select native icons', () => {
  const documents = [{docMd5:'patent',docTitle:'一种电能传输装置_专利',pathFile:'patent.pdf'},
    {docMd5:'thesis',docTitle:'超声加工博士学位论文',pathFile:'thesis.pdf'},
    {docMd5:'ambiguous',docTitle:'Acoustic study',pathFile:'acoustic.pdf'}];
  const {service,addon}=host({documents});
  service.saveMetadata(addon,{id:'ambiguous',metadata:{metrics:{type:'conference-paper'}}});
  const items=service.list(addon,{}).items;
  assert.equal(items.find(x=>x.id==='patent').itemType,'patent');
  assert.equal(items.find(x=>x.id==='thesis').itemType,'thesis');
  assert.equal(items.find(x=>x.id==='ambiguous').itemType,'conference-paper');
});


test("background metadata reads and saves do not load page counts or notebook relations", () => {
  const doc = { docMd5: 'safe', docTitle: 'Safe paper', pathFile: 'safe.pdf', currentTopicId: '' };
  Object.defineProperty(doc, 'pageCount', { get() { throw new Error('Expensive page count read'); } });
  const h = host({ documents: [doc] });
  assert.equal(h.service.record(h.addon, { id: 'safe' }).title, 'Safe paper');
  const saved = h.service.saveMetadata(h.addon, { id: 'safe', metadata: { abstract: 'Saved abstract' }, background: true });
  assert.equal(saved.abstract, 'Saved abstract');
  assert.equal(saved.notebookTitle, undefined);
});

 test("selecting a paper and saving its metadata never reads notebook membership or PDF page counts", () => {
  const doc = { docMd5: 'select', docTitle: 'Selected paper', pathFile: 'select.pdf', currentTopicId: '' };
  Object.defineProperty(doc, 'pageCount', { get() { throw new Error('Page count during selection'); } });
  const h = host({ documents: [doc], forbidNotebookReads: true });
  assert.equal(h.service.detail(h.addon, { id: 'select' }).title, 'Selected paper');
  assert.equal(h.service.saveMetadata(h.addon, { id: 'select', metadata: { abstract: 'An abstract' } }).abstract, 'An abstract');
});
