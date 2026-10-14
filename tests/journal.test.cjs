const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), test = require('node:test');
function host(responses = []) {
  const requests = [], timers = [], writes = [];
  const c = vm.createContext({ console, Date,
    Application:{sharedInstance:()=>({documentPath:'/docs'})},
    NSData:{dataWithContentsOfFile:()=>null},
    NSFileManager:{defaultManager:()=>({fileExistsAtPath:()=>true})},
    NSJSONSerialization:{JSONObjectWithDataOptions:d=>d, dataWithJSONObjectOptions:value=>({writeToFileAtomically:()=>{writes.push(value);return true;}})},
    NSURL:{URLWithString:value=>value}, NSMutableURLRequest:{requestWithURL:url=>({url,setHTTPMethod(){},setTimeoutInterval(){},setAllHTTPHeaderFields(){}})},
    NSOperationQueue:{mainQueue:()=>({})}, NSTimer:{scheduledTimerWithTimeInterval:(delay,_,fn)=>{timers.push(delay);fn();}},
    NSURLConnection:{sendAsynchronousRequestQueueCompletionHandler:(req,_,fn)=>{requests.push(req.url); const value=responses.shift(); fn({statusCode:()=>200},value,value instanceof Error ? value : null);}},
  });
  for(const f of ['PaperLibraryNativeValues.js','PaperLibraryBibliography.js','PaperLibraryJournalService.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',f),'utf8'),c);
  return { journal:c.MNPLJournal, bibliography:c.MNPLBibliography, requests,timers,writes };
}
const easy = {code:200,data:{officialRank:{all:{sci:'Q1',sciUp:'1区',sciif:'7.6',xr:'一区'}}}};
const oa = {results:[{id:'https://openalex.org/S123',display_name:'Tribology International',type:'journal',summary_stats:{'2yr_mean_citedness':5.4}}]};

test('parses official easyScholar fields without inventing a data year', () => {
  const h=host(), result=h.journal.parseEasyScholar(easy,'Tribology International');
  assert.equal(result.impactFactor,7.6);assert.equal(result.jcrQuartile,'Q1');assert.equal(result.year,'');assert.equal(result.source,'easyScholar');
  assert.throws(()=>h.journal.parseEasyScholar({code:40002},'x'),/密钥/);
});
test('OpenAlex matches exact journal names, never presents its metric as JCR IF', () => {
  const h=host(), result=h.journal.parseOpenAlex(oa,'Tribology International');
  assert.equal(result.impactFactor,undefined);assert.equal(result.openAlexCitedness,5.4);
  const badges=h.bibliography.badges({journal:result});assert.match(badges[0].text,/两年被引/);assert.doesNotMatch(badges[0].text,/IF/);
  assert.throws(()=>h.journal.parseOpenAlex(oa,'Tribology'),/唯一同名/);
  assert.throws(()=>h.journal.parseOpenAlex({results:[oa.results[0],oa.results[0]]},'Tribology International'),/唯一同名/);
});
test('deduplicates journal requests, caches success and never loads network at startup', async () => {
  const h=host([easy]);assert.equal(h.requests.length,0);
  h.journal.saveSettings({easyScholarKey:'test-secret'});
  const first=h.journal.lookup('Tribology International'), second=h.journal.lookup('Tribology International');
  assert.equal(first,second);const result=await first;assert.equal(result.journal.impactFactor,7.6);assert.equal(h.requests.length,1);
  await h.journal.lookup('Tribology International');assert.equal(h.requests.length,1);
});
test('falls back to OpenAlex and throttles requests after provider failure', async () => {
  const h=host([{code:40002},oa]);h.journal.saveSettings({easyScholarKey:'test-secret'});
  const result=await h.journal.lookup('Tribology International');assert.equal(result.journal.source,'OpenAlex');assert.equal(result.journal.impactFactor,null);
  assert.equal(result.warnings.length,1);assert.equal(h.requests.length,2);assert.ok(h.timers[0]>0);
});
test('failed requests are retryable and native errors cannot disclose keys', async () => {
  const h=host([new Error('https://example/?secretKey=test-secret'),easy]);h.journal.saveSettings({easyScholarKey:'test-secret',openAlex:false});
  await assert.rejects(h.journal.lookup('Nature'),e=>!e.message.includes('test-secret'));
  assert.equal((await h.journal.lookup('Nature')).journal.source,'easyScholar');
});
