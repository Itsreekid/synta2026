import pool from "../config/db.js";
import { createRecordingWorker } from "./zoom-recordings.js";
import { openZoomRecordingDownload } from "../utils/zoomClient.js";
import {
  abortR2MultipartUpload, completeR2MultipartUpload, createR2MultipartUpload,
  deleteFromR2, readR2ObjectMetadata, uploadR2Part,
} from "../utils/r2Utils.js";

export const recordingStorage = {
  createMultipart: createR2MultipartUpload,
  uploadPart: uploadR2Part,
  completeMultipart: completeR2MultipartUpload,
  abortMultipart: abortR2MultipartUpload,
  head: readR2ObjectMetadata,
  delete: deleteFromR2,
};

export const recordingWorker = createRecordingWorker(pool, {
  zoom: { download: openZoomRecordingDownload },
  storage: recordingStorage,
});
