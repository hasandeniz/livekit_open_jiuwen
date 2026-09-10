// Minimal, framework-agnostic types for the FaceUnity FURenderKit avatar.
// Adapted from the original Vite/Redux component, stripped of all app coupling.

/** The single avatar id shipped with this project. */
export const AVATAR_ID = '1uXv3aAcC';

/** Parsed `index.json` for an avatar. */
export interface BundleSpec {
  style: string;
  camera: string;
  light: string;
  bundles: string[];
  animations: string[];
}

/** What `loadAvatar` keeps per avatar. */
export interface AvatarSpec {
  bundle: BundleSpec;
  /** Raw avatar.json text/object passed to loadFromJson. */
  jsonData: unknown;
}

export type AvatarStatus = 'idle' | 'loading' | 'ready' | 'error';
