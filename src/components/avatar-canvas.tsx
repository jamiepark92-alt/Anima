import {
  Canvas,
  Fill,
  ImageShader,
  Rect,
  Shader,
  Skia,
  rect,
  useImage,
  type CanvasRef,
} from '@shopify/react-native-skia';
import { useMemo, type RefObject } from 'react';

import { AVATAR_SHADER } from '@/avatar/shader';
import { hexToRgb, type AvatarStyle } from '@/avatar/style';

type Props = {
  uri: string;
  style: AvatarStyle;
  size: number;
  canvasRef: RefObject<CanvasRef | null>;
};

export function AvatarCanvas({ uri, style, size, canvasRef }: Props) {
  const image = useImage(uri);
  const effect = useMemo(() => Skia.RuntimeEffect.Make(AVATAR_SHADER), []);
  const box = rect(0, 0, size, size);
  const [c0, c1, c2, c3, c4] = style.palette.map(hexToRgb);

  return (
    <Canvas ref={canvasRef} style={{ width: size, height: size }}>
      <Fill color={style.palette[4]} />
      {image && effect && (
        <Rect rect={box}>
          <Shader
            source={effect}
            uniforms={{
              size: [size, size],
              c0,
              c1,
              c2,
              c3,
              c4,
              lineAmount: (style.line - 1) / 9,
              levels: 1 + style.detail,
              textureAmount: (style.texture - 1) / 9,
            }}>
            <ImageShader image={image} fit="cover" rect={box} />
          </Shader>
        </Rect>
      )}
    </Canvas>
  );
}
