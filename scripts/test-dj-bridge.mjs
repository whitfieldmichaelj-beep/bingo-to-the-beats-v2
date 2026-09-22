import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,mocks={}) { const exports={}; vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports,require:id=>mocks[id]??require(id),Buffer,process,console,setTimeout,clearTimeout});return exports; }
const providers=load('lib/dj/providers.ts');
assert.equal(providers.isDjProvider('toString'),false);assert.equal(providers.isDjProvider('__proto__'),false);assert.equal(providers.isDjProvider('rekordbox'),true);
const normalization=load('lib/dj/normalize.ts');
for(const provider of Object.keys(providers.DJ_PROVIDERS)) {
 const t=normalization.normalizeDjTrack(provider,{id:'42',title:'Song',artist:'Artist',filePath:'/Volumes/DJ/Song.mp3',bpm:128});
 assert.equal(t.source,provider);assert.equal(t.sourceTrackId,'42');assert.equal(t.filePath,'/Volumes/DJ/Song.mp3');
 assert.equal(t.id,normalization.normalizeDjTrack(provider,{id:'42',filePath:'/renamed.mp3'}).id);
 const {DjDetectionGate}=load('lib/dj/detection.ts');const gate=new DjDetectionGate();
 assert.equal(gate.accept('old'),false);assert.equal(gate.accept('old'),false);assert.equal(gate.accept(null),false);assert.equal(gate.accept('new'),true);assert.equal(gate.accept('new'),false);assert.equal(gate.accept('next'),true);
 const empty=new DjDetectionGate();assert.equal(empty.accept(null),false);assert.equal(empty.accept('first'),true);
 const restore=load('lib/game/playback-config.ts');const config=restore.makePlaybackConfig(provider,45,[{id:t.id}]);
 assert.equal(restore.restorePlaybackConfig(JSON.parse(JSON.stringify(config)),'playlist',[]).source,provider);
}
const virtual=load('lib/dj/virtualdj.ts',{'./normalize':normalization});
const xml='<?xml version="1.0"?><VirtualFolder><song path="/Volumes/Music/A &amp; B.mp3" artist="A &amp; B" title="Song" bpm="128" remix="Club"/><song path="relative.mp3"/></VirtualFolder>';
const p=virtual.parseVirtualDjList(xml,'/DJ/My Lists/Party.xml');assert.equal(p.tracks.length,1);assert.equal(p.tracks[0].artist,'A & B');assert.equal(p.tracks[0].filePath,'/Volumes/Music/A & B.mp3');assert.equal(p.tracks[0].version,'Club');
assert.equal(virtual.parseVirtualDjList('#EXTM3U\n../Song.mp3\n','/DJ/Playlists/Party.m3u').tracks[0].filePath,'/DJ/Song.mp3');
let denied=null,reads=0;
const next={NextResponse:{json:(body,options={})=>({body,status:options.status??200})}};
const mocks={'next/server':next,'@/lib/auth/local-library':{localLibraryAccessResponse:async()=>denied},'@/lib/dj/providers':providers,'@/lib/dj/bridge':{getDjAdapter:async()=>{reads++;return {listPlaylists:async()=>[p],nowPlaying:async()=>null}}},'@/lib/game/service':{getUniquePlaylistTrackCount:tracks=>tracks.length},'@clerk/nextjs/server':{auth:async()=>({userId:'owner'})},'@/lib/billing/access':{HostAccessError:class extends Error{},requireGameHostAccess:async()=>{}}};
for(const endpoint of ['playlists','now-playing']) {
 const route=load(`app/api/dj/[provider]/${endpoint}/route.ts`,mocks);
 const req={nextUrl:new URL('http://localhost/?gameId=test')};
 denied={status:403};assert.equal(await route.GET(req,{params:Promise.resolve({provider:'serato'})}),denied);assert.equal(reads,0);
 denied=null;assert.equal((await route.GET(req,{params:Promise.resolve({provider:'invalid'})})).status,400);
 for(const provider of Object.keys(providers.DJ_PROVIDERS))assert.equal((await route.GET(req,{params:Promise.resolve({provider})})).status,200);
 reads=0;
}
const root=mkdtempSync(path.join(tmpdir(),'bttb-vdj-'));const previous=process.env.BTTB_VIRTUALDJ_PATH;
try {process.env.BTTB_VIRTUALDJ_PATH=path.join(root,'missing');await assert.rejects(virtual.virtualdjAdapter.nowPlaying(),{code:'ENOENT'});await assert.rejects(virtual.virtualdjAdapter.listPlaylists(),{code:'ENOENT'});process.env.BTTB_VIRTUALDJ_PATH=root;mkdirSync(path.join(root,'My Lists'));writeFileSync(path.join(root,'My Lists','Party.xml'),xml);assert.equal((await virtual.virtualdjAdapter.listPlaylists()).length,1);assert.equal(await virtual.virtualdjAdapter.loadPlaylist('invalid'),null);assert.equal(await virtual.virtualdjAdapter.nowPlaying(),null);}finally{rmSync(root,{recursive:true});if(previous===undefined)delete process.env.BTTB_VIRTUALDJ_PATH;else process.env.BTTB_VIRTUALDJ_PATH=previous;}
console.log('PASS all DJ providers: normalized identities, restore, startup/repeat detection guards, native VirtualDJ playlists, and API owner/provider isolation');
// Exercise the real game route's provider dispatch, filters and saved source.
let saved,chosen,savedOptions;
const gameRoute=load('app/api/game/create/route.ts',{
 'next/server':next,
 '@/lib/auth/local-library':{localLibraryAccessResponse:async()=>null},
 '@clerk/nextjs/server':{auth:async()=>({isAuthenticated:true,userId:'owner'})},
 '@/lib/dj/providers':providers,
 '@/lib/dj/bridge':{getDjAdapter:async provider=>{chosen=provider;return {loadPlaylist:async()=>({id:'playlist',name:'Party',tracks:Array.from({length:30},(_,i)=>({id:String(i),title:`Song ${i}`,artist:'Artist',filePath:`/music/${i}.mp3`,fileName:`${i}.mp3`,bpm:120}))})}}},
 '@/lib/serato/song-filter':{excludedDjSong:()=>false},
 '@/lib/billing/access':{HostAccessError:class extends Error{}},
 '@/lib/game/playback-config':load('lib/game/playback-config.ts'),
 '@/lib/game/balance-validator':{evaluateGameBalance:()=>({status:'healthy',recommendations:[]})},
 '@/lib/game/service':{getUniquePlaylistTrackCount:t=>t.length,createGameFromPlaylist:playlist=>({id:'game',playlist,tracks:playlist.tracks})},
 '@/lib/game/repository':{createGame:async (game,owner,options)=>{saved=game;savedOptions=options;return game}},
});
for(const provider of Object.keys(providers.DJ_PROVIDERS)) {
 const response=await gameRoute.POST({json:async()=>({provider,playlistId:'playlist',cardCount:5,clipLength:45})});
 assert.equal(response.status,200);assert.equal(chosen,provider);assert.equal(saved.playbackConfig.source,provider);assert.equal(saved.playbackConfig.clipLength,45);assert.equal(savedOptions.practice,true);
 const paid=await gameRoute.POST({json:async()=>({provider,playlistId:"playlist",cardCount:25,clipLength:30})});
 assert.equal(paid.status,200);assert.equal(savedOptions.practice,false);
}
assert.equal((await gameRoute.POST({json:async()=>({provider:'unknown',playlistId:'playlist'})})).status,400);
console.log('PASS game creation dispatches all providers and persists their playback source and clip length');
let rbClient;
class FakeRekordbox {
 constructor(options){assert.equal(options.dangerouslyModifyDatabase,false);assert.equal(options.pollIntervalMs,500,"Rekordbox history should be checked every half second");this.listeners={};rbClient=this;}
 on(name,fn){this.listeners[name]=fn;}
 start(){}
 stop(){}
 loadPlaylists(){return [{ID:'list',Name:'Set',Attribute:0},{ID:'folder',Name:'Folder',Attribute:1}];}
 loadPlaylistTracks(){return [{id:'song',filePath:'/song.mp3',title:'Song',artist:'Artist',subTitle:'Club',bpm:12800,length:180,album:'Album',key:'Am'}];}
}
const rb=load('lib/dj/rekordbox.ts',{'rekordbox-connect':{RekordboxConnect:FakeRekordbox},'./normalize':normalization}).rekordboxAdapter;
const rbLists=await rb.listPlaylists();assert.equal(rbLists.length,1);assert.equal(rbLists[0].tracks[0].bpm,128);assert.equal(rbLists[0].tracks[0].title,'Song (Club)');assert.equal(await rb.loadPlaylist('serato:list'),null);assert.equal(await rb.nowPlaying(),null);
rbClient.listeners.history({rows:[{rowid:1,title:'Song',artist:'Artist',filePath:'/song.mp3'}]});assert.equal((await rb.nowPlaying()).id,'rekordbox:1');
const serato=load('lib/dj/serato.ts',{
 '../serato/playlists':{getSeratoPlaylists:async()=>[]},'../serato/smart-crates':{getSeratoSmartCrates:async()=>[]},'../serato/playlist-reader':{},'../serato/finder':{findSeratoLibraries:async()=>['/Serato']},'./normalize':normalization,
 'serato-connect':{getLatestSessionPath:()=>'/session',getSessionSongs:async()=>[
  {title:'Old',artist:'Artist',filePath:'/old',playing:false,startTime:new Date('2026-01-01')},
  {title:'Live',artist:'Artist',filePath:'/live',playing:true,startTime:new Date('2026-01-02')},
 ],hasSeratoV4Database:()=>false},
}).seratoAdapter;
assert.equal((await serato.nowPlaying()).title,'Live');
console.log('PASS native adapters: Rekordbox read-only configuration, folder exclusion, BPM/version normalization, history events; Serato rejects unplayed entries');

let v4Songs = [
 {title:'Played v4',artist:'Artist',filePath:'/v4',played:true,startTime:new Date('2026-01-02')},
 {title:'Only loaded',played:false,startTime:new Date('2026-01-03')},
 {title:'Finished',played:true,startTime:new Date('2026-01-04'),playTime:new Date('2026-01-05')},
];
const serato4=load('lib/dj/serato.ts',{
 '../serato/playlists':{},'../serato/smart-crates':{},'../serato/playlist-reader':{},
 '../serato/finder':{findSeratoLibraries:async()=>[]},'./normalize':normalization,
 'serato-connect':{hasSeratoV4Database:()=>true,getLatestSessionSongsV4:()=>v4Songs},
}).seratoAdapter;
assert.equal((await serato4.nowPlaying()).title,'Played v4');
v4Songs=v4Songs.slice(1);assert.equal(await serato4.nowPlaying(),null);
console.log('PASS Serato 4 detects confirmed playback without a legacy playing flag and ignores loaded-only and ended entries');
