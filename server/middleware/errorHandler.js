const mongoose = require("mongoose");
const HttpError = require("../utils/httpError");

function notFound(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found." } });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let status = err.status || 500;
  let code = err.code || "INTERNAL_ERROR";
  let message = err.message || "Something went wrong.";
  let details = err.details;

  if (err instanceof mongoose.Error.ValidationError) {
    status = 422;
    code = "VALIDATION_ERROR";
    message = "Please correct the highlighted fields.";
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    code = "INVALID_ID";
    message = "Invalid identifier.";
  } else if (err.code === 11000) {
    status = 409;
    code = "DUPLICATE";
    message = "That record already exists.";
  }

  if (status >= 500) {
    console.error("[error]", err.stack || err.message);
    message = process.env.NODE_ENV === "production" ? "Something went wrong." : message;
  }

  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

module.exports = { HttpError, errorHandler, notFound };
