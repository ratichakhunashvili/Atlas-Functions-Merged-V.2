"use client";

import { HASH_GRID, hashFromGreyscale } from "@/lib/ar-hash";

/**
 * Browser-side half of AR matching: reduce a video frame or an image to the
 * greyscale grid that `hashFromGreyscale` expects.
 *
 * The frame is centre-cropped to a square first so that a portrait phone
 * viewfinder and a landscape reference photo hash the same subject rather than
 * different amounts of background.
 */
function drawSquare(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = HASH_GRID;
  canvas.height = HASH_GRID;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  const side = Math.min(sourceWidth, sourceHeight);
  const sx = (sourceWidth - side) / 2;
  const sy = (sourceHeight - side) / 2;
  context.drawImage(source, sx, sy, side, side, 0, 0, HASH_GRID, HASH_GRID);
  return context.getImageData(0, 0, HASH_GRID, HASH_GRID);
}

function toGreyscale(imageData: ImageData): number[] {
  const grey: number[] = [];
  const { data } = imageData;
  for (let index = 0; index < data.length; index += 4) {
    // Rec. 601 luma — matches how the eye weights the channels.
    grey.push(0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]);
  }
  return grey;
}

export function hashVideoFrame(video: HTMLVideoElement): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const imageData = drawSquare(video, video.videoWidth, video.videoHeight);
  return imageData ? hashFromGreyscale(toGreyscale(imageData)) : null;
}

/** Hashes an image file in the admin form, so the reference hash is stored at upload time. */
export async function hashImageFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not read that image."));
      element.src = url;
    });
    const imageData = drawSquare(image, image.naturalWidth, image.naturalHeight);
    return imageData ? hashFromGreyscale(toGreyscale(imageData)) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
