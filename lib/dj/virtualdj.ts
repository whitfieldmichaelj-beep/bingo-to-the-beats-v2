import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { XMLParser } from "fast-xml-parser";
import { normalizeDjTrack } from "./normalize";
import type { DjAdapter, DjPlaylist } from "./types";
const parser = new XMLParser({ignoreAttributes:false, attributeNamePrefix:"", parseAttributeValue:false, processEntities:true});
const array = <T>(value:T | T[] | undefined):T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const root = () => process.env.BTTB_VIRTUALDJ_PATH || path.join(os.homedir(),"Documents","VirtualDJ");
async function files(dir:string):Promise<string[]> {
  let entries;
  try { entries=await fs.readdir(dir,{withFileTypes:true}); } catch(e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
  return (await Promise.all(entries.map(e=>e.isDirectory()?files(path.join(dir,e.name)):e.isFile()&&/\.(xml|m3u8?|vdjfolder)$/i.test(e.name)?[path.join(dir,e.name)]:[]))).flat();
}
export function parseVirtualDjList(content:string, file:string, metadata:Map<string,Record<string,string>> = new Map()):DjPlaylist {
  const rows:Record<string,string>[] = /\.(xml|vdjfolder)$/i.test(file)
    ? array(parser.parse(content)?.VirtualFolder?.song)
    : content.split(/\r?\n/).filter(line=>line.trim()&&!line.startsWith("#")).map(line=>({path:path.resolve(path.dirname(file),line.trim())}));
  const tracks=rows.filter(r=>r.path && path.isAbsolute(r.path)).map(r=>{
    const m={...metadata.get(r.path),...r};
    return normalizeDjTrack("virtualdj",{filePath:r.path,title:m.title,artist:m.artist,album:m.album,version:m.remix,bpm:Number(m.bpm)||null,duration:Number(m.songlength)||undefined,key:m.key});
  });
  return {id:`virtualdj:${Buffer.from(file).toString("base64url")}`,name:path.basename(file,path.extname(file)),filePath:file,trackCount:tracks.length,tracks};
}
async function library() {
  const metadata = new Map<string,Record<string,string>>();
  try {
    const db=parser.parse(await fs.readFile(path.join(root(),"database.xml"),"utf8"));
    for(const song of array<{FilePath:string;Tags?:Record<string,string>}>(db.VirtualDJ_Database?.Song)) {
      const t=song.Tags ?? {}; metadata.set(song.FilePath,{title:t.Title,artist:t.Author,album:t.Album,remix:t.Remix});
    }
  } catch(e) {if ((e as NodeJS.ErrnoException).code!=="ENOENT") throw e;}
  const paths=[...await files(path.join(root(),"My Lists")),...await files(path.join(root(),"Playlists"))];
  return Promise.all(paths.map(async file=>parseVirtualDjList(await fs.readFile(file,"utf8"),file,metadata)));
}
export const virtualdjAdapter:DjAdapter = {
  listPlaylists:library,
  async loadPlaylist(id) {return (await library()).find(p=>p.id===id) ?? null;},
  async nowPlaying() {
    const file=path.join(root(),"History","tracklist.txt");
    let content:string;
    try {content=await fs.readFile(file,"utf8");} catch(e) {if((e as NodeJS.ErrnoException).code==="ENOENT") return null;throw e;}
    const lines=content.trim().split(/\r?\n/);
    const line=lines.at(-1) ?? "";
    const match=line.match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*:\s*(.+?)\s+-\s+(.+)$/);
    if (!match) return null;
    return {id:`virtualdj:${lines.length}:${line}`,artist:match[2],title:match[3],displayText:`${match[2]} - ${match[3]}`,playedAtText:match[1]};
  },
};
