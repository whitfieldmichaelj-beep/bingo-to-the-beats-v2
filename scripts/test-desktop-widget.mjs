import assert from 'node:assert/strict';
import { readFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function compile(file){return ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;}
const snapshot={};vm.runInNewContext(compile('lib/dj-widget/snapshot.ts'),{exports:snapshot,Number,Date});
const data=snapshot.widgetSnapshot({claimConnectionLost:true,gameCode:'SAMPLE',gameStatus:'READY',mode:'compact',connection:'connected',providerName:'VirtualDJ',providerConnected:true,progress:123,secondsRemaining:-2,track:{name:'<Song>',artist:'Artist'},players:[{playerName:'Tester',connected:true,cardNumbers:[2,-1,'3'],cardQuantity:1,paymentStatus:'PAID',cardIds:['secret-card']}],claim:{id:'claim',playerName:'Tester',cardNumber:2,winningSquares:['private']}},123);
assert.equal(data.claimConnectionLost,true);assert.equal(data.progress,100);assert.equal(data.secondsRemaining,0);assert.equal(data.updatedAt,123);assert.equal(data.track.name,'<Song>');assert.equal(data.players[0].cardNumbers.join(','),'2');assert.equal(data.players[0].cardIds,undefined);assert.equal(data.claim.winningSquares,undefined);
const access={};vm.runInNewContext(compile('lib/dj-widget/local-access.ts'),{exports:access,URL});
const request=(host='localhost:3010',origin='http://localhost:3010')=>({url:'http://localhost:3010/api/dj-widget',headers:new Headers({host,origin,'content-type':'application/json'})});
assert.equal(access.localWidgetRequest(request()),true);
for(const req of [request('192.168.1.2:3010','http://192.168.1.2:3010'),request('localhost:3010','https://evil.example'),request('localhost.evil.example:3010'),request('user@localhost:3010')])assert.equal(access.localWidgetRequest(req),false);
console.log('PASS desktop snapshots: only display fields, bounded values; local same-origin requests only');

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'bttb-widget-test-'));
try{
 const runtime=path.join(temp,'.bttb-widget');await fs.mkdir(path.join(runtime,'dist'),{recursive:true});await fs.writeFile(path.join(runtime,'dist','index.html'),'test');
 await fs.mkdir(path.join(temp,'node_modules/electron/dist'),{recursive:true});await fs.writeFile(path.join(temp,'node_modules/electron/path.txt'),'electron');await fs.writeFile(path.join(temp,'node_modules/electron/dist/electron'),'test');
 let spawned=0,envUsed;
 const session={};
 vm.runInNewContext(compile('lib/dj-widget/session.ts'),{exports:session,process:{cwd:()=>temp,env:{PATH:'/bin',CLERK_SECRET_KEY:'must-not-leak',DATABASE_URL:'must-not-leak'}},setTimeout,Date,Promise,
 require:id=>id==='./snapshot'?snapshot:id==='node:child_process'?{spawn:(_exe,args,options)=>{spawned++;envUsed=options.env;const child=new EventEmitter();child.unref=()=>{};fs.writeFile(path.join(args[1],'widget.json'),JSON.stringify({closed:false,ready:true,updatedAt:Date.now()})).then(()=>child.emit('spawn'));return child;}}:require(id)});
 const clientId=randomUUID();const input={action:'start',clientId,gameId:'game',snapshot:data};
 const first=await session.serializedWidgetSession('host',input);assert.equal(spawned,1);assert.equal(envUsed.CLERK_SECRET_KEY,undefined);assert.equal(envUsed.DATABASE_URL,undefined);
 const duplicate=await session.serializedWidgetSession('host',input);assert.equal(duplicate.id,first.id);assert.equal(spawned,1);
 await assert.rejects(session.serializedWidgetSession('other-host',input),/another host/);
 await assert.rejects(session.serializedWidgetSession('other-host',{action:'update',id:first.id,clientId,snapshot:data}),/not found/);
 await assert.rejects(session.serializedWidgetSession('host',{action:'update',id:'../../private',clientId,snapshot:data}),/Invalid/);
 const directory=path.join(runtime,'sessions',first.id);
 await fs.writeFile(path.join(directory,'command.json'),JSON.stringify({id:'mode',type:'mode',value:'standard'}));
 const update=await session.serializedWidgetSession('host',{action:'update',id:first.id,clientId,snapshot:data});assert.equal(update.command.type,'mode');
 await session.serializedWidgetSession('host',{action:'close',id:first.id,clientId});assert.equal(JSON.parse(await fs.readFile(path.join(directory,'snapshot.json'),'utf8')).closed,true);
 const lateUpdate=await session.serializedWidgetSession('host',{action:'update',id:first.id,clientId,snapshot:data});assert.equal(lateUpdate.closed,true,'A late update must not resurrect a closed widget');assert.equal(JSON.parse(await fs.readFile(path.join(directory,'snapshot.json'),'utf8')).closed,true);
 const reopened=await session.serializedWidgetSession('host',input);assert.notEqual(reopened.id,first.id,'Reopening immediately after close starts a new display even before the old heartbeat stops');assert.equal(spawned,2);
 console.log('PASS desktop sessions: one window, host ownership, no credentials, mode reply, safe close, no database writes');
}finally{await fs.rm(temp,{recursive:true,force:true});}

// Test the native window options on both OS branches without opening a window.
for(const platform of ['darwin','win32']){
 const handlers=new Map(),ipc=new Map(),files=new Map(),webEvents=new Map();let options,allSpaces=false,top=false,shown=false,hidden=false;
 const root=path.resolve('/fixture');const dir=path.join(root,'.bttb-widget','sessions',randomUUID());files.set(path.join(dir,'snapshot.json'),JSON.stringify(data));
 const webContents={send:(channel,payload)=>{assert.equal(channel,'snapshot');assert.equal(payload.gameCode,'SAMPLE');},setWindowOpenHandler:f=>assert.equal(f().action,'deny'),on:(type,handler)=>webEvents.set(type,handler),session:{setPermissionRequestHandler:()=>{},webRequest:{onBeforeRequest:()=>{}}}};
 class Window{constructor(o){options=o;this.webContents=webContents;}setMenu(){}setAlwaysOnTop(v){top=v;}setVisibleOnAllWorkspaces(){allSpaces=true;}isAlwaysOnTop(){return top;}getBounds(){return{x:10,y:20,width:1180,height:180}}setBounds(){}on(){}async loadURL(){}showInactive(){shown=true}hide(){hidden=true}}
 const app={setName(){},setPath(){},commandLine:{appendSwitch(){}},on:(k,v)=>handlers.set(k,v),dock:{hide(){}},whenReady:()=>Promise.resolve(),quit(){handlers.get('before-quit')?.();}};
 vm.runInNewContext(readFileSync('native/dj-widget/main.cjs','utf8'),{__dirname:path.join(root,'native/dj-widget'),process:{argv:['electron','main',dir],platform,pid:99,exit:()=>{throw Error('Unexpected exit')}},console,setInterval:()=>1,clearInterval(){},Date,Number,
 require:id=>id==='electron'?{app,BrowserWindow:Window,ipcMain:{on:(k,v)=>ipc.set(k,v)},screen:{getCursorScreenPoint:()=>({x:0,y:0}),getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1440,height:900}})},powerSaveBlocker:{start:()=>1,isStarted:()=>true,stop(){}}}:id==='node:fs'?{readFileSync:f=>{if(!files.has(f))throw Error('missing');return files.get(f)},writeFileSync:(f,v)=>files.set(f,v),renameSync:(a,b)=>files.set(b,files.get(a))}:require(id)});
 await new Promise(r=>setImmediate(r));assert.equal(options.frame,false);assert.equal(options.alwaysOnTop,true);assert.equal(options.webPreferences.sandbox,true);assert.equal(options.webPreferences.nodeIntegration,false);assert.equal(shown,true);assert.equal(allSpaces,platform==='darwin');
 ipc.get('widget')({sender:webContents},{type:'ready'});
 ipc.get('widget')({sender:webContents},{type:'mode',value:'standard'});assert.equal(JSON.parse(files.get(path.join(dir,'command.json'))).value,'standard');
 ipc.get('widget')({sender:webContents},{type:'console'});assert.equal(JSON.parse(files.get(path.join(dir,'command.json'))).type,'console');assert.equal(hidden,false,'Keep the widget visible until the existing console acknowledges the return');
 webEvents.get('render-process-gone')();assert.match(JSON.parse(files.get(path.join(dir,'error.json'))).message,/display stopped/);assert.equal(JSON.parse(files.get(path.join(dir,'widget.json'))).closed,true);
 ipc.get('widget')({sender:webContents},{type:'close'});assert.equal(JSON.parse(files.get(path.join(dir,'widget.json'))).closed,true);
}
console.log('PASS Mac/Windows desktop branches: no frame, always on top, isolated renderer, mode/full-console/close controls and renderer-crash recovery');
