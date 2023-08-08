import https from "node:https";
import http from "node:http";
import { exec } from "node:child_process";
import "dotenv/config";
import {
  YTPlaylistItem,
  YTPlaylistItemListResponse,
  SpotifyTokenResponse,
  SpotifySearchResults,
  YTPlaylistListResponse,
  SpotifyTrackObject
} from "./types/types";
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";

main();

async function main(): Promise<void> {
  if (process.argv.length < 3) {
    console.error("Usage: node ./index.js <URL>");
    process.exit(1);
  }

  const playlistUrl = process.argv[2];
  const playlistId = getPlaylistIdFromUrl(playlistUrl);
  if (playlistId instanceof Error) {
    console.error(playlistId.message);
    process.exit(2);
  }

  // get the songs from youtube
  const ytUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=id&playlistId=${playlistId}`;

  const { ytQueue } = await getAllPlaylistItems({ url: ytUrl });
  if (ytQueue instanceof Error) {
    console.error(ytQueue.message);
    process.exit(3);
  }

  const playlistRes = await getPlaylistInfo({ url: playlistUrl });
  console.log(playlistRes)
  const playlistTitle = playlistRes.items[0].snippet.title;

  console.log(`Playlist ${playlistTitle} contains ${ytQueue.length} videos...`);

  // log into Spotify to get your OAuth token - buckle up
  const { access_token: spotifyToken } = await getSpotifyToken();

  // make a new Spotify playlist for the user to hold this playlist
  const { id: spotifyPlaylistId } = await makePlaylist({
    playlistTitle,
    userId: process.env.SPOTIFY_USER_ID as string,
    token: spotifyToken,
  });

  const missedTracks: YTPlaylistItem[] = [];

  while (ytQueue.length !== 0) {
    const nextVid = ytQueue.pop();
    if (nextVid) {
      const {
        snippet: { title },
      } = nextVid;
      // search Spotify for that video's title
      const spotifyTrack = await searchSpotify({ token: spotifyToken, trackName: title });
      if (spotifyTrack instanceof Error || spotifyTrack.tracks.items.length === 0) {
        missedTracks.push(nextVid)
      } else {
        const t = spotifyTrack.tracks.items[0]
        console.log(`Adding ${t.name} to playlist ${playlistTitle}`)
        addToPlaylist({ playlistId: spotifyPlaylistId, track: t, token: spotifyToken })
      }
    }
  }

  if (missedTracks.length > 0) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    rl.question(
      "There were a few tracks that could not be placed. Would you like to write to file for review? (y/n): ",
      (res) => {
        rl.close();
        if (["y", "yes"].includes(res.toLowerCase())) {
          fs.writeFile(
            path.join(__dirname, "missed-tracks.txt"),
            missedTracks.map(ea => JSON.stringify(ea)).join("\n"),
            {
              encoding: "utf8"
            },
            () => null
          )
        }
      }
    );

    console.log("Missed tracks:");
    missedTracks.forEach(t => {
      console.log(t.snippet.title)
    })
  }

  process.exit(0);
}

function getPlaylistIdFromUrl(url: string): string | Error {
  const u = new URL(url);
  const listId = u.searchParams.get("list");

  if (listId) {
    return listId;
  } else {
    throw new Error(
      "Invalid playlist url - must have format https://www.youtube.com/playlist?list=<id>",
    );
  }
}

async function getPlaylistItems({
  url,
  pageToken,
  maxResults,
}: {
  url: string;
  pageToken: string;
  maxResults: number;
}): Promise<YTPlaylistItemListResponse> {
  const u = new URL(url);
  if (pageToken) {
    u.searchParams.set("pageToken", pageToken);
  }

  if (maxResults) {
    u.searchParams.set("maxResults", maxResults.toString());
  } else {
    u.searchParams.set("maxResults", "50");
  }

  u.searchParams.set("part", "snippet");

  u.searchParams.set("key", process.env.YT_API_KEY as string);
  return new Promise<YTPlaylistItemListResponse>((resolve, reject) => {
    const req = https.get(u, {}, (res) =>
      handleRes<YTPlaylistItemListResponse>({
        res,
        onEnd: resolve,
        onError: reject,
      }),
    );
    req.end();
  });
}

async function getAllPlaylistItems({
  url,
}: {
  url: string;
}): Promise<{ ytQueue: YTPlaylistItem[] }> {
  const ytQueue = [];
  let res = await getPlaylistItems({ url, pageToken: "", maxResults: 50 });
  ytQueue.push(...res.items);
  // if there's a next page token, queue up another request
  while (res.nextPageToken) {
    res = await getPlaylistItems({
      url,
      pageToken: res.nextPageToken,
      maxResults: 50,
    });
    ytQueue.push(...res.items);
  }

  return {
    ytQueue,
  };
}

async function getPlaylistInfo({
  url
}: {
  url: string;
}): Promise<YTPlaylistListResponse> {
  const u = new URL("/youtube/v3/playlists", "https://www.googleapis.com");
  u.searchParams.append("part", "snippet");
  u.searchParams.set("key", process.env.YT_API_KEY as string);
  const playlistId = getPlaylistIdFromUrl(url);
  if (playlistId instanceof Error) {
    console.error(playlistId.message);
    process.exit(2);
  }
  u.searchParams.append("id", playlistId);
  return new Promise((resolve, reject) => {
    const req = https.request(u, {}, (res) =>
      handleRes<YTPlaylistListResponse>({
        res,
        onEnd: resolve,
        onError: reject,
      }),
    );
    req.end();
  });
}

function getSpotifyToken(): Promise<SpotifyTokenResponse> {
  // fire up a server to handle the response from Spotify
  const code = new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url as string, `http://${req.headers.host}`);
      const code = u.searchParams.get("code");

      if (code) {
        resolve(code);
        server.close();
      } else {
        const error = u.searchParams.get("error");
        if (error) {
          console.error("server error:", error);
          reject(error);
        } else {
          console.error("server else error");
          reject("Unknown error occurred getting Spotify token");
        }
      }

      res.writeHead(200, "ok");
    });
    server.listen(8080, "localhost", () => {
      console.log("Server is running on port 8080");
    });
  });

  const u = new URL("/authorize", "https://accounts.spotify.com");
  u.searchParams.append("client_id", process.env.SPOTIFY_CLIENT_ID as string);
  u.searchParams.append("response_type", "code");
  u.searchParams.append("redirect_uri", "http://localhost:8080");
  u.searchParams.append("scope", "playlist-modify-public");

  exec(`open ${u.toString().replaceAll("&", "\\&")}`);

  const token = code.then((c) => {
    return new Promise<SpotifyTokenResponse>((resolve, reject) => {
      const u = new URL("/api/token", "https://accounts.spotify.com/api/token");
      u.searchParams.set("grant_type", "authorization_code");
      u.searchParams.set("code", c);
      u.searchParams.set("redirect_uri", "http://localhost:8080");
      const req = https.request(
        `${u.origin}${u.pathname}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(
              `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
            ).toString("base64")}`,
          },
        },
        (res) =>
          handleRes<SpotifyTokenResponse>({
            res,
            onEnd: resolve,
            onError: reject,
          }),
      );
      req.write(u.searchParams.toString());
      req.end();
    });
  });

  return token;
}

async function makePlaylist({
  playlistTitle,
  userId,
  token,
}: {
  playlistTitle: string;
  userId: string;
  token: string;
}): Promise<{ id: string }> {
  const u = `https://api.spotify.com/v1/users/${userId}/playlists`;
  const body = {
    name: playlistTitle,
  };
  return new Promise<{ id: string }>((resolve, reject) => {
    const req = https.request(
      u,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => handleRes<{ id: string }>({ res, onEnd: resolve, onError: reject }),
    );
    req.write(JSON.stringify(body));
    req.end();
  });
}

function searchSpotify({
  trackName,
  token,
}: {
  trackName: string;
  token: string;
}): Promise<SpotifySearchResults> {
  return new Promise<SpotifySearchResults>((resolve, reject) => {
    const u = new URL("/v1/search", "https://api.spotify.com");
    u.searchParams.append("q", encodeURIComponent(trackName));
    u.searchParams.append("type", "track");

    const req = https.request(
      u,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      (res) =>
        handleRes<SpotifySearchResults>({
          res,
          onEnd: resolve,
          onError: reject,
        }),
    );
    req.end();
  });
}

function handleRes<T>({
  res,
  onEnd,
  onError,
}: {
  res: http.IncomingMessage;
  onEnd: (data: T) => void;
  onError: (e: Error) => void;
}): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  res.on("end", () => {
    onEnd(JSON.parse(Buffer.concat(chunks).toString()));
  });
  res.on("error", (e: Error) => {
    onError(e);
  });
}

async function addToPlaylist({
  playlistId,
  track,
  token
}: {
  playlistId: string;
  track: SpotifyTrackObject;
  token: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const u = new URL(`/v1/playlists/${playlistId}/tracks`, "https://api.spotify.com")
    u.searchParams.append("uris", track.uri)
    const req = https.request(
      u,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      },
      res => handleRes({ res, onEnd: resolve, onError: reject })
    )
    req.end()
  })
}
