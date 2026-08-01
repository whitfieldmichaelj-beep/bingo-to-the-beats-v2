"use client";

import Link from "next/link";
import Script from "next/script";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useEffect, useState } from "react";

type MusicSource = "spotify" | "apple";

type SessionMusicSource =
  | MusicSource
  | "serato";

type DisplayTrack = {
  id: string;
  name: string;
  artist: string;
  album: string;
  image: string | null;
  uri?: string;
};

type GameDetails = {
  gameName?: string;
  venue?: string;
  venueName?: string;
  hostName?: string;
  eventDate?: string;
  eventTime?: string;
  primaryColor?: string;
  winning