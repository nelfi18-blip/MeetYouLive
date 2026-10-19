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

module.exports = {
  createFaceLivenessSession,
  getFaceLivenessSessionResults,
  compareFaces,
};
