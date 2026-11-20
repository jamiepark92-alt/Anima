export type ScreenPin = { uri: string; x: number; y: number; size: number };

export type BakeInput = {
  photo: { uri: string };
  pins: ScreenPin[];
  // The on-screen viewfinder the pins were placed on.
  view: { width: number; height: number };
  // True when the preview was mirrored but the saved photo isn't (front camera).
  mirrored: boolean;
};

// The preview fills the viewfinder like `cover`, so the photo is scaled and cropped to it.
// This maps each pin from screen points back into the photo's pixels.
export function pinRects(
  photo: { width: number; height: number },
  pins: ScreenPin[],
  view: { width: number; height: number },
  mirrored: boolean,
) {
  const scale = Math.max(view.width / photo.width, view.height / photo.height);
  const offsetX = (view.width - photo.width * scale) / 2;
  const offsetY = (view.height - photo.height * scale) / 2;

  return pins.map((pin) => {
    const x = (pin.x - offsetX) / scale;
    return {
      uri: pin.uri,
      box: {
        cx: mirrored ? photo.width - x : x,
        cy: (pin.y - offsetY) / scale,
        size: pin.size / scale,
      },
    };
  });
}
