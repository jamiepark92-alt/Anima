// Turns a written or dictated description into an image with FLUX on Replicate.
// Runs on the Expo server so the Replicate token never ships inside the app.

const MODEL = 'black-forest-labs/flux-schnell';

const FRAMING = {
  character: { aspect: '3:4', lead: 'Full-body character illustration on a plain background' },
  props: { aspect: '1:1', lead: 'A single object, centred on a plain background' },
  set: { aspect: '16:9', lead: 'A wide background scene with no people in it' },
} as const;

type Kind = keyof typeof FRAMING;

export async function POST(request: Request) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return Response.json(
      { error: 'Image making is not set up yet. Add a Replicate token to .env.local.' },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as { prompt?: unknown; kind?: unknown };
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 600) : '';
  const kind = body?.kind as Kind;
  if (!prompt || !(kind in FRAMING)) {
    return Response.json({ error: 'Describe what to make first.' }, { status: 400 });
  }

  const framing = FRAMING[kind];
  const prediction = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Hold the connection until the image is ready instead of polling.
      Prefer: 'wait',
    },
    body: JSON.stringify({
      input: {
        prompt: `${framing.lead}: ${prompt}`,
        aspect_ratio: framing.aspect,
        output_format: 'jpg',
        output_quality: 85,
      },
    }),
  });
  const result = (await prediction.json().catch(() => null)) as {
    output?: string[];
    error?: string;
    detail?: string;
  } | null;
  const imageUrl = result?.output?.[0];
  if (!prediction.ok || !imageUrl) {
    return Response.json(
      { error: result?.error ?? result?.detail ?? 'The image could not be made. Try again.' },
      { status: 502 },
    );
  }

  // Replicate's file links expire within the hour, so hand the image back inline.
  const image = await fetch(imageUrl);
  if (!image.ok) {
    return Response.json(
      { error: 'The image could not be downloaded. Try again.' },
      { status: 502 },
    );
  }
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const base64 = btoa(binary);
  return Response.json({ uri: `data:image/jpeg;base64,${base64}` });
}
