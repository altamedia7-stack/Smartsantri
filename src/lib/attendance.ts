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

  // 1. Accuracy Check (Detection of low quality or potentially spoofed signals)
  // Accuracy > 100m is usually too poor for attendance
  if (accuracy > 100) {
    return { 
      isValid: false, 
      isSuspicious: true, 
      reason: `Akurasi GPS terlalu rendah (${Math.round(accuracy)}m). Pastikan Anda berada di luar ruangan atau dekat jendela.`, 
      distance 
    };
  }

  // 2. Suspiciously Perfect Accuracy (Some mock apps return exactly 0 or 1)
  if (accuracy <= 1) {
    isSuspicious = true;
    reason = 'Sinyal GPS mencurigakan (Akurasi terlalu sempurna). Harap gunakan GPS asli.';
  }

  // 3. Radius Check
  if (distance > radius) {
    return { 
      isValid: false, 
      isSuspicious, 
      reason: `Anda berada di luar jangkauan (${Math.round(distance)}m dari lokasi). Jarak maksimal adalah ${radius}m.`, 
      distance 
    };
  }

  // 4. Suspiciously high accuracy but not perfect (e.g. 5-10m is normal, but constant 1.00000001 is weird)
  // This is a bit harder to detect without history, but we can flag very low accuracy as suspicious
  if (accuracy < 3 && !isSuspicious) {
    isSuspicious = true;
    reason = 'Akurasi GPS sangat tinggi, terdeteksi potensi penggunaan Mock Location.';
  }

  return { isValid: true, isSuspicious, reason, distance };
}

// Face Recognition Helpers
const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

export async function loadFaceModels() {
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
}

export async function getFaceDescriptor(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) {
  // Try SSD Mobilenet first for better accuracy
  let detection = await faceapi
    .detectSingleFace(imageElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  // Fallback to Tiny Face Detector if SSD fails or is too slow (though usually SSD is fine on modern devices)
  if (!detection) {
    detection = await faceapi
      .detectSingleFace(imageElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
  }
  
  return detection?.descriptor;
}

export function compareFaces(descriptor1: number[], descriptor2: number[]) {
  const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
  // Standard threshold is 0.6. Increasing to 0.65 for more leniency in varying lighting.
  return distance < 0.65; 
}
