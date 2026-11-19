import { Redirect } from 'expo-router';

// The app opens straight on the camera.
export default function Index() {
  return <Redirect href="/camera" />;
}
