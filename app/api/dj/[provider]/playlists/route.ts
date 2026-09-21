import { NextRequest, NextResponse } from "next/server";
import { localLibraryAccessResponse } from "@/lib/auth/local-library";
import { getDjAdapter } from "@/lib/dj/bridge";
import { isDjProvider } from "@/lib/dj/providers";
import { getUniquePlaylistTrackCount } from "@/lib/game/service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_request:NextRequest, context:{params:Promise<{provider:string}>}) {
  const denied=await localLibraryAccessResponse(); if(denied) return denied;
  const {provider}=await context.params;
  if(!isDjProvider(provider)) return NextResponse.json({ok:false,message:"Unknown DJ software."},{status:400});
  try {
    const playlists=(await (await getDjAdapter(provider)).listPlaylists()).map(p=>({...p,tracks:[],trackCount:getUniquePlaylistTrackCount(p.tracks)}));
    return NextResponse.json({ok:true,playlists,totalTracks:playlists.reduce((n,p)=>n+p.trackCount,0)},{headers:{"Cache-Control":"no-store"}});
  } catch {return NextResponse.json({ok:false,message:"Unable to read the selected local DJ library. Open the DJ software on this Mac and check library access."},{status:503});}
}
