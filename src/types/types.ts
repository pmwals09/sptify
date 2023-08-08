export type YTPlaylistItem = {
  kind: "youtube#playlistItem";
  etag: string;
  id: string;
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: {
      [key: string]: {
        url: string;
        width: number;
        height: number;
      };
    };
    channelTitle: string;
    videoOwnerChannelTitle: string;
    videoOwnerChannelId: string;
    playlistId: string;
    position: number;
    resourceId: {
      kind: string;
      videoId: string;
    };
  };
  contentDetails: {
    videoId: string;
    startAt: string;
    endAt: string;
    note: string;
    videoPublishedAt: string;
  };
  status: {
    privacyStatus: string;
  };
};

export type YTPlaylistListResponse = {
  kind: "youtube#playlistListResponse";
  etag: string;
  nextPageToken: string;
  prevPageToken: string;
  pageInfo: {
    totalResulst: number;
    resultsPerPage: number;
  };
  items: YTPlaylistResponse[];
};

type YTPlaylistResponse = {
  kind: "youtube#playlist";
  etag: string;
  id: string;
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: {
      [key: string]: {
        url: string;
        width: string;
        height: string;
      };
    };
    channelTitle: string;
    defaultLanguage: string;
    localized: {
      title: string;
      description: string;
    };
    status: {
      privacyStatus: string;
    };
    contentDetails: {
      itemCount: number;
    };
    player: {
      embedHtml: string;
    };
    localizations: {
      [key: string]: {
        title: string;
        description: string;
      };
    };
  };
};

export type YTPlaylistItemListResponse = {
  kind: "youtube#playlistItemListResponse";
  etag: string;
  nextPageToken: string;
  items: YTPlaylistItem[];
};

export type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
};

export type SpotifyTrackObject = {
  id: string;
  is_playable: boolean;
  name: string;
  popularity: number;
  preview_url: string;
  uri: string;
};

export type SpotifySearchResults = {
  tracks: {
    href: string;
    limit: number;
    next: string;
    offset: number;
    previous: string;
    total: number;
    items: SpotifyTrackObject[];
  };
};
