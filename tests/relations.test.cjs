const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(__dirname + '/../src/PaperLibraryRelations.js', 'utf8');
function host(disk = { value: null }) {
  let now = 100000, writeFailure = false;
  const requests = [], replies = [];
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const context = vm.createContext({ Date: Clock, console,
    Application: { sharedInstance: () => ({ documentPath: '/test' }) },
    MNPLPaperData: { doi: value => String(value || '').replace(/^https:\/\/doi.org\//, ''), settings: () => ({ openAlex: true }) },
    MNPLJournal: { settings: () => ({ openAlexKey: 'test-key' }) },
    MNPLNativeValues: { plain: x => x },
    NSData: { dataWithContentsOfFile: () => disk.value && JSON.parse(disk.value) },
    NSFileManager: { defaultManager: () => ({ fileExistsAtPath: () => true }) },
    NSJSONSerialization: { JSONObjectWithDataOptions: x => x, dataWithJSONObjectOptions: x => ({ writeToFileAtomically() { if (writeFailure) return false; disk.value = JSON.stringify(x); return true; } }) },
    NSURL: { URLWithString: x => x },
    NSMutableURLRequest: { requestWithURL: url => ({ url, setHTTPMethod() {}, setTimeoutInterval() {}, setAllHTTPHeaderFields() {} }) },
    NSOperationQueue: { mainQueue: () => ({}) },
    NSTimer: { scheduledTimerWithTimeInterval(seconds, repeats, callback) { now += seconds * 1000; callback(); } },
    NSURLConnection: { sendAsynchronousRequestQueueCompletionHandler(req, queue, callback) {
      requests.push(req.url); const reply = replies.shift();
      if (!reply) throw new Error('Unexpected request');
      callback({ statusCode: () => reply.status || 200, allHeaderFields: () => reply.headers || {} }, reply.data, null);
    } },
  });
  vm.runInContext(source, context);
  return { api: context.MNPLRelations, requests, replies, disk, failWrites() { writeFailure = true; } };
}
const doc = { id: 'local-a', doi: '10.1234/a' };
const root = { results: [{ id: 'https://openalex.org/W1', doi: 'https://doi.org/10.1234/a' }] };
function paper(id) { return { id: 'https://openalex.org/W' + id, display_name: 'Paper ' + id, doi: 'https://doi.org/10.1234/' + id, publication_year: 2024, authorships: [{ author: { display_name: 'Author' } }] }; }
function page(items, cursor = null, total = items.length) { return { results: items, meta: { count: total, next_cursor: cursor } }; }

test('citation directions, cursor pagination and persistence retain distinct lists without startup requests', async () => {
  const h = host(); assert.deepEqual(Object.keys(h.api.get(doc)), []); assert.equal(h.requests.length, 0);
  h.replies.push({ data: root }, { data: page([paper(2)], 'next', 2) }, { data: page([paper(2), paper(3)], null, 2) }, { data: page([paper(4)]) });
  await h.api.load(doc, 'references', false);
  const refs = await h.api.load(doc, 'references', true);
  await h.api.load(doc, 'citations', false);
  assert.match(h.requests[1], /filter=cited_by:W1/);
  assert.match(h.requests[2], /cursor=next/);
  assert.match(h.requests[3], /filter=cites:W1/);
  assert.deepEqual(Array.from(refs.items, x => x.id), ['https://openalex.org/W2', 'https://openalex.org/W3']);
  const restored = host(h.disk);
  assert.equal(restored.api.get(doc).references.items.length, 2);
  assert.equal(restored.api.get(doc).citations.items[0].url, 'https://doi.org/10.1234/4');
  assert.equal(restored.requests.length, 0);
  assert.deepEqual(Object.keys(restored.api.get({ ...doc, doi: '10.1234/changed' })), []);
});

test('429 preserves existing lists and blocks immediate repeat requests', async () => {
  const h = host(); h.replies.push({ data: root }, { data: page([paper(2)]) });
  await h.api.load(doc, 'references', false);
  h.replies.push({ status: 429, headers: { 'Retry-After': '90' } });
  await assert.rejects(h.api.load(doc, 'references', false), /429/);
  assert.equal(h.api.get(doc).references.items.length, 1);
  const count = h.requests.length;
  await assert.rejects(h.api.load(doc, 'citations', false), /查询受限/);
  assert.equal(h.requests.length, count);
});

test('unverified identity and failed writes do not replace stored relation data', async () => {
  const h = host();
  await assert.rejects(h.api.load({ id: 'empty' }, 'references', false), /DOI/);
  assert.equal(h.requests.length, 0);
  h.replies.push({ data: { results: [{ id: 'https://openalex.org/W1', doi: '10.1234/wrong' }] } });
  await assert.rejects(h.api.load(doc, 'references', false), /唯一对应/);
  assert.equal(h.disk.value, null);
  h.replies.push({ data: root }, { data: page([paper(2)]) });
  await h.api.load(doc, 'references', false);
  h.failWrites(); h.replies.push({ data: page([paper(3)]) });
  await assert.rejects(h.api.load(doc, 'references', false), /保存失败/);
  assert.equal(h.api.get(doc).references.items[0].id, 'https://openalex.org/W2');
});
