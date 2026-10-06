/**
 * Is this module the script node was started with? Scripts that tests also import (to reach their pure
 * functions) run their `main()` only then. The paths are compared as real paths: node follows a symlink
 * for `import.meta.url` but not for `process.argv[1]`, so a checkout reached through a symlinked folder
 * (macOS's /tmp, a linked work disk) would otherwise run nothing and exit 0.
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isMain(metaUrl, argv1 = process.argv[1]) {
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false; // no script path (node -e, a REPL)
  }
}
