#!/usr/bin/env node
import { type StdioOptions, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectPath = path.join(process.cwd(), 'example', 'android');

function openApp(
  command: string,
  args: string[],
  options: { detached?: boolean; stdio?: StdioOptions } = {}
) {
  const detached = options.detached ?? true;
  const child = spawn(command, args, {
    detached,
    stdio: options.stdio ?? 'ignore',
  });

  child.once('error', (error) => {
    console.error(`Error: Failed to open Android Studio: ${error.message}`);
    process.exit(1);
  });

  child.once('spawn', () => {
    if (detached) {
      child.unref();
    }
  });
}

const { ANDROID_STUDIO: androidStudio } = process.env;

switch (process.platform) {
  case 'darwin':
    // Open command sends an AppleEvent to launch the app and then exits immediately, so we can inherit the stdio.
    openApp('open', ['-a', 'Android Studio', projectPath], {
      detached: false,
      stdio: 'inherit',
    });
    break;
  case 'linux': {
    const home = os.homedir();

    let studioSh;

    if (androidStudio) {
      studioSh = path.join(androidStudio, 'bin', 'studio.sh');
      if (!fs.existsSync(studioSh)) {
        console.error(
          `Error: Android Studio not found at ${studioSh}.\n` +
            `Check that the ANDROID_STUDIO environment variable points to your Android Studio installation directory, ` +
            `or open the project manually in Android Studio: ${projectPath}`
        );
        process.exit(1);
      }
    } else {
      const possiblePaths = [
        // Tarball install in home directory
        `${home}/android-studio/bin/studio.sh`,
        // Common system-wide installs
        '/opt/android-studio/bin/studio.sh',
        '/usr/local/android-studio/bin/studio.sh',
        // snap
        '/snap/android-studio/current/bin/studio.sh',
        // TODO @behenate Install toolbox on Linux and check which is the correct path
        // JetBrains Toolbox 2.x (flat layout)
        `${home}/.local/share/JetBrains/Toolbox/apps/android-studio/bin/studio.sh`,
        // JetBrains Toolbox 2.x (with channel subdirectory still present)
        `${home}/.local/share/JetBrains/Toolbox/apps/android-studio/ch-0/bin/studio.sh`,
        // Flatpak (user install)
        `${home}/.local/share/flatpak/app/com.google.AndroidStudio/current/active/files/extra/android-studio/bin/studio.sh`,
        // Flatpak (system install)
        '/var/lib/flatpak/app/com.google.AndroidStudio/current/active/files/extra/android-studio/bin/studio.sh',
      ];

      studioSh = possiblePaths.find((p) => fs.existsSync(p));

      if (!studioSh) {
        for (const bin of ['studio.sh', 'android-studio', 'studio']) {
          const lookups = [
            ['which', bin],
            ['sh', '-c', `command -v ${bin}`],
          ] as const;
          for (const [command, ...args] of lookups) {
            const r = spawnSync(command, args, { encoding: 'utf8' });
            if (r.status === 0 && r.stdout.trim()) {
              studioSh = r.stdout.trim();
              break;
            }
          }
          if (studioSh) {
            break;
          }
        }
      }

      if (!studioSh) {
        console.error(
          `Error: Android Studio not found.\n` +
            `Set the ANDROID_STUDIO environment variable to your Android Studio installation directory, ` +
            `or open the project manually in Android Studio: ${projectPath}`
        );
        process.exit(1);
      }
    }
    // On Linux we launch Android Studio directly (long-running process), so don't inherit stdio
    openApp(studioSh, [projectPath]);
    break;
  }
  case 'win32': {
    const studioExe = androidStudio
      ? path.join(androidStudio, 'bin', 'studio64.exe')
      : path.join('C:', 'Program Files', 'Android', 'Android Studio', 'bin', 'studio64.exe');
    if (!require('fs').existsSync(studioExe)) {
      console.error(
        `Error: Android Studio not found at ${studioExe}.\n` +
          `Set the ANDROID_STUDIO environment variable to your Android Studio installation directory, ` +
          `or open the project manually in Android Studio: ${projectPath}`
      );
      process.exit(1);
    }
    // On Windows we launch Android Studio directly (long-running process), so don't inherit stdio
    openApp(studioExe, [projectPath]);
    break;
  }
  default:
    console.error(`Error: Unsupported platform: ${process.platform}`);
    process.exit(1);
}
