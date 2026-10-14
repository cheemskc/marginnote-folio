const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function host() {
  const timers = [], saved = [];
  const docs = [
    { id: 'a', title: 'A complete scientific paper title', authors: '', year: '', venue: '', metrics: {} },
    { id: 'b', title: 'Already identified scientific paper', authors: 'Known', year: '2024', venue: 'Journal', abstract: 'Known abstract', hasAbstract: true, journal: { jcrQuartile: 'Q1' }, metrics: { source: 'Crossref' } },
    { id: 'c', title: 'Another scientific paper title', authors: '', year: '', venue: '', metrics: {} },
  ];
  let lookup = doc => Promise.resolve({ authors: doc.id.toUpperCase(), year: '2025', venue: 'Journal', abstract: 'Known abstract', hasAbstract: true, journal: { jcrQuartile: 'Q1' }, metrics: { source: 'Crossref' } });
  const context = vm.createContext({
    NSTimer: { scheduledTimerWithTimeInterval: (_, __, fn) => timers.push(fn) },
    MNPLJournal: { settings: () => ({ easyScholar: false, openAlex: false }) },
    MNPLPaperData: {
      settings: () => ({ crossref: true, openAlex: true, overwrite: false }),
      lookup: doc => lookup(doc),
      merge: (_, fetched) => fetched,
    },
    MNPLService: {
      list(_, { offset, limit }) { return { items: docs.slice(offset, offset + limit), total: docs.length }; },
      detail() { throw new Error("Batch must not resolve notebooks"); },
      record(_, { id }) { return { ...docs.find(doc => doc.id === id) }; },
      inScope: id => id !== 'c',
      saveMetadata(_, { id, metadata }) { saved.push(id); Object.assign(docs.find(doc => doc.id === id), metadata); return docs.find(doc => doc.id === id); },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/PaperLibraryBatchLookup.js'), 'utf8'), context);
  return { batch: context.MNPLBatchLookup, timers, saved, docs, setLookup(fn) { lookup = fn; } };
}

test('batch lookup saves verified data only for eligible documents in scope', async () => {
  const h = host();
  const job = h.batch.start({}, {});
  for (let i = 0; i < 8 && h.timers.length; i++) {
    h.timers.shift()();
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(job.total, 2);
  assert.deepEqual(h.saved, ['a']);
  assert.equal(h.docs[0].authors, 'A');
  assert.equal(h.docs[2].authors, '');
});

test('stopping a batch before a response prevents saving it', async () => {
  const h = host();
  let answer;
  h.setLookup(() => new Promise(resolve => { answer = resolve; }));
  const job = h.batch.start({}, {});
  h.timers.shift()();
  job.stop();
  answer({ authors: 'Late', metrics: { source: 'Crossref' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.saved, []);
});

test('stop completes immediately and a late failure cannot advance or restart the job', async () => {
  const h=host();let rejectLookup,finished=0;
  h.setLookup(()=>new Promise((resolve,reject)=>{rejectLookup=reject;}));
  const job=h.batch.start({}, {done(){finished++;}});
  h.timers.shift()();job.stop();
  assert.equal(finished,1);assert.equal(job.stopped,true);
  rejectLookup(new Error('Network unavailable'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(job.current,0);assert.equal(job.failed,0);
  assert.equal(h.timers.length,0);assert.equal(finished,1);
});

test('batch distinguishes a missing match from a provider failure', async () => {
  const h=host();h.docs[2].id='d';
  h.setLookup(doc=>{const e=new Error(doc.id==='a'?'No unique match':'HTTP 429');e.kind=doc.id==='a'?'unmatched':'failed';return Promise.reject(e);});
  const job=h.batch.start({},{});
  for(let i=0;i<8&&h.timers.length;i++){h.timers.shift()();await new Promise(resolve => setImmediate(resolve));}
  assert.equal(job.unmatched,1);assert.equal(job.failed,1);assert.equal(job.lastError,'HTTP 429');
});

 test('candidate enumeration never opens native document details', () => {
  const h = host();
  assert.deepEqual(Array.from(h.batch.candidates({})), ['a', 'c']);
});
