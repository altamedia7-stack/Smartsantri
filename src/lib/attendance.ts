import * as faceapi from 'face-api.js';

export interface LocationStatus {
  isValid: boolean;
  isSuspicious: boolean;
  reason?: string;
  distance?: number;
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

export async function validateLocation(
  userLat: number,
  userLng: number,
  accuracy: number,
  targetLat: number,
  targetLng: number,
  radius: number
): Promise<LocationStatus> {
  const distance = calculateDistance(userLat, userLng, targetLat, targetLng);
  
  let isSuspicious = false;
  let reason = '';

  // Anti-fake GPS checks
  if (accuracy > 50) {
    isSuspicious = true;
    reason = 'Low GPS accuracy (>50m)';
  }

  // Basic radius check
  if (distance > radius) {
    return { isValid: false, isSuspicious, reason: 'Outside allowed area', distance };
  }

  return { isValid: true, isSuspicious, reason, distance };
}

// Face Recognition Helpers
const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

export async function loadFaceModels() {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
}

export async function getFaceDescriptor(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) {
  const detection = await faceapi
    .detectSingleFace(imageElement, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  return detection?.descriptor;
}

export function compareFaces(descriptor1: number[], descriptor2: number[]) {
  const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
  return distance < 0.6; // Threshold for match
}
