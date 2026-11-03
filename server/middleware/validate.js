const HttpError = require("../utils/httpError");

/*
 * Minimal validation helper: validate(body, schema) where schema maps
 * field -> { type, required, min, max, enum, pattern, default }.
 * Throws HttpError 422 with field details on failure.
 */
const TYPES = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  boolean: (v) => typeof v === "boolean",
  array: (v) => Array.isArray(v),
  object: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
};

function coerce(value, type) {
  if (value === undefined || value === null) return value;
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (type === "boolean") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  if (type === "array" && typeof value === "string") return [value];
  return value;
}

function validate(body, schema) {
  const errors = [];
  const clean = {};
  const src = body && typeof body === "object" ? body : {};
  for (const [field, rule] of Object.entries(schema)) {
    let value = coerce(src[field], rule.type);
    const present = value !== undefined && value !== null && value !== "";
    if (present && rule.default !== undefined && !TYPES[rule.type](value)) {
      value = rule.default;
      if (TYPES[rule.type](value)) { clean[field] = value; continue; }
    }
    if (!present) {
      if (rule.required) errors.push({ field, message: "This field is required." });
      else if (rule.default !== undefined) clean[field] = rule.default;
      continue;
    }
    if (!TYPES[rule.type] ? false : !TYPES[rule.type](value)) {
      errors.push({ field, message: `Expected type ${rule.type}.` });
      continue;
    }
    if (rule.type === "string") {
      const s = value.trim();
      if (rule.min !== undefined && s.length < rule.min) {
        errors.push({ field, message: `Must be at least ${rule.min} characters.` });
        continue;
      }
      if (rule.max !== undefined && s.length > rule.max) {
        errors.push({ field, message: `Must be at most ${rule.max} characters.` });
        continue;
      }
      if (rule.pattern && !rule.pattern.test(s)) {
        errors.push({ field, message: rule.patternMessage || "Invalid format." });
        continue;
      }
      if (rule.enum && !rule.enum.includes(s)) {
        errors.push({ field, message: `Must be one of: ${rule.enum.join(", ")}.` });
        continue;
      }
      clean[field] = s;
      continue;
    }
    if (rule.type === "number") {
      if (rule.min !== undefined && value < rule.min) {
        errors.push({ field, message: `Must be at least ${rule.min}.` });
        continue;
      }
      if (rule.max !== undefined && value > rule.max) {
        errors.push({ field, message: `Must be at most ${rule.max}.` });
        continue;
      }
      clean[field] = value;
      continue;
    }
    clean[field] = value;
  }
  if (errors.length) {
    throw new HttpError(422, "VALIDATION_ERROR", "Please correct the highlighted fields.", errors);
  }
  return clean;
}

module.exports = { validate };
