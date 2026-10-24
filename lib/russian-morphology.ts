import { spawn } from "node:child_process";
import { resolve } from "node:path";

export type RussianMorphologyMetrics = {
  posNounPer100: number;
  posAdjectivePer100: number;
  posVerbPer100: number;
  posAdverbPer100: number;
  posPronounPer100: number;
  posConjunctionPer100: number;
  posPrepositionPer100: number;
  posParticlePer100: number;
  posInfinitivePer100: number;
  posParticiplePer100: number;
  posGerundPer100: number;
  genitiveCasePer100: number;
  pastTensePer100: number;
  presentTensePer100: number;
  firstPersonGrammemePer100: number;
  morphologyCoverage: number;
  averageDictionaryParsesPerWord: number;
};

export type RussianMorphologyFeatures = {
  vector: number[];
  analyzedTokens: number;
  metrics: RussianMorphologyMetrics;
};

const EXPECTED_DIMENSIONS = 128;
const TIMEOUT_MS = 30_000;
const MAX_STDOUT = 512_000;
const MAX_STDERR = 16_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePayload(value: unknown): RussianMorphologyFeatures {
  if (!isRecord(value) || !Array.isArray(value.vector) || !isRecord(value.metrics)) {
    throw new Error("Russian morphology helper returned an unexpected JSON shape.");
  }
  if (value.vector.length !== EXPECTED_DIMENSIONS || value.vector.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
    throw new Error(`Russian morphology vector must contain ${EXPECTED_DIMENSIONS} finite numbers.`);
  }
  if (typeof value.analyzedTokens !== "number" || !Number.isFinite(value.analyzedTokens)) {
    throw new Error("Russian morphology helper did not return analyzedTokens.");
  }

  const metricKeys: (keyof RussianMorphologyMetrics)[] = [
    "posNounPer100", "posAdjectivePer100", "posVerbPer100", "posAdverbPer100",
    "posPronounPer100", "posConjunctionPer100", "posPrepositionPer100", "posParticlePer100",
    "posInfinitivePer100", "posParticiplePer100", "posGerundPer100", "genitiveCasePer100",
    "pastTensePer100", "presentTensePer100", "firstPersonGrammemePer100", "morphologyCoverage",
    "averageDictionaryParsesPerWord",
  ];
  for (const key of metricKeys) {
    if (typeof value.metrics[key] !== "number" || !Number.isFinite(value.metrics[key])) {
      throw new Error(`Russian morphology helper returned an invalid metric: ${key}.`);
    }
  }

  return {
    vector: value.vector as number[],
    analyzedTokens: value.analyzedTokens,
    metrics: value.metrics as unknown as RussianMorphologyMetrics,
  };
}

/**
 * Invoke the local pymorphy3 helper. No poem text is sent to a third-party API.
 * Set PYTHON_EXECUTABLE to a specific python.exe path if the default command fails.
 */
export async function analyzeRussianMorphology(texts: string[]): Promise<RussianMorphologyFeatures> {
  if (!texts.length || texts.some((text) => typeof text !== "string")) {
    throw new Error("Morphology input must be a non-empty array of poem strings.");
  }

  const scriptPath = resolve(process.cwd(), "scripts", "russian_morphology.py");
  const configuredPython = process.env.PYTHON_EXECUTABLE?.trim();
  const command = configuredPython || (process.platform === "win32" ? "py" : "python3");
  const args = configuredPython
    ? [scriptPath]
    : process.platform === "win32"
      ? ["-3", scriptPath]
      : [scriptPath];

  return new Promise<RussianMorphologyFeatures>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(error);
    };

    const timer = setTimeout(() => {
      child.kill();
      settleReject(new Error("Russian morphology analysis timed out. Try shorter input or check Python installation."));
    }, TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > MAX_STDOUT) {
        child.kill();
        settleReject(new Error("Russian morphology helper output exceeded the permitted size."));
      }
    });
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < MAX_STDERR) stderr += chunk.slice(0, MAX_STDERR - stderr.length);
    });
    child.on("error", (error) => {
      const detail = error.message.includes("ENOENT")
        ? `Python executable '${command}' was not found. Install Python and run: py -3 -m pip install -r scripts/requirements-morphology.txt. You may set PYTHON_EXECUTABLE in .env.local.`
        : `Could not start Russian morphology helper: ${error.message}`;
      settleReject(new Error(detail));
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        const detail = stderr.trim() || `Python process exited with code ${code}.`;
        settleReject(new Error(detail));
        return;
      }
      try {
        const parsed: unknown = JSON.parse(stdout);
        const result = validatePayload(parsed);
        settled = true;
        clearTimeout(timer);
        resolvePromise(result);
      } catch (error) {
        settleReject(error instanceof Error ? error : new Error("Could not parse morphology helper result."));
      }
    });

    child.stdin.on("error", () => undefined);
    child.stdin.end(JSON.stringify({ texts }));
  });
}
