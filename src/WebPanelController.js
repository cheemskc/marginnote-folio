var MNPLPanel = (function () {
  function rect(x,y,w,h){return {x:x,y:y,width:Math.max(0,w),height:Math.max(0,h)};}
  function respond(c,id,payload,error) {
    if(!id || c.mnplDisposed || !c.webView)return;
    const response={requestId:id,payload:payload===undefined?null:payload,error:error||null};
    c.webView.evaluateJavaScript("window.__MNPLBridgeReceive&&window.__MNPLBridgeReceive("+JSON.stringify(JSON.stringify(response))+")",function(){});
  }
  function resize(c,g,sx,sy){
    const study=c.addon.window&&Application.sharedInstance().studyController(c.addon.window);
    // Measure against the stationary host, without amplifying pointer movement.
    const p=g.translationInView(study&&study.view||c.view);
    if(g.state===1 || !c.mnplResizeStart)c.mnplResizeStart={width:c.mnplSurface.bounds.width,height:c.mnplSurface.bounds.height};
    c.mnplUserSize={width:Math.max(360,c.mnplResizeStart.width+sx*p.x),height:Math.max(420,c.mnplResizeStart.height+sy*p.y)};
    layout(c);
    if(g.state===3 || g.state===4 || g.state===5)c.mnplResizeStart=null;
  }
  const panelClass=JSB.defineClass("MNPLWebPanelController : UIViewController <UIWebViewDelegate>",{
    loadView:function(){ self.view=new UIView(rect(0,0,900,680)); },
    viewDidLoad:function(){
      const c=self;c.mnplInitialized=true;
      // A plain root UIView and a solid content container own the local page.
      c.view.backgroundColor=UIColor.clearColor();c.view.autoresizingMask=0;
      c.mnplSurface=new UIView(rect(0,0,900,680));
      c.mnplSurface.backgroundColor=UIColor.whiteColor();c.mnplSurface.layer.cornerRadius=10;
      c.mnplSurface.layer.masksToBounds=true;c.mnplSurface.autoresizingMask=0;
      c.view.addSubview(c.mnplSurface);
      c.webView=new UIWebView(rect(0,0,900,680));c.webView.delegate=c;
      c.webView.backgroundColor=UIColor.whiteColor();c.webView.opaque=true;
      c.webView.scrollView.scrollEnabled=false;c.webView.scrollView.bounces=false;
      c.webView.scalesPageToFit=false;c.webView.autoresizingMask=(1<<1|1<<4);
      c.mnplSurface.addSubview(c.webView);
      c.mnplResizeHandles=[];
      ["NW","NE","SW","SE"].forEach(function(corner){
        const grip=new UIView(rect(0,0,20,20));grip.backgroundColor=UIColor.clearColor();
        grip.addGestureRecognizer(new UIPanGestureRecognizer(c,"resize"+corner+":"));
        c.mnplSurface.addSubview(grip);c.mnplResizeHandles.push({corner:corner,view:grip});
      });
      const path=c.mainPath+"/web-dist/index.html";
      if(!NSFileManager.defaultManager().fileExistsAtPath(path))throw new Error("Folio 页面不存在，请重新安装完整插件包。");
      c.webView.loadRequest(NSURLRequest.requestWithURL(NSURL.fileURLWithPath(path)));
    },
    viewDidLayoutSubviews:function(){ layout(self); },
    resizeNW:function(g){resize(self,g,-1,-1);},
    resizeNE:function(g){resize(self,g,1,-1);},
    resizeSW:function(g){resize(self,g,-1,1);},
    resizeSE:function(g){resize(self,g,1,1);},
    viewDidDisappear:function(){
      const c=self;
      if(c.mnplVisible && !c.presentingViewController) deactivate(c);
    },
    webViewDidFinishLoad:function(){ self.mnplPageLoaded=true; },
    webViewDidFailLoadWithError:function(web,error){console.log("[MNPL] page load: "+String(error));},
    webViewShouldStartLoadWithRequestNavigationType:function(web,request){
      const c=self,url=request.URL(),scheme=String(url.scheme||"").toLowerCase();
      if(scheme!=="mnpl")return scheme==="file" || scheme==="about";
      let m;
      try{
        const absolute=String(url.absoluteString()),pos=absolute.indexOf("payload=");
        if(pos<0 || absolute.length-pos>120000)throw new Error("页面请求无效。");
        m=JSON.parse(decodeURIComponent(absolute.slice(pos+8)));
        if(!m || typeof m.command!=="string" || typeof m.requestId!=="string")throw new Error("请求格式无效。");
        const handlers=MNPLWebBridgeCommands.commands;
        if(!Object.prototype.hasOwnProperty.call(handlers,m.command))throw new Error("未知命令。");
        const id=m.requestId,result=handlers[m.command](c,m.payload||{});
        Promise.resolve(result).then(function(v){respond(c,id,v);},function(e){respond(c,id,null,{message:String(e&&e.message||e)});});
      }catch(e){respond(c,m&&m.requestId,null,{message:String(e&&e.message||e)});}
      return false;
    }
  });
  function sizeContent(c){
    if(!c.mnplSurface || !c.webView)return;
    const b=c.view.bounds;c.mnplSurface.frame=rect(0,0,b.width,b.height);c.webView.frame=rect(0,0,b.width,b.height);
    (c.mnplResizeHandles||[]).forEach(function(h){h.view.frame=rect(h.corner.endsWith("E")?b.width-20:0,h.corner.startsWith("S")?b.height-20:0,20,20);});
  }
  function create(path,addon){const c=panelClass.new();c.mainPath=path;c.addon=addon;c.mnplVisible=false;c.mnplDisposed=false;c.mnplGeneration=0;return c;}
  function layout(c){
    if(!c.mnplVisible)return;
    const study=c.addon.window&&Application.sharedInstance().studyController(c.addon.window);
    if(!study || !study.view)return;
    const b=study.view.bounds,margin=b.width<600?12:32;
    const w=Math.max(280,Math.min(c.mnplUserSize?c.mnplUserSize.width:1120,b.width-margin*2));
    const h=Math.max(320,Math.min(c.mnplUserSize?c.mnplUserSize.height:820,b.height-margin*2));
    c.preferredContentSize={width:w,height:h};sizeContent(c);
  }
  function deactivate(c){
    c.mnplGeneration++;c.mnplVisible=false;
    if(c.mnplBatch){c.mnplBatch.stop();c.mnplBatch=null;}
    const study=c.addon.window&&Application.sharedInstance().studyController(c.addon.window);if(study)study.refreshAddonCommands();
  }
  function close(c){
    const visible=c.mnplVisible;deactivate(c);
    if(visible)c.dismissViewControllerAnimatedCompletion(false,function(){});
  }
  function toggle(c){
    if(c.mnplVisible){close(c);return;}
    const study=c.addon.window&&Application.sharedInstance().studyController(c.addon.window);
    if(!study || !study.view){Application.sharedInstance().alert("请先打开一个学习界面。");return;}
    // UIKit owns presentation, sizing and input. A raw subview is treated as
    // reading chrome by the host and faded in compact/immersive layouts.
    c.modalPresentationStyle=2; // UIModalPresentationFormSheet
    c.mnplVisible=true;layout(c);
    study.presentViewControllerAnimatedCompletion(c,false,function(){layout(c);if(c.mnplPageLoaded)event(c,"mnpl-panel-show");});
  }
  function event(c,name){if(c.webView && c.mnplVisible)c.webView.evaluateJavaScript("window.dispatchEvent(new Event("+JSON.stringify(name)+"))",function(){});}
  function notifyDocumentChanged(c){event(c,"mnpl-document-changed");}
  function dispose(c){close(c);c.mnplDisposed=true;if(c.webView){c.webView.stopLoading();c.webView.delegate=null;}}
  return {create:create,layout:layout,toggle:toggle,close:close,notifyDocumentChanged:notifyDocumentChanged,dispose:dispose};
})();
