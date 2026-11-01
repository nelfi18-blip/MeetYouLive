/**
 * Thin wrapper around the AWS Rekognition SDK calls used by photo
 * verification. Isolated in its own module so:
 *   1. The SDK is only ever touched when the feature is enabled (the rest of
 *      the service/controllers can be unit-tested without AWS credentials).
 *   2. Tests can `jest.mock()` this module instead of the AWS SDK directly.
 *
 * NOTE ON SDK/CAPACITOR COMPATIBILITY (see PR description): this module only
 * covers the SERVER-SIDE Rekognition calls (CreateFaceLivenessSession,
 * GetFaceLivenessSessionResults, CompareFaces), which are plain HTTPS/Node
 * calls and have no Next.js/Capacitor constraints. The CLIENT-SIDE capture
 * widget (`@aws-amplify/ui-react-liveness`) is a separate concern handled in
 * the frontend and is NOT assumed to work inside the Capacitor WebView until
 * verified on a real device — see frontend/components/PhotoVerification.
 */

const { getPhotoVerificationConfig } = require("../config/photoVerification.js");

let rekognitionClientSingleton = null;

const getRekognitionClient = () => {
  if (rekognitionClientSingleton) return rekognitionClientSingleton;
  const config = getPhotoVerificationConfig();
  // Lazy require: the SDK is a real dependency (see package.json), but we
  // avoid constructing a client (and therefore touching credentials) unless
  // the feature is actually enabled.
  const { RekognitionClient } = require("@aws-sdk/client-rekognition");
  rekognitionClientSingleton = new RekognitionClient({
    region: config.awsRegion,
    credentials: config.accessKeyId
      ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
      : undefined,
  });
  return rekognitionClientSingleton;
};

/**
 * Starts a Face Liveness session server-side. Returns the opaque session id
 * the client SDK needs to run the in-app capture flow.
 */
const createFaceLivenessSession = async () => {
  const config = getPhotoVerificationConfig();
  const { CreateFaceLivenessSessionCommand } = require("@aws-sdk/client-rekognition");
  const client = getRekognitionClient();
  const command = new CreateFaceLivenessSessionCommand({
    Settings: config.livenessS3Bucket
      ? { OutputConfig: { S3Bucket: config.livenessS3Bucket } }
      : undefined,
  });
  const response = await client.send(command);
  return response.SessionId;
};

/**
 * Retrieves the liveness result + reference face image for a completed
 * session. The reference image bytes are held only in memory for the
 * duration of the CompareFaces call — never written to disk or the DB.
 */
const getFaceLivenessSessionResults = async (sessionId) => {
  const { GetFaceLivenessSessionResultsCommand } = require("@aws-sdk/client-rekognition");
  const client = getRekognitionClient();
  const command = new GetFaceLivenessSessionResultsCommand({ SessionId: sessionId });
  const response = await client.send(command);
  return {
    status: response.Status,
    confidence: response.Confidence ?? null,
    referenceImageBytes: response.ReferenceImage?.Bytes || null,
  };
};

/**
 * Compares the liveness reference image against the user's persisted primary
 * photo. Both image buffers only ever live in process memory.
 */
const compareFaces = async (sourceImageBytes, targetImageBytes, similarityThreshold) => {
  const { CompareFacesCommand } = require("@aws-sdk/client-rekognition");
  const client = getRekognitionClient();
  const command = new CompareFacesCommand({
    SourceImage: { Bytes: sourceImageBytes },
    TargetImage: { Bytes: targetImageBytes },
    SimilarityThreshold: 0, // We apply our own threshold logic in the decision step.
  });
  const response = await client.send(command);
  const bestMatch = (response.FaceMatches || []).reduce(
    (best, match) => (!best || (match.Similarity ?? 0) > best.Similarity ? match : best),
    null
  );
  return { similarity: bestMatch?.Similarity ?? 0, unmatchedFaces: response.UnmatchedFaces?.length || 0 };
};

/**
 * Idempotently ensures the Rekognition Collection used to hold reusable face
 * references exists. Collections only ever store AWS-managed face vectors
 * (returned to us as an opaque FaceId) — never the source images.
 */
const ensureCollection = async (collectionId) => {
  const { CreateCollectionCommand } = require("@aws-sdk/client-rekognition");
  const client = getRekognitionClient();
  try {
    await client.send(new CreateCollectionCommand({ CollectionId: collectionId }));
  } catch (err) {
    // Already exists — nothing to do. Any other error propagates.
    if (err?.name !== "ResourceAlreadyExistsException") throw err;
  }
};

/**
 * Indexes a single face into the given collection and returns only the
 * opaque FaceId AWS assigns to it — the image bytes passed in are never
 * written anywhere by this module; AWS itself does not retain the source
 * image for Collections (only the derived face vector).
 */
const indexFace = async (collectionId, imageBytes) => {
  const { IndexFacesCommand } = require("@aws-sdk/client-rekognition");
  const client = getRekognitionClient();
  const command = new IndexFacesCommand({
    CollectionId: collectionId,
    Image: { Bytes: imageBytes },
    MaxFaces: 1,
    QualityFilter: "AUTO",
    DetectionAttributes: [],
  });
  const response = await client.send(command);
  const record = (response.FaceRecords || [])[0];
  if (!record?.Face?.FaceId) {
    return { faceId: null, faceCount: 0 };
  }
  return { faceId: record.Face.FaceId, faceCount: response.FaceRecords.length };
};

/**
 * Searches the collection for the best-matching stored face for the given
 * image, returning the matched opaque FaceId + similarity (0-100), or null
 * when no face in the collection matches above AWS's own minimum floor.
 * We apply our OWN stricter threshold decision in the service layer.
 */
const searchFacesByImage = async (collectionId, imageBytes) => {
  const { SearchFacesByImageCommand } = require("@aws-sdk/client-rekognition");
  const client = getRekognitionClient();
  const command = new SearchFacesByImageCommand({
    CollectionId: collectionId,
    Image: { Bytes: imageBytes },
    MaxFaces: 1,
    FaceMatchThreshold: 0,
  });
  const response = await client.send(command);
  const bestMatch = (response.FaceMatches || []).reduce(
    (best, match) => (!best || (match.Similarity ?? 0) > best.Similarity ? match : best),
    null
  );
  if (!bestMatch?.Face?.FaceId) return null;
  return { faceId: bestMatch.Face.FaceId, similarity: bestMatch.Similarity ?? 0 };
};

/** Deletes one or more opaque FaceIds from the collection (consent withdrawal / cleanup). */
const deleteFaces = async (collectionId, faceIds) => {
  if (!Array.isArray(faceIds) || faceIds.length === 0) return;
  const { DeleteFacesCommand } = require("@aws-sdk/client-rekognition");
  const client = getRekognitionClient();
  await client.send(new DeleteFacesCommand({ CollectionId: collectionId, FaceIds: faceIds }));
};

/**
 * Runs AWS Rekognition `DetectFaces` on a single, already-decoded JPEG/PNG
 * image buffer. Used ONLY to check that a profile photo contains a
 * sufficiently visible human face — this is NOT an identity check (it never
 * confirms the face belongs to the account holder; see
 * `backend/src/lib/facePhotoValidation.js` for that distinction). Requests
 * the "ALL" attribute set so quality/pose signals are available to the
 * caller's own decision thresholds. Returns the raw `FaceDetails` array
 * (never persisted — the image bytes and this response are only ever held
 * in memory for the duration of the request).
 */
const detectFaces = async (imageBytes) => {
  const { DetectFacesCommand } = require("@aws-sdk/client-rekognition");
  const client = getRekognitionClient();
  const command = new DetectFacesCommand({ Image: { Bytes: imageBytes }, Attributes: ["ALL"] });
  const response = await client.send(command);
  return response.FaceDetails || [];
};

module.exports = {
  createFaceLivenessSession,
  getFaceLivenessSessionResults,
  compareFaces,
  ensureCollection,
  indexFace,
  searchFacesByImage,
  deleteFaces,
  detectFaces,
};
