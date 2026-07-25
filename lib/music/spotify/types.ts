export type SpotifyTokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

export type SpotifyApiError = {
  error?: {
    status?: number;
    message?: string;
  };
};

export type SpotifyImage = {
  url: string;
  width?: number | null;
  height?: number | null;
};

export type SpotifyPlaylistItem = {
  id?: string;
  name?: string;
  description?: string | null;
  images?: SpotifyImage[];
  owner?: {
    display_name?: string | null;
  };
  items?: {
    total?: number;
  };
  tracks?: {
    total?: number;
  };
};

export type SpotifyPlaylistsResponse = SpotifyApiError & {
  items?: SpotifyPlaylistItem[];
  total?: number;
  next?: string | null;
};
