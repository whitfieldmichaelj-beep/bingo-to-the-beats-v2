import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fixtureWriter} from './lib/fixture-writer.mjs';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname),'Verification requires a local database');
const {Pool}=require('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,query_timeout:15000,idleTimeoutMillis:5000,maxUses:100});
const id=randomUUID(),host=`verify-${randomUUID()}`,code=`V${randomUUID().replaceAll('-','').slice(0,5).toUpperCase()}`;
const {query,insertRows}=fixtureWriter(pool);
const insert=(table,row)=>insertRows(table,[row]);
try{
const source=(await query('SELECT g.* FROM "Game" g WHERE (SELECT count(*) FROM "BingoCard" b WHERE b."gameId"=g.id)>=25 ORDER BY g."createdAt" LIMIT 1')).rows[0];assert.ok(source,'A saved game with at least 25 cards is needed as fixture metadata');
await insert('User',{id:host,clerkId:host,updatedAt:new Date()});
await insert('Game',{...source,id,hostId:host,joinCode:code,title:'Temporary verification game',status:'READY',currentTrackId:null,startedAt:null,completedAt:null,isPractice:false,hostBillingRequired:false});
const sourceTracks=(await query('SELECT * FROM "GameTrack" WHERE "gameId"=$1',[source.id])).rows;
await insertRows('GameTrack',sourceTracks.map(track=>({...track,id:randomUUID(),gameId:id,called:false,calledAt:null,playedAt:null})));
const originals=(await query('SELECT * FROM "BingoCard" WHERE "gameId"=$1 ORDER BY "cardNumber" LIMIT 100',[source.id])).rows;
const cardIds=new Map(originals.map(card=>[card.id,randomUUID()]));
await insertRows('BingoCard',originals.map(original=>({...original,id:cardIds.get(original.id),gameId:id,status:'AVAILABLE',playerName:null,playerKey:null,purchaseId:null})));
const squares=(await query('SELECT * FROM "CardSquare" WHERE "cardId"=ANY($1::text[])',[[...cardIds.keys()]])).rows;
await insertRows('CardSquare',squares.map(square=>({...square,id:randomUUID(),cardId:cardIds.get(square.cardId),marked:false,markedAt:null})));
console.log(`Prepared isolated verification: ${originals.length} cards, ${squares.length} squares, ${sourceTracks.length} tracks.`);

process.exitCode=await new Promise((resolve,reject)=>{const child=spawn('bash',['scripts/verify-local.sh'],{stdio:'inherit',env:{...process.env,JOIN_CODE:code}});child.on('error',reject);child.on('exit',status=>resolve(status??1));});
}finally{
  try {
    await query('DELETE FROM "Game" WHERE id=$1',[id]);
    await query('DELETE FROM "User" WHERE id=$1',[host]);
    console.log('Temporary verification game removed.');
  } finally { await pool.end(); }
}
