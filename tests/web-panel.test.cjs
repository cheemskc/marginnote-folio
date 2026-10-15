const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function host(){
 let calls=0;const responses=[];
 class View{constructor(frame={x:0,y:0,width:1024,height:768}){this.frame=frame;this.layer={};this.subviews=[];}get bounds(){return {x:0,y:0,width:this.frame.width,height:this.frame.height};}addGestureRecognizer(g){this.gesture=g;}addSubview(v){v.superview=this;this.subviews.push(v);}removeFromSuperview(){this.superview.subviews=this.superview.subviews.filter(v=>v!==this);this.superview=null;}}
 class Web extends View{constructor(frame){super(frame);this.scrollView={};}loadRequest(r){this.request=r;}evaluateJavaScript(s){responses.push(s);}stopLoading(){this.stopped=true;}}
 const study={view:new View(),refreshAddonCommands(){},presentViewControllerAnimatedCompletion(c,animated,done){c.view.frame={x:0,y:0,...c.preferredContentSize};this.view.addSubview(c.view);c.presentingViewController=this;done();}};
 const context=vm.createContext({Promise,console,UIPanGestureRecognizer:class{constructor(target,action){this.target=target;this.action=action;}},UIView:View,UIWebView:Web,UIColor:{whiteColor:()=> 'white',clearColor:()=> 'clear'},
  NSFileManager:{defaultManager:()=>({fileExistsAtPath:()=>true})},NSURLRequest:{requestWithURL:p=>p},NSURL:{fileURLWithPath:p=>p},
  Application:{sharedInstance:()=>({studyController:()=>study,alert:()=>{}})},
  MNPLWebBridgeCommands:{commands:{probe:()=>{calls++;return {title:'Quoted "title"'};}}}
 });
 context.JSB={defineClass:(_,methods)=>({new(){const c={dismissViewControllerAnimatedCompletion(){this.view.removeFromSuperview();this.presentingViewController=null;}};let view;for(const [k,fn]of Object.entries(methods))c[k]=(...args)=>{const old=context.self;context.self=c;try{return fn(...args);}finally{context.self=old;}};Object.defineProperty(c,'view',{get(){if(!view){c.loadView();c.viewDidLoad();}return view;},set(v){view=v;}});return c;}})};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/WebPanelController.js'),'utf8'),context);
 return {panel:context.MNPLPanel,c:context.MNPLPanel.create('/plugin',{window:{}}),study,responses,calls:()=>calls};
}
test('web panel is lazy, loads local assets and lays out an opaque content WebView',()=>{
 const h=host();assert.equal(h.c.webView,undefined);h.panel.toggle(h.c);
 assert.equal(h.c.webView.request,'/plugin/web-dist/index.html');assert.equal(h.c.webView.backgroundColor,'white');assert.equal(h.c.webView.opaque,true);
 assert.equal(h.c.view.superview,h.study.view);assert.equal(h.c.mnplSurface.frame.width,960);assert.equal(h.c.webView.frame.width,960);
 assert.equal(h.calls(),0);h.study.view.frame.width=500;h.panel.layout(h.c);assert.equal(h.c.preferredContentSize.width,476);
 // UIKit applies preferredContentSize before the controller's layout callback.
 h.c.view.frame={x:0,y:0,...h.c.preferredContentSize};h.c.viewDidLayoutSubviews();assert.equal(h.c.webView.frame.width,476);
 h.panel.dispose(h.c);assert.equal(h.c.mnplVisible,false);assert.equal(h.c.webView.stopped,true);assert.equal(h.c.webView.delegate,null);
});
test('web panel intercepts only allowed commands and serializes replies safely',async()=>{
 const h=host();h.panel.toggle(h.c);
 const url={scheme:'mnpl',absoluteString:()=> 'mnpl://bridge?payload='+encodeURIComponent(JSON.stringify({command:'probe',requestId:'x',payload:{}}))};
 assert.equal(h.c.webViewShouldStartLoadWithRequestNavigationType(h.c.webView,{URL:()=>url}),false);
 await Promise.resolve();assert.equal(h.calls(),1);assert.ok(h.responses[0].includes('__MNPLBridgeReceive'));
 assert.equal(h.c.webViewShouldStartLoadWithRequestNavigationType(h.c.webView,{URL:()=>({scheme:'https'})}),false);
 assert.equal(h.c.webViewShouldStartLoadWithRequestNavigationType(h.c.webView,{URL:()=>({scheme:'file'})}),true);
});


test('all four corners resize the system panel without resetting a chosen size',()=>{
 const h=host();h.panel.toggle(h.c);assert.equal(h.c.mnplResizeHandles.length,4);
 h.c.resizeSE({state:1,translationInView:()=>({x:0,y:0})});
 h.c.resizeSE({state:2,translationInView:()=>({x:-100,y:-50})});
 assert.equal(h.c.preferredContentSize.width,760);assert.equal(h.c.preferredContentSize.height,604);
 h.panel.layout(h.c);assert.equal(h.c.preferredContentSize.width,760);
 h.c.resizeSE({state:3,translationInView:()=>({x:-100,y:-50})});assert.equal(h.c.mnplResizeStart,null);
});
