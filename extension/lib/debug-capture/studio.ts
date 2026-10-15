import { installDebugCapture } from '../debug-log';

// entrypoints/studio.content.ts imports this module FIRST, for its side effect only: ES modules evaluate in import
// order, so the capture is on before the entrypoint's other imports evaluate, and an error
// while one of them evaluates reaches the debug log. (WXT drops side-effect-only imports when it
// loads an entrypoint at build time to read its options, so this never runs in Node.)
installDebugCapture('studio', { target: window, ownFilesOnly: true });
