import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const stateKey='bttb-v2-caller-state',sessionKey='bttb-v2-game-session';
for(const blockedChannel of [false,true]){
 const data=new Map(),effects=[],states=[],events=new Map(),timers=new Map();let index=0,channel,closed=false;
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const a={sessionId:'a',currentTrack:{id:'song-a',name:'First'},secondsRemaining:30};
 const b={sessionId:'b',currentTrack:{id:'song-b',name:'Wrong game'}};
 storage.setItem(stateKey,JSON.stringify(b));storage.setItem(stateKey+':a',JSON.stringify(a));storage.setItem(sessionKey+':a',JSON.stringify({sessionId:'a',joinCode:'AAAAAA'}));
 const exports={};
 vm.runInNewContext(compile(readFileSync('app/game/caller/page.tsx','utf8')),{exports,URLSearchParams,localStorage:storage,window:{location:{search:'?gameId=a',origin:'http://localhost:3001'},addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k),setInterval:f=>{timers.set(1,f);return 1},clearInterval:k=>timers.delete(k)},BroadcastChannel:class{constructor(){if(blockedChannel)throw Error('Unavailable');channel=this}close(){closed=true}},require:id=>{
 if(id==='react')return {useState:initial=>{const n=index++;states[n]=initial;return [initial,v=>states[n]=typeof v==='function'?v(states[n]):v]},useEffect:f=>effects.push(f),useMemo:f=>f()};
 if(id==='react/jsx-runtime')return {jsx:()=>null,jsxs:()=>null};
 if(id.includes('useGameRoster'))return {useGameRoster:()=>({roster:{}})};
 return {};
 }});
 exports.default();const cleanup=effects[0]();assert.equal(states[0].currentTrack.id,'song-a');assert.equal(states[1].joinCode,'AAAAAA');
 if(channel){channel.onmessage({data:b});assert.equal(states[0].sessionId,'a','Other consoles cannot overwrite caller');channel.onmessage({data:{...a,secondsRemaining:29}});assert.equal(states[0].secondsRemaining,29);}
 storage.setItem(stateKey+':a',JSON.stringify({...a,currentTrack:{id:'song-next'},secondsRemaining:20}));timers.get(1)();assert.equal(states[0].currentTrack.id,'song-next','Polling recovers missed broadcasts');
 storage.setItem(stateKey,JSON.stringify(b));events.get('storage')({key:stateKey});assert.equal(states[0].sessionId,'a');
 cleanup();assert.equal(timers.size,0);assert.equal(events.size,0);if(channel)assert.equal(closed,true);
}
const source=readFileSync('app/dj-console/DjConsole.tsx','utf8');const start=source.indexOf('  function broadcast('),end=source.indexOf('  function saveSession(',start);const data=new Map(),sent=[];
const publisher=vm.createContext({CALLER_STATE_KEY:stateKey,CHANNEL_NAME:'sync',localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},setCallerState(){},BroadcastChannel:class{postMessage(v){sent.push(v)}close(){}}});
vm.runInContext(compile(source.slice(start,end)),publisher);
vm.runInContext("broadcast({sessionId:'a',currentTrack:{id:'first'}});broadcast({sessionId:'b',currentTrack:{id:'other'}})",publisher);
assert.equal(JSON.parse(data.get(stateKey+':a')).currentTrack.id,'first');assert.equal(JSON.parse(data.get(stateKey+':b')).currentTrack.id,'other');assert.equal(sent.length,2);
console.log('PASS Caller Screen game isolation, instant broadcasts, missed-event polling, unavailable channels, cleanup and per-game publishing');

const historyStart=source.indexOf('function getRecentPlayedTracks('),historyEnd=source.indexOf('// BTTB_APPLE_DJ_CONSOLE_PLAYBACK_V2',historyStart);
const historyContext=vm.createContext({});vm.runInContext(compile(source.slice(historyStart,historyEnd)),historyContext);
const result=vm.runInContext(`(()=>{const session={tracks:[{id:'first'},{id:'skipped'},{id:'third'},{id:'current'}],currentIndex:3,playedTrackIds:['third','first']};return {hidden:getRecentPlayedTracks(session),revealed:getRecentPlayedTracks(session,session.playedTrackIds,true),duplicate:getRecentPlayedTracks(session,['third','current'],true)}})()`,historyContext);
assert.deepEqual(Array.from(result.hidden,t=>t.id),['first','third']);
assert.deepEqual(Array.from(result.revealed,t=>t.id),['current','first','third']);
assert.deepEqual(Array.from(result.duplicate,t=>t.id),['current','third']);
assert.ok(!readFileSync('app/game/caller/page.tsx','utf8').includes('gameSession.tracks'),'Caller must not reconstruct plays from playlist position');
console.log('PASS caller history follows actual out-of-order songs, excludes skipped/hidden songs and includes the revealed current song once');
