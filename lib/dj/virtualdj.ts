import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { XMLParser } from "fast-xml-parser";
import { normalizeDjTrack } from "./normalize";
import type { DjAdapter, DjPlaylist } from "./types";
const parser = new XMLParser({ignoreAttributes:false, attributeNamePrefix:"", parseAttributeValue:false, processEntities:true});
const array = <T>(value:T | T[] | undefined):T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
export async function virtualDjRoot():Promise<string> {
  if (process.env.BTTB_VIRTUALDJ_PATH) {
    await fs.access(process.env.BTTB_VIRTUALDJ_PATH);
    return process.env.BTTB_VIRTUALDJ_PATH;
  }
  const home = os.homedir();
  const homePath = os.platform() === "win32" ? path.win32 : path;
  const candidates = os.platform() === "darwin"
    ? [path.join(home, "Library", "Application Support", "VirtualDJ"), path.join(home, "Documents", "VirtualDJ"), path.join(home, "Library", "VirtualDJ")]
    : [homePath.join(process.env.LOCALAPPDATA || homePath.join(home, "AppData", "Local"), "VirtualDJ"), homePath.join(home, "Documents", "VirtualDJ")];
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  const error = new Error("Virtual DJ library not found. Open Virtual DJ on this computer first.") as NodeJS.ErrnoException;
  error.code = "ENOENT";
  throw error;
}
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
export async function virtualDjLibraryRoots():Promise<string[]> {
  const home = await virtualDjRoot();
  // An explicit override is isolated, including in tests and custom installations.
  if (process.env.BTTB_VIRTUALDJ_PATH) return [home];
  const roots = [home];
  let candidates:string[] = [];
  if (os.platform() === "darwin") {
    const volumes = await fs.readdir("/Volumes", { withFileTypes: true });
    candidates = volumes.filter(volume => volume.isDirectory()).map(volume => path.join("/Volumes", volume.name, "VirtualDJ"));
  } else if (os.platform() === "win32") {
    candidates = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(letter => `${letter}:\\VirtualDJ`);
  }
  for (const candidate of candidates) {
    try {
      if ((await fs.stat(candidate)).isDirectory()) roots.push(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return roots;
}
async function library() {
  const roots = await virtualDjLibraryRoots();
  const metadata = new Map<string,Record<string,string>>();
  const paths:string[] = [];
  for (const root of roots) {
    try {
      const db=parser.parse(await fs.readFile(path.join(root,"database.xml"),"utf8"));
      for(const song of array<{FilePath:string;Tags?:Record<string,string>}>(db.VirtualDJ_Database?.Song)) {
        const t=song.Tags ?? {}; metadata.set(song.FilePath,{title:t.Title,artist:t.Author,album:t.Album,remix:t.Remix});
      }
    } catch(e) {if ((e as NodeJS.ErrnoException).code!=="ENOENT") throw e;}
    paths.push(...await files(path.join(root,"MyLists")),...await files(path.join(root,"My Lists")),...await files(path.join(root,"Playlists")));
  }
  return Promise.all([...new Set(paths)].map(async file=>parseVirtualDjList(await fs.readFile(file,"utf8"),file,metadata)));
}
export const virtualdjAdapter:DjAdapter = {
  libraryLocations: virtualDjLibraryRoots,
  listPlaylists:library,
  async loadPlaylist(id) {return (await library()).find(p=>p.id===id) ?? null;},
  async nowPlaying() {
    const root = await virtualDjRoot();
    const file=path.join(root,"History","tracklist.txt");
    let content:string;
    try {content=await fs.readFile(file,"utf8");} catch(e) {if((e as NodeJS.ErrnoException).code==="ENOENT") return null;throw e;}
    const lines=content.trim().split(/\r?\n/);
    const line=lines.at(-1) ?? "";
    const match=line.match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*:\s*(.+?)\s+-\s+(.+)$/);
    if (!match) return null;
    return {id:`virtualdj:${lines.length}:${line}`,artist:match[2],title:match[3],displayText:`${match[2]} - ${match[3]}`,playedAtText:match[1]};
  },
};
