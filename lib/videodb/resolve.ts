import { Collection, type Connection, type Video, type Audio, type Image } from "videodb";

/**
 * Cheap handles. A Collection shell needs only its id, so we skip the
 * GET /collection round-trip; media objects are fetched because their
 * methods rely on hydrated fields (length, stream_url).
 */
export const collection = (vdb: Connection, id: string): Collection => new Collection(vdb.vhttp, { id });

export const fetchVideo = (vdb: Connection, collectionId: string, videoId: string): Promise<Video> =>
  collection(vdb, collectionId).getVideo(videoId);

export const fetchAudio = (vdb: Connection, collectionId: string, audioId: string): Promise<Audio> =>
  collection(vdb, collectionId).getAudio(audioId);

export const fetchImage = (vdb: Connection, collectionId: string, imageId: string): Promise<Image> =>
  collection(vdb, collectionId).getImage(imageId);
