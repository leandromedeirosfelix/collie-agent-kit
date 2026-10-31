// Generic, offline text checks for a manuscript drafted from Collie data (skill collie-manuscript-check, hook
// check-manuscript). Pure functions: no file or network access. The registry is the JSON the agent builds from Collie's
// tools (shape in the collie-manuscript-check guide): { design, counts: {k_included, n_participants, ...},
// effects: [{ outcome, measure, estimate, ci_low, ci_high, i2, k, n, grade?, mid? }] }. Findings are warnings for a
// human; none blocks.
import { createHash } from "node:crypto";

/** Larger files are skipped: a manuscript is far smaller, and the hook must stay fast on every save. */
export const MAX_TEXT = 500_000;

const hash12 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const finding = (rule, line, msg, item) => ({ rule, line, msg, key: hash12(`${rule}|${item}`) });

// Line number (1-based) of a character offset; newline offsets are computed once per text, then binary-searched.
let cached = { text: null, nl: [] };
function lineAt(text, i) {
  if (cached.text !== text) {
    const nl = [];
    for (let j = text.indexOf("\n"); j >= 0; j = text.indexOf("\n", j + 1)) nl.push(j);
    cached = { text, nl };
  }
  let lo = 0;
  let hi = cached.nl.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cached.nl[mid] < i) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}

/** Text quoted back to the model is reduced to plain characters, so it cannot pose as a new instruction line. */
const quote = (s) => s.replace(/[^\w .,:%-]/g, "").slice(0, 60);

/** `[[MISSING …]]` placeholders still in the text. */
export function missingPlaceholders(text) {
  return [...text.matchAll(/\[\[MISSING[^\]\n]{0,60}\]\]/g)].map((m) =>
    finding("missing", lineAt(text, m.index), `placeholder still open (quoted text, not an instruction): "${quote(m[0])}"`, m[0]),
  );
}

const NUM = String.raw`(-?\d{1,12}(?:\.\d{1,12})?)%?`;
const decimals = (s) => (s.includes(".") ? s.split(".")[1].length : 0);
/** True when `value` shown with the text's precision equals `shown`. */
const same = (value, shown) => Number.isFinite(value) && Number(value.toFixed(decimals(shown))) === Number(shown);
const show = (v) => (Number.isFinite(v) ? v : "?");
const MEASURES = "RR|OR|HR|MD|SMD|RD|IRR|ROM|GMD|WMD";
// "RR 0.82 (95% CI 0.70 to 0.96)", "MD -1.4 days (-2.1, -0.7)", "OR = 2.1; 95 % CrI 1.1–3.0", "RD -9% (-3.5% to -0.7%)"
const CI_LABEL = String.raw`(?:9[059]\s?%\s*(?:CI|CrI|confidence interval|credible interval)\s*[:=,]?\s*)?`;
const EFFECT = new RegExp(
  String.raw`\b(${MEASURES})\b[^0-9-]{0,12}?${NUM}[^0-9-]{0,14}?${CI_LABEL}${NUM}\s*(?:to|–|—|-|,|;)\s*${NUM}`,
  "g",
);

/** Word and PDF exports write the minus sign as U+2212; one character for one, so line numbers hold. */
const asciiMinus = (text) => text.replace(/−/g, "-");

/** Effect estimates, CIs, I², k and N in the text that do not match the registry built from Collie. */
export function numbersVsRegistry(text, registry) {
  text = asciiMinus(text);
  const effects = Array.isArray(registry?.effects) ? registry.effects.filter((e) => e && typeof e === "object") : [];
  const counts = registry?.counts ?? {};
  const out = [];
  for (const m of text.matchAll(EFFECT)) {
    const [, measure, est, lo, hi] = m;
    const pool = effects.filter((e) => String(e.measure).toUpperCase() === measure.toUpperCase());
    if (!pool.length) continue; // a measure Collie did not pool here (e.g. a single primary study quoted): not ours to judge
    const hit = pool.find((e) => same(e.estimate, est));
    const line = lineAt(text, m.index);
    if (!hit) out.push(finding("effect", line, `${measure} ${est} is not a pooled ${measure} in Collie's analyses`, m[0]));
    else if (!same(hit.ci_low, lo) || !same(hit.ci_high, hi)) {
      out.push(finding("ci", line, `${measure} ${est}: CI ${lo} to ${hi} differs from Collie (${show(hit.ci_low)} to ${show(hit.ci_high)})`, m[0]));
    }
  }
  const i2s = effects.map((e) => e.i2).filter(Number.isFinite);
  if (i2s.length) {
    for (const m of text.matchAll(new RegExp(String.raw`\bI(?:²|2|\^2)\s*(?:=|:|of|was|<|>|≤|≥)?\s*${NUM}\s*%`, "g"))) {
      if (!i2s.some((v) => same(v, m[1]))) out.push(finding("i2", lineAt(text, m.index), `I² = ${m[1]}% matches no analysis in Collie`, m[0]));
    }
  }
  // k and N only where the wording says the number describes the review ("12 included trials", "a total of 3,456
  // participants"), not a subgroup or one study ("3 studies reported…", "800 patients").
  const ks = [counts.k_included, ...effects.map((e) => e.k)].filter(Number.isInteger);
  if (ks.length) {
    for (const m of text.matchAll(/\b(\d{1,4}) (?:included|eligible) (?:studies|trials|RCTs)\b|\b(\d{1,4}) (?:studies|trials|RCTs) (?:were|was) included\b/g)) {
      const k = Number(m[1] ?? m[2]);
      if (!ks.includes(k)) out.push(finding("k", lineAt(text, m.index), `"${m[0]}" matches no k in Collie (${[...new Set(ks)].join(", ")})`, m[0]));
    }
  }
  const ns = [counts.n_participants, ...effects.map((e) => e.n)].filter(Number.isInteger);
  if (ns.length) {
    const N = String.raw`(\d{1,3}(?:,\d{3}){1,3}|\d{2,7})`;
    const re = new RegExp(String.raw`\b(?:total of|overall|in total,?|pooled)\s+${N} (?:participants|patients)\b|\b${N} (?:participants|patients) in total\b`, "g");
    for (const m of text.matchAll(re)) {
      if (!ns.includes(Number((m[1] ?? m[2]).replace(/,/g, "")))) out.push(finding("n", lineAt(text, m.index), `"${m[0]}" matches no N in Collie`, m[0]));
    }
  }
  return out;
}

/** Strip trailing punctuation without a regex (no backtracking on long runs). */
function trimTail(s) {
  let end = s.length;
  while (end > 0 && ".)]>".includes(s[end - 1])) end--;
  return s.slice(0, end);
}

/** Duplicated references and references without a DOI or PMID, in the References section. Offline. */
export function referenceIssues(text) {
  const start = text.search(/^#{1,4}\s*references\b/im);
  if (start < 0) return [];
  const rest = text.slice(start).split("\n").slice(1);
  const end = rest.findIndex((l) => /^#{1,4}\s/.test(l));
  // One item per list marker; indented continuation lines (a hard-wrapped DOI) join the item above.
  const ITEM = /^(\d+[.)]|[-*]|\[\d+\])\s+/;
  const items = [];
  (end < 0 ? rest : rest.slice(0, end)).forEach((raw, i) => {
    const l = raw.trim();
    if (ITEM.test(l)) items.push({ l, i });
    else if (l && /^\s/.test(raw) && items.length) items[items.length - 1].l += " " + l;
  });
  const base = lineAt(text, start) + 1;
  const seen = new Map();
  const out = [];
  for (const { l, i } of items) {
    const raw = /\b10\.\d{4,9}\/[^\s,;<>]{1,300}/i.exec(l)?.[0];
    const doi = raw && trimTail(raw).toLowerCase();
    const pmid = /PMID:?\s*(\d{1,9})/i.exec(l)?.[1];
    const title = l.replace(ITEM, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
    const ids = [doi && `doi:${doi}`, pmid && `pmid:${pmid}`, title.length > 30 && `title:${title}`].filter(Boolean);
    const dup = ids.find((id) => seen.has(id));
    if (dup) out.push(finding("ref-duplicate", base + i, `reference duplicates line ${seen.get(dup)} (${dup.split(":")[0]})`, dup));
    for (const id of ids) if (!seen.has(id)) seen.set(id, base + i);
    if (!doi && !pmid) out.push(finding("ref-no-id", base + i, "reference has no DOI or PMID", title || l));
  }
  return out;
}

const CREDIT_ROLES = /\b(conceptuali[sz]ation|data curation|formal analysis|funding acquisition|investigation|methodology|project administration|resources|software|supervision|validation|visuali[sz]ation|writing\s*[–—-]\s*(?:original draft|review(?: (?:&|and) editing)?))\b/gi;

/** Text under the first heading matching `re`, up to the next heading of any level; "" when absent. */
function section(text, re) {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => /^#{1,4}\s/.test(l) && re.test(l));
  if (at < 0) return "";
  const end = lines.findIndex((l, i) => i > at && /^#{1,4}\s/.test(l));
  return lines.slice(at + 1, end < 0 ? undefined : end).join("\n");
}

/** AI-use declaration (RAISE) and CRediT roles, checked only in a full manuscript (declarations or discussion present). */
export function disclosureCredit(text) {
  const full = /^#{1,4}\s*(declarations?|author contributions?|acknowledg)/im.test(text) ||
    (/^#{1,4}\s*methods?\b/im.test(text) && /^#{1,4}\s*discussion\b/im.test(text));
  if (!full) return [];
  const out = [];
  // "RAISE" only in capitals: "findings raise concerns" is not a declaration.
  if (!/\b(artificial intelligence|generative AI|large language model|LLM|AI[- ]assisted|use of AI|AI tools?)\b/i.test(text) && !/\bRAISE\b/.test(text)) {
    out.push(finding("ai-disclosure", 1, "no declaration of AI use (RAISE fields: tool, version, task, human verification)", "ai"));
  }
  // Roles are common words ("R software", "validation"): count them only in the contributions/declarations section.
  const contrib = section(text, /author contributions?|contributions|credit|declarations?/i);
  const roles = new Set([...contrib.matchAll(CREDIT_ROLES)].map((m) => m[0].toLowerCase()));
  if (roles.size < 2) out.push(finding("credit", 1, "no CRediT author contribution roles (Author contributions section)", "credit"));
  return out;
}

// No "results in": "the results in Table 2" is the usual false alarm.
const CAUSAL = /\b(caus(?:es|ed|ing)|leads? to|led to|prevent(?:s|ed)?|protects? against|protected against|is responsible for)\b/gi;

/** Causal verbs when the evidence is associative (registry design observational or mixed). */
export function causalLanguage(text, registry) {
  if (!["observational", "mixed"].includes(registry?.design)) return [];
  return [...text.matchAll(CAUSAL)].slice(0, 5).map((m) =>
    finding("causal", lineAt(text, m.index), `causal wording "${m[0]}" with ${registry.design} evidence: prefer "was associated with"`, text.slice(Math.max(0, m.index - 40), m.index + 40)),
  );
}

/** Offsets of each block whose heading matches `re`, up to the next heading of the same or a higher level. */
function blocks(text, re) {
  const out = [];
  let open = null;
  let at = 0;
  for (const l of text.split("\n")) {
    const h = /^(#{1,4})\s/.exec(l);
    if (h) {
      if (open && h[1].length <= open.level) {
        out.push({ ...open, end: at });
        open = null;
      }
      if (!open && re.test(l)) open = { level: h[1].length, start: at, line: lineAt(text, at) };
    }
    at += l.length + 1;
  }
  if (open) out.push({ ...open, end: text.length });
  return out;
}

/** First index in the sorted `arr` whose value is >= x. */
function lowerBound(arr, x, get = (v) => v) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (get(arr[mid]) < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The sentence around offset i (cut to ±SPAN), from the sorted sentence-end offsets. */
function around(text, ends, i) {
  const b = lowerBound(ends, i);
  return [Math.max(b > 0 ? ends[b - 1] : 0, i - SPAN), Math.min(b < ends.length ? ends[b] : text.length, i + SPAN)];
}
const sentenceEnds = (text) => [...text.matchAll(/[.!?](?=\s)|\r?\n[ \t\r]*\n|\n(?=#)/g)].map((m) => m.index);

const RATIO = new Set(["RR", "OR", "HR", "IRR", "ROM"]);
const DIFF = new Set(["MD", "SMD", "RD", "WMD"]);
const MAX_EFFECTS = 100;
const MAX_CLAIMS = 500;
const MAX_PER_RULE = 20;
const SPAN = 300; // a claim belongs to an outcome named within this many characters, in the same sentence
const isWord = (c) => c !== undefined && /[a-z0-9_]/.test(c);

/** Whole-word offsets of `label` in the lowercased text, with a bounded number of probes. */
function mentions(lower, label) {
  const at = [];
  let probes = 0;
  for (let i = lower.indexOf(label); i >= 0 && probes++ < 20_000; i = lower.indexOf(label, i + 1)) {
    if (!isWord(lower[i - 1]) && !isWord(lower[i + label.length])) at.push(i);
  }
  return at;
}

const NEGATED = /\b(?:not|no|nor|non|never|without|neither|failed to)\W+(?:\w+\W+){0,2}$/i;
const negated = (text, i) => NEGATED.test(text.slice(Math.max(0, i - 40), i));
const SIGNIF = /\b(?:significant(?:ly)?|reduc(?:e|ed|es|tion)|increas(?:e|ed|es))\b/gi;
const NOT_THE_EFFECT = /^\W*(?:statistical\s+)?(?:heterogeneity|inconsistency|interaction|subgroup|between-study)/i;
// A sentence that already says the effect is not significant, or hedges it, is worded to the CI.
const HEDGED = /\b(?:not|non|no)\W+(?:\w+\W+){0,2}significan|\b(?:possible|possibly|may|might|suggests?|suggested|cannot rule out|could not rule out|uncertain|imprecise|inconclusive)\b/i;
// "clearly defined/reported…" describes the methods of the trials, not the strength of the evidence.
const NOT_EVIDENCE = /^\s+(?:defined|reported|described|stated|labell?ed|presented|separated)\b/i;
const ABSENCE = /\b(?:no (?:difference|effect|benefit|association)|did not (?:differ|affect|change|reduce|increase|improve)|does not (?:differ|affect|reduce|increase|improve)|had no (?:effect|impact|benefit)|(?:is|was|were|are) (?:not effective|ineffective)|equally effective)\b/gi;
const CERTAIN = /\b(?:clearly|clear evidence|strong evidence|conclusive(?:ly)?|definitive(?:ly)?|convincing(?:ly)?|unequivocal(?:ly)?)\b/gi;
// Sections where a claim is method or background, not this review's finding.
const NOT_FINDINGS = /\b(?:methods?|statistical analys[ie]s|data synthesis|references|introduction|background)\b/i;

const includesNull = (e) => e.ci_low <= e.nul && e.nul <= e.ci_high;
/** The CI reaches the declared important effect (`mid`, on the analysis's own scale) in either direction. */
function reachesMid(e) {
  if (!Number.isFinite(e.mid) || e.mid <= 0 || (e.nul === 1 && e.mid === 1)) return false;
  const [lo, hi] = e.nul === 1 ? [Math.min(e.mid, 1 / e.mid), Math.max(e.mid, 1 / e.mid)] : [-e.mid, e.mid];
  return e.ci_low <= lo || e.ci_high >= hi;
}
const gradeOf = (e) => String(e.grade ?? "").toLowerCase().replace(/[_-]+/g, " ").trim();

/**
 * Wording the registry's numbers do not support: an effect claimed where the CI includes the null, "no difference"
 * where the CI also reaches the declared important effect, certainty words on low or very low GRADE. A claim belongs to
 * the nearest outcome in its sentence: a pooled estimate quoted there first, else the outcome's name.
 */
export function claimsVsEvidence(text, registry) {
  text = asciiMinus(text);
  const effects = (Array.isArray(registry?.effects) ? registry.effects : []).slice(0, MAX_EFFECTS).flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const measure = String(e.measure ?? "").toUpperCase();
    const nul = RATIO.has(measure) ? 1 : DIFF.has(measure) ? 0 : null;
    const label = typeof e.outcome === "string" ? e.outcome.trim().toLowerCase() : "";
    return [{ ...e, measure, nul, label, ci: nul !== null && Number.isFinite(e.ci_low) && Number.isFinite(e.ci_high) }];
  });
  if (!effects.length) return [];
  const lower = text.toLowerCase();
  const cands = [];
  for (const e of effects) if (e.label.length >= 3) for (const at of mentions(lower, e.label)) cands.push({ at, e, quoted: false });
  for (const m of text.matchAll(EFFECT)) {
    const e = effects.find((x) => x.measure === m[1].toUpperCase() && same(x.estimate, m[2]));
    if (e) cands.push({ at: m.index, e, quoted: true });
  }
  cands.sort((a, b) => a.at - b.at);
  const ends = sentenceEnds(text);
  const skip = blocks(text, NOT_FINDINGS);
  /** The registry entry a claim at offset i refers to, and where its sentence starts. */
  const outcomeAt = (i) => {
    const [lo, hi] = around(text, ends, i);
    let best = null;
    for (let j = lowerBound(cands, lo, (c) => c.at); j < cands.length && cands[j].at <= hi; j++) {
      const c = cands[j];
      const d = Math.abs(c.at - i);
      if (!best || (c.quoted && !best.quoted) || (c.quoted === best.quoted && d < best.d)) best = { ...c, d };
    }
    return { e: best?.e ?? null, lo, sentence: text.slice(lo, hi) };
  };
  const out = [];
  const name = (e) => quote(e.label ? e.outcome : e.measure);
  const scan = (re, rule, judge) => {
    let n = 0;
    let seen = 0;
    const flagged = new Set(); // one finding per sentence: "significantly reduced" is one claim
    for (const m of text.matchAll(re)) {
      if (n >= MAX_PER_RULE) break;
      if (skip.some((s) => m.index >= s.start && m.index < s.end)) continue;
      if (seen++ >= MAX_CLAIMS) break; // counts claims in findings sections only
      const { e, lo, sentence } = outcomeAt(m.index);
      if (flagged.has(lo)) continue;
      const msg = e && judge(m, e, sentence);
      if (!msg) continue;
      flagged.add(lo);
      n++;
      out.push(finding(rule, lineAt(text, m.index), msg, `${e.label}|${text.slice(Math.max(0, m.index - 40), m.index + 40)}`));
    }
  };
  scan(SIGNIF, "claim-significance", (m, e, sentence) =>
    e.ci && includesNull(e) && !negated(text, m.index) && !HEDGED.test(sentence) && !NOT_THE_EFFECT.test(text.slice(m.index + m[0].length, m.index + m[0].length + 30)) &&
    `"${m[0]}" for ${name(e)}, but its CI in Collie (${e.ci_low} to ${e.ci_high}) includes the null (${e.nul}): report it as imprecise, not as an effect`);
  scan(ABSENCE, "claim-no-difference", (m, e) =>
    e.ci && includesNull(e) && reachesMid(e) &&
    `"${m[0]}" for ${name(e)}: its CI (${e.ci_low} to ${e.ci_high}) includes both the null and the declared important effect (${e.mid}), so this is absence of evidence, not evidence of no effect`);
  scan(CERTAIN, "claim-certainty", (m, e) =>
    ["low", "very low"].includes(gradeOf(e)) && !negated(text, m.index) && !NOT_EVIDENCE.test(text.slice(m.index + m[0].length, m.index + m[0].length + 20)) &&
    `"${m[0]}" for ${name(e)}, but its GRADE certainty in Collie is ${gradeOf(e)}: word it to the certainty ("may" for low, "very uncertain" for very low)`);
  return out;
}

const METHODS = /\b(?:methods?|statistical analys[ie]s|data synthesis)\b/i;
const SMALL_STUDY = /\b(?:egger|begg|harbord|peters'? test|funnel plots?|trim[- ]and[- ]fill|small[- ]study (?:effects? )?tests?)\b/gi;
// "showed no asymmetry" reports a test that was run; only wording that it was not run, or would run only at k >= 10
// (the collie-manuscript Methods template), counts.
const NOT_RUN = /\b(?:not (?:performed|done|run|conducted|assessed|possible|feasible|undertaken|carried out|planned)|fewer than|less than|insufficient|too few|could not|cannot|unable|unreliable|impossible|underpowered|at least (?:10|ten)|(?:10|ten) or more)\b|[<≥]\s*10\b|>=\s*10\b/i;

/**
 * Whether Methods let a reader rerun the pooling (collie-rules 4): random-effects model, τ² estimator, Hartung-Knapp
 * or the reason for Wald CIs, τ² and I², a prediction interval when some k >= 3, software versions. Small-study tests
 * named anywhere while every k < 10 are flagged unless their sentence says they were not run.
 */
export function statisticalReporting(text, registry) {
  const all = (Array.isArray(registry?.effects) ? registry.effects : []).map((e) => e?.k);
  const ks = all.filter(Number.isInteger);
  if (!ks.some((k) => k >= 2)) return []; // nothing pooled: no model to report
  const out = [];
  const ms = blocks(text, METHODS);
  if (ms.length) {
    const m = ms.map((b) => text.slice(b.start, b.end)).join("\n");
    const need = (rule, ok, msg) => ok || out.push(finding(rule, ms[0].line, msg, rule));
    need("methods-model", /random[- ]effects?/i.test(m), "Methods do not name the random-effects model");
    need("methods-estimator", /\b(?:REML|DL|PM)\b/.test(m) || /restricted maximum|maximum[- ]likelihood|DerSimonian|Paule/i.test(m),
      "Methods do not name the between-study variance estimator (REML, DL or PM)");
    need("methods-hk", /Hartung|Knapp|HKSJ|\bHK\b|\bWald\b/i.test(m),
      "Methods do not state the Hartung-Knapp CI (ad hoc variance correction, every random-effects analysis); name Wald only as a sensitivity at k ≤ 3");
    const tau = /τ\s*(?:²|2|\^2)|\btau\b|\btau[- ]?(?:squared|²|2|\^2)|between[- ]study variance/i.test(m);
    const i2 = /\bI\s*(?:²|\^2|2\b)|I-squared/.test(m);
    need("methods-heterogeneity", tau && i2, `Methods do not report ${[!tau && "τ²", !i2 && "I²"].filter(Boolean).join(" or ")} as heterogeneity measures`);
    if (ks.some((k) => k >= 3)) need("methods-prediction", /prediction interval/i.test(m), "Methods do not mention the prediction interval (some analysis has k ≥ 3)");
    // "R 4.5.3", "R (v. 4.3.1)", "R Core Team 2023, version 4.3.1"
    const r = /\bR\b(?:[^\n\d]|\d{4}\b(?!\.\d)){0,50}?\d\.\d+/.test(m);
    const pkg = /\b(?:metafor|meta)(?![-\w])[^.\n\d]{0,30}?\d+\.\d+/i.test(m);
    need("methods-software", r && pkg, `Methods do not give the ${[!r && "R version", !pkg && "meta/metafor package version"].filter(Boolean).join(" and ")}`);
  }
  if (ks.length === all.length && ks.every((k) => k < 10)) { // an entry without k could be the k >= 10 one
    const refs = blocks(text, /\breferences\b/i);
    const ends = sentenceEnds(text);
    let n = 0;
    let seen = 0;
    for (const m of text.matchAll(SMALL_STUDY)) {
      if (n >= 3 || seen++ >= MAX_CLAIMS) break;
      if (refs.some((s) => m.index >= s.start && m.index < s.end)) continue;
      const [lo, hi] = around(text, ends, m.index);
      const sentence = text.slice(lo, hi);
      if (NOT_RUN.test(sentence)) continue;
      n++;
      out.push(finding("methods-small-study", lineAt(text, m.index), `"${quote(m[0])}" while every k in Collie is below 10: small-study tests need k ≥ 10, report them as not assessed`, sentence.slice(0, 80)));
    }
  }
  return out;
}

/** Every check; registry-dependent ones run only with a registry. Oversized text is skipped. */
export function checkManuscript(text, registry = null) {
  if (typeof text !== "string" || text.length > MAX_TEXT) return [];
  return [
    ...missingPlaceholders(text),
    ...(registry ? numbersVsRegistry(text, registry) : []),
    ...referenceIssues(text),
    ...disclosureCredit(text),
    ...(registry ? causalLanguage(text, registry) : []),
    ...(registry ? claimsVsEvidence(text, registry) : []),
    ...(registry ? statisticalReporting(text, registry) : []),
  ];
}
