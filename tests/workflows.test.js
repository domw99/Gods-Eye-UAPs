import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = '.github/workflows';
const workflows = readdirSync(DIR)
  .filter((f) => f.endsWith('.yml'))
  .map((f) => ({ file: f, text: readFileSync(`${DIR}/${f}`, 'utf8') }));

/** The steps' scripts, each with the `shell:` its step names. The workflows are plain: steps start at six spaces of indent. */
function runSteps(text) {
  const steps = [];
  for (const chunk of text.split(/^ {6}- /m).slice(1)) {
    const lines = chunk.split('\n');
    const at = lines.findIndex((l) => /^\s*run:/.test(l));
    if (at < 0) continue;
    const indent = lines[at].search(/\S/);
    let script = lines[at].replace(/^\s*run:\s*/, '');
    if (/^[|>]/.test(script)) {
      script = '';
      for (let j = at + 1; j < lines.length && (!lines[j].trim() || lines[j].search(/\S/) > indent); j++) script += `${lines[j]}\n`;
    }
    steps.push({ script, shell: /^\s*shell:\s*(\S+)/m.exec(chunk)?.[1] || null });
  }
  return steps;
}

describe('the workflows', () => {
  it('have steps whose scripts can be read', () => {
    expect(workflows.length).toBeGreaterThanOrEqual(8);
    expect(workflows.flatMap((w) => runSteps(w.text)).length).toBeGreaterThan(20);
    const read = runSteps('    steps:\n      - run: a | tee b\n        shell: bash\n      - name: x\n        run: |\n          one\n          two\n        env:\n          K: v\n');
    expect(read.map((s) => ({ ...s, script: s.script.replace(/^\s+/gm, '').trim() }))).toEqual([
      { script: 'a | tee b', shell: 'bash' },
      { script: 'one\ntwo', shell: null },
    ]);
  });

  it('do not paste inputs, branch names or event text into a script (they go through env)', () => {
    for (const { file, text } of workflows)
      for (const { script } of runSteps(text)) {
        const risky = [...script.matchAll(/\$\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]).filter((e) => /^(inputs\.|github\.(ref_name|head_ref|ref\b|event\.(?!name)))/.test(e));
        expect(risky, `${file}: ${script.trim().slice(0, 60)}`).toEqual([]);
      }
  });

  it('use an explicit shell where a script pipes into tee, so a failing command fails the step', () => {
    // Without `shell:`, GitHub runs `bash -e {0}` (no pipefail) and the step takes tee's status.
    for (const { file, text } of workflows)
      for (const { script, shell } of runSteps(text))
        if (/\|\s*tee\b/.test(script)) expect(shell === 'bash' || /pipefail/.test(script), `${file}: ${script.trim().slice(0, 60)}`).toBe(true);
  });

  it('start the Pages deploy after committing site files, since a push made with the workflow token does not', () => {
    for (const { file, text } of workflows) {
      if (file === 'pages.yml' || !/git push/.test(text) || !/git add public/.test(text)) continue;
      expect(text, file).toMatch(/gh workflow run pages\.yml/);
      expect(text, file).toMatch(/actions:\s*write/);
    }
  });
});
