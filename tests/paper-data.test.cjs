const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const context = vm.createContext({
  Application:{sharedInstance:()=>({documentPath:'/tmp/paper-library-tests'})},
  NSData:{dataWithContentsOfFile:()=>null},
  NSFileManager:{defaultManager:()=>({fileExistsAtPath:()=>true})},
  MNPLNativeValues:{plain:value=>value},
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/PaperLibraryPaperData.js'),'utf8'),context);
const data=context.MNPLPaperData;
test('paper metadata accepts only a verified DOI or strong title and year match',()=>{
  const item={DOI:'10.1234/TEST',title:['A study of ultrasonic machining of ceramic materials'],author:[{given:'A',family:'Smith'}],issued:{'date-parts':[[2024]]},'container-title':['Journal of Materials Processing'],type:'journal-article',publisher:'Example Publisher','is-referenced-by-count':0,'references-count':12};
  const record=data.crossrefRecord(item,{doi:'10.1234/test',title:'Wrong title'});
  assert.equal(record.doi,'10.1234/TEST');
  assert.equal(record.metrics.citations,0);
  assert.equal(record.metrics.source,'Crossref');
  assert.equal(data.crossrefRecord(item,{doi:'',title:'Completely different study about materials',year:'2024'}),null);
  assert.equal(data.crossrefRecord(item,{doi:'',title:item.title[0],year:'2020'}),null);
  assert.ok(data.crossrefRecord(item,{doi:'',title:item.title[0],year:'2024'}));
});
test('metadata merge preserves manual fields by default and keeps source provenance',()=>{
  const fetched={title:'Canonical title',authors:'Fetched',year:'2024',venue:'New Journal',doi:'10.1234/new',metrics:{type:'journal-article',citations:0,source:'Crossref',matchedTitle:'New title',updatedAt:'2026-10-04'}};
  const current={title:'Filename title',metadataTitle:'',authors:'Manual',year:'',venue:'My Journal',doi:'',metrics:{type:'',citations:null,source:'Old'}};
  const patch=data.merge(current,fetched,false);
  assert.equal(patch.authors,undefined);
  assert.equal(patch.venue,undefined);
  assert.equal(patch.year,'2024');
  assert.equal(patch.title,'Canonical title');
  assert.equal(patch.metrics.citations,0);
  assert.equal(patch.metrics.source,'Crossref');
  assert.equal(data.merge(current,fetched,true).authors,'Fetched');
});
test('DOI extraction works from URL and file names',()=>{
  assert.equal(data.doi('https://doi.org/10.1016/j.matprotec.2024.123456'),'10.1016/j.matprotec.2024.123456');
  assert.equal(data.doi('Study 10.1234/abc.pdf'),'10.1234/abc');
});

test('structured truncated filenames need corroborating year and authors',()=>{
  const requested=data.identity({title:'2016_Modeling analysis of contactless power transfer sy_X. Wang and A. Wang.pdf'});
  assert.equal(requested.title,'Modeling analysis of contactless power transfer sy');
  assert.equal(requested.year,'2016');
  const item={DOI:'10.4028/www.scientific.net/amm.829.35',title:['Modeling Analysis of Contactless Power Transfer System for Rotary Ultrasonic Machining'],author:[{given:'X',family:'Wang'},{given:'A',family:'Wang'}],issued:{'date-parts':[[2016]]}};
  assert.ok(data.crossrefRecord(item,requested));
  assert.equal(data.crossrefRecord(item,{...requested,year:'2024'}),null);
  assert.equal(data.crossrefRecord(item,{...requested,authorHint:'A. Smith'}),null);
  assert.equal(data.crossrefRecord(item,{...requested,allowPartial:false}),null);
  assert.equal(data.identity({title:'2024_Canonical_title',metadataTitle:'2024_Canonical_title'}).title,'2024_Canonical_title');
});
test('lookup uses a DOI first, accepts verified Crossref data and does no startup request',async()=>{
  let requests=0;
  const response={message:{DOI:'10.1234/abc',title:['Verified paper title'],author:[{given:'Ada',family:'Lovelace'}],issued:{'date-parts':[[2023]]},'container-title':['Example Journal'],type:'journal-article',publisher:'Example'}};
  const native=vm.createContext({
    Application:{sharedInstance:()=>({documentPath:'/tmp/paper-library-tests'})},
    NSData:{dataWithContentsOfFile:()=>null},
    MNPLNativeValues:{plain:value=>value},
    NSJSONSerialization:{JSONObjectWithDataOptions:value=>value},
    NSURL:{URLWithString:url=>url},
    NSMutableURLRequest:{requestWithURL:url=>({url,setHTTPMethod(){},setTimeoutInterval(){},setAllHTTPHeaderFields(){}})},
    NSOperationQueue:{mainQueue:()=>({})},
    NSURLConnection:{sendAsynchronousRequestQueueCompletionHandler(req,queue,callback){requests++;assert.match(req.url,/crossref.org\/works\/10.1234%2Fabc/);callback({statusCode:()=>200},response,null);}},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/PaperLibraryPaperData.js'),'utf8'),native);
  assert.equal(requests,0);
  const result=await native.MNPLPaperData.lookup({doi:'10.1234/abc',title:'Unrelated local title'});
  assert.equal(requests,1);
  assert.equal(result.authors,'Ada Lovelace');
  assert.equal(result.metrics.matchedTitle,'Verified paper title');
});

test('stopping after Crossref starts prevents the OpenAlex fallback request',async()=>{
  let requests=0,complete,stopped=false;
  const native=vm.createContext({
    Application:{sharedInstance:()=>({documentPath:'/tmp/paper-library-tests'})},
    NSData:{dataWithContentsOfFile:()=>null},MNPLNativeValues:{plain:value=>value},
    NSJSONSerialization:{JSONObjectWithDataOptions:value=>value},
    NSURL:{URLWithString:url=>url},NSMutableURLRequest:{requestWithURL:url=>({url,setHTTPMethod(){},setTimeoutInterval(){},setAllHTTPHeaderFields(){}})},
    NSOperationQueue:{mainQueue:()=>({})},MNPLJournal:{settings:()=>({openAlexKey:''})},
    NSURLConnection:{sendAsynchronousRequestQueueCompletionHandler(req,queue,callback){requests++;complete=callback;}},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/PaperLibraryPaperData.js'),'utf8'),native);
  const result=native.MNPLPaperData.lookup({title:'A sufficiently complete scientific paper title'}, {cancelled:()=>stopped});
  await Promise.resolve();stopped=true;complete({statusCode:()=>200},{message:{items:[]}},null);
  await assert.rejects(result,e=>e.kind==='cancelled');
  assert.equal(requests,1);
});

test('explicit abstract lookup supplements a verified Crossref record without replacing its bibliographic fields', async () => {
  for (const status of [200, 429, "europe-pmc"]) {
    const requests = [];
    const native = vm.createContext({
      Application: { sharedInstance: () => ({ documentPath: '/test' }) }, NSData: { dataWithContentsOfFile: () => null },
      MNPLNativeValues: { plain: x => x }, NSJSONSerialization: { JSONObjectWithDataOptions: x => x },
      MNPLJournal: { settings: () => ({ openAlexKey: '' }) }, NSURL: { URLWithString: x => x },
      NSMutableURLRequest: { requestWithURL: url => ({ url, setHTTPMethod() {}, setTimeoutInterval() {}, setAllHTTPHeaderFields() {} }) },
      NSOperationQueue: { mainQueue: () => ({}) },
      NSURLConnection: { sendAsynchronousRequestQueueCompletionHandler(req, queue, done) {
        requests.push(req.url);
        if (requests.length === 1) done({ statusCode: () => 200 }, { message: { DOI: '10.1234/a', title: ['Verified title'], author: [{ family: 'Crossref author' }] } }, null);
        else if (req.url.startsWith('https://www.ebi.ac.uk/')) done({ statusCode: () => 200 }, { resultList: { result: status === 'europe-pmc' ? [{ doi: '10.1234/a', abstractText: '<p>European abstract</p>' }] : [] } }, null);
        else done({ statusCode: () => status }, { results: [{ id: 'https://openalex.org/W1', doi: 'https://doi.org/10.1234/a', display_name: 'Other display title', abstract_inverted_index: { Original: [0], abstract: [1] } }] }, null);
      } },
    });
    vm.runInContext(fs.readFileSync(__dirname + '/../src/PaperLibraryPaperData.js', 'utf8'), native);
    const record = await native.MNPLPaperData.lookup({ doi: '10.1234/a' }, { includeAbstract: true });
    assert.match(requests[1], /europepmc/);
    assert.equal(requests.length, status === 'europe-pmc' ? 2 : 3);
    if (status !== 'europe-pmc') assert.match(requests[2], /filter=doi:10.1234%2Fa/);
    assert.equal(record.authors, 'Crossref author'); assert.equal(record.metrics.source, 'Crossref');
    if (status === 200) { assert.equal(record.abstract, 'Original abstract'); assert.equal(record.metrics.abstractSource, 'OpenAlex'); }
    else if (status === 'europe-pmc') { assert.equal(record.abstract, 'European abstract'); assert.equal(record.metrics.abstractSource, 'Europe PMC'); }
    else { assert.equal(record.abstract, ''); assert.match(record.abstractLookupError, /429/); }
  }
});

test('keeping a manually written abstract also keeps its source attribution', () => {
  const patch = data.merge({ abstract: 'Manual text', metrics: { abstractSource: '手动编辑' } }, { abstract: 'Fetched text', metrics: { abstractSource: 'OpenAlex' } }, false);
  assert.equal(patch.abstract, undefined); assert.equal(patch.metrics.abstractSource, undefined);
});
